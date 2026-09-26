// Shared page chrome and helpers: top bar, banner, formatting, modal, toast.
(function () {
  const C = window.SKELLY_CONFIG;
  const U = {};
  const ZERO = '0x0000000000000000000000000000000000000000';

  U.isPlaceholder = (addr) => !addr || /^0x0{40}$/i.test(addr);
  U.configured = (key) => !U.isPlaceholder(C.contracts[key]);
  // A usable link: a real URL, not empty, not a placeholder.
  U.linkOk = (url) => typeof url === 'string' && /^https?:\/\//.test(url) && !/PLACEHOLDER/.test(url) && !/0x0{40}/.test(url);

  U.el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- art
  U.artUrl = (formId) => {
    const local = C.sampleForms.includes(Number(formId));
    if (C.mock || /PLACEHOLDER/.test(C.ipfs.imagesCid)) {
      return local ? `/img/${formId}.webp` : U.placeholderArt(formId);
    }
    return C.ipfs.imageUrl.replace('{cid}', C.ipfs.imagesCid).replace('{id}', formId);
  };
  U.placeholderArt = (id) => {
    const hue = (Number(id) * 47) % 360;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 500'><rect width='360' height='500' fill='hsl(${hue} 70% 55%)'/><g fill='none' stroke='#07060a' stroke-width='14' stroke-linejoin='round'><path d='M180 110c-62 0-104 44-104 104 0 40 18 66 44 84v46h120v-46c26-18 44-44 44-84 0-60-42-104-104-104z' fill='#f4ecd8'/><circle cx='142' cy='222' r='22' fill='#07060a'/><circle cx='218' cy='222' r='22' fill='#07060a'/><path d='M150 344v40M180 344v40M210 344v40'/></g><text x='180' y='450' font-family='Impact,Arial Narrow,sans-serif' font-size='54' text-anchor='middle' fill='#07060a'>#${id}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  };
  /// The card every Skelly wears until the beacon deals the art.
  U.shroudArt = () => {
    // The real pre-reveal card once it is pinned; the drawing below is the
    // fallback so the page still reads if the gateway is slow.
    if (C.ipfs && C.ipfs.shroudUrl && !/PLACEHOLDER/.test(C.ipfs.shroudUrl)) return C.ipfs.shroudUrl;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 500'><rect width='360' height='500' fill='#1b1830'/><g opacity='.5'><path d='M0 0h360v500H0z' fill='url(#g)'/></g><defs><radialGradient id='g'><stop offset='0' stop-color='#2f2a4e'/><stop offset='1' stop-color='#15121f'/></radialGradient></defs><g fill='none' stroke='#4a4470' stroke-width='12' stroke-linejoin='round'><path d='M180 150c-52 0-88 37-88 88 0 34 15 56 37 71v39h102v-39c22-15 37-37 37-71 0-51-36-88-88-88z' fill='#241f3c'/><circle cx='150' cy='241' r='18' fill='#15121f'/><circle cx='210' cy='241' r='18' fill='#15121f'/></g><text x='180' y='392' font-family='Impact,Arial Narrow,sans-serif' font-size='30' text-anchor='middle' fill='#5b5482'>NOT DEALT YET</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  };
  U.artCard = (formId, opts = {}) => {
    // form 0 or null: the art has not been dealt, so there is nothing to show.
    if (!Number(formId)) {
      const im = U.el('img', { alt: 'A Skelly whose picture has not been dealt yet', loading: 'lazy', decoding: 'async', width: 360, height: 500, src: U.shroudArt() });
      return U.el('div', { class: 'card shroud' }, im, U.el('span', { class: 'tag' }, opts.label ?? 'SHROUDED'));
    }
    const img = U.el('img', { alt: `SkellyKuntz form #${formId}`, loading: opts.eager ? 'eager' : 'lazy', decoding: 'async', width: 360, height: 500 });
    if (opts.lazy) img.dataset.src = U.artUrl(formId); else img.src = U.artUrl(formId);
    const relic = Number(formId) >= 1 && Number(formId) <= C.collection.relics;
    const tag = U.el('span', { class: 'tag' + (relic ? ' relic' : '') }, opts.label ?? (relic ? `RELIC #${formId}` : `#${formId}`));
    return U.el('div', { class: 'card', dataset: { form: formId } }, img, tag);
  };

  // ---- numbers
  const fmtInt = new Intl.NumberFormat('en-US');
  U.dash = '—';
  U.int = (v) => (v == null ? U.dash : fmtInt.format(Number(v)));
  U.eth = (wei, dp = 4) => {
    if (wei == null) return U.dash;
    const s = window.ethers.formatEther(wei);
    const n = Number(s);
    if (n === 0) return '0';
    if (n < 10 ** -dp) return `<${(10 ** -dp).toFixed(dp)}`;
    return n.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: 0 });
  };
  U.units = (v, dec = 18, dp = 2) => {
    if (v == null) return U.dash;
    const n = Number(window.ethers.formatUnits(v, dec));
    if (n === 0) return '0';
    if (n < 10 ** -dp) return `<${(10 ** -dp).toFixed(dp)}`;
    return n.toLocaleString('en-US', { maximumFractionDigits: dp });
  };
  // Marrow amounts (whole tokens). The live decimals are read from the token
  // once and stored here by chain.constants(); 18 until then.
  U.marrowDecimals = 18;
  U.tokens = (v) => (v == null ? U.dash : U.units(v, U.marrowDecimals, 0));
  U.power = (p) => (p == null ? U.dash : `×${(Number(p) / 100).toFixed(2)}`);
  U.short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : U.dash);
  U.hms = (secs) => {
    if (secs == null || !isFinite(secs)) return U.dash;
    secs = Math.max(0, Math.floor(secs));
    const m = Math.floor(secs / 60) % 60, s = secs % 60, h = Math.floor(secs / 3600);
    return (h ? `${h}:` : '') + `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  U.utc = (ts) => (ts == null ? U.dash : new Date(Number(ts) * 1000).toISOString().slice(11, 19) + ' UTC');
  U.explorerTx = (h) => `${C.chain.explorer}/tx/${h}`;
  U.explorerAddr = (a) => `${C.chain.explorer}/address/${a}`;

  // ---- chrome
  // brand marks, inline so nothing loads from a third party
  const ICON = {
    discord: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
    telegram: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
    x: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    opensea: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M11 5.2v9.3H6.6c.9-1.9 2.4-4.8 4.4-9.3zM13 7.4c2.6 1.6 4 3.7 4.3 6.1a1 1 0 0 1-1 1H13z"/><path fill="currentColor" d="M5.3 16.2h13.4c-.5 1.1-1.3 1.9-2.5 2.4H7.8c-1.2-.5-2-1.3-2.5-2.4z"/></svg>`,
  };
  /// The community links (Discord, Telegram, X, OpenSea) as chunky icon buttons; used in the top bar,
  /// the footer and the list's success screen.
  U.socials = (cls = 'socials') => U.el('div', { class: cls, 'aria-label': 'Community' },
    U.linkOk(C.links.discord) ? U.el('a', { class: 'soc discord', href: C.links.discord, target: '_blank', rel: 'noopener', title: 'Discord', html: ICON.discord + '<span>Discord</span>' }) : null,
    U.linkOk(C.links.telegram) ? U.el('a', { class: 'soc telegram', href: C.links.telegram, target: '_blank', rel: 'noopener', title: 'Telegram', html: ICON.telegram + '<span>Telegram</span>' }) : null,
    U.linkOk(C.links.x) ? U.el('a', { class: 'soc x', href: C.links.x, target: '_blank', rel: 'noopener', title: 'X', html: ICON.x + '<span>X</span>' }) : null,
    U.linkOk(C.links.collection) ? U.el('a', { class: 'soc opensea', href: C.links.collection, target: '_blank', rel: 'noopener', title: 'OpenSea', html: ICON.opensea + '<span>OpenSea</span>' }) : null);

  const logo = `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M18 3C10 3 5 8.5 5 16c0 5 2.3 8.4 5.6 10.6V32h14.8v-5.4C28.7 24.4 31 21 31 16c0-7.5-5-13-13-13z" fill="#f4ecd8" stroke="#07060a" stroke-width="2.4" stroke-linejoin="round"/><circle cx="13" cy="17" r="3.2" fill="#07060a"/><circle cx="23" cy="17" r="3.2" fill="#07060a"/><path d="M15 27v4M18 27v4M21 27v4" stroke="#07060a" stroke-width="2.2"/></svg>`;
  U.chrome = (page) => {
    const nav = [['/', 'Board'], ['/stats/', 'Stats'], ['/roll/', 'Roll'], ['/my/', 'My Skellies'], ['/docs/', 'Docs']];
    const top = U.el('header', { class: 'top', 'data-check': 'header' },
      U.el('div', { class: 'wrap top-in' },
        U.el('a', { class: 'brand', href: '/', html: `${logo}<span>SkellyKuntz</span>` }),
        U.el('nav', { class: 'nav', 'aria-label': 'Site' },
          nav.map(([href, label]) => U.el('a', { href, class: href === page ? 'on' : '' }, label)),
          U.el('span', { class: 'pill', id: 'netpill', title: `${C.chain.name} · chain id ${C.chain.id}` }, U.el('span', { class: 'dot' }), U.el('span', { class: 'txt' }, C.chain.name)),
          C.mock ? U.el('span', { class: 'pill mock', title: 'demo mode: none of these numbers are real yet' }, 'mock') : null,
        ),
        U.socials('socials socnav')));
    document.body.prepend(top);
    // Before anything is deployed the airdrop is a promise, not an event, so
    // the banner must not speak in the present tense on any page.
    const notLive = !C.mock && U.isPlaceholder(C.contracts.skellies);
    if (C.migrationLive) {
      top.after(U.el('div', { class: 'banner', 'data-check': 'banner', role: 'status' },
        U.el('div', { class: 'wrap' },
          U.el('b', null, notLive ? 'Ink holders' : 'Migration in progress'),
          U.el('span', { class: 'banner-long' }, notLive
            ? 'Held a Skelly on Ink? You will get one here automatically, sent to the same wallet. Nothing to claim.'
            : 'Had a Skelly on Ink? You get one here, sent straight to the same wallet. Nothing to claim.'),
          U.el('a', { href: '/docs/#migration' }, 'Details'))));
    }
    document.body.append(U.el('footer', { class: 'foot' },
      U.el('div', { class: 'wrap' },
        U.el('span', null, `1,100 unique ${C.collection.name} on Robinhood`),
        U.el('span', null,
          U.linkOk(C.links.collection) ? U.el('a', { href: C.links.collection, target: '_blank', rel: 'noopener' }, 'OpenSea') : U.el('span', { class: 'dim' }, 'OpenSea (soon)'),
          ' · ',
          (U.linkOk(C.links.token) || (!U.isPlaceholder(C.contracts.marrow) && U.linkOk(C.links.ponsLaunchpad))) ? U.el('a', { href: U.linkOk(C.links.token) ? C.links.token : C.links.ponsLaunchpad + C.contracts.marrow, target: '_blank', rel: 'noopener' }, '$SKELLY on Pons') : U.el('span', { class: 'dim' }, '$SKELLY on Pons (soon)')),
        U.socials('socials socfoot'))));
    document.body.append(U.el('div', { class: 'toasts', id: 'toasts' }));
  };
  // The mint countdown block: four ticking tiles, the date in UTC and in the
  // viewer's own time, an add-to-calendar link. Three states: no date yet
  // (a tease), counting, open. Mounted wherever a page puts #mint-countdown.
  U.mountCountdown = (host, iso, { cta } = {}) => {
    if (!host) return;
    const t = Date.parse(iso || '');
    const box = U.el('div', { class: 'cd-box panel halftone' });
    const eyebrow = U.el('div', { class: 'cd-eyebrow' }, U.el('span', { class: 'live', 'aria-hidden': 'true' }), U.el('span', { class: 'cd-words' }, 'Mint opens in'));
    box.append(eyebrow);
    const wrap = U.el('section', { class: 'cd' }, box);
    host.replaceChildren(wrap);
    // Minted out (config.mint.soldOut): no clock, no mint button; the way in
    // is the secondary market.
    if (C.mint && C.mint.soldOut) {
      wrap.classList.add('open', 'soldout');
      eyebrow.querySelector('.cd-words').textContent = 'Mint is over';
      box.append(U.el('div', { class: 'cd-openword' }, 'Minted out'));
      box.append(U.el('p', { class: 'cd-when' }, U.el('b', null, `All ${U.int(C.collection.supply)} Skellies minted.`), U.el('span', null, 'The only way in now is the secondary market.')));
      const buy = U.linkOk(C.links.collection) ? C.links.collection : C.links.mint;
      if (U.linkOk(buy)) box.append(U.el('div', { class: 'cd-cta' }, U.el('a', { class: 'btn lemon cd-go', href: buy, target: '_blank', rel: 'noopener' }, 'Buy on OpenSea')));
      return;
    }
    if (!isFinite(t)) {
      eyebrow.querySelector('.cd-words').textContent = 'Mint coming soon';
      box.append(U.el('p', { class: 'cd-when' }, 'The date lands here first, as a countdown. ', U.el('a', { href: C.links.x, target: '_blank', rel: 'noopener' }, 'Follow @SkellyKuntz')));
      if (cta) box.append(U.el('div', { class: 'cd-cta' }, cta));
      wrap.classList.add('tease');
      return;
    }
    const tiles = U.el('div', { class: 'cd-tiles', role: 'timer', 'aria-live': 'off' });
    const parts = ['days', 'hours', 'minutes', 'seconds'].map((l) => {
      const n = U.el('span', { class: 'n' }, '00');
      tiles.append(U.el('div', { class: 'cd-tile' }, n, U.el('span', { class: 'l' }, l)));
      return n;
    });
    box.append(tiles);
    const d = new Date(t);
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const utc = `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
    let local = '';
    try { local = d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }); } catch (e) { local = ''; }
    const cal = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('SkellyKuntz mint') +
      '&dates=' + d.toISOString().replace(/[-:]|\.\d{3}/g, '').replace('Z', 'Z/') + new Date(t + 3600e3).toISOString().replace(/[-:]|\.\d{3}/g, '') +
      '&details=' + encodeURIComponent('Free mint for the list first, then 0.0015 ETH. https://skellykuntz.com') + '&location=' + encodeURIComponent('https://skellykuntz.com');
    box.append(U.el('p', { class: 'cd-when' }, U.el('b', null, utc), local ? U.el('span', null, 'in your time: ', U.el('b', null, local)) : null, U.el('a', { href: cal, target: '_blank', rel: 'noopener' }, 'Add to calendar ↗')));
    if (cta) box.append(U.el('div', { class: 'cd-cta' }, cta));
    const openWord = U.el('div', { class: 'cd-openword hidden' }, 'Minting now');
    box.insertBefore(openWord, tiles);
    const last = ['', '', '', ''];
    const paint = () => {
      const left = Math.floor((t - Date.now()) / 1000);
      if (left <= 0) {
        wrap.classList.add('open');
        eyebrow.querySelector('.cd-words').textContent = 'Mint is open';
        openWord.classList.remove('hidden');
        if (U.linkOk(C.links.mint) && !box.querySelector('.cd-go')) box.append(U.el('div', { class: 'cd-cta' }, U.el('a', { class: 'btn lemon cd-go', href: C.links.mint, target: '_blank', rel: 'noopener' }, 'Mint on OpenSea')));
        return true;
      }
      const v = [Math.floor(left / 86400), Math.floor(left / 3600) % 24, Math.floor(left / 60) % 60, left % 60].map((x) => String(x).padStart(2, '0'));
      v.forEach((s, i) => { if (s !== last[i]) { parts[i].textContent = s; parts[i].classList.remove('tick'); void parts[i].offsetWidth; parts[i].classList.add('tick'); last[i] = s; } });
      return false;
    };
    if (!paint()) { const iv = setInterval(() => { if (paint()) clearInterval(iv); }, 1000); }
  };

  // A live countdown to an ISO time, written into `node` every second.
  U.countdown = (node, iso, { before = '', after = 'now' } = {}) => {
    const t = Date.parse(iso);
    if (!isFinite(t)) return;
    const paint = () => {
      const left = Math.floor((t - Date.now()) / 1000);
      if (left <= 0) { node.textContent = after; node.classList.add('open'); return true; }
      const d = Math.floor(left / 86400), h = Math.floor(left / 3600) % 24, m = Math.floor(left / 60) % 60, sec = left % 60;
      node.textContent = before + (d ? `${d}d ` : '') + `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      return false;
    };
    if (!paint()) { const iv = setInterval(() => { if (paint()) clearInterval(iv); }, 1000); }
  };
  // Cloudflare Web Analytics: one deferred script, no cookies, only when a
  // token is configured. Readable only in the account's dashboard.
  if (C.analyticsToken) {
    const b = document.createElement('script');
    b.defer = true; b.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    b.setAttribute('data-cf-beacon', JSON.stringify({ token: C.analyticsToken }));
    document.head.appendChild(b);
  }
  U.netStatus = (ok) => { const p = document.getElementById('netpill'); if (p) p.classList.toggle('off', !ok); };

  // ---- toast
  U.toast = (msg, kind = '', ms = 4200) => {
    const t = U.el('div', { class: `toast ${kind}` }, msg);
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), ms);
  };

  // ---- modal: returns a promise resolving true (ok) / false (cancel)
  U.modal = ({ title, body, ok = 'OK', cancel = 'Cancel', danger = false, wide = false }) => new Promise((resolve) => {
    const veil = U.el('div', { class: 'veil open', role: 'dialog', 'aria-modal': 'true' });
    const box = U.el('div', { class: 'panel modal' + (wide ? ' gmodal' : '') });
    const close = (v) => { veil.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    veil.addEventListener('click', (e) => { if (e.target === veil) close(false); });
    if (title) box.append(U.el('h3', null, title));
    box.append(typeof body === 'string' ? U.el('div', { html: body }) : body);
    const row = U.el('div', { class: 'foot-row' });
    if (cancel) row.append(U.el('button', { class: 'btn sm ghost', onclick: () => close(false) }, cancel));
    if (ok) row.append(U.el('button', { class: `btn sm ${danger ? 'pink' : 'acid'}`, onclick: () => close(true) }, ok));
    box.append(row);
    veil.append(box);
    document.body.append(veil);
    box.querySelector('button.acid, button.pink, button.ghost')?.focus();
    veil._box = box;
    veil._close = close;
    U._lastModal = veil;
  });
  U.closeModal = () => { if (U._lastModal) { U._lastModal._close(false); U._lastModal = null; } };

  // lazy image loader for [data-src]
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { const img = e.target; img.src = img.dataset.src; delete img.dataset.src; io.unobserve(img); }
  }, { rootMargin: '400px 0px' }) : null;
  U.lazy = (root) => root.querySelectorAll('img[data-src]').forEach((img) => (io ? io.observe(img) : (img.src = img.dataset.src)));

  window.SK = U;
})();
