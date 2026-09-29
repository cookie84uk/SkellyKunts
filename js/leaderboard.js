// /leaderboard/: the Skelly Roll players ranked by net PnL, the top-earning
// Skellies, and a live activity feed. All three come from the bot's event index
// (skellybot /api/roll/leaderboard, /api/leaderboard/skellies, /api/feed).
(function () {
  const C = window.SKELLY_CONFIG;
  const SK = window.SK;
  const el = SK.el;
  SK.chrome('/leaderboard/');

  const base = SK.linkOk(C.stats && C.stats.url) ? C.stats.url.replace(/\/+$/, '') : null;
  const $ = (id) => document.getElementById(id);

  async function get(path) {
    if (!base) return null;
    try {
      const r = await fetch(base + path);
      return r.ok ? r.json() : null;
    } catch (e) { return null; }
  }

  const skelly = (wei) => {
    const n = Number(BigInt(wei || 0) / 10n ** 18n);
    return SK.int(n);
  };
  const walletCell = (a) => el('a', { class: 'mono', href: SK.explorerAddr(a), target: '_blank', rel: 'noopener' }, SK.short(a));
  // blocks are ~0.1s apart on Robinhood Chain
  const when = (block, head) => {
    if (head == null || block == null) return '';
    const secs = Math.max(0, head - block) * 0.1;
    if (secs < 60) return 'just now';
    const m = Math.floor(secs / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  function table(columns, rows, empty) {
    if (!rows.length) return el('p', { class: 'dim' }, empty);
    return el('table', { class: 'lb-table' },
      el('thead', null, el('tr', null, ...columns.map((c) => el('th', { class: c.num ? 'num' : null }, c.h)))),
      el('tbody', null, ...rows.map((r) => el('tr', null, ...columns.map((c) => el('td', { class: c.num ? 'num' : null }, c.v(r)))))));
  }

  // ---------------------------------------------------------------- roll
  let rollPeriod = 'all';
  async function paintRoll() {
    $('rl-note').textContent = 'reading…';
    const d = await get(`/api/roll/leaderboard?period=${rollPeriod}`);
    if (!d) { $('rl-note').textContent = 'no data'; $('rl-table').innerHTML = ''; $('rl-biggest').innerHTML = ''; return; }
    const idx = d.indexed || {};
    $('rl-note').textContent = idx.indexing ? `indexing… ${SK.int(idx.events || 0)} events` : `${SK.int(idx.events || 0)} events indexed`;
    $('rl-biggest').innerHTML = '';
    if (d.biggest) {
      $('rl-biggest').append(el('div', { class: 'panel tk' },
        el('div', { class: 'panel-head' }, el('h3', null, 'Biggest single win'), el('span', { class: 'dim small' }, when(d.biggest.block, idx.lastBlock))),
        el('p', { class: 'mk-item' }, el('span', { class: 'p' }, `${skelly(d.biggest.amount)} $SKELLY`), ' ', walletCell(d.biggest.wallet))));
    }
    $('rl-table').innerHTML = '';
    $('rl-table').append(table([
      { h: 'wallet', v: (r) => walletCell(r.wallet) },
      { h: '#rolls', num: true, v: (r) => SK.int(r.rolls) },
      { h: 'spent', num: true, v: (r) => skelly(r.spent) },
      { h: 'win', num: true, v: (r) => SK.int(r.wins) },
      { h: 'lose', num: true, v: (r) => SK.int(r.losses) },
      { h: 'won', num: true, v: (r) => skelly(r.won) },
      { h: 'lost', num: true, v: (r) => skelly(r.lost) },
      { h: 'net PnL', num: true, v: (r) => { const n = BigInt(r.net); return (n >= 0n ? '+' : '−') + skelly(n < 0n ? -n : n); } },
    ], d.players || [], 'Nobody has rolled in this window yet.'));
  }

  // ---------------------------------------------------------------- skellies
  let skPeriod = 'all';
  async function paintSkellies() {
    $('sk-note').textContent = 'reading…';
    const d = await get(`/api/leaderboard/skellies?period=${skPeriod}`);
    if (!d) { $('sk-note').textContent = 'no data'; $('sk-table').innerHTML = ''; return; }
    const idx = d.indexed || {};
    $('sk-note').textContent = idx.indexing ? 'indexing…' : `${SK.int(idx.events || 0)} events indexed`;
    $('sk-table').innerHTML = '';
    $('sk-table').append(table([
      { h: 'Skelly', v: (r) => el('a', { href: `/market/?id=${r.tokenId}` }, `#${r.tokenId}`) },
      { h: 'share points', num: true, v: (r) => SK.dash },
      { h: 'earned (ETH)', num: true, v: (r) => SK.eth(BigInt(r.earnedWei)) },
      { h: 'payouts', num: true, v: (r) => SK.int(r.payouts) },
      { h: 'owner', v: () => SK.dash },
    ], d.skellies || [], 'No payouts indexed in this window yet.'));
  }

  // ---------------------------------------------------------------- feed
  let lastFeedTop = null;
  async function paintFeed() {
    const d = await get('/api/feed?limit=40');
    const box = $('feed');
    if (!d || !d.items) { box.innerHTML = ''; box.append(el('li', { class: 'dim' }, 'Feed not connected yet.')); return; }
    const top = d.items[0] ? d.items[0].tx : null;
    if (top === lastFeedTop) return; // nothing new
    lastFeedTop = top;
    box.innerHTML = '';
    for (const it of d.items) {
      box.append(el('li', null,
        el('span', { class: `badge ${it.kind}` }, it.kind),
        ' ',
        el('span', null, it.text),
        ' ',
        it.tx ? el('a', { class: 'dim small', href: SK.explorerTx(it.tx), target: '_blank', rel: 'noopener' }, 'tx') : null));
    }
  }

  // ---------------------------------------------------------------- wiring
  function wire(hostId, onPick, current) {
    const host = $(hostId);
    if (!host) return;
    for (const b of host.querySelectorAll('[data-p]')) {
      b.classList.toggle('on', b.dataset.p === current);
      b.addEventListener('click', () => {
        for (const o of host.querySelectorAll('[data-p]')) o.classList.toggle('on', o === b);
        onPick(b.dataset.p);
      });
    }
  }
  wire('rl-period', (p) => { rollPeriod = p; paintRoll(); }, rollPeriod);
  wire('sk-period', (p) => { skPeriod = p; paintSkellies(); }, skPeriod);

  paintRoll();
  paintSkellies();
  paintFeed();
  setInterval(paintFeed, 20_000);
})();