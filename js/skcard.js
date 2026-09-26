// One Skelly, drawn from what chain.tokens() returns, plus its OpenSea
// listing if it has one. Used by the market grid (compact) and by the detail
// panel on /stats/ and /market/ (full). Reads only.
(function () {
  const C = window.SKELLY_CONFIG;
  const SK = window.SK;
  const el = SK.el;

  const rankName = (r) => (r < 0 ? 'never woken' : r === 0 ? 'Awake' : `Level ${r}`);
  const osUrl = (id) => (SK.linkOk(C.links.asset) ? C.links.asset.replace('{contract}', C.contracts.skellies).replace('{id}', id) : (SK.linkOk(C.links.collection) ? C.links.collection : null));

  function badges(s, listing) {
    const out = [];
    if (s.gone) return [el('span', { class: 'badge gone' }, 'merged away')];
    out.push(s.raised ? el('span', { class: 'badge raised' }, 'awake') : el('span', { class: 'badge asleep' }, 'asleep'));
    if (s.rank > 0) out.push(el('span', { class: 'badge' }, `Level ${s.rank}`));
    if (s.relic) out.push(el('span', { class: 'badge relic' }, 'relic'));
    if (s.souls > 1) out.push(el('span', { class: 'badge souls' }, `${s.souls} merged`));
    if (listing) out.push(el('span', { class: 'badge listed' }, 'listed'));
    return out;
  }

  // the compact grid item
  function item(s, listing) {
    const b = el('button', { class: 'mk-item', type: 'button', dataset: { id: s.id }, 'aria-label': `Skelly #${s.id}` },
      SK.artCard(s.form, { label: s.form ? undefined : 'SHROUDED' }),
      el('div', null,
        el('div', { class: 't' }, `#${s.id}`),
        el('div', { class: 'badges' }, badges(s, listing)),
        listing ? el('div', { class: 'p' }, `${listing.price.replace(/\.?0+$/, '')} ETH`, el('small', null, 'ask')) : null,
        s.holdings && s.holdings.length ? el('div', { class: 'small dim' }, `holds ${s.holdings.map((h) => h.symbol).join(', ')}`) : null));
    return b;
  }

  // the full card
  function full(s, listing) {
    const box = el('div', { class: 'skc' });
    box.append(SK.artCard(s.form, { label: s.form ? undefined : 'SHROUDED' }));
    const right = el('div');
    right.append(el('h3', null, `Skelly #${s.id}`), el('div', { class: 'badges' }, badges(s, listing)));
    if (!s.gone) {
      const kv = el('dl', { class: 'kv' });
      const row = (k, v) => kv.append(el('dt', null, k), el('dd', null, v));
      row('Status', s.raised ? 'awake and earning' : (s.rank < 0 ? 'asleep, never woken' : 'asleep'));
      row('Level', rankName(s.rank));
      row('Share points', s.raised ? SK.power(s.power) : '—');
      if (s.souls > 1) row('Merged parts', String(s.souls));
      row('Picture', s.form ? `form #${s.form}` : 'not dealt yet');
      if (s.owner) row('Holder', SK.short(s.owner));
      if (s.owedEth != null && s.owedEth > 0n) row('ETH waiting', `${SK.eth(s.owedEth)} ETH`);
      right.append(kv);
      if (s.holdings && s.holdings.length) {
        const t = el('table', { class: 'hold' });
        t.append(el('thead', null, el('tr', null, el('th', null, 'Inside it'), el('th', { class: 'num' }, 'amount'))));
        const tb = el('tbody');
        for (const h of s.holdings) tb.append(el('tr', null, el('td', null, h.symbol), el('td', { class: 'num' }, SK.units(h.amount, h.decimals, 4))));
        t.append(tb);
        right.append(el('div', { class: 'hold' }, t));
      } else right.append(el('p', { class: 'small dim' }, 'Nothing inside it yet.'));
      if (listing) right.append(el('div', { class: 'price' }, `${listing.price.replace(/\.?0+$/, '')} ETH`, ' ', el('small', null, 'asking on OpenSea')));
      // the next rung of the ladder, and the button that buys it
      const LAD = (C.ladder || [25000, 75000, 150000, 300000, 850000]);
      const burnedTok = s.bonesBurned == null ? 0 : Number(s.bonesBurned / 10n ** 18n);
      const nextRung = LAD.find((v) => v > burnedTok);
      if (nextRung != null && window.SKTOKEN) {
        const need = nextRung - burnedTok;
        right.append(el('div', { class: 'rung' }, el('span', null, s.raised === false && burnedTok === 0 ? `Wake it up: burn ${SK.int(need)} $SKELLY` : `Next level: ${SK.int(need)} more $SKELLY`), window.SKTOKEN.buyButton('btn sm lemon buy', 'Buy $SKELLY')));
      }
      const acts = el('div', { class: 'acts' });
      const u = osUrl(s.id);
      if (u) acts.append(el('a', { class: 'btn sm lemon', href: u, target: '_blank', rel: 'noopener' }, listing ? 'Buy on OpenSea' : 'View on OpenSea'));
      acts.append(el('a', { class: 'btn sm ghost', href: `${C.chain.explorer}/token/${C.contracts.skellies}/instance/${s.id}`, target: '_blank', rel: 'noopener' }, 'Explorer'));
      right.append(acts);
    } else right.append(el('p', { class: 'dim' }, 'This Skelly was merged into another one. Its picture and everything inside it moved there.'));
    box.append(right);
    return box;
  }

  function open(s, listing) {
    SK.modal({ title: null, body: full(s, listing), ok: null, cancel: 'Close', wide: true });
  }

  window.SKCARD = { item, full, open, badges, rankName, osUrl };
})();
