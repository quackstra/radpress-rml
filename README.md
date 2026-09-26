# radpress

A Radix-native site builder with social features, where **a Radix account *is* a
website**. Build and theme your site, write posts, follow people, reply across sites —
everything you publish is **Quackdown** on the Radix ledger, readable by any Quackdown
reader. Radpress is just one client of an open format.

**Live (Stokenet): https://quackstra.github.io/radpress-rml/**

> Replaces the old ATProto Radpress entirely — nothing from that codebase carries over.
> Radix-only: identity = a Radix account, data = the ledger (read directly via the
> Gateway; no indexer yet). No ATProto, no PDS, no hub.

## What works today

- **Read (live, themed):** the directory home + latest-posts feed, themed site views
  (profile / posts / pages), post pages with **cross-site replies**, and a following feed —
  all read directly from the ledger via [`@quackdown/core`](https://github.com/quackstra/radix-markup-language).
- **Studio** (Account / Compose / Theme / Pages):
  - **Account** — generate a Stokenet key (testnet-only, stored locally), fund from the
    faucet, and **list your site in the public directory** — all in-browser.
  - **Compose** — live Quackdown preview (raw HTML disabled), schema-aware (post / page /
    profile / follows / reply).
  - **Theme** — a live color-token editor that publishes an on-ledger theme atom + sets
    your site's `theme-ref`.
  - **Pages** — manage your site's pages (delete-to-cart).
  - **Action cart → one-click publish:** the cart is signed and submitted **in the
    browser** as a single v1 `COMMIT` (identical blobs deduped). Fee + tx count shown at
    checkout; a **stale-cart check** warns if the site changed since you started. Carts can
    also be exported and published with `qd commit`.

## Depends on

A **pinned** version of the published core package (currently
[`@quackdown/core` v1.2.0](https://github.com/quackstra/radix-markup-language/releases/tag/core-v1.2.0))
— no submodule, no relative imports into RML. Format changes land in RML first; Radpress
bumps its version. Anything the format lacks is proposed as a **namespaced schema
extension in RML** (`radpress:…`), never an app-side workaround.

## Not yet

- **Wallet connect (Radix dApp Toolkit)** — the browser key is a Stokenet play key; mainnet
  will use the wallet. (Paste-key input removed; generate-only until wallet connect lands.)
- **Tips**, richer theme templates/blocks, and media.

## Develop

```
npm install
npm run dev       # local dev
npm run build     # -> dist (static)
```
