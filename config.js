// SkellyKuntz site configuration. Every address, link and switch lives here.
// Placeholders are the zero address / obvious tokens; the site refuses to
// read the chain while a required address is still a placeholder and shows
// "—" instead. Flip `mock` to false for deploy.
window.SKELLY_CONFIG = {
  // Renders plausible fake chain state and a fake wallet so every page can
  // be screenshotted before the contracts exist. Must be false in production.
  mock: false,
  // Which product state the mock renders. 'minting': the free mint is open
  // but $SKELLY has not launched (marrow() is the zero address; raise,
  // ascend and absorb revert NotBound). 'live': token bound, pot running.
  // The live site never reads this; it reads marrow() from the chain.
  mockPhase: 'live',

  // The Ink-holders banner. Off since 2026-09-15: the airdrop goes to the
  // holders who completed the form posted on X, and that ask lives on X.
  migrationLive: false,

  chain: {
    id: 4663,
    hex: '0x1237',
    name: 'Robinhood Chain',
    currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    // Tried in order; a failing node is rotated out for the session.
    rpcs: [
      'https://rpc.mainnet.chain.robinhood.com',
      // Fallbacks (all answer browsers with CORS *). The official node
      // rate-limits bursts hard (HTTP 429 with a malformed CORS header the
      // browser reports as "Failed to fetch"), so a page load that fires
      // several batches at once needs somewhere else to go.
      'https://robinhood-rpc.publicnode.com',
      'https://robinhood.drpc.org',
      'https://rpc.ordofi.network',
    ],
    // At most this many JSON-RPC requests in flight at once, site-wide.
    rpcConcurrency: 2,
    // At most this many JSON-RPC calls per HTTP batch (the public node caps there).
    batchMax: 40,
    // Multicall3 (same address on most chains). Probed once with getChainId();
    // if the probe fails the site falls back to plain batches.
    multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    // Reads per Multicall3 aggregate3 call.
    multicallChunk: 250,
    explorer: 'https://robinhoodchain.blockscout.com',
    // Block the collection was deployed at (narrows event scans). 0 = unknown.
    deployBlock: 63866023,
  },

  contracts: {
    // SkellyKuntz (ERC-721, SeaDrop-compatible)
    skellies: '0x0710E2AB29dD12CBB7522C37f7b51DF6E569bd3A',
    // Skelly token on Pons (the "marrow" the collection burns)
    marrow: '0x87022254d364f2B2b8e1974232b6B4Ee605d770E',
    // Crypt (hourly engine)
    crypt: '0x31a95ef7B8f78089FeCB6Ee7E65eDa743B97911C',
    // Ossuary (per-token holdings)
    ossuary: '0x48140884A4a1B9C5d374C12169B42e9FB998331A',
    // Tithe (50/50 fee splitter, no owner)
    tithe: '0x19F0AdD6E507080b82A3E298e036d11AAb44EFfc',
    // the Pons bonding curve of the token (buy/sell while it has not graduated);
    // set together with marrow so the site can take buys without the Pons UI
    curve: '0x192Bc06A87A98B861741b3191ff370f095E04fB1',
    // SKELLY ROLL, the slot machine (zero = not deployed yet; the page says so)
    roll: '0x8A56DBC9227EC26fB3F0F200666DAb9Dc89A1c30',
  },

  links: {
    // OpenSea drop page (free mint)
    mint: 'https://opensea.io/collection/skellykuntz/overview',
    // OpenSea collection page
    collection: 'https://opensea.io/collection/skellykuntz',
    // OpenSea asset URL pattern; {contract} and {id} are replaced
    asset: 'https://opensea.io/item/robinhood/{contract}/{id}',
    // The $SKELLY page on Pons. Left empty, every buy button resolves to
    // ponsLaunchpad + the token address the moment `contracts.marrow` is set.
    token: '',
    ponsLaunchpad: 'https://www.ponsfamily.com/launchpad/',
    // Social
    x: 'https://x.com/SkellyKuntz',
    discord: 'https://discord.gg/BT6dKJEFkN',
    telegram: 'https://t.me/SkellyKuntz',
    // How to get ETH onto Robinhood Chain (bridge). Empty = no button in the FAQ.
    bridge: '',
    // The $SKELLY chart (DexScreener pair page) once the pool exists. Empty = no button.
    chart: '',
  },

  ipfs: {
    // Replace CID_PLACEHOLDER with the pinned images folder CID.
    // {cid} and {id} are replaced; the site shows local samples / a
    // placeholder card while the CID is still the placeholder.
    // The pre-reveal card, shown for every Skelly until the beacon deals the art.
    shroudUrl: 'https://indigo-actual-quail-223.mypinata.cloud/ipfs/bafkreigwhqrcuotog2wci3vvr7cfcfzuqhzvu6tvdlssq5aypda2l2q5xa',
    imageUrl: 'https://indigo-actual-quail-223.mypinata.cloud/ipfs/{cid}/{id}.png',
    imagesCid: 'bafybeigenqezaye47buhcnbmcasvf6sn4fdgttghafieb7stmclko2gcfy',
  },

  // The list: free mints go to it first. Getting on it is a post on X
  // (skellykuntz.com/list/). `url` is the Worker in list/worker.js; while it
  // is the placeholder the page says the list opens soon. `open: false`
  // closes it on the site side (the Worker has its own LIST_CLOSED switch).
  list: {
    url: 'https://list.skellykuntz.workers.dev',
    open: false,
    // The post. {pass} is the person's SKULL-XXXXX. The Worker requires the
    // ticker, the tag and the pass to be in the post, so keep those here.
    post: "just got my spot on the SkellyKuntz list. free mint incoming.\n\n1,100 skeletons on robinhood chain that get paid every hour in blue chip stocks.\n\npost your card and you're in too. pass {pass} \u00b7 $SKELLY @SkellyKuntz",
    // Cloudflare Turnstile site key (public by design; the secret half lives
    // in the Worker). Empty = no captcha on the page.
    turnstileSiteKey: '',
  },

  // Cloudflare Web Analytics beacon token (the dashboard is private to the
  // account; the token itself is public by design). Empty = no analytics.
  analyticsToken: '',

  // The stats Worker (stats/worker.js): one JSON every five minutes with the
  // counts, volumes, rewards and OpenSea listings. Placeholder = the pages
  // fall back to what the chain answers directly and say the rest is coming.
  stats: {
    url: 'https://stats.skellykuntz.workers.dev',
  },

  // The mint. `opensAt` (ISO 8601, UTC, e.g. '2026-09-21T18:00:00Z') turns
  // on the countdown on the board and the list page; empty = no countdown.
  mint: {
    opensAt: '2026-09-17T16:10:00Z',
    // true once every Skelly is minted (2026-09-17 ~16:40 UTC): the countdown
    // block says "Minted out" and its button is "Buy on OpenSea" (links.collection).
    soldOut: true,
  },

  // $SKELLY burned per level, whole tokens: RANK_BURN(0..4) on the contract
  // (checked 2026-09-16). The wake-up is the first rung.
  ladder: [25000, 75000, 150000, 300000, 850000],
  // what every Skelly holder receives at the token launch (the first wake-up)
  seedAmount: 25000,

  collection: {
    name: 'SkellyKuntz',
    symbol: 'SKELLY',
    supply: 1100,
    relics: 11,
    // Ink-chain edition that was migrated 1:1
    inkContract: '0xf7ba30def38bb69ea49a7272622380aa2491add7',
    inkMinted: 160,
    migrateMax: 200,
    provenance: '2224a2f8680a41dec4d624fd7d97edd3ba4782b4393d46d1eeb58a58a447923e',
  },

  // Form ids that ship as downscaled samples in img/ (used for the hero, the
  // relic list and as a stand-in while the IPFS CID is a placeholder).
  sampleForms: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 88, 233, 377, 512, 777],
  heroForms: [7, 1, 88, 3, 233, 12, 512, 777],
};
