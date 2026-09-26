# Site ↔ contracts consistency audit

Date: 2026-09-13. Scope: `site/js/{mine,board,chain,wallet,ui,rpc}.js`,
`site/config.js`, `site/tools/{build-abi,check}.mjs` against
`contracts/src/*.sol`, the compiled ABIs in `contracts/out/<Name>.sol/<Name>.json`
and the symbol map in `contracts/PORT_NOTES.md`. Nothing outside `site/` was
edited. Nothing was committed.

Method: regenerated the ABI fragments from the compiled artifacts into a
scratch file and diffed against the shipped `js/abi.js`; read every
`fn`/`args`/decode site in the five JS files against the ABI and the source;
re-derived the constants and the power formula from `SkellyKuntz.sol`;
ran the preview math against integer bps math over every rank × absorbed ×
souls × relic combination (0 mismatches); proved the NotBound decode path
in node against six error shapes; ran `node tools/check.mjs` (30/30).

## 1. Mismatches found and fixed

| # | Where | What was wrong | Fix |
|---|---|---|---|
| 1 | `js/abi.js:63` (generated 16:16, contract changed 19:07) | Stale against `contracts/out`: `error NotBound()` was missing, so a NotBound revert could not be decoded and showed as raw bytes / "execution reverted". | Regenerated with `tools/build-abi.mjs`. `NotBound()` is now at `js/abi.js:65`. |
| 2 | `tools/build-abi.mjs:26` | `MarrowBound` event not in the wanted list (the event that marks the token launch on chain). | Added; emitted at `js/abi.js:50`. |
| 3 | `js/chain.js:44` (old) `constants()` | When `marrow()` returned the zero address the site **fell back to `config.contracts.marrow`**. The chain's zero is the real "not bound yet" state; the fallback would have shown a balance/allowance for a token the collection cannot burn, and `raise` would have reverted `NotBound` after an approval. | The chain is authoritative: `marrowBound = !isPlaceholder(marrow())`; config only stands in when the read itself failed. New field `marrowBound: true \| false \| null` (null = could not read). Cache only while bound so Refresh flips the page after launch. |
| 4 | `js/mine.js:175` (old) raise preview | Relic multiplier hard-coded as `* 1.5` instead of `RELIC_BONUS_BPS`; absorbed power and the soul bonus were ignored, so a never-woken survivor of a merge previewed the wrong share points. | New `previewPower(rank, absorbed, souls, relic)` mirroring `SkellyKuntz.powerOf` (rank power + absorbed → +20%/+30% souls → relic bps, integer floor at each step, as the contract does). Raise, ascend and absorb previews all use it (`js/mine.js:22-29`). |
| 5 | `js/mine.js:184-186, 218-219` (old) ascend/absorb previews | Float multipliers `1.2 / 1.3 / bps/10000` with nested `Math.floor`. Verified exact for every reachable combination, but not the contract's integer math. | Replaced by `previewPower` (integer bps). |
| 6 | `js/mine.js:131` (old) `run()` | With no marrow (unbound or read failed) the approve step dereferenced `mine.marrow.address` → TypeError instead of a message. | Guard: toast the plain launch note (unbound) or "Could not read the $SKELLY token" (read failed) before the dialog. |
| 7 | `js/wallet.js:115-118` (old) `explain()` | Revert data only looked at `e.data`, `e.info.error.data`, `e.error.data`; MetaMask/ethers also nest it at `e.error.data.data`, `e.data.originalError.data`, `e.cause…`. Decoded errors rendered as `Contract refused: NotBound`. | `revertData()` walks those keys to depth 5; `PLAIN` table maps `NotBound` → "$SKELLY hasn't launched yet. Wake up opens when it does." plus plain text for NotHolder / AlreadyRaised / NotRaised / BadRank / BadAbsorb / WalletsOnly / NothingToUnearth / BadOffering / Forbidden. Verified in node against `0x179435b3` (= keccak("NotBound()")[:4]) in all six shapes and the message-only form. |
| 8 | `js/wallet.js:96-97` (old) EIP-5792 | Status 600 (partly reverted, possible with `atomicRequired: false`) was reported as a generic batch failure. | Explicit message. The rest of the v2 shape was right: `wallet_getCapabilities [address, [chainHex]]`, `wallet_sendCalls [{version:'2.0.0', chainId, from, atomicRequired, calls:[{to,data}]}]`, `{id}` or string result, `wallet_getCallsStatus [id]` → numeric `status`. |
| 9 | `js/ui.js:66` (old) `SK.tokens` | Assumed 18 decimals for marrow amounts while `constants()` read `decimals()` live and dropped it. | `SK.marrowDecimals` set by `constants()`; `tokens()` uses it. |
| 10 | `js/board.js:46` (old) | Migration denominator came from `config.collection.migrateMax`, not the contract. | `board()` reads `MIGRATE_MAX` (contract: 200) with config as fallback. |
| 11 | `js/chain.js:111` (old) `lastTribute()` | "no logs" and "log scan failed" both returned null, so an RPC failure rendered as "no cycle closed yet". | `false` = scan fine, nothing in the window; `null` = could not read → "—". |

## 2. Verified correct (no change)

- **Function names / argument order / types**: `raise(uint256)`,
  `ascend(uint256,uint8)`, `absorb(uint256[])`, `setPortion(uint256,uint8[],uint16[])`,
  `unearthOwed(uint256,uint8)`, `unearth(uint256)`, `unearthOne(uint256,uint8)`,
  `approve(address,uint256)` — all match the ABI; ids are passed as numbers
  (ethers encodes them as uint256), ranks 1..4 as uint8.
- **Return decoding**: `portionOf` → `(uint8[3], uint16[3], uint8)` read as
  `po[0..2]`; `holdingsOf` → 14 slots aligned to offering index (Ossuary
  `MAX_SLOTS`), the site indexes `offs[idx]` accordingly; `offerings(i)` read
  by name (`token`, `isStock`); `RANK_POWER` uint16 → Number; `souls` 0 → 1
  (contract treats 0 as 1). Multi-output results are returned as the ethers
  `Result` (`d.length === 1 ? d[0] : d` in `rpc.js:110`).
- **Events / topics**: `CycleClosed(uint256 indexed cycle, uint256 pot, uint256 totalPower)`
  topic from `IF.crypt.getEvent('CycleClosed').topicHash`, decoded by name.
  `Absorbed` carries `marrowBurned` as in the source.
- **Constants** (site reads them live; the mock uses the same values):
  `RAISE_BURN` 25,000e18; `RANK_BURN` [25k, 75k, 150k, 300k, 850k]e18;
  `RANK_POWER` [100, 140, 190, 250, 350]; `ABSORB_BURN_TWO` 50,000e18;
  `ABSORB_BURN_THREE` 100,000e18; `RELIC_BONUS_BPS` 15,000; `RELIC_COUNT` 11
  (`config.collection.relics` 11 matches); `MIGRATE_MAX` 200
  (`config.collection.migrateMax` 200 matches); `CYCLE` 3600 (site default
  3600, overwritten by the live read).
- **rankOf** (`chain.js`): burned == 0 → never raised; else highest i in 4..1
  with burned ≥ RANK_BURN[i], else 0 — same loop as `powerOf`.
- **Absorb cost**: `ABSORB_BURN_TWO`, `+ ABSORB_BURN_THREE` when the total is
  3 souls, `= ABSORB_BURN_THREE` when the survivor already holds 2 — identical
  to `absorb()`. Gained power = `_basePower` of each body (rank power +
  absorbed, no soul/relic bonus) — identical.
- **Ascend rules**: button off when `bonesBurned == 0` (`NotRaised`) or rank 4;
  a rung at or below the current burn is disabled (`BadRank`); cost is the
  difference — identical.
- **Approve flow**: spender is `config.contracts.skellies` in both the
  allowance read (`chain.js` `allowance(addr, ADDR.skellies)`) and the approve
  call (`mine.js` `approve(ADDR.skellies, amount)` sent to the marrow token).
  Correct: `_burnMarrow` runs `marrow.transferFrom(holder, DEAD, amount)` from
  the SkellyKuntz contract. Owner is the connected address.
- **40-call batch cap**: `rpc.js` slices every JSON-RPC batch at
  `config.chain.batchMax` (40). Multicall3 `aggregate3` chunks of 250 reads
  ride inside those batches; a failed probe (`getChainId()` ≠ 4663) falls
  back to plain batched `eth_call`s. Per-call failures come back as `null`,
  never 0.
- **"—" not 0**: every null/undefined value goes through `SK.int/eth/units/
  tokens/power` which render `—`; `raisedCount` returns null when every read
  failed; the board leaves `—` when a read is missing. New in the minting
  state: pot tiles are forced to `—`, Awake reads `0` (exact: nothing can be
  raised while unbound and a bound token can never be unbound).
- **EIP-5792 v2 shape**: see row 8.

## 3. "Token not launched yet" state (Part 2)

Detection: `marrow()` read live in both `constants()` and `board()`;
`marrowBound === false` when it is the zero address. Config's
`contracts.marrow` is never trusted over the chain.

- `my/`: Wake up, Level up and Merge selected are disabled (tooltip = the
  note); the note "Wake up opens when $SKELLY launches." shows under the stats
  (`#launch-note`); the merge hint reads "Merge opens when $SKELLY launches.";
  `$SKELLY in wallet` / `approved to burn` read `—`. Payout pick and Take out
  stay enabled (they do not burn). A burn attempt that somehow gets through
  toasts the note; a `NotBound` revert decodes to "$SKELLY hasn't launched
  yet. Wake up opens when it does."
- `index`: pot tiles (`[data-pot]`: In the pot, Next payout in, Share points,
  Last payout, Paid in so far) read `—` and dim; Awake reads `0 of N`; the
  line "Minting is open. $SKELLY launches next; that's when Skellies start
  earning." shows under the board (`#board-note`); the $SKELLY CTA reads
  "$SKELLY / launching soon" (no href, aria-disabled); the Wake up CTA reads
  "Wake up / opens at token launch" (still links to /my/, dimmed). The
  migration banner is untouched.
- Mock: `config.mockPhase: 'minting' | 'live'` (default `'live'`).
- Check: `tools/check.mjs` renders index and my in both phases at the six
  sizes (docs once), keeps the overflow/overlap/clipping assertions, and adds
  state assertions (button disabled state, exact note strings, CTA strings,
  dashed pot tiles, banner present). Flow shots run in the live phase only.

## 4. New config keys

- `mockPhase: 'minting' | 'live'` in `config.js` (mock only; the live site
  reads `marrow()`).

## 5. Check results

`node tools/check.mjs`: 30/30 PASS (index-live ×6, index-minting ×6,
my-live ×6, my-minting ×6, docs ×6). Screenshots in `site/shots/`
(`<page>-<phase>-<w>x<h>[-full|-ascend|-unearth-all].png`).

Forbidden-string sweep over `site/` (excluding node_modules, vendor, shots,
img, package-lock): clean, AUDIT.md included. One hit slipped in during the
work (an ordinary English word in a comment carrying one of the substrings)
and was reworded before the final sweep.
