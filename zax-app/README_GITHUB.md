# Zax — private project source

This is the owner’s private source-only export of Zax, formerly StratDesk: an Expo Router React Native/Web trading-analysis, learning and **paper-trading** app. It is not a public release, live-money broker system or backup of private account records.

The current source includes the Chart, Markets, Trades, Alerts, Strategies and My Library experiences; read-only market adapters, deterministic source/strategy/confluence logic, hypothetical AI scenario layers, private AI Coach/Library processing, paper risk and discipline tools, and quantitative research workflows. Availability depends on the documented source, credential, venue, owner-device and deployment prerequisites. A model response or confluence score is not validated predictive performance.

## Product documents

- [Detailed current-state PRD, 20 October 2026](docs/product/Zax_Current_State_PRD.md)
- [Detailed feature specification, 20 October 2026](docs/product/Zax_Feature_Specification.md)
- [On-request two-way synchronization guide](PRIVATE_GITHUB_SYNC.md)
- [Existing application setup guide](README.md)

## Code synchronization

The managed mobile project remains Manus-managed. This GitHub repository is a separate private export with **two-way source synchronization on request**, not a continuous mirror. Ask “Sync my latest Zax changes to GitHub” or “Pull my GitHub changes into Zax.” The local helper plans before writing, preserves disjoint edits, refuses conflicting or unsafe changes, and relies on a trusted managed-only baseline rather than editable GitHub metadata alone.

No automatic job, GitHub Action, publication, broker permission or paper-auto consent is enabled by this export. Review imported code before running it, validate affected paths, and intentionally save imported changes through the original managed repository. Keep this repository private. Do not commit API keys, credential stores, database files, uploaded Library originals or generated runtime outputs.

`ZAX_SYNC_MANIFEST.json` records the exported source baseline and hashes. The managed-only trust anchor is intentionally excluded. The initial GitHub history starts with the current clean snapshot, not the earlier development history or historical generated artifacts.
