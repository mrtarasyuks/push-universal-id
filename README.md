# Push Universal ID

**Who are you on Push Chain?** Paste any address from any supported origin chain
(Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, BNB testnet, Solana devnet, or a
native Push address) and this tool shows its **Universal Executor Account (UEA)** on the
Push Chain **Donut testnet**: whether it is deployed, its balance, transaction count,
token transfers, the real apps it interacted with, and recent activity — with a
link to the Donut explorer for every on-chain item.

The derived UEA is also **verified on-chain**: besides computing it offchain (`CREATE2`), the
tool asks the Push factory's own `computeUEA` view to confirm the address — so you see the chain
itself validating the result, even when the account is not deployed yet. It shows the UEA's
**current token holdings** (what it holds on Push Chain right now, with the external chain each
bridged asset represents), and every address has a one-click **copy** button plus a **copy-link**
button to share the exact result.

It also works **in reverse**: paste a UEA address that is already on Push Chain and it tells
you which origin wallet and chain it belongs to (asked straight from the Push factory), and it
**decodes each `executeUniversalTx`** to show the real target application of every universal
action — not just the relayer and token contracts a plain explorer stops at. For cross-chain
actions it reads the gateway's own **`UniversalTxOutbound` event** (via `eth_getLogs`) to show
the **exact destination chain** the universal call was routed to (and the recipient contract on
it), rather than inferring the chain from the bridged token. A ✓ next to a destination means it
was confirmed from that event. Actions are **grouped per app**, so you see at a
glance the wallet's main integrations (how many calls and how much PC each), and the full
history is **auto-loaded in the background** so gas and the top-apps totals cover everything,
not just the first page.

It is a **read-only** static site. There is **no wallet connect, no signing, no
transactions, no backend, and no API keys** — everything is computed in your browser from
public data. Nothing to approve, nothing to trust with your keys.

Live example (ETH Sepolia origin with an active UEA):
`?address=0xdcffb983a2d59f45718afdf5029efcf30a7c85a6&chain=eth-sepolia`

## Why this is useful

A normal block explorer does not know about UEAs. When you look up your wallet on
Blockscout you see your *origin* address — not the smart account Push Chain executes your
universal transactions through. This tool bridges that gap:

- **Builders of Universal Apps** can check what their origin wallet maps to on Push Chain
  and whether the account is deployed yet, without wiring up the SDK.
- **Grant / creator-program reviewers** can paste an applicant's address and immediately
  see their real Push Chain footprint.
- **Anyone farming the Donut testnet** can see their cross-chain identity and activity in
  one place.

## What a UEA is

A **Universal Executor Account** is a deterministic smart account on Push Chain derived
from an origin account (`chain namespace` + `chain id` + `owner`). It is non-custodial and
*lazily deployed* — the address is reserved from day one (via `CREATE2`) and the contract
is only created on the first universal transaction from the owner wallet. So an address can
have a known, fixed UEA that is "not deployed yet" — that is a valid, honest state this
tool shows.

## The flow

1. Enter an address (or click an example) and pick its origin chain — **or** pick
   “↩︎ Це UEA на Push Chain” to go the other way and paste a UEA directly.
2. Forward: the UEA is derived **offchain** (`CREATE2`), identical to the algorithm in
   [`@pushchain/core`](https://push.org/docs/chain/build/utility-functions/).
   Reverse: the origin is read from the factory’s `getOriginForUEA` (authoritative, not a guess).
3. The tool reads the UEA's activity from the public Donut Blockscout API and **decodes each
   `executeUniversalTx`** (with viem) to find the real target app of every universal action,
   including the ones batched inside a UEA multicall.
4. You get the origin ↔ UEA mapping, deploy status, metrics, the decoded universal actions
   (cross-chain ones showing their destination chain + contract), a **grouped top-apps summary**
   with per-app call count and PC spent (the relayer and protocol precompiles are excluded as
   infrastructure), and a token / transaction history, each linking to the Donut explorer.
5. The rest of the history is **loaded automatically in the background** (progress shown), so
   gas and the top-apps totals reflect the whole account. You can stop it, and for very large
   accounts a manual “load more / load all” continues past the auto-load cap.
6. The URL carries `?address=…&chain=…`, so any result is shareable.

## Data sources

- **UEA address** — computed in-browser with `CREATE2`, mirroring
  `computeUEAOffchain` in `@pushchain/core` v6 (namespaces, chain ids, the UEA factory and
  the EIP-1167 proxy come from the SDK's own constants). No RPC call is needed to show it, which
  keeps the site a pure static page.
- **On-chain verification** — the derived address is cross-checked against the factory's own
  `computeUEA` view via one read-only `eth_call` through Blockscout's RPC proxy. When it matches,
  the UI shows "✓ confirmed by the Push factory"; when the factory is unreachable it degrades to
  "computed offchain" rather than claiming a confirmation it does not have. Read-only; nothing is
  signed.
- **Current token holdings** — `GET /addresses/{uea}/token-balances`, labelled with the external
  chain each bridged synthetic PRC-20 represents (from the SDK's token map).
- **Activity** — the public Blockscout REST API v2 at `https://donut.push.network/api/v2`
  (`/addresses/{uea}`, `/counters`, `/transactions`, `/token-transfers`), paginated with the
  API's own `next_page_params`. No key.
- **Reverse lookup (UEA → origin)** — one read-only `getOriginForUEA` `eth_call` to the Push
  factory through Blockscout's JSON-RPC proxy (`/api/eth-rpc`), which — unlike the raw EVM RPC
  — sends CORS headers. Read-only; nothing is signed or sent.
- **Universal action targets** — decoded in-browser with `viem` from each transaction's
  `raw_input` (the `executeUniversalTx` payload, and the `(address,uint256,bytes)[]` of a UEA
  multicall). When an inner call targets the gateway precompile, its `sendUniversalTxOutbound`
  argument is decoded too: `recipient` gives the **destination contract** (EVM address or
  Solana pubkey) and the bridged PRC-20 `token` the amount. Contract names come from the SDK's
  own address book (gateway, UniswapV3, synthetic tokens, factory) first, then Blockscout. When
  an inner call cannot be decoded cleanly it is shown as an undecoded action rather than guessed.
- **Exact cross-chain destination** — the gateway's `UniversalTxOutbound` event carries the
  destination chain as a CAIP-2 `chainNamespace` (e.g. `eip155:421614`). The tool reads these
  events with `eth_getLogs` through the Blockscout RPC proxy (filtered by the event signature;
  the proxy ignores positional topic filters, so the UEA `sender` and `token` are matched
  client-side) and uses that **exact chain** instead of inferring it from the bridged token — so
  a generic gas token, or the same token bridged to different chains, is resolved correctly. A ✓
  marks a destination confirmed from the event; without a matching event the tool falls back to
  the token-derived chain and says so.

Every result footer shows the data source and the time it was read. When a source fails,
the tool says so instead of showing made-up numbers.

## Facts

- Push Chain Donut testnet — chain id **42101**, namespace `eip155:42101`
- Explorer: https://donut.push.network · Faucet: https://faucet.push.org
- Native token shown as **PC**, 18 decimals

## Run locally

```bash
npm install
npm run dev      # Vite dev server
# or a production build into docs/ (served by GitHub Pages):
npm run build
npm run preview
```

The static site is built into `docs/` so GitHub Pages can serve it as-is.

## Limits & honesty

- Testnet data. Balances and counts are whatever the Donut Blockscout indexer reports at
  the moment you look.
- The app list, universal-action list and gas are computed over the pages that are **loaded**.
  After the first page the tool auto-pages the rest in the background through Blockscout's
  `next_page_params` (capped at ~600 items / 12 pages to bound requests); past that cap a manual
  “load more / load all” continues. The headline “transactions / token-transfers total”
  counters are the true lifetime totals from the API regardless of how much is loaded.
- A cross-chain action's destination **chain** comes from the bridged synthetic PRC-20 token
  (the SDK maps each one to its origin chain); the exact `chainNamespace` string is not in the
  calldata, so the label is derived from the token, and the destination **contract** is the raw
  `recipient` from the gateway call. Bridged amounts use each token's real decimals when the
  explorer has reported them, else default to 18.
- "Gas paid by the UEA" counts only the UEA's own outgoing transactions; most UEAs are
  funded by a relayer (shown separately), so this is often 0 — the tool only shows it when
  it is non-zero.
- Reverse lookup returns an honest "this address is not a UEA" when the factory has no origin
  for it (a plain Push wallet, or a UEA not deployed yet).
- Supported origin chains are limited to those Push maps to the Donut testnet in the SDK.
- Built by one person with AI assistance. It uses the Push Chain SDK's documented UEA
  derivation; it is an independent tool and not an official Push product.

## License

MIT
