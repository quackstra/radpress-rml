# radpress

A Radix-native site builder with social features, where **a Radix account *is* a
website**. Connect your wallet, build and theme your site, write posts, follow
people, and tip them — everything you publish is **Quackdown** on the Radix ledger,
readable by any Quackdown reader. Radpress is just one client of an open format.

> Replaces the old ATProto Radpress entirely. Nothing from that codebase carries
> over. Radix-only: identity = Radix account (wallet connect), data = ledger +
> indexer. No ATProto, no PDS, no hub.

## Status: not started (gated)

Per the Quackdown v1 brief, Radpress (Part C) does **not** begin until these ship
in [`radix-markup-language`](https://github.com/quackstra/radix-markup-language):

- **T5** — the shared core published as a versioned package (e.g. `@quackdown/core`).
- **S0** — the approved core social schema (profile / post / reply / follows / theme-ref).
- **S1** — the open, deterministic indexer.

Radpress depends on a **pinned version** of the published core package — no submodule,
no relative imports into RML. Format changes land in RML first; Radpress bumps its
version. If Radpress needs something the format lacks, it's proposed as a **namespaced
schema extension in RML** (`radpress:…`), never an app-side workaround.

## Planned (from the brief)

- **R1** — Composer + action cart (wallet connect, live preview, batch checkout via v1 COMMIT).
- **R2** — Sites, themes (on-ledger atoms + remixes), history as a commit log.
- **R3** — Social: follows feed, cross-site replies, tips — all verifiable against the ledger.
