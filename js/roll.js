// SKELLY ROLL — the page. Reads the machine's odds and pot from the chain,
// takes a roll (approve + roll in one wallet batch when the wallet can),
// spins the reels while the beacon round arrives and the croupier settles,
// then stops them on the Settled events for that roll.
(function () {
  const C = window.SKELLY_CONFIG;
  const SK = window.SK;
  const E = window.ethers;
  const el = SK.el;
  const $ = (id) => document.getElementById(id);
  const NAMES = ['Nothing', 'Bones', 'Big bones', 'Motherlode', 'Jackpot'];
  const PRICE = 100000n * 10n ** 18n;
  const rollAddr = () => (C.contracts && !SK.isPlaceholder(C.contracts.roll) ? C.contracts.roll : null);
  const tok = (wei) => SK.int(Number(BigInt(wei) / 10n ** 18n));
  const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);

  const IF = { roll: new E.Interface(window.SKELLY_ABI.SkellyRoll), erc20: new E.Interface(window.SKELLY_ABI.ERC20) };
  const rpc = new window.SkellyRpc(C.chain.rpcs);
  let wallet = null, marrow = null, state = null, busy = false;

  function reels(n, cls) {
    const box = $('rl-reels'); box.innerHTML = '';
    for (let i = 0; i < n; i++) box.append(el('div', { class: 'rl-reel ' + (cls || ''), 'aria-hidden': cls ? null : 'true' }, cls ? '' : '?'));
    return [...box.children];
  }

  async function readState() {
    const to = rollAddr();
    const [odds, burned, paid, paused] = await rpc.reads([
      { to, iface: IF.roll, fn: 'odds' }, { to, iface: IF.roll, fn: 'totalBurned' }, { to, iface: IF.roll, fn: 'totalPaid' }, { to, iface: IF.roll, fn: 'paused' },
    ]);
    const [w, avail, pays, pot, total] = odds;
    state = { w: w.map(Number), avail: avail.map(Boolean), pays: pays.map(BigInt), pot: BigInt(pot), total: Number(total), burned: BigInt(burned), paid: BigInt(paid), paused: !!paused };
    return state;
  }

  function paint() {
    const s = state;
    $('rl-pot').textContent = tok(s.pot);
    $('rl-jack').textContent = tok(s.pays[4]);
    $('rl-burned').textContent = tok(s.burned);
    $('rl-paid').textContent = tok(s.paid);
    $('rl-state').textContent = s.paused ? 'paused: no new rolls right now' : 'live · odds read from the chain';
    const tb = $('rl-odds').querySelector('tbody'); tb.innerHTML = '';
    for (let t = 0; t < 5; t++) {
      const pct = s.avail[t] && s.total ? (s.w[t] / s.total * 100) : 0;
      tb.append(el('tr', { class: (s.avail[t] ? '' : 'off ') + (t === 4 ? 'jack' : '') },
        el('td', null, NAMES[t] + (s.avail[t] ? '' : ' · pot too small')),
        el('td', { class: 'n' }, s.avail[t] ? (pct < 1 ? pct.toFixed(2) : pct.toFixed(1)) + '%' : '—'),
        el('td', { class: 'n' }, t === 0 ? '—' : tok(s.pays[t]) + (t === 4 ? ' now' : ''))));
    }
  }

  async function myMarrow() {
    if (!wallet || !wallet.address) return null;
    const m = C.contracts.marrow;
    const [bal, allow] = await rpc.reads([{ to: m, iface: IF.erc20, fn: 'balanceOf', args: [wallet.address] }, { to: m, iface: IF.erc20, fn: 'allowance', args: [wallet.address, rollAddr()] }]);
    marrow = { address: m, balance: BigInt(bal), allowance: BigInt(allow) };
    return marrow;
  }

  function buttons() {
    const box = $('rl-buttons'); box.innerHTML = '';
    for (const n of [1, 3, 5]) {
      box.append(el('button', { class: 'btn ' + (n === 1 ? 'lemon' : 'acid'), type: 'button', id: 'rl-go-' + n, disabled: state.paused || busy, onclick: () => go(n) }, `Roll ×${n}`, el('span', { class: 'small', style: 'display:block;font-family:var(--body);font-size:12px' }, `${SK.int(100000 * n)} $SKELLY`)));
    }
    if (window.SKTOKEN) box.append(window.SKTOKEN.buyButton('btn ghost buy', 'Buy $SKELLY'));
  }

  /// One roll: connect, check balance and allowance, batch approve + roll,
  /// then watch for the settlement.
  async function go(n) {
    if (busy) return;
    busy = true; buttons();
    const status = $('rl-status');
    try {
      if (!wallet) wallet = new window.SkellyWallet();
      status.textContent = 'Connecting your wallet…';
      await wallet.connect();
      await myMarrow();
      const cost = PRICE * BigInt(n);
      if (marrow.balance < cost) {
        status.textContent = `This wallet holds ${tok(marrow.balance)} $SKELLY; a ×${n} roll needs ${tok(cost)}. Buy some first.`;
        return;
      }
      const calls = [];
      if (marrow.allowance < cost) calls.push({ to: marrow.address, iface: IF.erc20, fn: 'approve', args: [rollAddr(), cost * 10n], label: 'approve' });
      calls.push({ to: rollAddr(), iface: IF.roll, fn: 'roll', args: [n], label: 'roll' });
      const spinning = reels(n, 'spin');
      status.textContent = calls.length > 1 ? 'Approve the $SKELLY, then the roll — two prompts, or one if your wallet batches.' : 'Approve the roll in your wallet…';
      const before = await rpc.batch([{ method: 'eth_blockNumber' }]);
      const fromBlock = Number(before[0]) - 5;
      await wallet.sendMany(calls, () => {});
      status.textContent = 'Rolled. The beacon lands in 30 seconds and the result follows right after. Hold on…';
      const id = await findMyRoll(fromBlock);
      if (id == null) { status.textContent = 'Rolled, but the roll id could not be read back. It will settle on its own; check "Last spins" in a minute.'; spinning.forEach((r) => r.classList.remove('spin')); return; }
      const results = await waitSettled(id, 150000);
      if (!results) { status.textContent = `Roll #${id} is waiting for its beacon. It settles by itself; refresh in a minute.`; spinning.forEach((r) => r.classList.remove('spin')); return; }
      let won = 0n;
      results.sort((a, b) => a.i - b.i);
      for (const r of results) {
        const reel = spinning[r.i]; if (!reel) continue;
        await new Promise((res) => setTimeout(res, 550));
        reel.classList.remove('spin');
        reel.textContent = r.tier === 0 ? 'nothing' : `${NAMES[r.tier]}\n${tok(r.amount)}`;
        if (r.tier > 0) reel.classList.add(r.tier === 4 ? 'jack' : 'win');
        won += r.amount;
      }
      status.textContent = won > 0n ? `You won ${tok(won)} $SKELLY. It's in your wallet.` : 'Nothing this time. The 90,000 went into the pot for the next one.';
      await readState(); paint(); await feed(); await myMarrow();
    } catch (e) {
      status.textContent = (e && (e.shortMessage || e.message)) || 'Something went wrong.';
      $('rl-reels').querySelectorAll('.spin').forEach((r) => r.classList.remove('spin'));
    } finally { busy = false; buttons(); }
  }

  const logs = (params) => rpc.batch([{ method: 'eth_getLogs', params: [params] }]).then((r) => (Array.isArray(r[0]) ? r[0] : []));

  async function findMyRoll(fromBlock) {
    const topic = IF.roll.getEvent('Rolled').topicHash;
    const me = E.zeroPadValue(wallet.address, 32);
    for (let k = 0; k < 20; k++) {
      const found = await logs({ address: rollAddr(), topics: [topic, null, me], fromBlock: '0x' + fromBlock.toString(16), toBlock: 'latest' });
      if (found.length) return Number(BigInt(found[found.length - 1].topics[1]));
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  }

  async function waitSettled(id, ms) {
    const topic = IF.roll.getEvent('Settled').topicHash;
    const idTopic = E.zeroPadValue(E.toBeHex(id), 32);
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const head = Number((await rpc.batch([{ method: 'eth_blockNumber' }]))[0]);
      const found = await logs({ address: rollAddr(), topics: [topic, idTopic], fromBlock: '0x' + Math.max(0, head - 9000).toString(16), toBlock: 'latest' });
      if (found.length) return found.map((l) => { const p = IF.roll.parseLog(l); return { i: Number(p.args.i), tier: Number(p.args.tier), amount: BigInt(p.args.amount) }; });
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  }

  // The node answers eth_getLogs for ~9,000 blocks at a time, which is about
  // 15 minutes here, so "the last N blocks" is empty most of the day. Instead:
  // read the latest rolls by id, turn each one's beacon round into a time,
  // find the block at that time, and scan only the stretch where the croupier
  // settled it.
  const FEED_ROLLS = 12, SPAN_BACK = 600, SPAN_FWD = 8400;
  const roundTime = (round) => 1692803367 + (Number(round) - 1) * 3; // drand quicknet

  async function blockAt(t, head, near) {
    let n = near.number, ts = near.timestamp, per = 0.1;
    for (let k = 0; k < 4 && Math.abs(ts - t) > 20; k++) {
      const guess = Math.max(1, Math.min(head.number, Math.round(n - (ts - t) / per)));
      if (guess === n) break;
      const b = await rpc.one('eth_getBlockByNumber', ['0x' + guess.toString(16), false]);
      const bts = Number(b.timestamp);
      if (bts !== ts) per = Math.max(0.02, Math.abs((bts - ts) / (guess - n)));
      n = guess; ts = bts;
    }
    return { number: n, timestamp: ts };
  }

  const ago = (t) => { if (!t) return ''; const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };

  // A settled roll never changes, so each one is looked up once per browser.
  const FEED_KEY = () => 'sk-roll-feed:' + rollAddr().toLowerCase();
  const feedCache = () => { try { return JSON.parse(localStorage.getItem(FEED_KEY())) || {}; } catch (e) { return {}; } };
  const feedSave = (c) => { try { const keep = Object.keys(c).map(Number).sort((x, y) => y - x).slice(0, 40); localStorage.setItem(FEED_KEY(), JSON.stringify(Object.fromEntries(keep.map((k) => [k, c[k]])))); } catch (e) {} };

  // -> [{ id, player, reels, won, best, t }] newest first
  async function recentRolls() {
    const to = rollAddr();
    const count = Number(await rpc.reads([{ to, iface: IF.roll, fn: 'rollCount' }]).then((r) => r[0] ?? 0));
    if (!count) return [];
    const ids = []; for (let id = count - 1; id >= 0 && ids.length < FEED_ROLLS; id--) ids.push(id);
    const cache = feedCache();
    const missing = ids.filter((id) => !cache[id]);
    if (missing.length) {
      const info = await rpc.reads(missing.map((id) => ({ to, iface: IF.roll, fn: 'rolls', args: [id] })));
      const head = await rpc.block();
      const topic = IF.roll.getEvent('Settled').topicHash;
      const groups = new Map();
      // every group exists before the first scan: one window often holds several rolls
      missing.forEach((id, k) => { const r = info[k]; if (r && r.settled) groups.set(id, { id, player: r.player, n: Number(r.n), reels: 0, won: 0n, best: 0, t: roundTime(r.round) }); });
      let scannedFrom = Infinity, near = head;
      for (let k = 0; k < missing.length; k++) { // newest first, so windows only ever move back
        const r = info[k]; if (!r || !r.settled) continue;
        near = await blockAt(roundTime(r.round), head, near); // the last find is the next one's starting guess
        const at = near.number;
        if (at - SPAN_BACK >= scannedFrom) continue; // an earlier window already covers it
        const from = Math.max(0, at - SPAN_BACK), upto = Math.min(head.number, at + SPAN_FWD, scannedFrom - 1);
        for (const l of await logs({ address: to, topics: [topic], fromBlock: '0x' + from.toString(16), toBlock: '0x' + upto.toString(16) })) {
          const p = IF.roll.parseLog(l); const g = groups.get(Number(p.args.id)); if (!g) continue;
          g.reels++; g.won += BigInt(p.args.amount); g.best = Math.max(g.best, Number(p.args.tier));
        }
        scannedFrom = from;
      }
      // only a roll with every reel found is kept for good
      for (const g of groups.values()) if (g.reels === g.n) cache[g.id] = { id: g.id, player: g.player, reels: g.reels, won: g.won.toString(), best: g.best, t: g.t };
      feedSave(cache);
    }
    return ids.map((id) => cache[id]).filter(Boolean).map((g) => ({ ...g, won: BigInt(g.won) }));
  }

  async function feed() {
    const box = $('rl-feed'); if (!box) return;
    try {
      const rows = (await recentRolls()).slice(0, 10);
      box.innerHTML = '';
      if (!rows.length) { box.append(el('li', null, el('span', { class: 'dim' }, 'No spins yet.'))); return; }
      for (const g of rows) {
        box.append(el('li', null,
          el('span', null, short(g.player), ` rolled ×${g.reels}: `, g.won === 0n ? el('span', { class: 'dim' }, 'nothing') : el('b', null, `${NAMES[g.best]} · won ${tok(g.won)}`)),
          el('span', { class: 'dim small' }, `${ago(g.t)} · #${g.id}`)));
      }
    } catch (e) { /* the feed is decoration */ }
  }

  async function main() {
    SK.chrome('/roll/');
    if (!rollAddr()) {
      $('rl-state').textContent = 'not open yet';
      $('rl-status').textContent = 'The machine goes live once the token is seeded. Soon.';
      reels(3, ''); $('rl-buttons').innerHTML = '';
      return;
    }
    try { await readState(); paint(); } catch (e) { $('rl-state').textContent = 'could not read the chain; refresh'; return; }
    reels(3, ''); buttons(); feed();
    setInterval(async () => { if (!busy) { try { await readState(); paint(); } catch (e) {} } }, 20000);
  }
  main();
})();
