// /market/: every Skelly listed on OpenSea with its on-chain state next to
// the price, plus a lookup by number. Listings come from the stats Worker;
// the state comes from the chain, one multicall for the whole page.
(function () {
  const C = window.SKELLY_CONFIG;
  const SK = window.SK;
  const el = SK.el;
  SK.chrome('/market/');
  const chain = window.SkellyChain.make();
  const $ = (id) => document.getElementById(id);
  const statsUrl = SK.linkOk(C.stats && C.stats.url) ? C.stats.url.replace(/\/+$/, '') : null;

  let book = null, byId = new Map();

  async function loadBook() {
    if (!statsUrl) return null;
    const r = await fetch(statsUrl + '/listings');
    if (!r.ok) return null;
    return r.json();
  }

  function head(b) {
    const h = $('mk-head');
    h.innerHTML = '';
    if (!b) { h.append(el('span', { class: 'dim' }, 'Listings are not connected yet. The lookup below reads the chain.')); return; }
    if (!b.count) { h.append(el('span', { class: 'n' }, '0'), el('span', null, b.note ? 'listed · OpenSea not linked yet' : 'listed right now')); return; }
    h.append(el('span', { class: 'n' }, SK.int(b.count)), el('span', null, `listed · floor `, el('b', null, `${b.floor.replace(/\.?0+$/, '')} ETH`), ` · ${String(b.at).replace('T', ' ').slice(11, 16)} UTC`));
  }

  async function grid(b) {
    const box = $('mk-grid');
    box.innerHTML = '';
    if (!b || !b.items || !b.items.length) { box.append(el('p', { class: 'mk-empty' }, b && b.note ? 'Listings appear once the collection is on OpenSea.' : 'Nothing listed right now. Check back, or look one up below.')); return; }
    const toks = await chain.tokens(b.items.map((x) => x.id)).catch(() => []);
    byId = new Map(toks.map((t) => [t.id, t]));
    const sort = $('mk-sort').value;
    const items = [...b.items];
    if (sort === 'awake') items.sort((a, c) => Number(!!(byId.get(c.id) || {}).raised) - Number(!!(byId.get(a.id) || {}).raised) || Number(a.price) - Number(c.price));
    if (sort === 'level') items.sort((a, c) => ((byId.get(c.id) || {}).rank ?? -1) - ((byId.get(a.id) || {}).rank ?? -1) || Number(a.price) - Number(c.price));
    for (const it of items) {
      const t = byId.get(it.id) || { id: it.id, form: null, raised: null, rank: -1, souls: 1, holdings: [] };
      const node = window.SKCARD.item(t, it);
      node.addEventListener('click', () => window.SKCARD.open(t, it));
      box.append(node);
    }
  }

  // lookup by number: the chain answers, the book adds the price if listed
  async function lookup(n) {
    const out = $('mk-card');
    out.innerHTML = '';
    if (!(n >= 1 && n <= 1100)) { out.append(el('p', { class: 'lst-err' }, 'A number between 1 and 1,100.')); return; }
    out.append(el('p', { class: 'dim' }, 'Reading the chain…'));
    let t = null;
    try { [t] = await chain.tokens([n]); } catch (e) { t = null; }
    out.innerHTML = '';
    if (!t) { out.append(el('p', { class: 'lst-err' }, 'Could not read the chain. Try again in a moment.')); return; }
    if (t.minted === false) { out.append(el('p', { class: 'dim' }, `Skelly #${n} has not been minted yet.`)); return; }
    const listing = book && book.items ? book.items.find((x) => x.id === n) : null;
    out.append(el('div', { class: 'panel' }, window.SKCARD.full(t, listing)));
  }

  $('mk-sort').addEventListener('change', () => grid(book));
  const input = $('mk-id');
  const go = () => lookup(Number(input.value.trim()));
  $('mk-go').addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  const q = new URLSearchParams(location.search).get('id');
  if (q) { input.value = q; go(); }

  (async () => {
    try { book = await loadBook(); } catch (e) { book = null; }
    head(book);
    grid(book);
  })();
})();
