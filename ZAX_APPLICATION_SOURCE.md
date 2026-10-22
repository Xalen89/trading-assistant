# Zax application source in Trading Assistant

The Zax application source is included under [`zax-app/`](zax-app/). The existing root README and the Trading Assistant strategy documents under `docs/` are preserved.

## Source and scope

This is an additive snapshot of the private repository [Xalen89/zax-trading-app](https://github.com/Xalen89/zax-trading-app), `main` commit `afd5f71a13fad742e1acca5b38cb3de5d964fdd2`, imported on 21 October 2026. `ZAX_SOURCE_IMPORT.json` records the source commit and SHA-256/file-mode inventory for the copied files.

The import does not replace the existing Trading Assistant project, merge the two unrelated Git histories, change Zax's Manus-managed origin, publish an app, or enable trading or alerts.

## Where to start

- [Application package and scripts](zax-app/package.json)
- [Frontend routes and screens](zax-app/app/)
- [Backend API and trading services](zax-app/server/)
- [Trading models and source logic](zax-app/lib/trading/)
- [Database schema](zax-app/drizzle/schema.ts)
- [Current-state PRD](zax-app/docs/product/Zax_Current_State_PRD.md)
- [Detailed feature specification](zax-app/docs/product/Zax_Feature_Specification.md)
- [Feature-purpose guide](zax-app/FEATURE_PURPOSE_GUIDE.md)

A developer or coding assistant with repository access can inspect and edit the included code. Work on the application from `zax-app/`; the repository root is not its package directory. Review the existing package scripts, environment template and service adapters before running it.

## Privacy and operational boundaries

The source export contains no live API keys, broker credentials, owner account records, database backup or uploaded Library originals. Actual operation still requires its approved backend, authentication, database, storage and provider configuration. Current source documents describe native, inference, market-data and deployment limitations; code availability alone does not verify those services or make this a working hosted application.

Keep owner-only access and paper-only execution intact. Do not add real-money brokerage execution or expose private data as part of using this copy.

## Synchronization

This addition is a one-time source import, not automatic sync or a canonical repository switch. The copied `PRIVATE_GITHUB_SYNC.md` and `ZAX_SYNC_MANIFEST.json` refer to the original `zax-trading-app` export, not a new sync binding for `trading-assistant`. Changes here will not automatically update Manus or the original repository. Request a reviewed sync explicitly when needed; preserve edits on both sides rather than overwriting them.
