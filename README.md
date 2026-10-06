# Push Universal ID

**Who are you on Push Chain?** Paste any address from any supported origin chain
(Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, BNB testnet, Solana devnet, or a
native Push address) and this tool shows its **Universal Executor Account (UEA)** on the
Push Chain **Donut testnet**: whether it is deployed, its balance, transaction count,
token transfers, the apps/counterparties it interacted with, and recent activity — with a
link to the Donut explorer for every on-chain item.

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

1. Enter an address (or click an example) and pick its origin chain.
2. The UEA is derived **offchain** (`CREATE2`), identical to the algorithm in
   [`@pushchain/core`](https://push.org/docs/chain/build/utility-functions/).
3. The tool reads the UEA's activity from the public Donut Blockscout API.
4. You get the origin → UEA mapping, deploy status, metrics, counterparties and a token /
   transaction history, each linking to the Donut explorer.
5. The URL carries `?address=…&chain=…`, so any result is shareable.

## Data sources

- **UEA address** — computed in-browser with `CREATE2`, mirroring
  `computeUEAOffchain` in `@pushchain/core` v6 (namespaces, chain ids, the UEA factory and
  the EIP-1167 proxy come from the SDK's own constants). No RPC call is needed, which keeps
  the site a pure static page — the Donut EVM RPC does not send CORS headers, so the browser
  cannot call it directly anyway.
- **Activity** — the public Blockscout REST API v2 at `https://donut.push.network/api/v2`
  (`/addresses/{uea}`, `/counters`, `/transactions`, `/token-transfers`). No key.

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
- Transaction / token-transfer lists and the derived "counterparties" are computed from the
  **most recent page** the API returns (up to ~50 each), not the full lifetime history.
- "Gas paid by the UEA" counts only the UEA's own outgoing transactions; most UEAs are
  funded by a relayer, so this is often 0 — the tool only shows it when it is non-zero.
- Supported origin chains are limited to those Push maps to the Donut testnet in the SDK.
- Built by one person with AI assistance. It uses the Push Chain SDK's documented UEA
  derivation; it is an independent tool and not an official Push product.

## License

MIT
