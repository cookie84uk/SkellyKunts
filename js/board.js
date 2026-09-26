// index.html: hero strip, live board, CTAs.
(function () {
  const C = window.SKELLY_CONFIG;
  const SK = window.SK;
  SK.chrome('/');

  const chain = window.SkellyChain.make();
  const $ = (id) => document.getElementById(id);

  // the countdown, right under the hero, on every visit until the mint opens
  SK.mountCountdown($('mint-countdown'), C.mint && C.mint.opensAt, {
    cta: C.list && C.list.open !== false ? SK.el('a', { class: 'btn acid', href: '/list/' }, 'Get on the list') : null,
  });

  // the $SKELLY panel: price, market cap, the supply-eaten meter, the buy button
  window.SKTOKEN.mount($('token-panel'));

  // hero strip
  const strip = $('strip');
  C.heroForms.forEach((f, i) => strip.append(SK.artCard(f, { eager: i < 4 })));

  // CTAs from config
  const mint = $('cta-mint'), wake = $('cta-wake'), token = $('cta-token');
  if (C.mint && C.mint.soldOut && SK.linkOk(C.links.collection)) { mint.href = C.links.collection; mint.querySelector('.big').textContent = 'Buy'; mint.querySelector('.why').textContent = 'Minted out · secondary market on OpenSea'; }
  else if (SK.linkOk(C.links.mint)) mint.href = C.links.mint; else if (C.mock) mint.href = '#'; else { mint.setAttribute('aria-disabled', 'true'); mint.removeAttribute('href'); mint.querySelector('.why').textContent = 'OpenSea link goes live at launch'; }
  if (SK.linkOk(C.links.token)) token.href = C.links.token; else if (C.mock) token.href = '#'; else { token.setAttribute('aria-disabled', 'true'); token.removeAttribute('href'); token.querySelector('.why').textContent = 'Pons link goes live at launch'; }
  // the token tile is a buy button the moment a buy link exists (after the
  // tile consts exist: referencing `token` above them threw at load once
  // marrow was configured, and took the whole board down with it)
  if (window.SKTOKEN.buyUrl()) { token.href = window.SKTOKEN.buyUrl(); token.querySelector('.big').textContent = 'Buy $SKELLY'; token.querySelector('.why').textContent = 'Wake a Skelly with 25,000 · every trade feeds the pot'; }
  // What the two CTAs say once the token is live (restored if the page
  // ever moves from the minting state to live without a reload).
  const liveWhy = { wake: wake.querySelector('.why').textContent, token: token.querySelector('.why').textContent, tokenHref: token.getAttribute('href') };

  // Nothing deployed yet: no tiles, no countdown, no claims in the present
  // tense. The panel says what the collection will be, and that is all.
  const prelaunch = !C.mock && !SK.configured('skellies');
  if (prelaunch) {
    document.getElementById('prelaunch').classList.remove('hidden');
    document.querySelector('.tiles').classList.add('hidden');
    document.querySelector('.board-foot').classList.add('hidden');
    const head = document.querySelector('#board-h');
    if (head) head.textContent = 'SkellyKuntz, before launch';
    for (const [el, why] of [[mint, 'opens at launch'], [wake, 'opens when $SKELLY launches'], [token, 'launches after the mint']]) {
      el.classList.add('soon');
      el.setAttribute('aria-disabled', 'true');
      el.removeAttribute('href');
      el.querySelector('.why').textContent = why;
    }
  }
  // While the list takes names and the mint has not opened, the mint tile is
  // the door to the list (before launch and in the days between deploy and mint).
  {
    const beforeMintOpen = !!(C.mint && C.mint.opensAt) && Date.now() < Date.parse(C.mint.opensAt);
    if (C.list && C.list.open !== false && (prelaunch || beforeMintOpen)) {
      mint.classList.remove('soon');
      mint.removeAttribute('aria-disabled');
      mint.removeAttribute('target');
      mint.href = '/list/';
      mint.querySelector('.big').textContent = 'Get on the list';
      mint.querySelector('.why').textContent = 'Free mint for the list · then 0.0015 ETH';
    }
    const clock = document.querySelector('.panel-head .dim');
    if (clock) clock.classList.add('hidden'); // no half-empty clock line

  }

  const set = (id, v) => { $(id).textContent = v; };
  let chainOffset = null; // chain timestamp - local seconds at fetch
  let cycleLen = 3600, currentCycle = null;
  // true while marrow() is the zero address: the mint is open, $SKELLY has
  // not launched, nothing can be raised and no pot can exist yet.
  let minting = false;

  const tick = () => {
    if (prelaunch) return;
    if (chainOffset == null) { set('b-countdown', SK.dash); return; }
    const nowChain = Date.now() / 1000 + chainOffset;
    set('b-chaintime', SK.utc(Math.floor(nowChain)));
    if (minting || currentCycle == null) { set('b-countdown', SK.dash); return; }
    const closesAt = (currentCycle + 1) * cycleLen;
    set('b-countdown', SK.hms(closesAt - nowChain));
  };
  setInterval(tick, 1000);

  // Three things happen in order before the pot can pay anyone: minting
  // closes, the beacon deals the art, the token launches. The line under the
  // board says which one the collection is waiting on.
  const beforeMint = () => !!(C.mint && C.mint.opensAt) && Date.now() < Date.parse(C.mint.opensAt);
  const NOTE = {
    minting: "Minting is open. When it closes, a public randomness beacon deals every picture at once. $SKELLY launches after that; that's when Skellies start earning.",
    before: "The contracts are live and the airdrop goes out before the mint. Minting opens on the countdown above; $SKELLY launches after the reveal.",
    sealed: "Minting is closed. The beacon that deals every picture lands in a couple of minutes, and anyone can submit it.",
    dealt: "Every picture has been dealt. $SKELLY launches next; that's when Skellies start earning.",
  };
  function setPhase(m, phase) {
    minting = m;
    document.querySelectorAll('.tile[data-pot]').forEach((t) => t.classList.toggle('off', m));
    $('board-note').classList.toggle('hidden', !m);
    if (m && phase && NOTE[phase]) $('board-note').textContent = NOTE[phase === 'minting' && beforeMint() ? 'before' : phase];
    wake.classList.toggle('soon', m);
    token.classList.toggle('soon', m);
    if (m) {
      wake.querySelector('.why').textContent = 'opens at token launch';
      token.querySelector('.why').textContent = 'launching soon';
      token.setAttribute('aria-disabled', 'true'); token.removeAttribute('href');
    } else if (window.SKTOKEN.buyUrl()) {
      token.classList.remove('soon'); token.removeAttribute('aria-disabled'); token.href = window.SKTOKEN.buyUrl();
      token.querySelector('.big').textContent = 'Buy $SKELLY'; token.querySelector('.why').textContent = 'Wake a Skelly with 25,000 · every trade feeds the pot';
    } else {
      wake.querySelector('.why').textContent = liveWhy.wake;
      token.querySelector('.why').textContent = liveWhy.token;
      if (liveWhy.tokenHref) { token.setAttribute('href', liveWhy.tokenHref); token.removeAttribute('aria-disabled'); }
    }
  }

  async function refresh() {
    let b;
    try { b = await chain.board(); } catch (e) { SK.netStatus(false); return; }
    if (b.block) {
      chainOffset = b.block.timestamp - Date.now() / 1000;
      cycleLen = b.CYCLE; currentCycle = b.currentCycle;
      set('b-block', SK.int(b.block.number));
    }
    setPhase(b.marrowBound === false, b.unveiled ? 'dealt' : b.sealed ? 'sealed' : 'minting');
    // Pot tiles cannot exist before the token does: dash them, whatever the
    // Crypt happens to hold.
    const pot = (v) => (minting ? SK.dash : v);
    set('b-cauldron', pot(SK.eth(b.cauldron)));
    set('b-pending', pot(SK.eth(b.pending)));
    set('b-power', pot(b.totalPower == null ? SK.dash : SK.power(b.totalPower)));
    set('b-gathered', pot(SK.eth(b.totalGathered, 3)));
    set('b-summoned', b.totalSummoned == null ? SK.dash : `${SK.int(b.totalSummoned)} / ${SK.int(b.maxSupply)}`);
    set('b-alive', b.totalSupply == null ? SK.dash : SK.int(b.totalSupply));
    const migrateMax = b.MIGRATE_MAX == null ? C.collection.migrateMax : b.MIGRATE_MAX;
    tick();
    return b;
  }

  (async () => {
    const b = await refresh();
    if (!b) return;
    if (minting) {
      // Nothing can be raised while the token is unbound (raise reverts
      // NotBound, and a bound token can never be unbound), so 0 is exact.
      set('b-raised', SK.int(0));
      set('b-tribute', SK.dash); $('b-tribute-u').textContent = 'no payout yet';
      setInterval(refresh, 30000);
      return;
    }
    // heavy reads once
    chain.raisedCount(b.totalSummoned).then((n) => set('b-raised', n == null ? SK.dash : SK.int(n))).catch(() => set('b-raised', SK.dash));
    chain.lastTribute(b.block && b.block.number).then((t) => {
      // t: object = last closed cycle; false = none in the window; null = could not read
      set('b-tribute', t ? SK.eth(t.pot) : SK.dash);
      $('b-tribute-u').textContent = t ? `cycle ${SK.int(t.cycle)} · ${SK.power(t.totalPower)} total power` : (t === false ? 'no cycle closed yet' : 'shared last hour');
    }).catch(() => set('b-tribute', SK.dash));
    setInterval(refresh, 30000);
  })();
})();
