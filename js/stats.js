// /stats/: the numbers, from the stats Worker (one JSON) with the chain as
// the fallback for the counts it can answer directly.
(function () {
  const C = window.SKELLY_CONFIG;
  const SK = window.SK;
  const el = SK.el;
  SK.chrome('/stats/');
  const chain = window.SkellyChain.make();
  const $ = (id) => document.getElementById(id);
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };

  const statsUrl = SK.linkOk(C.stats && C.stats.url) ? C.stats.url.replace(/\/+$/, '') : null;
  const ethOf = (wei) => (wei == null ? SK.dash : SK.eth(BigInt(wei), 3));

  async function fromWorker() {
    if (!statsUrl) return null;
    const r = await fetch(statsUrl + '/stats');
    if (!r.ok) return null;
    return r.json();
  }
  async function fromChain() {
    const b = await chain.board();
    const awake = b.totalSummoned != null && Number(b.totalSummoned) === 0 ? 0 : await chain.raisedCount(b.totalSummoned).catch(() => null);
    const minted = b.totalSummoned == null ? null : Number(b.totalSummoned), alive = b.totalSupply == null ? null : Number(b.totalSupply);
    return { collection: { minted, alive, maxSupply: 1100, migrated: b.migrated == null ? null : Number(b.migrated), awake, asleep: minted != null && awake != null ? alive - awake : null, mergedAway: minted != null && alive != null ? minted - alive : null, totalGatheredWei: b.totalGathered == null ? null : b.totalGathered.toString(), tokenBound: !!b.marrowBound }, partial: true };
  }

  function paint(s) {
    const c = s.collection || {};
    set('st-minted', c.minted == null ? SK.dash : SK.int(c.minted));
    set('st-minted-u', c.minted == null ? 'of 1,100' : `of ${SK.int(c.maxSupply || 1100)} · ${SK.int(c.alive)} alive`);
    set('st-awake', c.awake == null ? SK.dash : SK.int(c.awake));
    set('st-asleep', c.asleep == null ? SK.dash : SK.int(c.asleep));
    set('st-merged', c.mergedAway == null ? SK.dash : SK.int(c.mergedAway));
    const L = s.listings;
    set('st-listed', L && L.count != null ? SK.int(L.count) : SK.dash);
    set('st-listed-u', L && L.floor ? `floor ${L.floor.replace(/\.?0+$/, '')} ETH` : (L && L.note ? 'OpenSea not linked yet' : 'on OpenSea'));
    const V = s.volume;
    set('st-vol24', V ? ethOf(V.dayWei) : SK.dash);
    set('st-volall', V ? ethOf(V.totalWei) : SK.dash);
    set('st-vol-u', c.tokenBound ? `${V && V.trades != null ? SK.int(V.trades) + ' trades' : ''}` : '$SKELLY not launched yet');
    const R = s.rewards;
    set('st-paid', R ? ethOf(R.totalWei) : SK.dash);
    set('st-paid-u', R && R.count ? `${SK.int(R.count)} hourly payouts` : (c.tokenBound ? 'no payout yet' : 'starts with $SKELLY'));
    set('st-gathered', c.totalGatheredWei == null ? SK.dash : ethOf(c.totalGatheredWei));
    const note = $('st-note');
    if (s.partial) note.textContent = 'Listings, volume and payouts come from the stats service, which is not connected yet; the counts above are read straight from the chain.';
    else note.textContent = `Updated ${String(s.at).replace('T', ' ').slice(0, 16)} UTC · block ${SK.int(s.head)} · refreshed every 5 minutes.`;
  }

  async function listed(s) {
    const box = $('st-listed-grid');
    const L = s.listings;
    if (!L || !L.items || !L.items.length) { box.append(el('p', { class: 'mk-empty' }, L && L.note ? 'Listings appear once the collection is on OpenSea.' : 'Nothing listed right now.')); return; }
    const items = L.items.slice(0, 12);
    const toks = await chain.tokens(items.map((x) => x.id)).catch(() => []);
    const byId = new Map(toks.map((t) => [t.id, t]));
    for (const it of items) {
      const t = byId.get(it.id) || { id: it.id, form: null, raised: null, rank: -1, souls: 1, holdings: [] };
      const node = window.SKCARD.item(t, it);
      node.addEventListener('click', () => window.SKCARD.open(t, it));
      box.append(node);
    }
    if (L.items.length > items.length) box.after(el('p', { class: 'mt' }, el('a', { class: 'btn sm sky', href: '/market/' }, `All ${SK.int(L.count)} on the market →`)));
  }

  function leaders(s) {
    const L = s.leaders || {};
    const rowP = (x, i) => el('li', null, el('a', { href: `/market/?id=${x.id}` }, `#${x.id}`), el('span', { class: 'lb-v' }, SK.power(x.power)), el('span', { class: 'lb-m' }, [x.relic ? 'relic' : null, x.souls > 1 ? `${x.souls} merged` : null].filter(Boolean).join(' · ')));
    const rowB = (x) => el('li', null, el('a', { href: `/market/?id=${x.id}` }, `#${x.id}`), el('span', { class: 'lb-v' }, `${SK.int(Number(BigInt(x.burned) / 10n ** 18n))} $SKELLY`), el('span', { class: 'lb-m' }, x.raised ? 'awake' : 'asleep'));
    const p = $('lb-power'), b = $('lb-burned');
    if (!L.byPower || !L.byPower.length) p.append(el('li', { class: 'dim' }, 'No Skelly is awake yet.')); else L.byPower.forEach((x, i) => p.append(rowP(x, i)));
    if (!L.byBurned || !L.byBurned.length) b.append(el('li', { class: 'dim' }, 'Nothing burned yet.')); else L.byBurned.forEach((x) => b.append(rowB(x)));
  }

  (async () => {
    let s = null;
    try { s = await fromWorker(); } catch (e) { s = null; }
    if (!s) { try { s = await fromChain(); } catch (e) { s = { collection: {}, partial: true }; } }
    paint(s);
    listed(s);
    leaders(s);
    window.SKTOKEN.panel($('token-panel'), s);
  })();
})();
