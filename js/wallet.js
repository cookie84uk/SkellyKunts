// Injected-wallet layer (EIP-1193 only). Connect, ensure the chain, send one
// call, or send many through EIP-5792 wallet_sendCalls when the wallet has it.
// In mock mode a fake wallet answers everything.
(function () {
  const C = window.SKELLY_CONFIG;
  const E = window.ethers;
  const SK = window.SK;

  // ---- finding the wallet
  // window.ethereum alone misses real setups: Brave with its own wallet off,
  // Phantom or MetaMask not set as "default", two extensions fighting over the
  // slot. EIP-6963 has every wallet announce itself; the named globals are the
  // fallback for wallets that do not announce.
  const found = new Map(); // rdns/name -> { name, icon, provider }
  window.addEventListener('eip6963:announceProvider', (e) => {
    const d = e.detail; if (!d || !d.provider || !d.info) return;
    found.set(d.info.rdns || d.info.name, { name: d.info.name, icon: d.info.icon, provider: d.provider });
  });
  const ask = () => { try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (e) {} };
  ask();

  function wallets() {
    const out = [...found.values()];
    const has = (p) => p && out.some((w) => w.provider === p);
    const extra = [
      ['Browser wallet', window.ethereum],
      ['Phantom', window.phantom && window.phantom.ethereum],
      ['Brave Wallet', window.braveEthereum],
      ['Coinbase Wallet', window.coinbaseWalletExtension],
      ['OKX Wallet', window.okxwallet],
      ['Trust Wallet', window.trustwallet],
    ];
    // only when nothing announced: an announced wallet is usually also window.ethereum behind a proxy
    if (!out.length) for (const [name, p] of extra) if (p && typeof p.request === 'function' && !has(p)) out.push({ name, icon: null, provider: p });
    return out;
  }

  async function pick() {
    ask();
    let list = wallets();
    // extensions inject a moment after load; give a late one a second
    for (let i = 0; i < 5 && !list.length; i++) { await new Promise((r) => setTimeout(r, 200)); ask(); list = wallets(); }
    if (list.length <= 1) { if (list[0]) remember(list[0].name); return list[0] ? list[0].provider : null; }
    let last = lastName();
    if (!SK.modal) return (list.find((w) => w.name === last) || list[0]).provider;
    let chosen = null;
    const body = SK.el('div', { class: 'actions', style: 'flex-direction:column;align-items:stretch' }, list.map((w) => SK.el('button', { class: 'btn sm ' + (w.name === last ? 'acid' : 'ghost'), type: 'button', onclick: () => { chosen = w; SK.closeModal(); } },
      w.icon && /^data:image\//.test(w.icon) ? SK.el('img', { src: w.icon, alt: '', width: 20, height: 20, style: 'vertical-align:middle;margin-right:8px' }) : null, w.name)));
    await SK.modal({ title: 'Which wallet?', body, ok: null, cancel: 'Cancel' });
    if (!chosen) throw new Error('No wallet picked.');
    remember(chosen.name);
    return chosen.provider;
  }

  const lastName = () => { try { return localStorage.getItem('sk-wallet'); } catch (e) { return null; } };
  const remember = (name) => { try { localStorage.setItem('sk-wallet', name); } catch (e) {} };
  // The session: a flag that lives as long as the tab does (sessionStorage), so
  // a refresh or a move between pages keeps the wallet and closing the tab or
  // the browser lets it go. Disconnect clears it.
  const session = {
    on: () => { try { return sessionStorage.getItem('sk-session') === '1'; } catch (e) { return false; } },
    set: (v) => { try { v ? sessionStorage.setItem('sk-session', '1') : sessionStorage.removeItem('sk-session'); } catch (e) {} },
  };

  class Wallet {
    constructor() { this.address = null; this.provider = null; this.signer = null; this.eth = null; this.onChange = () => {}; }
    // the provider picked at connect; before that, whatever answers first
    get injected() { return this.eth || (wallets()[0] || {}).provider || null; }

    async connect() {
      if (C.mock) { this.address = '0x5Ke11Ec0FFEE0000000000000000000000000B0e'; session.set(true); this.onChange(); return this.address; }
      if (this.eth && this.address) return this.address; // already connected: no second picker
      if (await this.resume()) return this.address; // connected earlier in this tab: no picker, no prompt
      const eth = await pick();
      if (!eth) throw new Error(/Brave/.test(navigator.userAgent) || navigator.brave
        ? 'No wallet answered. In Brave: open brave://settings/wallet and set "Default Ethereum wallet" to Brave Wallet or to your extension, then reload.'
        : 'No wallet found in this browser. Install one (MetaMask, Rabby, etc.) and reload. On a phone, open this page inside your wallet app\'s browser.');
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      return this.attach(eth, accounts);
    }

    attach(eth, accounts) {
      this.eth = eth;
      this.address = E.getAddress(accounts[0]);
      this.provider = new E.BrowserProvider(eth);
      if (!eth.__skBound) {
        eth.__skBound = true;
        eth.on?.('accountsChanged', (acc) => { this.address = acc[0] ? E.getAddress(acc[0]) : null; this.signer = null; if (!this.address) session.set(false); this.onChange(); });
        eth.on?.('chainChanged', () => { this.signer = null; this.onChange(); });
      }
      session.set(true);
      this.onChange();
      return this.address;
    }

    // After a refresh: the wallet that was connected in this tab, asked with
    // eth_accounts, which never opens a prompt. A locked wallet or a revoked
    // site answers [] and the page stays disconnected.
    async resume() {
      if (!session.on() || this.address) return !!this.address;
      if (C.mock) { this.address = '0x5Ke11Ec0FFEE0000000000000000000000000B0e'; this.onChange(); return true; }
      try {
        ask();
        let list = wallets();
        const last = lastName();
        const want = () => list.find((w) => w.name === last) || (list.length === 1 && !last ? list[0] : null);
        for (let i = 0; i < 10 && !want(); i++) { await new Promise((r) => setTimeout(r, 200)); ask(); list = wallets(); }
        const w = want() || (list.length === 1 ? list[0] : null);
        if (!w) return false;
        const accounts = await w.provider.request({ method: 'eth_accounts' });
        if (!accounts || !accounts[0]) return false;
        this.attach(w.provider, accounts);
        return true;
      } catch (e) { return false; }
    }

    // Disconnect: the site forgets the wallet until Connect is pressed again.
    forget() { this.address = null; this.signer = null; session.set(false); }

    async ensureChain() {
      if (C.mock) return true;
      const eth = this.injected;
      const cur = await eth.request({ method: 'eth_chainId' });
      if (Number(cur) === C.chain.id) return true;
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: C.chain.hex }] });
      } catch (e) {
        if (e && (e.code === 4902 || /unrecognized|not added|4902/i.test(e.message || ''))) {
          await eth.request({ method: 'wallet_addEthereumChain', params: [{
            chainId: C.chain.hex, chainName: C.chain.name, nativeCurrency: C.chain.currency, rpcUrls: C.chain.rpcs, blockExplorerUrls: [C.chain.explorer],
          }] });
        } else throw e;
      }
      const after = await eth.request({ method: 'eth_chainId' });
      if (Number(after) !== C.chain.id) throw new Error(`Wallet is not on ${C.chain.name}.`);
      this.signer = null;
      return true;
    }

    async getSigner() {
      await this.ensureChain();
      if (!this.signer) this.signer = await this.provider.getSigner();
      return this.signer;
    }

    // One transaction. call = {to, iface, fn, args, label}
    async send(call, report) {
      if (C.mock) { await new Promise((r) => setTimeout(r, 700)); return { hash: '0x' + 'ab'.repeat(32), mock: true }; }
      const signer = await this.getSigner();
      const data = call.iface.encodeFunctionData(call.fn, call.args || []);
      let tx;
      // call.gas: an explicit limit for calls whose estimate lies (a try/catch
      // around a swap "succeeds" at a lower limit by skipping the swap). Only
      // the gas actually used is charged.
      try { tx = await signer.sendTransaction(call.gas ? { to: call.to, data, gasLimit: call.gas } : { to: call.to, data }); }
      catch (e) { throw new Error(this.explain(e, call.iface)); }
      report?.('sent', tx.hash);
      const rc = await tx.wait();
      if (!rc || rc.status !== 1) throw new Error('Transaction reverted.');
      return { hash: tx.hash };
    }

    async supports5792() {
      if (C.mock) return true;
      const eth = this.injected;
      if (!eth || !this.address) return false;
      try {
        const caps = await eth.request({ method: 'wallet_getCapabilities', params: [this.address, [C.chain.hex]] });
        const c = caps && (caps[C.chain.hex] || caps[String(C.chain.id)]);
        return !!c; // any capability answer for this chain means sendCalls is understood
      } catch (e) { return false; }
    }

    // Many calls. Uses wallet_sendCalls when supported, else one tx after
    // another. report(step, info) narrates progress.
    async sendMany(calls, report) {
      if (C.mock) { for (let i = 0; i < calls.length; i++) { await new Promise((r) => setTimeout(r, 400)); report?.('done', i); } return { mock: true, batched: true }; }
      await this.ensureChain();
      const eth = this.injected;
      if (await this.supports5792()) {
        try {
          const payload = {
            version: '2.0.0', chainId: C.chain.hex, from: this.address, atomicRequired: false,
            calls: calls.map((c) => ({ to: c.to, data: c.iface.encodeFunctionData(c.fn, c.args || []) })),
          };
          const res = await eth.request({ method: 'wallet_sendCalls', params: [payload] });
          const id = typeof res === 'string' ? res : res.id;
          report?.('batched', id);
          for (let i = 0; i < 180; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            let st; try { st = await eth.request({ method: 'wallet_getCallsStatus', params: [id] }); } catch (e) { continue; }
            const code = st && (st.status ?? st.state);
            // EIP-5792 v2 status codes: 100 pending, 200 landed, 400 failed
            // off-chain, 500 reverted on chain, 600 partly reverted (only
            // possible with atomicRequired: false).
            if (code === 200) { calls.forEach((_, i) => report?.('done', i)); return { batched: true, id, receipts: st.receipts }; }
            if (code === 600) throw new Error('Some steps in the batch failed. Refresh and try the rest again.');
            if (typeof code === 'number' && code >= 400) throw new Error('The wallet reported the batch failed.');
            if (code === 'FAILED') throw new Error('The wallet reported the batch failed.');
          }
          throw new Error('Timed out waiting for the batch.');
        } catch (e) {
          if (/4100|4200|not supported|unsupported|does not support/i.test(e.message || '')) { /* fall through to sequential */ }
          else if (/reject|denied|cancel/i.test(e.message || '')) throw new Error('Rejected in the wallet.');
          else throw e;
        }
      }
      for (let i = 0; i < calls.length; i++) {
        report?.('now', i);
        await this.send(calls[i]);
        report?.('done', i);
      }
      return { batched: false };
    }

    explain(e, iface) {
      const data = revertData(e);
      if (data) {
        // the revert may come from a contract other than the one called (the
        // token, during a burn), so every interface the site knows gets a try
        const ifaces = [iface, ...Object.values(window.SKELLY_ABI || {}).map((frags) => { try { return new E.Interface(frags); } catch (_) { return null; } })].filter(Boolean);
        for (const i of ifaces) {
          try {
            const p = i.parseError(data);
            if (!p) continue;
            if (p.name === 'ERC20InsufficientBalance') return `Not enough $SKELLY in this wallet: it holds ${fmtTok(p.args[1])}, this needs ${fmtTok(p.args[2])}.`;
            if (p.name === 'ERC20InsufficientAllowance') return `The collection is only approved for ${fmtTok(p.args[1])} $SKELLY and this needs ${fmtTok(p.args[2])}. Approve again and retry.`;
            return PLAIN[p.name] || `Contract refused: ${p.name}`;
          } catch (_) { /* not this one */ }
        }
      }
      const m = e?.shortMessage || e?.message || String(e);
      if (/reject|denied|cancel/i.test(m)) return 'Rejected in the wallet.';
      if (/could not coalesce|missing response|failed to fetch|network error|timeout/i.test(m)) return "Your wallet's network node hiccuped. Nothing was sent; try again in a moment. If it keeps happening, set Robinhood Chain's RPC in your wallet to https://rpc.mainnet.chain.robinhood.com";
      if (/insufficient funds/i.test(m)) return 'Not enough ETH for gas.';
      if (/NotBound/.test(m)) return PLAIN.NotBound;
      return m.length > 160 ? m.slice(0, 160) + '…' : m;
    }
  }

  const fmtTok = (v) => { try { return Number(BigInt(v) / 10n ** 18n).toLocaleString('en-US'); } catch (_) { return String(v); } };
  // Custom errors the contracts raise, in plain words. Anything else shows
  // its name.
  const PLAIN = {
    NotBound: "$SKELLY hasn't launched yet. Wake up opens when it does.",
    NotHolder: 'That Skelly is not in this wallet.',
    AlreadyRaised: 'That Skelly is already awake.',
    NotRaised: 'Wake it up first.',
    BadRank: 'Pick a level above the one it has.',
    BadAbsorb: 'Pick 2 or 3 of your own Skellies, 3 bodies at most, no repeats.',
    WalletsOnly: 'Use a plain wallet, not a smart-contract one.',
    NothingToUnearth: 'Nothing inside to take out.',
    BadOffering: 'That payout pick is not on the menu.',
    Forbidden: 'This wallet is not allowed to do that.',
  };

  // Wallets and ethers nest the revert bytes in different places
  // (e.data, e.info.error.data, e.error.data.data, e.data.originalError.data,
  // ...). Walk a few levels for the first thing that looks like ABI-encoded
  // revert data.
  function revertData(e, depth = 0) {
    if (e == null || depth > 5) return null;
    if (typeof e === 'string') return /^0x[0-9a-fA-F]{8}([0-9a-fA-F]{2})*$/.test(e) ? e : null;
    if (typeof e !== 'object') return null;
    for (const k of ['data', 'error', 'info', 'originalError', 'cause', 'revert']) {
      const found = revertData(e[k], depth + 1);
      if (found) return found;
    }
    return null;
  }

  window.SkellyWallet = Wallet;
})();
