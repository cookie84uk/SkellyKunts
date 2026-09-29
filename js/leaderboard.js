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

  // ---------------------------------------------------------------- paging
  // One page at a time, so a board is never the whole history at once.
  const LIMIT = { roll: 25, skellies: 25, feed: 20 };
  const qs = new URLSearchParams(location.search);
  const pageNo = (k) => Math.max(1, Number(qs.get(k)) || 1);
  let rollPage = pageNo('rp');
  let skPage = pageNo('sp');
  let feedPage = pageNo('fp');
  const offsetOf = (p, kind) => (Math.max(1, p) - 1) * LIMIT[kind];

  // The page lives in the URL, so a board can be linked and survives a reload.
  function setUrlPage(key, val) {
    const q = new URLSearchParams(location.search);
    q.set(key, String(val));
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  }

  // ‹ prev · 26–50 of 132 · next › — drawn only when there is more than one page.
  function pager(kind, total, offset, go) {
    const limit = LIMIT[kind];
    const cur = Math.floor(offset / limit) + 1;
    const pages = Math.max(1, Math.ceil(total / limit));
    if (pages <= 1) return null;
    const step = (label, to, off) => el('button', { class: 'btn xs', type: 'button', disabled: off || null, onclick: () => go(to) }, label);
    return el('div', { class: 'pager' },
      step('‹ prev', cur - 1, cur <= 1),
      el('span', { class: 'dim small' }, `${SK.int(offset + 1)}–${SK.int(Math.min(offset + limit, total))} of ${SK.int(total)}`),
      step('next ›', cur + 1, cur >= pages));
  }

  // ---------------------------------------------------------------- roll
  let lastHead = null; // newest indexed block, so cards can say "how long ago"
  let rollPeriod = 'all';
  async function paintRoll() {
    const offset = offsetOf(rollPage, 'roll');
    $('rl-note').textContent = 'reading…';
    const d = await get(`/api/roll/leaderboard?period=${rollPeriod}&limit=${LIMIT.roll}&offset=${offset}`);
    if (!d) { $('rl-note').textContent = 'no data'; $('rl-table').innerHTML = ''; $('rl-biggest').innerHTML = ''; return; }
    const idx = d.indexed || {};
    if (idx.lastBlock) lastHead = idx.lastBlock;
    $('rl-note').textContent = idx.indexing ? `indexing… ${SK.int(idx.events || 0)} events` : `${SK.int(idx.events || 0)} events indexed`;
    $('rl-biggest').innerHTML = '';
    if (d.biggest) {
      $('rl-biggest').append(el('div', { class: 'panel tk' },
        el('div', { class: 'panel-head' }, el('h3', null, 'Biggest single win'), el('span', { class: 'dim small' }, when(d.biggest.block, idx.lastBlock))),
        el('p', { class: 'mk-item' }, el('span', { class: 'p' }, `${skelly(d.biggest.amount)} $SKELLY`), ' ', walletCell(d.biggest.wallet)),
        el('div', { class: 'share-row' },
          el('button', { class: 'btn xs lemon', type: 'button', onclick: () => openCard({ kind: 'win', amount: d.biggest.amount, wallet: d.biggest.wallet, block: d.biggest.block, tx: d.biggest.tx }) }, 'Make a card'))));
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
    const p = pager('roll', d.total || 0, offset, (n) => { rollPage = n; setUrlPage('rp', n); paintRoll(); });
    if (p) $('rl-table').append(p);
  }

  // ---------------------------------------------------------------- skellies
  let skPeriod = 'all';
  async function paintSkellies() {
    const offset = offsetOf(skPage, 'skellies');
    $('sk-note').textContent = 'reading…';
    const d = await get(`/api/leaderboard/skellies?period=${skPeriod}&limit=${LIMIT.skellies}&offset=${offset}`);
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
    const p = pager('skellies', d.total || 0, offset, (n) => { skPage = n; setUrlPage('sp', n); paintSkellies(); });
    if (p) $('sk-table').append(p);
  }

  // ---------------------------------------------------------------- feed
  // rows that can become a share card
  const SHAREABLE = new Set(['win', 'claim', 'reward', 'awaken', 'level', 'merge']);
  let lastFeedKey = null;
  async function paintFeed() {
    const offset = offsetOf(feedPage, 'feed');
    const d = await get(`/api/feed?limit=${LIMIT.feed}&offset=${offset}`);
    const box = $('feed');
    const pagerHost = $('feed-pager');
    const clearPager = () => { if (pagerHost) pagerHost.innerHTML = ''; };
    if (!d || !d.items) {
      box.innerHTML = '';
      box.append(el('li', { class: 'dim' }, 'Feed not connected yet.'));
      clearPager();
      return;
    }
    const top = d.items[0] ? d.items[0].tx : '';
    const key = `${offset}|${d.total}|${top}`;
    if (key === lastFeedKey) return; // nothing new on this page
    lastFeedKey = key;
    box.innerHTML = '';
    for (const it of d.items) {
      box.append(el('li', null,
        el('span', { class: `badge ${it.kind}` }, it.kind),
        ' ',
        el('span', null, it.text),
        ' ',
        it.tx ? el('a', { class: 'dim small', href: SK.explorerTx(it.tx), target: '_blank', rel: 'noopener' }, 'tx') : null,
        SHAREABLE.has(it.kind) ? el('button', { class: 'btn xs', type: 'button', onclick: () => openCard(it) }, 'card') : null));
    }
    clearPager();
    const p = pager('feed', d.total || 0, offset, (n) => { feedPage = n; setUrlPage('fp', n); paintFeed(); });
    if (p && pagerHost) pagerHost.append(p);
  }

  // ---------------------------------------------------------------- share cards
  // A 1200×630 card drawn on a canvas so it can be downloaded and posted. The art
  // is read from the chain by token id; if that read fails the card still draws.
  const SITE = 'https://skellykuntz.com';
  const chain = (() => { try { return window.SkellyChain ? window.SkellyChain.make() : null; } catch (e) { return null; } })();

  const image = (src) => new Promise((res) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });

  async function artFor(id) {
    if (!id || !chain) return null;
    let form = null;
    try { const [t] = await chain.tokens([id]); form = t && t.form; } catch (e) { form = null; }
    return form ? image(SK.artUrl(form)) : null;
  }

  // What the card says, per event kind.
  function spec(it) {
    const eth = (v) => (v == null ? null : `${SK.eth(BigInt(v), 8)} ETH`);
    switch (it.kind) {
      case 'win': return { tag: 'Skelly Roll', head: 'rolled a winner', big: `${skelly(it.amount)} $SKELLY`, sub: 'paid out by the beacon, on-chain' };
      case 'claim': return { tag: `Skelly #${it.tokenId}`, head: 'cashed out', big: eth(it.amount) || 'payout taken', sub: 'out of the Skelly, into the wallet' };
      case 'reward': return { tag: `Skelly #${it.tokenId}`, head: 'got paid', big: eth(it.amount) || 'reward paid in', sub: 'the hourly pot, straight into the Skelly' };
      case 'awaken': return { tag: `Skelly #${it.tokenId}`, head: 'woke up', big: it.amount ? `${skelly(it.amount)} $SKELLY` : 'awake', sub: 'burned to wake it — earning every hour' };
      case 'level': return { tag: `Skelly #${it.tokenId}`, head: 'levelled up', big: it.rank ? `Level ${it.rank}` : 'Level up', sub: 'a bigger slice of every pot' };
      case 'merge': return { tag: `Skelly #${it.tokenId}`, head: 'absorbed the bones', big: 'Merged', sub: 'power combined into one' };
      default: return { tag: 'SkellyKuntz', head: it.text, big: '', sub: '' };
    }
  }

  const BANG = '"Bangers", Impact, "Arial Narrow", sans-serif';
  const RUB = '"Rubik", Arial, sans-serif';

  function drawCard(canvas, s, art) {
    const W = 1200, H = 630;
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    const glow = (x, y, r, col) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    };
    const rr = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    };
    const label = (txt, x, y, font, colour, shadow) => {
      g.font = font; g.textBaseline = 'alphabetic';
      if (shadow) { g.fillStyle = shadow; g.fillText(txt, x + 4, y + 4); }
      g.fillStyle = colour; g.fillText(txt, x, y);
    };

    g.fillStyle = '#0f0d16'; g.fillRect(0, 0, W, H);
    glow(W * 0.98, -140, 560, 'rgba(255,79,163,.22)');
    glow(W * 0.02, H + 150, 560, 'rgba(138,107,255,.20)');
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (let y = 7; y < H; y += 10) for (let x = 7; x < W; x += 10) { g.beginPath(); g.arc(x, y, 1.5, 0, 6.2832); g.fill(); }

    let x = 92;
    if (art) {
      const aw = 340, ah = 472, ax = 62, ay = (H - ah) / 2;
      g.fillStyle = '#f4ecd8'; rr(ax + 8, ay + 8, aw, ah, 8); g.fill();
      g.fillStyle = '#07060a'; rr(ax, ay, aw, ah, 8); g.fill();
      g.save(); rr(ax + 6, ay + 6, aw - 12, ah - 12, 5); g.clip(); g.drawImage(art, ax + 6, ay + 6, aw - 12, ah - 12); g.restore();
      x = ax + aw + 56;
    }

    label('SKELLYKUNTZ', x, 150, `400 28px ${BANG}`, '#a4ff3d');

    g.font = `700 22px ${RUB}`;
    const tw = g.measureText(s.tag).width;
    g.fillStyle = '#ffe14d'; rr(x, 176, tw + 28, 40, 6); g.fill();
    g.fillStyle = '#07060a'; g.textBaseline = 'middle'; g.fillText(s.tag, x + 14, 197);

    label(s.head, x, 312, `400 66px ${BANG}`, '#f4ecd8', '#ff4fa3');
    if (s.big) label(s.big, x, 412, `400 84px ${BANG}`, '#ffe14d', '#07060a');
    label(s.sub, x, 456, `400 23px ${RUB}`, '#a49db6');

    g.fillStyle = 'rgba(244,236,216,.25)'; g.fillRect(x, 494, W - x - 92, 3);
    g.font = `500 21px ${RUB}`; g.textBaseline = 'alphabetic';

    const meta = [s.who, s.when].filter(Boolean).join('  ·  ');
    g.fillStyle = '#d9d0bb'; g.fillText(meta, x, 534);

    g.fillStyle = '#a49db6'; g.font = `500 19px ${RUB}`;
    g.fillText(`${SITE.replace('https://', '')}   ·   ${s.txShort || ''}`.trim(), x, 580);
  }

  const shortTx = (tx) => (tx ? `tx ${String(tx).slice(0, 10)}…` : '');

  function download(canvas, name) {
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = name;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }

  function tweet(s) {
    const text = s.quote || `${s.tag} — ${s.head}${s.big ? `: ${s.big}` : ''}`;
    const body = `${text}\n\n1,100 skeletons on Robinhood Chain, paid every hour in stocks.`;
    return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(body) + '&url=' + encodeURIComponent(`${SITE}/leaderboard/`);
  }

  async function openCard(it) {
    const base = spec(it);
    const s = { ...base, who: it.wallet ? SK.short(it.wallet) : '', when: when(it.block, lastHead), txShort: shortTx(it.tx) };
    if (it.kind === 'win') s.quote = `${s.big} won on Skelly Roll 💀`;
    const canvas = el('canvas', { class: 'share-canvas', width: 1200, height: 630 });
    const acts = el('div', { class: 'share-acts' });
    SK.modal({ body: el('div', { class: 'share' }, canvas, acts), ok: null, cancel: 'Close', wide: true });
    acts.append(
      el('button', { class: 'btn sm lemon', type: 'button', onclick: () => download(canvas, `skelly-${it.kind}-${it.tokenId || 'roll'}.png`) }, 'Download card'),
      el('a', { class: 'btn sm acid', href: tweet(s), target: '_blank', rel: 'noopener' }, 'Post on X'));
    const art = await artFor(it.tokenId);
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    drawCard(canvas, s, art);
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
  // changing the window starts the board again from page 1
  wire('rl-period', (p) => { rollPeriod = p; rollPage = 1; setUrlPage('rp', 1); paintRoll(); }, rollPeriod);
  wire('sk-period', (p) => { skPeriod = p; skPage = 1; setUrlPage('sp', 1); paintSkellies(); }, skPeriod);

  // A hash link (#activity) arrives before the boards have painted, when the page
  // is still too short to land on it. Jump again once everything is on screen.
  function landOnHash() {
    const id = location.hash.replace('#', '');
    const node = id ? document.getElementById(id) : null;
    if (node) node.scrollIntoView({ block: 'start' });
  }
  Promise.all([paintRoll(), paintSkellies(), paintFeed()]).finally(() => setTimeout(landOnHash, 250));
  // only page 1 follows the chain live; deeper pages stay put while you read
  setInterval(() => { if (feedPage === 1) paintFeed(); }, 20_000);
})();