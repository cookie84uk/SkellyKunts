// Read model over the five contracts. Two implementations behind one shape:
// LiveChain (JSON-RPC) and MockChain (config.mock). Every value that cannot
// be read is null and renders as "—".
(function () {
  const C = window.SKELLY_CONFIG;
  const E = window.ethers;
  const A = window.SKELLY_ABI;
  const SK = window.SK;

  const IF = {
    skellies: new E.Interface(A.SkellyKuntz),
    crypt: new E.Interface(A.Crypt),
    ossuary: new E.Interface(A.Ossuary),
    tithe: new E.Interface(A.Tithe),
    erc20: new E.Interface(A.ERC20),
  };
  const ADDR = C.contracts;

  const rankOf = (burned, RANK_BURN) => {
    if (burned == null || burned === 0n) return -1; // never raised
    let r = 0;
    for (let i = 4; i > 0; i--) if (burned >= RANK_BURN[i]) { r = i; break; }
    return r;
  };

  // ------------------------------------------------------------ live
  class LiveChain {
    constructor() { this.rpc = new window.SkellyRpc(C.chain.rpcs); this._const = null; this._off = null; }
    get live() { return true; }
    r(name, fn, args) { return { to: ADDR[name], iface: IF[name], fn, args }; }

    async block() { return this.rpc.block(); }
    // the smallest pot per payout asset the Crypt will swap in one call
    async swapFloor() { const [v] = await this.rpc.reads([this.r('crypt', 'swapFloor')]); return v == null ? null : BigInt(v); }

    // Cached once the marrow is bound. While it is not (the mint opens
    // before $SKELLY launches) every call re-reads, so a Refresh after the
    // team binds the token flips the page without a reload.
    async constants() {
      // Cached only in the end state: every earlier phase is one the page must
      // see change (minting closes, the art is dealt, the token is bound).
      if (this._const && this._const.marrowBound && this._const.unveiled) return this._const;
      if (!SK.configured('skellies')) return null;
      const reads = [
        this.r('skellies', 'RAISE_BURN'), this.r('skellies', 'ABSORB_BURN_TWO'), this.r('skellies', 'ABSORB_BURN_THREE'),
        this.r('skellies', 'RELIC_BONUS_BPS'), this.r('skellies', 'RELIC_COUNT'), this.r('skellies', 'marrow'), this.r('skellies', 'MIGRATE_MAX'),
        this.r('skellies', 'unveiled'), this.r('skellies', 'summoningSealed'),
      ];
      for (let i = 0; i < 5; i++) reads.push(this.r('skellies', 'RANK_BURN', [i]));
      for (let i = 0; i < 5; i++) reads.push(this.r('skellies', 'RANK_POWER', [i]));
      const v = await this.rpc.reads(reads);
      // The chain is the authority on the marrow. The zero address means the
      // team has not bound the token yet (raise / ascend / absorb revert
      // NotBound), whatever config says. Only when the read itself failed
      // does a configured address stand in; a placeholder there means unknown.
      let marrow = null, marrowBound = null;
      if (v[5] != null) { marrowBound = !SK.isPlaceholder(v[5]); marrow = marrowBound ? v[5] : null; }
      else if (SK.configured('marrow')) { marrow = ADDR.marrow; marrowBound = true; }
      let sym = null, dec = 18;
      if (marrow) {
        const [s, d] = await this.rpc.reads([{ to: marrow, iface: IF.erc20, fn: 'symbol' }, { to: marrow, iface: IF.erc20, fn: 'decimals' }]);
        sym = s; if (d != null) dec = Number(d);
        SK.marrowDecimals = dec;
      }
      this._const = {
        RAISE_BURN: v[0], ABSORB_BURN_TWO: v[1], ABSORB_BURN_THREE: v[2], RELIC_BONUS_BPS: v[3], RELIC_COUNT: v[4], MIGRATE_MAX: v[6],
        RANK_BURN: v.slice(9, 14), RANK_POWER: v.slice(14, 19).map((x) => (x == null ? null : Number(x))),
        unveiled: v[7], sealed: v[8],
        marrowBound,
        marrow: marrow ? { address: marrow, symbol: sym || 'SKELLY', decimals: dec } : null,
      };
      return this._const;
    }

    async offerings() {
      if (this._off) return this._off;
      if (!SK.configured('crypt')) return [];
      const [count] = await this.rpc.reads([this.r('crypt', 'offeringCount')]);
      const n = count == null ? 0 : Number(count);
      const rows = await this.rpc.reads(Array.from({ length: n }, (_, i) => this.r('crypt', 'offerings', [i])));
      const metas = await this.rpc.reads(rows.flatMap((o) => (o ? [{ to: o.token, iface: IF.erc20, fn: 'symbol' }, { to: o.token, iface: IF.erc20, fn: 'decimals' }] : [])));
      let m = 0;
      this._off = rows.map((o, idx) => {
        if (!o) return { idx, token: null, symbol: `#${idx}`, decimals: 18, isStock: false };
        const symbol = metas[m++], decimals = metas[m++];
        return { idx, token: o.token, symbol: symbol || SK.short(o.token), decimals: decimals == null ? 18 : Number(decimals), isStock: o.isStock };
      });
      return this._off;
    }

    async board() {
      const out = { block: null, cauldron: null, totalPower: null, lastClosedCycle: null, totalGathered: null, CYCLE: 3600, currentCycle: null,
        totalSummoned: null, totalSupply: null, maxSupply: null, migrated: null, MIGRATE_MAX: null, marrowBound: null, raisedCount: null, lastTribute: null, pending: null };
      try { out.block = await this.rpc.block(); SK.netStatus(true); } catch (e) { SK.netStatus(false); return out; }
      const reads = [];
      if (SK.configured('crypt')) reads.push(this.r('crypt', 'cauldron'), this.r('crypt', 'totalPower'), this.r('crypt', 'lastClosedCycle'), this.r('crypt', 'totalGathered'), this.r('crypt', 'CYCLE'), this.r('crypt', 'currentCycle'));
      else reads.push(null, null, null, null, null, null);
      if (SK.configured('skellies')) reads.push(this.r('skellies', 'totalSummoned'), this.r('skellies', 'totalSupply'), this.r('skellies', 'maxSupply'), this.r('skellies', 'migrated'), this.r('skellies', 'MIGRATE_MAX'), this.r('skellies', 'marrow'));
      else reads.push(null, null, null, null, null, null);
      if (SK.configured('tithe')) reads.push(this.r('tithe', 'pending')); else reads.push(null);
      const real = reads.filter(Boolean);
      const got = real.length ? await this.rpc.reads(real) : [];
      let g = 0;
      const v = reads.map((x) => (x ? got[g++] : null));
      [out.cauldron, out.totalPower, out.lastClosedCycle, out.totalGathered] = v;
      if (v[4] != null) out.CYCLE = Number(v[4]);
      out.currentCycle = v[5] == null ? Math.floor(out.block.timestamp / out.CYCLE) : Number(v[5]);
      [out.totalSummoned, out.totalSupply, out.maxSupply, out.migrated, out.MIGRATE_MAX] = v.slice(6, 11).map((x) => (x == null ? null : Number(x)));
      // null = could not read; false = the token is not bound yet (mint open,
      // $SKELLY not launched); true = bound.
      out.marrowBound = v[11] == null ? null : !SK.isPlaceholder(v[11]);
      const c = await this.constants();
      out.unveiled = c ? c.unveiled : null;
      out.sealed = c ? c.sealed : null;
      out.pending = v[12];
      return out;
    }

    // Counts raised skellies by asking each id. Separate from board() because
    // it is the one heavy read; the page runs it once.
    async raisedCount(totalSummoned) {
      if (!SK.configured('skellies') || !totalSummoned) return null;
      const v = await this.rpc.reads(Array.from({ length: totalSummoned }, (_, i) => this.r('skellies', 'isRaised', [i + 1])));
      if (v.every((x) => x == null)) return null;
      return v.filter((x) => x === true).length;
    }

    async lastTribute(latestBlock) {
      if (!SK.configured('crypt') || !latestBlock) return null;
      const topic = IF.crypt.getEvent('CycleClosed').topicHash;
      const span = 90000; // ~2.5 h at 0.1 s blocks
      const from = Math.max(C.chain.deployBlock || 0, latestBlock - span);
      const logs = await this.rpc.logs(ADDR.crypt, [topic], from, latestBlock);
      if (!logs) return null; // could not read: renders "—"
      if (!logs.length) return false; // read fine, no cycle closed in the window
      const last = logs[logs.length - 1];
      const d = IF.crypt.decodeEventLog('CycleClosed', last.data, last.topics);
      return { cycle: Number(d.cycle), pot: d.pot, totalPower: d.totalPower, block: Number(last.blockNumber) };
    }

    async mine(addr) {
      if (!SK.configured('skellies')) return { ids: [], skellies: [], marrow: null };
      const [total] = await this.rpc.reads([this.r('skellies', 'totalSummoned')]);
      const n = total == null ? 0 : Number(total);
      const owners = await this.rpc.reads(Array.from({ length: n }, (_, i) => this.r('skellies', 'ownerOf', [i + 1])));
      const ids = [];
      owners.forEach((o, i) => { if (o && o.toLowerCase() === addr.toLowerCase()) ids.push(i + 1); });
      const skellies = await this.tokens(ids);
      const consts = await this.constants();
      let marrow = null;
      if (consts && consts.marrow) {
        const [bal, allow] = await this.rpc.reads([
          { to: consts.marrow.address, iface: IF.erc20, fn: 'balanceOf', args: [addr] },
          { to: consts.marrow.address, iface: IF.erc20, fn: 'allowance', args: [addr, ADDR.skellies] },
        ]);
        marrow = { ...consts.marrow, balance: bal, allowance: allow };
      }
      return { ids, skellies, marrow };
    }

    // Everything the site shows about a Skelly, for any list of ids: form,
    // awake, level, souls, power, relic, what it is owed and what it holds.
    // A burned id comes back with `gone: true`.
    async tokens(ids) {
      if (!SK.configured('skellies') || !ids.length) return [];
      const consts = await this.constants();
      const offs = await this.offerings();
      const per = 8;
      const reads = ids.flatMap((id) => [
        this.r('skellies', 'formOf', [id]), this.r('skellies', 'isRaised', [id]), this.r('skellies', 'bonesBurned', [id]),
        this.r('skellies', 'souls', [id]), this.r('skellies', 'absorbedPower', [id]), this.r('skellies', 'powerOf', [id]),
        this.r('skellies', 'isRelic', [id]), this.r('skellies', 'devouredForms', [id]),
      ]);
      const cryptOk = SK.configured('crypt'), ossOk = SK.configured('ossuary');
      const per2 = (cryptOk ? 2 + offs.length : 0) + (ossOk ? 1 : 0);
      const reads2 = ids.flatMap((id) => [
        ...(cryptOk ? [this.r('crypt', 'owedEth', [id]), this.r('crypt', 'portionOf', [id]), ...offs.map((o) => this.r('crypt', 'owedOffering', [id, o.idx]))] : []),
        ...(ossOk ? [this.r('ossuary', 'holdingsOf', [id])] : []),
      ]);
      const [owners, [summoned]] = await Promise.all([this.rpc.reads(ids.map((id) => this.r('skellies', 'ownerOf', [id]))), this.rpc.reads([this.r('skellies', 'totalSummoned')])]);
      const nSummoned = summoned == null ? 0 : Number(summoned);
      const [v, w] = await Promise.all([this.rpc.reads(reads), this.rpc.reads(reads2)]);
      const skellies = ids.map((id, k) => {
        const b = k * per, c = k * per2;
        const burned = v[b + 2];
        const s = { id, owner: owners[k] || null, minted: id <= nSummoned, gone: id <= nSummoned && !owners[k], form: v[b] == null ? null : Number(v[b]), raised: v[b + 1], bonesBurned: burned, souls: v[b + 3] == null ? 1 : Math.max(1, Number(v[b + 3])),
          absorbedPower: v[b + 4] == null ? null : Number(v[b + 4]), power: v[b + 5] == null ? null : Number(v[b + 5]), relic: v[b + 6], devouredForms: v[b + 7] == null ? 0 : Number(v[b + 7]),
          rank: consts ? rankOf(burned, consts.RANK_BURN) : -1, owedEth: null, portion: null, owedSlots: [], holdings: [] };
        let p = c;
        if (cryptOk) {
          s.owedEth = w[p++];
          const po = w[p++];
          if (po) s.portion = { idx: Array.from(po[0], Number).slice(0, Number(po[2])), bps: Array.from(po[1], Number).slice(0, Number(po[2])), count: Number(po[2]) };
          offs.forEach((o) => { const amt = w[p++]; if (amt && amt > 0n) s.owedSlots.push({ idx: o.idx, amount: amt, symbol: o.symbol, decimals: o.decimals }); });
        }
        if (ossOk) {
          const h = w[p++];
          if (h) h[1].forEach((amt, idx) => { if (amt > 0n) { const o = offs[idx]; s.holdings.push({ idx, token: h[0][idx], amount: amt, symbol: o ? o.symbol : SK.short(h[0][idx]), decimals: o ? o.decimals : 18 }); } });
        }
        return s;
      });
      return skellies;
    }
  }

  // ------------------------------------------------------------ mock
  const T = (n) => E.parseUnits(String(n), 18);
  const MOCK = {
    consts: {
      RAISE_BURN: T(25000), ABSORB_BURN_TWO: T(50000), ABSORB_BURN_THREE: T(100000), RELIC_BONUS_BPS: 15000n, RELIC_COUNT: 11n, MIGRATE_MAX: 200n,
      RANK_BURN: [T(25000), T(75000), T(150000), T(300000), T(850000)], RANK_POWER: [100, 140, 190, 250, 350],
      marrow: { address: '0x00000000000000000000000000000000000Ba5e5', symbol: 'SKELLY', decimals: 18 },
    },
    offerings: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'PLTR', 'AMD', 'GME', 'SPCX', 'USDG'].map((symbol, idx) => ({ idx, token: `0x${(idx + 1).toString(16).padStart(40, '0')}`, symbol, decimals: symbol === 'USDG' ? 6 : 18, isStock: symbol !== 'USDG' })),
    addr: '0x5Ke11Ec0FFEE0000000000000000000000000B0e',
    marrow: { balance: T(412500), allowance: 0n },
    skellies: [
      { id: 7, form: 3, raised: true, bonesBurned: T(150000), souls: 2, absorbedPower: 140, power: 594, relic: true, devouredForms: 233, owedEth: E.parseEther('0.0184'), portion: { idx: [2, 11], bps: [7000, 3000], count: 2 }, owedSlots: [],
        holdings: [{ idx: 2, symbol: 'NVDA', decimals: 18, amount: E.parseUnits('0.4127', 18) }, { idx: 11, symbol: 'USDG', decimals: 6, amount: E.parseUnits('61.42', 6) }] },
      { id: 88, form: 88, raised: true, bonesBurned: T(75000), souls: 1, absorbedPower: 0, power: 140, relic: false, devouredForms: 0, owedEth: E.parseEther('0.0041'), portion: null, owedSlots: [],
        holdings: [{ idx: 11, symbol: 'USDG', decimals: 6, amount: E.parseUnits('12.07', 6) }] },
      // awake and earning, first payout not in yet: the card explains the wait
      { id: 12, form: 12, raised: true, bonesBurned: T(850000), souls: 1, absorbedPower: 0, power: 350, relic: false, devouredForms: 0, owedEth: E.parseEther('0.00119'), portion: { idx: [11], bps: [10000], count: 1 }, owedSlots: [], holdings: [] },
      { id: 512, form: 512, raised: false, bonesBurned: 0n, souls: 1, absorbedPower: 0, power: 0, relic: false, devouredForms: 0, owedEth: 0n, portion: null, owedSlots: [], holdings: [] },
      { id: 777, form: 777, raised: false, bonesBurned: T(25000), souls: 1, absorbedPower: 0, power: 0, relic: false, devouredForms: 0, owedEth: 0n, portion: { idx: [0], bps: [10000], count: 1 }, owedSlots: [{ idx: 0, symbol: 'AAPL', decimals: 18, amount: E.parseUnits('0.0213', 18) }],
        holdings: [{ idx: 0, symbol: 'AAPL', decimals: 18, amount: E.parseUnits('0.0912', 18) }] },
    ],
  };

  // The 'minting' phase: the free mint is open, $SKELLY does not exist yet.
  // marrow() is the zero address, nothing can be raised, no cycle has closed.
  const MINTING = {
    skellies: [
      { id: 512, form: 512, raised: false, bonesBurned: 0n, souls: 1, absorbedPower: 0, power: 0, relic: false, devouredForms: 0, owedEth: null, portion: null, owedSlots: [], holdings: [] },
      { id: 777, form: 777, raised: false, bonesBurned: 0n, souls: 1, absorbedPower: 0, power: 0, relic: false, devouredForms: 0, owedEth: null, portion: null, owedSlots: [], holdings: [] },
    ],
  };

  class MockChain {
    get live() { return false; }
    get minting() { return C.mockPhase === 'minting' || C.mockPhase === 'sealed'; }
    // 'sealed' = minting is closed and the beacon that deals the art has not
    // landed yet, so no Skelly knows its picture.
    get shrouded() { return C.mockPhase === 'minting' || C.mockPhase === 'sealed'; }
    _t0 = Math.floor(Date.now() / 1000) - 137; // fake chain clock, slightly behind
    async block() { return { number: 62_401_337 + Math.floor((Date.now() / 1000 - this._t0) * 10), timestamp: Math.floor(Date.now() / 1000) - 137 }; }
    async constants() { return this.minting ? { ...MOCK.consts, marrow: null, marrowBound: false, unveiled: false, sealed: C.mockPhase === 'sealed' } : { ...MOCK.consts, marrowBound: true, unveiled: true, sealed: true }; }
    async offerings() { return MOCK.offerings; }
    async swapFloor() { return E.parseEther('0.0005'); }
    async board() {
      const block = await this.block();
      const CYCLE = 3600;
      if (this.minting) {
        return { block, cauldron: null, totalPower: null, lastClosedCycle: null, totalGathered: null, CYCLE, currentCycle: Math.floor(block.timestamp / CYCLE),
          totalSummoned: 431, totalSupply: 431, maxSupply: 1100, migrated: 173, MIGRATE_MAX: 200, marrowBound: false, unveiled: false, sealed: C.mockPhase === 'sealed', raisedCount: null, lastTribute: null, pending: null };
      }
      return { block, cauldron: E.parseEther('0.4271'), totalPower: 61_230n, lastClosedCycle: Math.floor(block.timestamp / CYCLE) - 0, totalGathered: E.parseEther('38.914'), CYCLE,
        currentCycle: Math.floor(block.timestamp / CYCLE), totalSummoned: 1100, totalSupply: 1087, maxSupply: 1100, migrated: 173, MIGRATE_MAX: 200, marrowBound: true, raisedCount: null, lastTribute: null, pending: E.parseEther('0.0932') };
    }
    async raisedCount() { await new Promise((r) => setTimeout(r, 400)); return this.minting ? 0 : 412; }
    async lastTribute() { return this.minting ? false : { cycle: 496_121, pot: E.parseEther('0.6118'), totalPower: 60_910n, block: 62_400_001 }; }
    async mine() {
      await new Promise((r) => setTimeout(r, 300));
      if (this.minting) return { ids: MINTING.skellies.map((s) => s.id), skellies: MINTING.skellies.map((s) => ({ ...s, form: null, relic: false, rank: -1 })), marrow: null };
      return { ids: MOCK.skellies.map((s) => s.id), skellies: MOCK.skellies.map((s) => ({ ...s, rank: rankOf(s.bonesBurned, MOCK.consts.RANK_BURN) })), marrow: { ...MOCK.consts.marrow, ...MOCK.marrow } };
    }
    // Any id list: known mock Skellies as they are, other ids made up from the id.
    async tokens(ids) {
      await new Promise((r) => setTimeout(r, 200));
      const pool = this.minting ? MINTING.skellies : MOCK.skellies;
      return ids.map((id) => {
        const k = pool.find((s) => s.id === id);
        if (k) return { ...k, owner: '0x5Ke11Ec0FFEE0000000000000000000000000B0e', minted: true, gone: false, rank: this.minting ? -1 : rankOf(k.bonesBurned, MOCK.consts.RANK_BURN), form: this.minting ? null : k.form, relic: this.minting ? false : k.relic };
        if (id > 1100) return { id, minted: true, gone: true, owner: null, form: null, raised: false, bonesBurned: 0n, souls: 1, absorbedPower: 0, power: 0, relic: false, devouredForms: [], rank: -1, owedEth: 0n, portion: null, owedSlots: [], holdings: [] };
        const raised = !this.minting && id % 3 !== 0;
        return { id, minted: true, gone: false, owner: '0x' + String(id).padStart(40, 'a'), form: this.minting ? null : id, raised, bonesBurned: raised ? MOCK.consts.RANK_BURN[id % 5] : 0n, souls: id % 7 === 0 ? 2 : 1, absorbedPower: 0, power: raised ? MOCK.consts.RANK_POWER[id % 5] : 0, relic: id <= 11, devouredForms: [], rank: raised ? id % 5 : -1, owedEth: raised ? E.parseEther('0.0021') : 0n, portion: null, owedSlots: [], holdings: raised ? [{ idx: 0, token: MOCK.offerings[0].token, amount: 1234567n, symbol: 'AAPL', decimals: 6 }] : [] };
      });
    }
    // Simulated effects of writes so the page reflects a "sent" action.
    apply(kind, a) {
      const find = (id) => MOCK.skellies.find((s) => s.id === id);
      if (kind === 'approve') MOCK.marrow.allowance = a.amount;
      if (kind === 'raise') { const s = find(a.id); s.raised = true; if (s.bonesBurned === 0n) s.bonesBurned = MOCK.consts.RANK_BURN[0]; s.power = 100; MOCK.marrow.balance -= MOCK.consts.RAISE_BURN; }
      if (kind === 'ascend') { const s = find(a.id); MOCK.marrow.balance -= MOCK.consts.RANK_BURN[a.rank] - s.bonesBurned; s.bonesBurned = MOCK.consts.RANK_BURN[a.rank]; s.power = s.raised ? MOCK.consts.RANK_POWER[a.rank] : 0; }
      if (kind === 'absorb') { const sv = find(a.ids[0]); for (const id of a.ids.slice(1)) { const b = find(id); sv.absorbedPower += b.raised ? 100 : 0; sv.souls += b.souls; MOCK.skellies.splice(MOCK.skellies.indexOf(b), 1); } sv.power = Math.floor(sv.power * 1.2); MOCK.marrow.balance -= a.cost; }
      if (kind === 'portion') { const s = find(a.id); s.portion = { idx: a.idx, bps: a.bps, count: a.idx.length }; }
      if (kind === 'claim') for (const id of a.ids) { const s = find(id); const usdg = s.holdings.find((h) => h.idx === 11); const got = s.owedEth * 2600n / 10n ** 12n; if (usdg) usdg.amount += got; else s.holdings.push({ idx: 11, symbol: 'USDG', decimals: 6, amount: got }); s.owedEth = 0n; }
      if (kind === 'unearth') { const s = find(a.id); s.holdings = []; }
      if (kind === 'unearthOwed') { const s = find(a.id); s.owedSlots = s.owedSlots.filter((x) => x.idx !== a.idx); }
    }
  }

  window.SkellyChain = { LiveChain, MockChain, IF, rankOf, make: () => (C.mock ? new MockChain() : new LiveChain()) };
})();
