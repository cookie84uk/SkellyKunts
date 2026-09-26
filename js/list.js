// /list/: getting on the list is a post on X.
//
// Four steps on one panel. 1) the wallet that will mint (pasted, or read
// from the browser wallet with no chain switch and no signature). 2) the X
// handle; the card draws itself from it, avatar included. 3) the post,
// shown as it will look on the timeline, and a button that opens X with the
// text filled in and the card attached (share sheet on phones, clipboard on
// desktop, a download as the last resort). 4) the link to the post, which
// the Worker reads through X's public oEmbed and checks.
//
// The pass (SKULL-XXXXX) is derived from the wallet here and again in the
// Worker; the Worker's copy is the rule. Nothing here is trusted by it.
(function () {
  'use strict';
  const C = window.SKELLY_CONFIG;
  const SK = window.SK;
  const L = C.list || {};
  SK.chrome('/list/');

  const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
  const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
  // a status link anywhere in the pasted text, or a t.co short link (the
  // Worker follows those)
  const STATUS_RE = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:[A-Za-z0-9_]{1,15}\/status(?:es)?|i\/(?:web\/)?status)\/\d{10,25}[^\s]*/;
  const TCO_RE = /https?:\/\/t\.co\/[A-Za-z0-9]+/;
  const postLinkIn = (text) => { const m = STATUS_RE.exec(text) || TCO_RE.exec(text); return m ? m[0] : null; };
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const KEY = 'skellykuntz.list.v1';
  const el = SK.el;

  const $steps = document.getElementById('lst-steps');
  const $body = document.getElementById('lst-body');

  const configured = SK.linkOk(L.url) && /^https:\/\//.test(L.url || '');
  // Phones and tablets only. A touch-screen Windows laptop must get the
  // desktop flow: its share sheet has no X in it (seen in the wild).
  const isTouch = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

  // who sent them (?via=CODE): optional, internal attribution only
  const cleanVia = (v) => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
  let via = '';
  try { via = cleanVia(new URLSearchParams(location.search).get('via')); } catch (e) { /* no query */ }

  const st = { step: 0, wallet: '', handle: '', pass: '', pfp: null, busy: false };

  async function passFor(wallet) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(wallet.toLowerCase()));
    const b = new Uint8Array(digest);
    let out = '';
    for (let i = 0; i < 5; i++) out += ALPHABET[b[i] % 32];
    return 'SKULL-' + out;
  }
  const postText = () => String(L.post || '').replace('{pass}', st.pass);

  // ---------------------------------------------------------------- avatar
  // unavatar answers with a CORS header (so the canvas stays exportable); the
  // Worker's proxy is the fallback; null draws the hooded stand-in.
  function loadImage(src) {
    return new Promise((res) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  }
  async function loadPfp(handle) {
    const direct = await loadImage('https://unavatar.io/x/' + encodeURIComponent(handle) + '?fallback=false');
    if (direct) return direct;
    return configured ? loadImage(L.url.replace(/\/+$/, '') + '/pfp/' + encodeURIComponent(handle)) : null;
  }
  // The Skelly stamped on the card: one of the non-relic samples shipped in
  // img/, picked by the pass so the same wallet always gets the same one.
  // Just decoration: nobody's art is dealt until the reveal.
  const STAMPS = [12, 88, 233, 377, 512, 777];
  const stamps = {};
  const stampFor = (pass) => {
    let h = 0;
    for (const c of pass) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const id = STAMPS[h % STAMPS.length];
    return (stamps[id] ||= loadImage('/img/' + id + '.webp'));
  };
  let fontsP = null;
  const fonts = () => (fontsP ||= Promise.all([
    document.fonts.load("80px 'Bangers'"), document.fonts.load("700 22px 'Rubik'"), document.fonts.load("500 26px 'Rubik'"),
  ]).catch(() => null));

  // ---------------------------------------------------------------- card
  // 1200×675, the box X shows an attached image in. Comic ink like the site:
  // a tilted bone card on the dark ground, the avatar pinned to it, the pass
  // on an acid pill, a Skelly stamped on the corner. Deterministic
  // apart from the avatar, so the same wallet always draws the same card.
  const DISPLAY = "'Bangers', Impact, 'Arial Narrow Bold', sans-serif";
  const TEXT = "'Rubik', 'Segoe UI', Helvetica, Arial, sans-serif";
  function drawCard(canvas, { handle, pass, pfp, stamp }) {
    const W = 1200, H = 675;
    canvas.width = W; canvas.height = H;
    const x = canvas.getContext('2d');

    // the ground: ink with the site's halftone and two glows
    x.fillStyle = '#0f0d16'; x.fillRect(0, 0, W, H);
    let g = x.createRadialGradient(240, -60, 10, 240, -60, 700);
    g.addColorStop(0, 'rgba(138,107,255,.32)'); g.addColorStop(1, 'rgba(138,107,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createRadialGradient(1200, 760, 10, 1200, 760, 640);
    g.addColorStop(0, 'rgba(255,79,163,.28)'); g.addColorStop(1, 'rgba(255,79,163,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.06)';
    for (let py = 6; py < H; py += 12) for (let px = 6 + ((py / 12) % 2) * 6; px < W; px += 12) { x.beginPath(); x.arc(px, py, 1.6, 0, Math.PI * 2); x.fill(); }

    // the card itself, tilted
    x.save();
    x.translate(W / 2, H / 2); x.rotate(-1.6 * Math.PI / 180); x.translate(-W / 2, -H / 2);
    const CX = 76, CY = 72, CW = 1048, CH = 530;
    x.fillStyle = '#d9d0bb'; x.fillRect(CX + 16, CY + 16, CW, CH);
    x.fillStyle = '#07060a'; x.fillRect(CX + 10, CY + 10, CW, CH);
    x.fillStyle = '#f4ecd8'; x.fillRect(CX, CY, CW, CH);
    x.lineWidth = 8; x.strokeStyle = '#07060a'; x.strokeRect(CX, CY, CW, CH);

    // the avatar, pinned like a photo
    const PS = 250, PX = CX + 60, PY = CY + 74;
    x.save();
    x.translate(PX + PS / 2, PY + PS / 2); x.rotate(2.2 * Math.PI / 180); x.translate(-(PX + PS / 2), -(PY + PS / 2));
    x.fillStyle = '#07060a'; x.fillRect(PX - 6, PY - 6, PS + 12, PS + 12);
    x.fillStyle = '#241f33'; x.fillRect(PX, PY, PS, PS);
    if (pfp) {
      const s = Math.min(pfp.naturalWidth || pfp.width, pfp.naturalHeight || pfp.height);
      const sx = ((pfp.naturalWidth || pfp.width) - s) / 2, sy = ((pfp.naturalHeight || pfp.height) - s) / 2;
      x.drawImage(pfp, sx, sy, s, s, PX, PY, PS, PS);
    } else {
      // no picture: a big skull, the site's mark
      x.fillStyle = '#f4ecd8';
      x.beginPath(); x.ellipse(PX + PS / 2, PY + 112, 84, 78, 0, 0, Math.PI * 2); x.fill();
      x.fillRect(PX + PS / 2 - 52, PY + 150, 104, 54);
      x.fillStyle = '#07060a';
      x.beginPath(); x.arc(PX + PS / 2 - 32, PY + 108, 20, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(PX + PS / 2 + 32, PY + 108, 20, 0, Math.PI * 2); x.fill();
      for (const dx of [-22, 0, 22]) x.fillRect(PX + PS / 2 + dx - 4, PY + 172, 8, 26);
    }
    // the tag under it, lemon on ink
    x.font = `26px ${DISPLAY}`;
    let tag = '@' + handle;
    while (x.measureText(tag).width > PS + 40 && tag.length > 6) tag = tag.slice(0, -2) + '…';
    const tw = x.measureText(tag).width + 28;
    x.fillStyle = '#07060a'; x.fillRect(PX - 12, PY + PS + 14, tw + 8, 46);
    x.fillStyle = '#ffe14d'; x.fillRect(PX - 16, PY + PS + 10, tw + 8, 46);
    x.strokeStyle = '#07060a'; x.lineWidth = 4; x.strokeRect(PX - 16, PY + PS + 10, tw + 8, 46);
    x.fillStyle = '#07060a'; x.textBaseline = 'middle'; x.textAlign = 'left';
    x.fillText(tag, PX - 2, PY + PS + 34);
    x.restore();

    // the words
    const RX = CX + 380, RW = CX + CW - 56 - RX;
    x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    // the eyebrow ends before the stamp's column, whatever the font fallback
    x.fillStyle = '#ff4fa3';
    try { x.letterSpacing = '5px'; } catch (e) { /* older canvas */ }
    const eyebrow = 'SKELLYKUNTZ · ROBINHOOD CHAIN';
    for (let size = 22; size >= 14; size -= 1) { x.font = `700 ${size}px ${TEXT}`; if (x.measureText(eyebrow).width <= RW - 220) break; }
    x.fillText(eyebrow, RX, CY + 76);
    try { x.letterSpacing = '0px'; } catch (e) { /* older canvas */ }
    const big = (t, y) => {
      let size = 96;
      x.font = `${size}px ${DISPLAY}`;
      while (x.measureText(t).width > RW && size > 40) { size -= 4; x.font = `${size}px ${DISPLAY}`; }
      x.fillStyle = '#ff4fa3'; x.fillText(t, RX + 5, y + 5);
      x.fillStyle = '#0f0d16'; x.fillText(t, RX, y);
    };
    big("I'M GETTING", CY + 172);
    big('A SKELLY', CY + 262);
    // the pass on an acid pill
    x.font = `44px ${DISPLAY}`;
    const pw = x.measureText(pass).width + 44;
    x.fillStyle = '#07060a'; roundRect(x, RX + 5, CY + 293, pw, 66, 12); x.fill();
    x.fillStyle = '#a4ff3d'; roundRect(x, RX, CY + 288, pw, 66, 12); x.fill();
    x.lineWidth = 4; x.strokeStyle = '#07060a'; roundRect(x, RX, CY + 288, pw, 66, 12); x.stroke();
    x.fillStyle = '#07060a'; x.fillText(pass, RX + 22, CY + 336);
    x.font = `700 20px ${TEXT}`; x.fillStyle = '#a49db6';
    x.fillText('MY PASS', RX + pw + 18, CY + 332);
    const line = (t, y, color) => {
      let size = 27;
      x.font = `500 ${size}px ${TEXT}`;
      while (x.measureText(t).width > RW && size > 16) { size -= 1; x.font = `500 ${size}px ${TEXT}`; }
      x.fillStyle = color; x.fillText(t, RX, y);
    };
    line('1,100 skeletons paid every hour in blue chip stocks.', CY + 404, '#2b2740');
    line("post this card and you're on the list. free mint incoming.", CY + 444, '#2b2740');
    x.font = `34px ${DISPLAY}`; x.fillStyle = '#0f0d16';
    x.fillText('$SKELLY  ·  skellykuntz.com', RX, CY + 500);
    x.restore();

    // a Skelly, stamped over the top-right corner (the words keep the
    // bottom-right; nothing sits under the stamp)
    if (stamp) {
      const sw = 200, sh = Math.round(sw * (stamp.naturalHeight / stamp.naturalWidth));
      const SX = W - sw - 40, SY = 26;
      x.save();
      x.translate(SX + sw / 2, SY + sh / 2); x.rotate(5 * Math.PI / 180); x.translate(-(SX + sw / 2), -(SY + sh / 2));
      x.fillStyle = '#07060a'; x.fillRect(SX + 8, SY + 8, sw, sh);
      x.drawImage(stamp, SX, SY, sw, sh);
      x.lineWidth = 6; x.strokeStyle = '#07060a'; x.strokeRect(SX, SY, sw, sh);
      x.restore();
    }
  }
  function roundRect(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py); x.lineTo(px + w - r, py); x.arcTo(px + w, py, px + w, py + r, r);
    x.lineTo(px + w, py + h - r); x.arcTo(px + w, py + h, px + w - r, py + h, r);
    x.lineTo(px + r, py + h); x.arcTo(px, py + h, px, py + h - r, r);
    x.lineTo(px, py + r); x.arcTo(px, py, px + r, py, r);
    x.closePath();
  }
  async function paintCard(canvas) {
    const [stamp] = await Promise.all([stampFor(st.pass), fonts()]);
    drawCard(canvas, { handle: st.handle || 'you', pass: st.pass, pfp: st.pfp, stamp });
  }
  function cardBlob() {
    return new Promise((res) => {
      const cv = document.createElement('canvas');
      paintCard(cv).then(() => cv.toBlob(res, 'image/png')).catch(() => res(null));
    });
  }
  const fileName = () => 'skelly-pass-' + st.pass + '.png';
  async function download() {
    const blob = await cardBlob();
    if (!blob) return false;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fileName(); a.click();
    return true;
  }

  // ---------------------------------------------------------------- captcha
  // Only when config carries a site key. One token per /prove; reset after.
  let tsWidget = null;
  function mountCaptcha(host) {
    if (!L.turnstileSiteKey) return;
    const go = () => { try { tsWidget = window.turnstile.render(host, { sitekey: L.turnstileSiteKey, theme: 'dark' }); } catch (e) { tsWidget = null; } };
    if (window.turnstile) return go();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.defer = true; s.onload = go;
    document.head.appendChild(s);
  }
  const tsToken = () => { try { return window.turnstile && tsWidget !== null ? window.turnstile.getResponse(tsWidget) || '' : ''; } catch (e) { return ''; } };
  const tsReset = () => { try { if (window.turnstile && tsWidget !== null) window.turnstile.reset(tsWidget); } catch (e) { /* gone */ } };

  // ---------------------------------------------------------------- steps
  function paint() {
    $body.innerHTML = '';
    tsWidget = null;
    [...$steps.children].forEach((li, i) => { li.className = i < st.step ? 'done' : i === st.step ? 'on' : ''; });
    [stepWallet, stepHandle, stepPost, stepLink][st.step]();
  }
  const say = (msg) => {
    let e = $body.querySelector('.lst-err');
    if (!e) { e = el('div', { class: 'lst-err', role: 'alert' }); $body.append(e); }
    e.textContent = msg;
  };

  function stepWallet() {
    $body.append(el('h3', null, '1 · The wallet that will mint'));
    $body.append(el('p', { class: 'dim' }, 'Paste the address. Nothing connects, nothing is signed.'));
    const input = el('input', { class: 'lst-input mono', placeholder: '0x…', spellcheck: 'false', autocomplete: 'off', value: st.wallet, 'aria-label': 'Wallet address' });
    const row = el('div', { class: 'lst-row' }, input);
    if (window.ethereum) {
      row.append(el('button', { class: 'btn sm ghost', type: 'button', onclick: async () => {
        try { const acc = await window.ethereum.request({ method: 'eth_requestAccounts' }); if (acc && acc[0]) input.value = acc[0]; }
        catch (e) { /* they closed the wallet window */ }
      } }, 'Use my wallet'));
    }
    $body.append(row);
    const next = el('button', { class: 'btn acid', type: 'button', onclick: async () => {
      const v = input.value.trim();
      if (!WALLET_RE.test(v)) return say('That is not an address. It starts with 0x and has 40 characters after it.');
      st.wallet = v; st.pass = await passFor(v); st.step = 1; paint();
    } }, 'Next');
    $body.append(el('div', { class: 'lst-row' }, next));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') next.click(); });
    input.focus();
  }

  function stepHandle() {
    $body.append(el('h3', null, '2 · Your X handle'));
    $body.append(el('p', { class: 'dim' }, 'The card draws itself while you type.'));
    const input = el('input', { class: 'lst-input', placeholder: '@yourhandle', spellcheck: 'false', autocomplete: 'off', value: st.handle, 'aria-label': 'X handle' });
    $body.append(el('div', { class: 'lst-row' }, input));
    const canvas = el('canvas', { class: 'lst-card', 'aria-label': 'Your card' });
    $body.append(el('div', { class: 'lst-cardwrap' }, canvas));
    paintCard(canvas);
    let timer = null, seq = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const h = input.value.trim().replace(/^@+/, '');
        if (!HANDLE_RE.test(h)) return;
        const mine = ++seq;
        st.handle = h; st.pfp = null;
        paintCard(canvas);
        const pfp = await loadPfp(h);
        if (mine !== seq) return;
        st.pfp = pfp; paintCard(canvas);
      }, 450);
    });
    const back = el('button', { class: 'btn sm ghost', type: 'button', onclick: () => { st.step = 0; paint(); } }, 'Back');
    const next = el('button', { class: 'btn acid', type: 'button', onclick: async () => {
      const h = input.value.trim().replace(/^@+/, '');
      if (!HANDLE_RE.test(h)) return say('That is not a handle. Letters, numbers and _ only, up to 15.');
      if (h !== st.handle || !st.pfp) { st.handle = h; st.pfp = await loadPfp(h); }
      st.step = 2; paint();
    } }, "That's me");
    $body.append(el('div', { class: 'lst-row' }, back, next));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') next.click(); });
    input.focus();
  }

  function stepPost() {
    $body.append(el('h3', null, '3 · Post it'));
    $body.append(el('p', { class: 'lst-must' }, el('b', null, 'Posting this is how you get on the list.'), ' No post, no spot. Post it exactly like this, card attached.'));
    const blobReady = cardBlob(); // drawn now, so the share sheet has it instantly
    const mock = el('div', { class: 'lst-post' });
    const head = el('div', { class: 'head' });
    if (st.pfp) head.append(el('img', { src: st.pfp.src, alt: '', crossorigin: 'anonymous' }));
    head.append(el('b', null, '@' + st.handle));
    mock.append(head, el('div', { class: 'txt' }, postText()));
    const canvas = el('canvas', { class: 'lst-card', 'aria-label': 'Your card' });
    if (isTouch) {
      // a real image: press and hold offers "Save to Photos" in every mobile browser
      const im = el('img', { class: 'lst-card lst-cardimg', alt: 'Your card. Press and hold to save it.', width: 1200, height: 675 });
      paintCard(canvas).then(() => { try { im.src = canvas.toDataURL('image/png'); } catch (e) { mock.querySelector('.lst-cardwrap').replaceChildren(canvas); } });
      mock.append(el('div', { class: 'lst-cardwrap' }, im));
    } else {
      mock.append(el('div', { class: 'lst-cardwrap' }, canvas));
      paintCard(canvas);
    }
    $body.append(mock);
    const hint = el('p', { class: 'dim lst-hint' });
    $body.append(hint);

    // Phones get the share sheet with the card attached (X opens with it in
    // the post). Desktop gets the X composer in a new tab, synchronously on
    // the click, while the card lands on the clipboard in the same gesture;
    // one paste attaches it. Told apart by touch, not by canShare: desktop
    // Safari claims it can share files and then offers no X.
    const intentUrl = 'https://x.com/intent/post?text=' + encodeURIComponent(postText());
    const intent = () => window.open(intentUrl, '_blank', 'noopener');
    const back = el('button', { class: 'btn sm ghost', type: 'button', onclick: () => { st.step = 1; paint(); } }, 'Back');
    const done = el('button', { class: 'btn acid', type: 'button', onclick: () => { st.step = 3; paint(); } }, 'I posted it');
    if (isTouch) {
      // Phones. Nothing here may depend on a download or on work done after
      // the tap: iOS drops the tap's permission while a picture is being
      // generated, and in-app browsers (Telegram, X) cannot save files at
      // all. So the card is shown as a real picture (press and hold saves it
      // in every browser), the X link is a plain anchor, and the share button
      // hands over a File prepared in advance, synchronously — or is not
      // offered when the browser cannot share files.
      const openX = el('a', { class: 'btn pink', href: intentUrl, target: '_blank', rel: 'noopener' }, 'Open X ↗');
      const steps = el('ol', { class: 'lst-howto' },
        el('li', null, el('b', null, 'Press and hold the card'), ' above → Save to Photos.'),
        el('li', null, el('b', null, 'Open X'), '; the words are already typed.'),
        el('li', null, 'Add the saved picture with the photo button, post.'));
      let file = null;
      blobReady.then((blob) => { if (blob) file = new File([blob], fileName(), { type: 'image/png' }); });
      let canShareFiles = false;
      try { canShareFiles = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(4)], 'x.png', { type: 'image/png' })] })); } catch (e) { canShareFiles = false; }
      if (canShareFiles) {
        const share = el('button', { class: 'btn pink', type: 'button', onclick: () => {
          if (!file) { hint.innerHTML = 'One second, the card is still drawing. Tap again.'; return; }
          navigator.share({ text: postText(), files: [file] }).then(() => { st.step = 3; paint(); })
            .catch(() => { hint.innerHTML = "No X in that menu? No problem: press and hold the card to save it, then <b>Open X</b> and add the picture."; });
        } }, 'Post on X');
        openX.className = 'btn sm ghost';
        $body.append(el('div', { class: 'lst-row' }, back, share, done));
        $body.append(el('p', { class: 'dim small lst-planb' }, 'Share menu not showing X? Do it by hand:'), steps);
        $body.append(el('div', { class: 'lst-row lst-planb' }, openX));
      } else {
        $body.append(el('p', { class: 'lst-must' }, 'Three taps:'), steps);
        $body.append(el('div', { class: 'lst-row lst-planb' }, back, openX, done));
      }
    } else {
      const post = el('button', { class: 'btn pink', type: 'button', onclick: () => {
        const fallback = async () => { if (await download()) hint.innerHTML = 'Your card just <b>downloaded</b>. Attach it to the post with the picture button, then post.'; };
        let wrote = null;
        try { if (navigator.clipboard && window.ClipboardItem) wrote = navigator.clipboard.write([new ClipboardItem({ 'image/png': blobReady })]); } catch (e) { wrote = null; }
        intent();
        if (wrote) { hint.innerHTML = 'Your card is <b>copied</b>. In the post box press <b>⌘V</b> (Ctrl+V) to attach it, then post.'; wrote.catch(fallback); }
        else fallback();
      } }, 'Post on X');
      const dl = el('button', { class: 'btn sm ghost', type: 'button', onclick: async () => { if (await download()) hint.innerHTML = 'Card <b>downloaded</b>. Attach it to your post with the picture button, post, then paste the link in the next step.'; } }, 'Download the card');
      $body.append(el('div', { class: 'lst-row' }, back, post, dl, done));
    }
  }

  function stepLink() {
    $body.append(el('h3', null, '4 · Paste the link to your post'));
    $body.append(el('p', { class: 'dim' }, 'On your post, tap Share → Copy link, then paste it here.'));
    const input = el('input', { class: 'lst-input', placeholder: 'https://x.com/you/status/…', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Link to your post' });
    $body.append(el('div', { class: 'lst-row' }, input));
    const ts = el('div', { class: 'lst-ts' });
    $body.append(ts);
    mountCaptcha(ts);
    const back = el('button', { class: 'btn sm ghost', type: 'button', onclick: () => { st.step = 2; paint(); } }, 'Back');
    const check = el('button', { class: 'btn acid', type: 'button' }, 'Check my post');
    check.addEventListener('click', async () => {
      const v = postLinkIn(input.value);
      if (!v) return say("That doesn't look like a link to a post. On the post itself, tap Share → Copy link, then paste it here. It looks like x.com/you/status/1234…");
      if (st.busy) return;
      st.busy = true; check.textContent = 'Reading…'; check.disabled = true;
      try {
        const r = await fetch(L.url.replace(/\/+$/, '') + '/prove', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: st.wallet, handle: st.handle, post: v, via, ts: tsToken() }),
        });
        let out = {};
        try { out = await r.json(); } catch (e) { /* not json */ }
        tsReset();
        if (!r.ok) {
          const words = {
            'wrong account': 'That post is by @' + (out.author || 'someone else') + ', not @' + st.handle + '. Post from your own account.',
            'pass missing': 'Your pass ' + st.pass + ' is not in that post. Post the text exactly as step 3 shows it.',
            'ticker missing': 'The post is missing $SKELLY. Post the text exactly as step 3 shows it.',
            'tag missing': 'The post must tag @SkellyKuntz. Post the text exactly as step 3 shows it.',
            'card missing': 'Your card is not on the post. Post again with the card attached.',
            'post not found': "X can't show us that post. Is the account public? A private (protected) account can't be checked. And make sure the link is to the post itself: on the post, tap Share → Copy link.",
            'x busy': "X isn't answering right now. Wait a minute and press Check my post again.",
            'handle taken': 'That X account is already on the pile with a different wallet.',
            'captcha': 'The robot check said no. Tick the box below and try again.',
            'closed': 'The list is closed.',
          }[out.error] || 'Could not check the post. Try again in a moment.';
          if (out.error === 'closed') { closed(); return; }
          throw new Error(words);
        }
        try { localStorage.setItem(KEY, JSON.stringify({ wallet: st.wallet, handle: out.handle || st.handle, pass: st.pass, pending: !!out.pending, at: new Date().toISOString() })); } catch (e) { /* private mode */ }
        if (out.pending) pending(); else success(out.handle || st.handle);
      } catch (e) {
        say(e.message || 'Could not check the post. Try again in a moment.');
        check.textContent = 'Check my post'; check.disabled = false;
      }
      st.busy = false;
    });
    $body.append(el('div', { class: 'lst-row' }, back, check));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check.click(); });
    input.focus();
  }

  // Posting puts you on the list; GTD spots are picked from it before the
  // mint (decided 2026-09-15). The list never closes on a number.
  function success(handle) {
    [...$steps.children].forEach((li) => (li.className = 'done'));
    $body.innerHTML = '';
    const ok = el('div', { class: 'lst-ok', 'data-check': 'list-ok' });
    ok.append(el('h3', null, "You're on the list"));
    ok.append(el('p', null, el('b', null, '@' + handle + ' · ' + st.pass), '. Post checked, wallet ', el('span', { class: 'mono' }, SK.short(st.wallet)), ' is in. When the list closes, every wallet on it lands in a round, GTD or FCFS, and the split is announced before the mint. Keep that wallet, and watch ', el('a', { href: C.links.x, target: '_blank', rel: 'noopener' }, '@SkellyKuntz'), ' for the rounds and the date.'));
    const canvas = el('canvas', { class: 'lst-card', 'aria-label': 'Your card' });
    ok.append(el('div', { class: 'lst-cardwrap' }, canvas));
    paintCard(canvas);
    ok.append(el('div', { class: 'lst-row' },
      el('button', { class: 'btn sm ghost', type: 'button', onclick: download }, 'Download the card'),
      el('a', { class: 'btn acid', href: '/' }, 'Done')));
    ok.append(el('p', { class: 'lst-join' }, 'Come hang out with the crew:'), SK.socials('socials socbig'));
    $body.append(ok);
  }

  // X would not show the post to either of our readers (it hides some
  // accounts and posts from embeds). The link is kept for a person to look at.
  function pending() {
    [...$steps.children].forEach((li) => (li.className = 'done'));
    $body.innerHTML = '';
    const ok = el('div', { class: 'lst-ok', 'data-check': 'list-pending' });
    ok.append(el('h3', null, 'Got it. One of us will check it by hand'));
    ok.append(el('p', null, el('b', null, '@' + st.handle + ' · ' + st.pass), ". X won't show us your post automatically (it does that for some accounts), so we saved the link and a person will look at it, usually within the day. If the post is yours, has the card on it and your pass in the text, you're on the list. Nothing else to do."));
    const canvas = el('canvas', { class: 'lst-card', 'aria-label': 'Your card' });
    ok.append(el('div', { class: 'lst-cardwrap' }, canvas));
    paintCard(canvas);
    ok.append(el('div', { class: 'lst-row' },
      el('button', { class: 'btn sm ghost', type: 'button', onclick: download }, 'Download the card'),
      el('a', { class: 'btn acid', href: '/' }, 'Done')));
    $body.append(ok);
  }

  function closed() {
    [...$steps.children].forEach((li) => (li.className = ''));
    $body.innerHTML = '';
    const mintOk = SK.linkOk(C.links.mint);
    $body.append(el('div', { class: 'lst-ok', 'data-check': 'list-closed' },
      el('h3', null, 'The list is closed'),
      el('p', null, 'The picks are made and the mint is about to open. No more names go on it. ', mintOk ? el('span', null, 'The mint is on ', el('a', { href: C.links.mint, target: '_blank', rel: 'noopener' }, 'OpenSea'), '; the page there tells you whether your wallet is on the list.') : 'The mint page on OpenSea will tell you whether your wallet made it.')));
  }
  function soon() {
    $body.innerHTML = '';
    $body.append(el('div', { class: 'lst-ok', 'data-check': 'list-soon' },
      el('h3', null, 'Opens soon'),
      el('p', null, 'The list is not taking names yet. Watch ', el('a', { href: C.links.x, target: '_blank', rel: 'noopener' }, '@SkellyKuntz'), '.')));
  }

  // a returning visitor sees what they already did, and can do it again
  function again(prev) {
    $body.innerHTML = '';
    $body.append(el('div', { class: 'lst-ok', 'data-check': 'list-again' },
      el('h3', null, prev.pending ? 'Your post is waiting for a look' : "You're already on the list"),
      el('p', null, el('b', null, '@' + prev.handle + ' · ' + prev.pass), ' with wallet ', el('span', { class: 'mono' }, SK.short(prev.wallet)), ', from this browser. ', prev.pending ? 'A person checks it by hand, usually within the day. ' : '', 'Posting again with the same wallet just updates it.'),
      el('div', { class: 'lst-row' },
        el('button', { class: 'btn acid', type: 'button', onclick: () => { st.step = 0; paint(); } }, 'Do it again'),
        el('a', { class: 'btn sm ghost', href: '/' }, 'Back to the board'))));
  }

  // ---------------------------------------------------------------- checker
  // Already posted? Paste a wallet: on the list, waiting for a look, or not.
  const $check = document.getElementById('lst-check');
  if ($check && configured) {
    const input = el('input', { class: 'lst-input mono', placeholder: '0x…', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Wallet to check' });
    const out = el('p', { class: 'lst-verdict', 'aria-live': 'polite' });
    const go = el('button', { class: 'btn sm sky', type: 'button' }, 'Check');
    go.addEventListener('click', async () => {
      const w = input.value.trim();
      out.className = 'lst-verdict';
      if (!WALLET_RE.test(w)) { out.textContent = 'That is not an address. It starts with 0x and has 40 characters after it.'; out.classList.add('bad'); return; }
      go.disabled = true; out.textContent = 'Checking…';
      try {
        const r = await fetch(L.url.replace(/\/+$/, '') + '/check?wallet=' + w);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'no');
        if (d.listed) { out.textContent = SK.short(w) + " is on the list ✓ You're in. When the list closes we go through every wallet on it and each one lands in a round: GTD or FCFS. The split is announced before the mint; watch @SkellyKuntz."; out.classList.add('good'); }
        else if (d.pending) { out.textContent = SK.short(w) + ' posted, and the post is waiting for someone to look at it. Usually within the day.'; out.classList.add('wait'); }
        else { out.textContent = SK.short(w) + ' is not on the list yet. Post your card above and it will be.'; out.classList.add('bad'); }
      } catch (e) { out.textContent = 'Could not check right now. Try again in a moment.'; out.classList.add('bad'); }
      go.disabled = false;
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
    $check.append(el('div', { class: 'lst-row' }, input, go), out);
  } else if ($check) $check.closest('section').classList.add('hidden');

  // ---------------------------------------------------------------- the pile
  // Who is on the list, newest first. Public: handles and posts are public
  // already. The Worker caches the answer for a minute.
  const $pile = document.getElementById('pile');
  if ($pile && configured) {
    fetch(L.url.replace(/\/+$/, '') + '/pile').then((r) => r.json()).then((d) => {
      if (!d || typeof d.n !== 'number') return;
      $pile.classList.remove('hidden');
      document.getElementById('pile-n').textContent = SK.int(d.n);
      const names = document.getElementById('pile-names');
      for (const r of d.latest || []) names.append(el('a', { class: 'chip', href: r.post, target: '_blank', rel: 'noopener', title: String(r.at || '').replace('T', ' ').slice(0, 16) + ' UTC' }, '@' + r.handle));
      const more = d.n - (d.latest || []).length;
      if (more > 0) { const m = document.getElementById('pile-more'); m.textContent = `and ${SK.int(more)} more`; m.classList.remove('hidden'); }
    }).catch(() => { /* the pile is decoration; the flow works without it */ });
  }
  // the bridge button in the FAQ, when a link is configured
  const fb = document.getElementById('faq-bridge');
  if (fb && SK.linkOk(C.links.bridge)) fb.append(' ', el('a', { class: 'btn xs sky', href: C.links.bridge, target: '_blank', rel: 'noopener' }, 'Open the bridge ↗'));

  // the mint countdown, on top
  SK.mountCountdown(document.getElementById('mint-countdown'), C.mint && C.mint.opensAt);

  if (L.open === false) closed();
  else if (!configured) soon();
  else {
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { prev = null; }
    if (prev && prev.wallet && prev.pass && !/again=0/.test(location.search)) again(prev); else paint();
  }
})();
