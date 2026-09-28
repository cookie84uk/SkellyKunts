// my.html: wallet, my Skellies, and every write behind an explicit dialog.
(function () {
  const C = window.SKELLY_CONFIG;
  const E = window.ethers;
  const SK = window.SK;
  const { IF } = window.SkellyChain;
  SK.chrome('/my/');

  const chain = window.SkellyChain.make();
  const wallet = new window.SkellyWallet();
  const $ = (id) => document.getElementById(id);
  const ADDR = C.contracts;

  let consts = null, offerings = [], mine = null, selected = new Set();
  // True while marrow() is the zero address: the mint is open, $SKELLY has
  // not launched, and raise / ascend / absorb revert NotBound.
  const unbound = () => !!consts && consts.marrowBound === false;
  const LAUNCH_NOTE = 'Wake up opens when $SKELLY launches.';

  // SkellyKuntz.powerOf, mirrored: rank power + absorbed power, then +20% for
  // two souls or +30% for three, then the relic bonus. Integer bps math like
  // the contract (the soul percentages are literals in the contract too).
  const previewPower = (rankIdx, absorbed, souls, relic) => {
    let p = consts.RANK_POWER[Math.max(0, rankIdx)] + (absorbed || 0);
    if (souls === 2) p = Math.floor((p * 12000) / 10000);
    else if (souls === 3) p = Math.floor((p * 13000) / 10000);
    if (relic) p = Math.floor((p * Number(consts.RELIC_BONUS_BPS)) / 10000);
    return p;
  };
  const mintLink = $('empty-mint');
  if (SK.linkOk(C.links.mint)) mintLink.href = C.links.mint; else mintLink.replaceWith('Mint one on OpenSea (link goes live at launch)');

  // ------------------------------------------------------------ connect
  // Nothing deployed yet: connecting a wallet could only ever show an empty
  // page, so say why instead of inviting it.
  if (!C.mock && !SK.configured('skellies')) {
    const b = $('btn-connect');
    b.disabled = true;
    b.textContent = 'Not launched yet';
    const note = SK.el('p', { class: 'note' },
      'SkellyKuntz has not been deployed yet. Once the mint is live this page shows your Skellies, what each one has earned and everything you can do with it.');
    b.parentNode.insertBefore(note, b.nextSibling);
  }

  $('btn-connect').addEventListener('click', async () => {
    try { await wallet.connect(); await load(); } catch (e) { SK.toast(wallet.explain(e), 'bad'); }
  });
  $('btn-disconnect').addEventListener('click', () => { wallet.forget(); mine = null; selected.clear(); paint(); });
  $('btn-refresh').addEventListener('click', load);
  if (window.SKTOKEN) $('my-buy').append(window.SKTOKEN.buyButton('btn xs lemon buy', 'Buy $SKELLY'));
  wallet.onChange = () => { if (wallet.address) load(); else paint(); };
  // a refresh keeps the wallet that was connected in this tab (no prompt)
  if (C.mock || SK.configured('skellies')) wallet.resume();

  async function load() {
    if (!wallet.address) return paint();
    $('addr').textContent = wallet.address;
    $('connect').classList.add('hidden'); $('connected').classList.remove('hidden');
    $('s-count').textContent = '…';
    try {
      // Re-read while the token is unbound so a Refresh after launch flips the page.
      if (!consts || consts.marrowBound !== true) consts = await chain.constants();
      if (!offerings.length) offerings = await chain.offerings();
      mine = await chain.mine(wallet.address);
      SK.netStatus(true);
    } catch (e) { SK.netStatus(false); SK.toast('Could not read the chain right now: ' + (e.message || e), 'bad'); mine = { ids: [], skellies: [], marrow: null }; }
    selected = new Set([...selected].filter((id) => mine.ids.includes(id)));
    paint();
  }

  // ------------------------------------------------------------ paint
  function paint() {
    const on = !!wallet.address;
    $('connect').classList.toggle('hidden', on); $('connected').classList.toggle('hidden', !on);
    $('stats').classList.toggle('hidden', !on || !mine);
    $('bulk').classList.toggle('hidden', !on || !mine || !mine.skellies.length);
    $('empty').classList.toggle('hidden', !on || !mine || mine.skellies.length > 0);
    $('launch-note').classList.toggle('hidden', !on || !mine || !unbound());
    const list = $('skellies'); list.innerHTML = '';
    if (!on || !mine) return;
    const m = mine.marrow;
    $('s-count').textContent = SK.int(mine.skellies.length);
    $('s-bal').textContent = m && m.balance != null ? `${SK.tokens(m.balance)} ${sym()}` : SK.dash;
    $('s-allow').textContent = m && m.allowance != null ? `${SK.tokens(m.allowance)} ${sym()}` : SK.dash;
    for (const s of mine.skellies) list.append(skellyCard(s));
    SK.lazy(list);
    updateBulk();
  }

  const rankName = (r) => (r < 0 ? 'never woken' : r === 0 ? 'Awake' : `Level ${r}`);
  function skellyCard(s) {
    const card = SK.artCard(s.form ?? 0, { lazy: true, label: !s.form ? 'SHROUDED' : (s.relic ? 'RELIC' : `form ${s.form}`) });
    const cb = SK.el('input', { type: 'checkbox', class: 'sel', title: 'select to merge', 'aria-label': `select Skelly #${s.id}` });
    cb.checked = selected.has(s.id);
    cb.addEventListener('change', () => { if (cb.checked) selected.add(s.id); else selected.delete(s.id); updateBulk(); });
    card.prepend(cb);
    const badges = [
      s.raised === true ? SK.el('span', { class: 'badge raised' }, 'awake') : s.raised === false ? SK.el('span', { class: 'badge rest' }, s.bonesBurned && s.bonesBurned > 0n ? 'asleep' : 'never woken') : null,
      s.relic ? SK.el('span', { class: 'badge relic' }, 'relic ×1.5') : null,
      s.souls > 1 ? SK.el('span', { class: 'badge souls' }, `${s.souls} souls`) : null,
    ];
    const holdRows = s.holdings.map((h) => SK.el('tr', null, SK.el('td', null, h.symbol), SK.el('td', { class: 'num' }, SK.units(h.amount, h.decimals, h.decimals === 6 ? 2 : 4)),
      SK.el('td', { class: 'right' }, SK.el('button', { class: 'btn xs', onclick: () => doUnearthOne(s, h) }, 'Take out'))));
    const owedRows = s.owedSlots.map((h) => SK.el('tr', null, SK.el('td', null, `${h.symbol} (waiting)`), SK.el('td', { class: 'num' }, SK.units(h.amount, h.decimals, 4)),
      SK.el('td', { class: 'right' }, SK.el('button', { class: 'btn xs', onclick: () => doUnearthOwed(s, h) }, 'Take'))));
    // ETH a Skelly has earned this hour but that has not yet been swapped into
    // the stock/USDG that lands in its Ossuary. It is real money owed to this
    // Skelly; showing it is the difference between "nothing due" and the truth.
    if (s.owedEth && s.owedEth > 0n) owedRows.push(SK.el('tr', null,
      SK.el('td', null, 'ETH earned (converting)'), SK.el('td', { class: 'num' }, SK.eth(s.owedEth, 6)),
      SK.el('td', { class: 'right' }, SK.el('span', { class: 'dim small' }, 'auto'))));
    const portion = s.portion && s.portion.count ? s.portion.idx.map((i, k) => `${(offerings[i] || { symbol: `#${i}` }).symbol} ${s.portion.bps[k] / 100}%`).join(' · ') : 'USDG (default)';
    const off = unbound();
    const canAscend = !off && s.bonesBurned != null && s.bonesBurned > 0n && s.rank < 4;
    return SK.el('article', { class: 'panel sk', dataset: { id: s.id } },
      card,
      SK.el('div', null,
        SK.el('div', { class: 'title' }, SK.el('h3', null, `Skelly #${s.id}`), badges),
        SK.el('dl', { class: 'kv' },
          SK.el('dt', null, 'Level'), SK.el('dd', null, rankName(s.rank)),
          SK.el('dt', null, 'Share points'), SK.el('dd', null, s.raised ? SK.power(s.power) : (s.power ? `${SK.power(s.power)} once awake` : SK.dash)),
          SK.el('dt', null, '$SKELLY burned so far'), SK.el('dd', null, s.bonesBurned == null ? SK.dash : SK.tokens(s.bonesBurned)),
          SK.el('dt', { class: 'full' }, 'Paid in'), SK.el('dd', { class: 'wrap' }, portion))),
      SK.el('div', { class: 'actions' },
        (window.SKTOKEN && s.rank < 4) ? window.SKTOKEN.buyButton('btn xs lemon buy', s.raised === false && !(s.bonesBurned > 0n) ? `Buy ${SK.int(window.SKTOKEN.LADDER[0])} $SKELLY to wake` : 'Buy $SKELLY') : null,
        s.raised === false ? SK.el('button', { class: 'btn xs acid', disabled: off, title: off ? LAUNCH_NOTE : null, onclick: () => doRaise(s) }, 'Wake up') : null,
        SK.el('button', { class: 'btn xs lemon', disabled: !canAscend, title: off ? LAUNCH_NOTE : null, onclick: () => doAscend(s) }, s.rank >= 4 ? 'Max level' : 'Level up'),
        SK.el('button', { class: 'btn xs sky', onclick: () => doPortion(s) }, 'Payout pick'),
        SK.el('button', { class: 'btn xs', disabled: !s.holdings.length, title: s.holdings.length ? null : 'Nothing inside this Skelly.', onclick: () => doUnearth(s) }, 'Take out all')),
      (holdRows.length || owedRows.length) ? SK.el('div', { class: 'hold' }, SK.el('table', null, SK.el('thead', null, SK.el('tr', null, SK.el('th', null, 'Holding'), SK.el('th', { class: 'num' }, 'Amount'), SK.el('th', null, ''))), SK.el('tbody', null, holdRows, owedRows)))
        : SK.el('div', { class: 'hold dim small' }, 'Nothing is owed to this Skelly. Anything already inside it can still be taken out.'));
  }
  function updateBulk() {
    const n = selected.size;
    const off = unbound();
    $('btn-absorb').disabled = off || n < 2 || n > 3;
    $('btn-absorb').title = off ? LAUNCH_NOTE : '';
    $('sel-note').textContent = off ? `Merge opens when $SKELLY launches.` : n ? `${n} selected. The one that stays: #${[...selected][0]}.` : 'Tick 2 or 3 Skellies to merge. The first one you tick is the one that stays.';
    $('btn-unearth-all').disabled = !mine || !mine.skellies.some((s) => s.holdings.length);
    const asleep = bulkTargets().filter((s) => s.raised === false);
    const levelable = bulkTargets().filter((s) => s.rank < 4);
    $('btn-wake-all').textContent = asleep.length ? `Wake ${n ? 'selected' : 'all'} asleep (${asleep.length})` : 'Wake all asleep';
    $('btn-wake-all').disabled = off || !asleep.length;
    $('btn-wake-all').title = off ? LAUNCH_NOTE : '';
    $('btn-level-all').textContent = n ? `Level selected up (${levelable.length})` : 'Level all up';
    $('btn-level-all').disabled = off || !levelable.length;
    $('btn-level-all').title = off ? LAUNCH_NOTE : '';
  }
  // Bulk actions work on the ticked Skellies when any are ticked, else on all of them.
  const bulkTargets = () => !mine ? [] : (selected.size ? mine.skellies.filter((s) => selected.has(s.id)) : mine.skellies);

  // ------------------------------------------------------------ dialog + run
  const line = (k, v, burn) => SK.el('div', { class: 'line' + (burn ? ' burn' : '') }, SK.el('span', null, k), SK.el('b', null, v));
  const sym = () => '$' + (mine && mine.marrow && mine.marrow.symbol ? mine.marrow.symbol.replace(/^\$/, '') : 'SKELLY');

  // Runs a list of steps [{label, call}] with a progress modal. `burn` is the
  // exact marrow amount the action pulls, so the approval step can be added.
  async function run(title, lines, steps, burn, batch = false) {
    if (!wallet.address) return;
    const need = burn && burn > 0n;
    // Every burn goes through marrow.transferFrom inside the collection; with
    // no token bound the contract reverts NotBound, so stop here in plain words.
    if (need && (unbound() || !mine.marrow || !mine.marrow.address)) return SK.toast(unbound() ? LAUNCH_NOTE : 'Could not read the $SKELLY token. Refresh and try again.', 'bad');
    let approveMode = 'exact';
    const body = SK.el('div', null, SK.el('div', { class: 'lines' }, lines));
    if (need) {
      const m = mine.marrow;
      if (m && m.balance != null && m.balance < burn) {
        const short = burn - m.balance;
        const buy = window.SKTOKEN ? window.SKTOKEN.buyButton('btn sm lemon buy', `Buy ${SK.tokens(short)} more $SKELLY`) : null;
        await SK.modal({ title, body: SK.el('div', null, SK.el('p', { class: 'note' }, `This burns ${SK.tokens(burn)} ${sym()} and this wallet holds ${SK.tokens(m.balance)}: ${SK.tokens(short)} short. Top up first, then come back.`), buy), ok: null, cancel: 'Close' });
        return;
      }
      if (!m || m.allowance == null || m.allowance < burn) {
        body.append(SK.el('p', { class: 'note' }, `The collection needs approval to pull ${SK.tokens(burn)} ${sym()} from you and send it to the dead address.`));
        const sel = SK.el('select', null, SK.el('option', { value: 'exact' }, `Approve exactly ${SK.tokens(burn)} ${sym()} (you'll sign an approval again next time)`), SK.el('option', { value: 'ten' }, `Approve ${SK.tokens(burn * 10n)} ${sym()} (skip that step next time)`));
        sel.addEventListener('change', () => (approveMode = sel.value));
        body.append(SK.el('label', null, 'Approval', sel));
      }
    }
    // only an action that burns says so: a payout pick can be changed any time, taking out burns nothing
    if (need) body.append(SK.el('p', { class: 'note' }, 'Burns are forever. Nothing here can be undone or refunded.'));
    const ok = await SK.modal({ title, body, ok: 'Sign', danger: need });
    if (!ok) return;
    const all = [];
    if (need && (!mine.marrow || mine.marrow.allowance == null || mine.marrow.allowance < burn)) {
      const amount = approveMode === 'ten' ? burn * 10n : burn;
      all.push({ label: `Approve ${SK.tokens(amount)} ${sym()}`, call: { to: mine.marrow.address, iface: IF.erc20, fn: 'approve', args: [ADDR.skellies, amount] }, mock: ['approve', { amount }] });
    }
    all.push(...steps);
    await progress(title, all, batch);
  }

  const BATCH_MAX = (C.wallet && C.wallet.batchMax) || 10;
  const BATCH_NOTE = (n) => n > BATCH_MAX ? `${Math.ceil(n / BATCH_MAX)} signatures if your wallet batches (${BATCH_MAX} actions each), otherwise one per action.` : 'One signature if your wallet batches, otherwise one per action.';
  async function progress(title, steps, batch = false) {
    const ol = SK.el('ol', null, steps.map((s) => SK.el('li', null, s.label)));
    const body = SK.el('div', { class: 'progress' }, SK.el('p', null, batch ? 'Sending as one batch if your wallet allows it, otherwise one at a time.' : 'Sign each step in your wallet.'), ol);
    const p = SK.modal({ title, body, ok: null, cancel: 'Hide' });
    const items = ol.children;
    const mark = (i, cls, extra) => { items[i].className = cls; if (extra) items[i].append(' ', extra); };
    try {
      if (batch) {
        // Wallets cap one wallet_sendCalls at BATCH_MAX calls (MetaMask: 10),
        // so a long list goes as pages: one signature per page.
        let batched = false;
        for (let p = 0; p < steps.length; p += BATCH_MAX) {
          const page = steps.slice(p, p + BATCH_MAX);
          const res = await wallet.sendMany(page.map((s) => s.call), (ev, i) => { if (ev === 'now') mark(p + i, 'now'); if (ev === 'done') mark(p + i, 'done'); if (ev === 'batched') for (let k = 0; k < page.length; k++) mark(p + k, 'now'); });
          if (C.mock) page.forEach((s) => s.mock && chain.apply(...s.mock));
          for (let k = 0; k < page.length; k++) mark(p + k, 'done');
          batched = batched || !!res.batched;
        }
        SK.toast(batched ? (steps.length > BATCH_MAX ? 'All pages landed.' : 'Batch landed.') : 'All steps landed.', 'good');
      } else {
        for (let i = 0; i < steps.length; i++) {
          mark(i, 'now');
          const r = await wallet.send(steps[i].call, (ev, h) => { if (ev === 'sent') mark(i, 'now', SK.el('a', { href: SK.explorerTx(h), target: '_blank', rel: 'noopener' }, 'tx')); });
          if (C.mock && steps[i].mock) chain.apply(...steps[i].mock);
          mark(i, 'done', r.mock ? '(mock)' : null);
        }
        SK.toast('Done.', 'good');
      }
    } catch (e) {
      const i = [...items].findIndex((li) => li.className === 'now');
      if (i >= 0) mark(i, 'fail', `— ${e.message}`);
      SK.toast(e.message, 'bad', 6000);
    }
    SK.closeModal(); await p;
    await load();
  }

  // ------------------------------------------------------------ actions
  function doRaise(s) {
    if (!consts) return SK.toast('Constants not loaded.', 'bad');
    const burn = consts.RAISE_BURN;
    // A rested Skelly keeps its rank: powerOf already says what it earns
    // once awake. A never-woken one is seeded at rank 0 by the raise.
    const power = s.bonesBurned > 0n && s.power ? s.power : previewPower(s.rank, s.absorbedPower, s.souls, s.relic);
    run(`Wake up Skelly #${s.id}`, [
      line('Burn', `${SK.tokens(burn)} ${sym()}`, true),
      line('Starts earning', 'from the next hour'),
      line('Share points once awake', SK.power(power)),
    ], [{ label: `raise(#${s.id})`, call: { to: ADDR.skellies, iface: IF.skellies, fn: 'raise', args: [s.id] }, mock: ['raise', { id: s.id }] }], burn);
  }

  async function doAscend(s) {
    if (!consts) return SK.toast('Constants not loaded.', 'bad');
    const cur = s.bonesBurned || 0n;
    let pick = null;
    const body = SK.el('div', { class: 'rankpick' });
    const powerAt = (r) => previewPower(r, s.absorbedPower, s.souls, s.relic);
    const btns = [];
    for (let r = 1; r <= 4; r++) {
      const cost = consts.RANK_BURN[r] - cur;
      const b = SK.el('button', { disabled: cost <= 0n },
        SK.el('span', { class: 'r' }, `Level ${r}`), SK.el('span', { class: 'c' }, cost <= 0n ? 'reached' : `burn ${SK.tokens(cost)} ${sym()}`),
        SK.el('span', { class: 'small' }, `share points ${SK.power(powerAt(r))}`), SK.el('span', { class: 'c small' }, cost <= 0n ? '' : `${SK.power(powerAt(r) - (s.power || powerAt(Math.max(0, s.rank))))} more than now`));
      b.addEventListener('click', () => { pick = r; btns.forEach((x) => x.classList.remove('on')); b.classList.add('on'); });
      btns.push(b); body.append(b);
    }
    const ok = await SK.modal({ title: `Level up Skelly #${s.id}`, body: SK.el('div', null, SK.el('p', { class: 'note' }, `Right now: ${rankName(s.rank)}, ${SK.tokens(cur)} ${sym()} burned so far. You only pay the difference to the level you pick.`), body), ok: 'Next' });
    if (!ok || !pick) return;
    const cost = consts.RANK_BURN[pick] - cur;
    run(`Level up #${s.id} to level ${pick}`, [
      line('Burn', `${SK.tokens(cost)} ${sym()}`, true),
      line('Total burned after', `${SK.tokens(consts.RANK_BURN[pick])} ${sym()}`),
      line('Share points', `${SK.power(s.raised ? s.power : powerAt(Math.max(0, s.rank)))} → ${SK.power(powerAt(pick))}${s.raised ? '' : ' (once awake)'}`),
    ], [{ label: `ascend(#${s.id}, ${pick})`, call: { to: ADDR.skellies, iface: IF.skellies, fn: 'ascend', args: [s.id, pick] }, mock: ['ascend', { id: s.id, rank: pick }] }], cost);
  }

  $('btn-absorb').addEventListener('click', () => {
    if (!consts) return SK.toast('Constants not loaded.', 'bad');
    const ids = [...selected];
    const sk = ids.map((id) => mine.skellies.find((x) => x.id === id));
    const survivor = sk[0];
    const totalSouls = sk.reduce((a, x) => a + (x.souls || 1), 0);
    if (totalSouls > 3) return SK.toast(`Those add up to ${totalSouls} bodies. The most a Skelly can hold is 3.`, 'bad');
    let cost = consts.ABSORB_BURN_TWO;
    if (totalSouls === 3) cost += consts.ABSORB_BURN_THREE;
    if (survivor.souls === 2 && totalSouls === 3) cost = consts.ABSORB_BURN_THREE;
    const base = (x) => (x.bonesBurned && x.bonesBurned > 0n ? consts.RANK_POWER[Math.max(0, x.rank)] + (x.absorbedPower || 0) : 0);
    const gained = sk.slice(1).reduce((a, x) => a + base(x), 0);
    // powerOf(survivor) after: rank power + (absorbed + gained), soul bonus
    // for the new total, then the survivor's relic bonus. A never-woken
    // survivor reads 0 until raised; the preview shows what a raise gives.
    const after = previewPower(survivor.rank, (survivor.absorbedPower || 0) + gained, totalSouls, survivor.relic);
    run(`Merge into Skelly #${survivor.id}`, [
      line('Burn', `${SK.tokens(cost)} ${sym()}`, true),
      line('Gone forever', sk.slice(1).map((x) => `#${x.id}${x.relic ? ' (its relic bonus is lost)' : ''}`).join(', ')),
      line('Bodies after', `${totalSouls} (+${totalSouls === 2 ? 20 : 30}% bonus)`),
      line('Share points of the one that stays', `${survivor.raised ? SK.power(survivor.power) : SK.dash} → ${SK.power(after)}${survivor.raised ? '' : ' (once awake)'}`),
      line('Everything inside them', 'moves to the one that stays'),
    ], [{ label: `absorb([${ids.join(', ')}])`, call: { to: ADDR.skellies, iface: IF.skellies, fn: 'absorb', args: [ids] }, mock: ['absorb', { ids, cost }] }], cost);
    selected.clear();
  });

  async function doPortion(s) {
    if (!offerings.length) return SK.toast('The payout menu could not be loaded.', 'bad');
    const rows = [];
    const cur = s.portion && s.portion.count ? s.portion : { idx: [offerings.length - 1], bps: [10000], count: 1 };
    const body = SK.el('div', null, SK.el('p', { class: 'note' }, 'Pick up to three. The percentages must add up to 100. This only changes what future hours buy for this Skelly.'));
    const wrap = SK.el('div');
    const addRow = (idx = 0, pct = 0) => {
      const sel = SK.el('select', null, offerings.map((o) => SK.el('option', { value: o.idx, selected: o.idx === idx }, `${o.symbol}${o.isStock ? '' : ' (stable)'}`)));
      const num = SK.el('input', { type: 'number', min: 0, max: 100, step: 0.01, value: pct });
      const row = SK.el('div', { class: 'row' }, sel, num, SK.el('button', { class: 'btn xs ghost', onclick: () => { rows.splice(rows.indexOf(row), 1); row.remove(); } }, '×'));
      row._sel = sel; row._num = num; rows.push(row); wrap.append(row);
    };
    cur.idx.forEach((i, k) => addRow(i, cur.bps[k] / 100));
    body.append(wrap, SK.el('button', { class: 'btn xs', onclick: () => { if (rows.length < 3) addRow(offerings[0].idx, 0); } }, '+ add another'));
    const ok = await SK.modal({ title: `Payout pick for Skelly #${s.id}`, body, ok: 'Next' });
    if (!ok) return;
    const idx = rows.map((r) => Number(r._sel.value));
    const bps = rows.map((r) => Math.round(Number(r._num.value) * 100));
    if (!idx.length || idx.length > 3) return SK.toast('Pick one to three things.', 'bad');
    if (new Set(idx).size !== idx.length) return SK.toast('Each one only once.', 'bad');
    if (bps.reduce((a, b) => a + b, 0) !== 10000) return SK.toast('The percentages must add up to exactly 100.', 'bad');
    run(`Payout pick for #${s.id}`, idx.map((i, k) => line((offerings.find((o) => o.idx === i) || {}).symbol || `#${i}`, `${bps[k] / 100}%`)),
      [{ label: `Crypt.setPortion(#${s.id})`, call: { to: ADDR.crypt, iface: IF.crypt, fn: 'setPortion', args: [s.id, idx, bps] }, mock: ['portion', { id: s.id, idx, bps }] }], 0n);
  }

  function doUnearth(s) {
    run(`Take everything out of #${s.id}`, s.holdings.map((h) => line(h.symbol, SK.units(h.amount, h.decimals, h.decimals === 6 ? 2 : 4))),
      [{ label: `Ossuary.unearth(#${s.id})`, call: { to: ADDR.ossuary, iface: IF.ossuary, fn: 'unearth', args: [s.id] }, mock: ['unearth', { id: s.id }] }], 0n);
  }
  function doUnearthOne(s, h) {
    run(`Take ${h.symbol} out of #${s.id}`, [line(h.symbol, SK.units(h.amount, h.decimals, h.decimals === 6 ? 2 : 4))],
      [{ label: `Ossuary.unearthOne(#${s.id}, ${h.idx})`, call: { to: ADDR.ossuary, iface: IF.ossuary, fn: 'unearthOne', args: [s.id, h.idx] }, mock: ['unearth', { id: s.id }] }], 0n);
  }
  function doUnearthOwed(s, h) {
    run(`Take waiting ${h.symbol} out of #${s.id}`, [line(h.symbol, SK.units(h.amount, h.decimals, 4))],
      [{ label: `Crypt.unearthOwed(#${s.id}, ${h.idx})`, call: { to: ADDR.crypt, iface: IF.crypt, fn: 'unearthOwed', args: [s.id, h.idx] }, mock: ['unearthOwed', { id: s.id, idx: h.idx }] }], 0n);
  }

  // ------------------------------------------------------------ bulk wake / level
  $('btn-wake-all').addEventListener('click', () => {
    if (!consts) return SK.toast('Constants not loaded.', 'bad');
    const asleep = bulkTargets().filter((s) => s.raised === false);
    if (!asleep.length) return;
    const burn = consts.RAISE_BURN * BigInt(asleep.length);
    run(`Wake up ${asleep.length} Skellies`, [
      line('Skellies', asleep.map((s) => `#${s.id}`).join(', ')),
      line('Burn', `${asleep.length} × ${SK.tokens(consts.RAISE_BURN)} = ${SK.tokens(burn)} ${sym()}`, true),
      line('Start earning', 'from the next hour'),
      line('Signing', BATCH_NOTE(asleep.length + 1)),
    ], asleep.map((s) => ({ label: `raise(#${s.id})`, call: { to: ADDR.skellies, iface: IF.skellies, fn: 'raise', args: [s.id] }, mock: ['raise', { id: s.id }] })), burn, true);
  });

  $('btn-level-all').addEventListener('click', async () => {
    if (!consts) return SK.toast('Constants not loaded.', 'bad');
    const pool = bulkTargets().filter((s) => s.rank < 4);
    if (!pool.length) return;
    // Cost to bring one Skelly to level r: the difference to what it has
    // burned so far. A never-woken one is woken first (25,000, which seeds
    // the base), then climbs; the two together cost exactly RANK_BURN[r].
    const plan = (r) => pool.filter((s) => (s.bonesBurned || 0n) < consts.RANK_BURN[r]).map((s) => {
      const woken = s.bonesBurned && s.bonesBurned > 0n;
      return { s, wake: !woken, cost: woken ? consts.RANK_BURN[r] - s.bonesBurned : consts.RANK_BURN[r] };
    });
    let pick = null;
    const body = SK.el('div', { class: 'rankpick' });
    const btns = [];
    for (let r = 1; r <= 4; r++) {
      const pl = plan(r);
      const total = pl.reduce((a, x) => a + x.cost, 0n);
      const b = SK.el('button', { disabled: !pl.length },
        SK.el('span', { class: 'r' }, `Level ${r}`), SK.el('span', { class: 'c' }, pl.length ? `burn ${SK.tokens(total)} ${sym()}` : 'all there already'),
        SK.el('span', { class: 'small' }, pl.length ? `${pl.length} Skell${pl.length === 1 ? 'y' : 'ies'} climb${pl.filter((x) => x.wake).length ? `, ${pl.filter((x) => x.wake).length} woken first` : ''}` : ''),
        SK.el('span', { class: 'c small' }, pl.length ? `share points ${SK.power(previewPower(r, 0, 1, false))} each at least` : ''));
      b.addEventListener('click', () => { pick = r; btns.forEach((x) => x.classList.remove('on')); b.classList.add('on'); });
      btns.push(b); body.append(b);
    }
    const ok = await SK.modal({ title: `Level up ${pool.length} Skellies`, body: SK.el('div', null, SK.el('p', { class: 'note' }, `Every Skelly below the level you pick climbs to it. Each one pays only the difference to what it has burned so far; ones already at or above that level are skipped. Never-woken ones are woken first.`), body), ok: 'Next' });
    if (!ok || !pick) return;
    const pl = plan(pick);
    const total = pl.reduce((a, x) => a + x.cost, 0n);
    const steps = [];
    for (const x of pl) {
      if (x.wake) steps.push({ label: `raise(#${x.s.id})`, call: { to: ADDR.skellies, iface: IF.skellies, fn: 'raise', args: [x.s.id] }, mock: ['raise', { id: x.s.id }] });
      steps.push({ label: `ascend(#${x.s.id}, ${pick})`, call: { to: ADDR.skellies, iface: IF.skellies, fn: 'ascend', args: [x.s.id, pick] }, mock: ['ascend', { id: x.s.id, rank: pick }] });
    }
    run(`Level ${pl.length} Skellies up to level ${pick}`, [
      line('Skellies', pl.map((x) => `#${x.s.id}`).join(', ')),
      line('Burn', `${SK.tokens(total)} ${sym()}`, true),
      line('Each ends at', `${SK.tokens(consts.RANK_BURN[pick])} ${sym()} burned, level ${pick}`),
      line('Signing', BATCH_NOTE(steps.length + 1)),
    ], steps, total, true);
  });

  $('btn-unearth-all').addEventListener('click', async () => {
    const with_ = mine.skellies.filter((s) => s.holdings.length);
    if (!with_.length) return;
    const lines = with_.map((s) => line(`#${s.id}`, s.holdings.map((h) => `${SK.units(h.amount, h.decimals, h.decimals === 6 ? 2 : 4)} ${h.symbol}`).join(' · ')));
    const ok = await SK.modal({ title: `Take out from ${with_.length} Skellies`, body: SK.el('div', null, SK.el('div', { class: 'lines' }, lines), SK.el('p', { class: 'note' }, 'One signature for all of them if your wallet supports batching. Otherwise one at a time, in order.')), ok: 'Sign' });
    if (!ok) return;
    const steps = with_.map((s) => ({ label: `Ossuary.unearth(#${s.id})`, call: { to: ADDR.ossuary, iface: IF.ossuary, fn: 'unearth', args: [s.id] }, mock: ['unearth', { id: s.id }] }));
    await progress('Take out all', steps, true);
  });

  paint();
})();
