// The $SKELLY panel: price, market cap, 24h volume, holders, the
// supply-eaten meter, a price line and the buy button. Fed by the stats
// Worker's JSON (exact: every trade replayed); the burn meter also has a
// direct chain fallback (the token's balance at the dead address).
// Mounted wherever a page has #token-panel; SKTOKEN.meter() draws the meter alone.
(function () {
  const C = window.SKELLY_CONFIG;
  const SK = window.SK;
  const el = SK.el;
  const LADDER = C.ladder || [25000, 75000, 150000, 300000, 850000];
  const SUPPLY = 1e9;
  const MAX_BURN = 1100 * LADDER[LADDER.length - 1]; // every Skelly at the top level

  // the Pons page: an explicit link, else the launchpad pattern + the token address once it exists
  const tokenAddr = () => (C.contracts && !SK.isPlaceholder(C.contracts.marrow) ? C.contracts.marrow : null);
  const buyUrl = () => (SK.linkOk(C.links.token) ? C.links.token : (tokenAddr() && SK.linkOk(C.links.ponsLaunchpad) ? C.links.ponsLaunchpad + tokenAddr() : null));
  const fmtUsd = (s) => { const n = Number(s); if (!isFinite(n)) return SK.dash; if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return '$' + Math.round(n).toLocaleString('en-US'); if (n >= 1) return '$' + n.toFixed(2); return '$' + n.toPrecision(3); };
  const fmtPrice = (t) => (t.priceUsd ? '$' + Number(t.priceUsd).toPrecision(3) : (t.priceEth ? Number(t.priceEth).toPrecision(3) + ' ETH' : SK.dash));
  const tokensOf = (wei) => Number(BigInt(wei) / 10n ** 18n);

  /// The big button. `where` is a short label for the reason ("wake this one").
  function buyButton(cls = 'btn lemon buy', label = 'Buy $SKELLY') {
    const u = buyUrl();
    if (u) return el('a', { class: cls, href: u, target: '_blank', rel: 'noopener', 'data-buy': '1' }, el('span', { class: 'buy-word' }, label), el('span', { class: 'buy-arrow', 'aria-hidden': 'true' }, '→'));
    return el('span', { class: cls + ' soon', 'aria-disabled': 'true', 'data-buy': '0' }, el('span', { class: 'buy-word' }, label), el('span', { class: 'buy-sub' }, 'launches after the reveal'));
  }

  /// The supply-eaten meter: burned by the collection against the supply.
  function meter(t) {
    const burned = t && t.burnedWei ? tokensOf(t.burnedWei) : 0;
    const pct = burned / SUPPLY * 100;
    const box = el('div', { class: 'meter', 'data-check': 'meter' });
    box.append(el('div', { class: 'meter-head' },
      el('span', null, el('b', null, SK.int(Math.round(burned))), ' $SKELLY burned by the collection'),
      el('span', { class: 'meter-pct' }, (pct < 0.01 && burned > 0 ? '<0.01' : pct.toFixed(pct < 1 ? 2 : 1)) + '% of supply gone')));
    const bar = el('div', { class: 'bar meter-bar', role: 'progressbar', 'aria-valuenow': String(Math.round(pct * 100) / 100), 'aria-valuemin': '0', 'aria-valuemax': '100' }, el('div', { class: 'a meter-fill' }));
    bar.querySelector('.meter-fill').style.width = Math.max(pct > 0 ? 0.6 : 0, Math.min(100, pct)) + '%';
    box.append(bar);
    box.append(el('p', { class: 'meter-note' }, `Every wake-up burns ${SK.int(LADDER[0])}, the top level burns ${SK.int(LADDER[LADDER.length - 1])} per Skelly. All 1,100 at the top would burn `, el('b', null, SK.int(MAX_BURN)), ` — ${(MAX_BURN / SUPPLY * 100).toFixed(1)}% of every $SKELLY that will ever exist. Burned is gone for good.`));
    return box;
  }

  /// The price line from the hourly candles (closes), on a canvas.
  function sparkline(candles) {
    const cv = el('canvas', { class: 'spark', width: 600, height: 120, 'aria-label': 'price, last days' });
    const pts = (candles || []).map((c) => Number(c[4]) / 1e18).filter((v) => isFinite(v) && v > 0);
    if (pts.length < 2) { cv.classList.add('empty'); return cv; }
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height, P = 6;
    const lo = Math.min(...pts), hi = Math.max(...pts);
    const y = (v) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
    x.lineWidth = 3; x.lineJoin = 'round'; x.strokeStyle = pts[pts.length - 1] >= pts[0] ? '#a4ff3d' : '#ff4fa3';
    x.beginPath();
    pts.forEach((v, i) => { const px = P + (i / (pts.length - 1)) * (W - 2 * P); i ? x.lineTo(px, y(v)) : x.moveTo(px, y(v)); });
    x.stroke();
    x.globalAlpha = 0.18; x.lineTo(W - P, H); x.lineTo(P, H); x.closePath(); x.fillStyle = x.strokeStyle; x.fill(); x.globalAlpha = 1;
    return cv;
  }

  function panel(host, s) {
    const t = (s && s.token) || null;
    const v = (s && s.volume) || null;
    host.innerHTML = '';
    const box = el('div', { class: 'panel lit halftone tk' });
    const head = el('div', { class: 'panel-head' }, el('h2', null, '$SKELLY'), el('span', { class: 'dim small' }, t && t.launched ? (t.phase === 'pool' ? 'trading on Uniswap · every trade feeds the pot' : 'trading on Pons · every trade feeds the pot') : 'the token that wakes Skellies'));
    box.append(head);
    if (!t || !t.launched) {
      box.append(el('p', { class: 'lede tk-lede' }, 'Wake a Skelly by burning ', el('b', null, `${SK.int(LADDER[0])} $SKELLY`), '. Level it up by burning more. Half of every trade fee lands in the pot that pays awake Skellies in stocks, every hour.'));
      box.append(meter(t));
      box.append(el('div', { class: 'tk-cta' }, buyButton()));
      buyBox(box);
      host.append(box);
      return;
    }
    const chg = t.change24hPct;
    const tiles = el('div', { class: 'tk-tiles' },
      el('div', { class: 'tile' }, el('span', { class: 'k' }, 'Price'), el('span', { class: 'v' }, fmtPrice(t)), el('span', { class: 'u' }, chg == null ? 'no 24h history yet' : `${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(1)}% · 24h`)),
      el('div', { class: 'tile' }, el('span', { class: 'k' }, 'Market cap'), el('span', { class: 'v' }, t.fdvUsd ? fmtUsd(t.fdvUsd) : `${Number(t.fdvEth).toFixed(1)} ETH`), el('span', { class: 'u' }, '1,000,000,000 supply, fixed')),
      el('div', { class: 'tile' }, el('span', { class: 'k' }, 'Volume · 24h'), el('span', { class: 'v' }, v ? `${SK.eth(BigInt(v.dayWei), 2)} ETH` : SK.dash), el('span', { class: 'u' }, v ? `${SK.int(v.trades)} trades all time` : '')),
      el('div', { class: 'tile' }, el('span', { class: 'k' }, 'Holders'), el('span', { class: 'v' }, t.holders == null ? SK.dash : SK.int(t.holders)), el('span', { class: 'u' }, 'wallets holding $SKELLY')));
    box.append(tiles);
    // price line removed 2026-09-17 (user): the tiles carry the number, the chart link carries the picture
    box.append(meter(t));
    const cta = el('div', { class: 'tk-cta' }, buyButton());
    if (SK.linkOk(C.links.chart)) cta.append(el('a', { class: 'btn sm ghost', href: C.links.chart, target: '_blank', rel: 'noopener' }, 'Chart ↗'));
    box.append(cta);
    buyBox(box);
    box.append(el('p', { class: 'small dim tk-note' }, s.at ? `Updated ${String(s.at).replace('T', ' ').slice(11, 16)} UTC · every trade on the curve and the pool counted, none estimated.` : ''));
    host.append(box);
  }

  /// The on-site buy: talks to the Pons curve directly, so buying works even
  /// when the Pons site is down. Curve phase only (the pool phase is Uniswap's).
  const CURVE_IF = () => new window.ethers.Interface([
    'function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256)',
    'function quoteReserve() view returns (uint256)', 'function tokenReserve() view returns (uint256)', 'function graduated() view returns (bool)',
  ]);
  const curveAddr = () => (C.contracts && !SK.isPlaceholder(C.contracts.curve) ? C.contracts.curve : null);
  const FEE_BPS = 300n; // 1% curve fee + 2% creator tax, both off the ETH leg
  async function buyBox(host) {
    const curve = curveAddr();
    if (!curve || !window.SkellyRpc || !window.SkellyWallet) return;
    const rpc = new window.SkellyRpc(C.chain.rpcs);
    const iface = CURVE_IF();
    let q = 0n, t = 0n;
    try {
      const [g, qr, tr] = await rpc.reads([{ to: curve, iface, fn: 'graduated' }, { to: curve, iface, fn: 'quoteReserve' }, { to: curve, iface, fn: 'tokenReserve' }]);
      if (g) return; // graduated: the pool has it now, the Pons/Uniswap link is the way
      q = BigInt(qr); t = BigInt(tr);
    } catch (e) { return; }
    const box = el('div', { class: 'tk-buy', 'data-check': 'buybox' });
    const input = el('input', { type: 'text', inputmode: 'decimal', value: '0.01', 'aria-label': 'ETH to spend', id: 'tk-buy-eth' });
    const out = el('span', { class: 'tk-buy-out' });
    const btn = el('button', { class: 'btn lemon', type: 'button', id: 'tk-buy-go' }, 'Buy with your wallet');
    const status = el('p', { class: 'small dim tk-buy-status' }, 'Buys go straight to the token\'s curve contract from your wallet. Works even when the Pons site is slow.');
    const quote = () => {
      let wei; try { wei = window.ethers.parseEther(String(input.value || '0').trim()); } catch (e) { wei = 0n; }
      if (wei <= 0n || q === 0n) { out.textContent = ''; return 0n; }
      const net = wei * (10000n - FEE_BPS) / 10000n;
      const tok = net * t / (q + net);
      out.textContent = '≈ ' + SK.int(Number(tok / 10n ** 18n)) + ' $SKELLY';
      return tok;
    };
    input.addEventListener('input', quote);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const wei = window.ethers.parseEther(String(input.value || '0').trim());
        const expect = quote(); if (expect <= 0n) throw new Error('Enter an amount of ETH.');
        const w = new window.SkellyWallet();
        status.textContent = 'Connecting your wallet…';
        await w.connect();
        const signer = await w.getSigner();
        const minOut = expect * 95n / 100n; // 5% slippage; the launch-second snipe tax makes this revert rather than overpay
        status.textContent = 'Approve it in your wallet…';
        const tx = await signer.sendTransaction({ to: curve, value: wei, data: iface.encodeFunctionData('buy', [wei, minOut, w.address]) });
        status.innerHTML = ''; status.append('Sent. ', el('a', { href: `${C.chain.explorer}/tx/${tx.hash}`, target: '_blank', rel: 'noopener' }, 'View the transaction ↗'));
        const rc = await tx.wait();
        status.textContent = rc && rc.status === 1 ? 'Done. The $SKELLY is in your wallet (add the token address to see it).' : 'The transaction reverted.';
        try { const [qr, tr] = await rpc.reads([{ to: curve, iface, fn: 'quoteReserve' }, { to: curve, iface, fn: 'tokenReserve' }]); q = BigInt(qr); t = BigInt(tr); quote(); } catch (e) {}
      } catch (e) { status.textContent = (e && (e.shortMessage || e.message)) || 'Something went wrong.'; }
      btn.disabled = false;
    });
    box.append(el('div', { class: 'tk-buy-row' }, el('label', { for: 'tk-buy-eth' }, 'ETH'), input, out, btn), status);
    host.append(box);
    quote();
  }

  /// Fetch the Worker's JSON once (shared by the pages that mount both).
  let statsP = null;
  function stats() {
    if (statsP) return statsP;
    const url = SK.linkOk(C.stats && C.stats.url) ? C.stats.url.replace(/\/+$/, '') : null;
    statsP = url ? fetch(url + '/stats').then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null);
    return statsP;
  }

  async function mount(host) {
    if (!host) return;
    const s = await stats();
    panel(host, s || { token: { launched: false } });
  }

  window.SKTOKEN = { mount, panel, meter, buyButton, buyUrl, stats, LADDER };
})();
