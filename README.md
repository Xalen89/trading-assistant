# trading-assistant
A web app for trading NAS100 and XAUUSD with AI scenario data visualization on charts

## Zax application source

The full Zax source is in [`zax-app/`](zax-app/), including its Expo frontend, backend, trading logic and product specifications. See [Zax application source and setup boundaries](ZAX_APPLICATION_SOURCE.md).

- [Product requirements document](zax-app/docs/product/Zax_Current_State_PRD.md)
- [Feature specification](zax-app/docs/product/Zax_Feature_Specification.md)

The existing strategy notes in `docs/` remain unchanged. This private source import does not publish the app or enable automatic synchronization or real-money trading.

## Prerequisites

- Node.js 22.13+ and pnpm 9.12.0 (`corepack enable` uses the pinned package manager).
- A running MySQL 8-compatible server and an **existing empty database** for a new installation.
  The app uses MySQL, not SQLite; Python's SQLite vector cache is rebuildable local data.
- Credentials for the approved Manus OAuth application and the owner's Open ID.
  This source snapshot does not include an authentication service or its credentials.
- Python 3.11+ with `venv`/pip for image indexing and quantitative research.
  On Debian/Ubuntu, install `python3-venv`, `libglib2.0-0`, `libgomp1`, and
  `poppler-utils` (the latter supplies `pdftoppm` for PDF previews).

## Quick setup

Run application commands **inside `zax-app/`**, not at the repository root:

```bash
cd zax-app
pnpm install --frozen-lockfile
cp .env.example .env
# Edit .env with the required database, OAuth, owner, and secret values.
pnpm run setup
pnpm dev
```

On Windows, copy `.env.example` to `.env` and set `PYTHON_EXECUTABLE=.venv/Scripts/python.exe`.
Use `pnpm run setup`, not pnpm's unrelated built-in `pnpm setup` command.
If `.env` is absent, `pnpm run setup` creates it without overwriting an existing file,
then stops with a list of required settings to fill in. Shell/platform variables
take precedence over `.env`.

`pnpm run setup` installs the locked Node dependencies, checks configuration, creates
the local `.venv` (or uses your configured Python executable), installs the pinned
`python/requirements.txt`, applies all eight committed Drizzle migrations, and
verifies the database migration history and Python worker imports. Failures return
a nonzero exit code; rerun after correcting the reported prerequisite.

For frontend-only development, use `pnpm run setup --skip-python`. This explicitly
leaves image indexing, order-book ML, and quantitative research unavailable until
Python is installed. It does **not** bypass database or owner authentication.

### Environment configuration

The complete template is [`zax-app/.env.example`](zax-app/.env.example).
Keep `.env`, credentials, uploaded originals, and database backups private.
Never put secrets in an `EXPO_PUBLIC_*` variable: those values enter client bundles.

| Variable | Requirement |
| --- | --- |
| `DATABASE_URL` | Required MySQL URL including database name; URL-encode credentials. Create the database before setup. The migration account needs DDL permissions. |
| `MANUS_PROJECT_ID` | Required registered OAuth application ID. Legacy alias: `VITE_APP_ID`. |
| `MANUS_OAUTH_API_URL` | Required OAuth API base URL. Legacy alias: `OAUTH_SERVER_URL`. |
| `MANUS_OAUTH_PORTAL_URL` | Required OAuth sign-in portal URL. Legacy alias: `VITE_OAUTH_PORTAL_URL`. |
| `OWNER_OPEN_ID` | Required owner identity enforced by the existing server-side gate. |
| `MANUS_JWT_SECRET` | Required stable random secret of at least 32 bytes. Legacy alias: `JWT_SECRET`. Generate once using the command in the template. Changing it invalidates sessions and can make encrypted stored data unreadable. |
| `EXPO_PUBLIC_API_BASE_URL` | Development API URL, normally `http://localhost:3000`. For a phone use an approved reachable HTTPS API. Leave empty at build time for same-origin production web hosting. |
| `PORT` | API port, default 3000. The combined dev command uses port 3000 and Metro port 8081. |
| `PYTHON_EXECUTABLE` | Interpreter used by the backend; the template selects the setup-created `.venv`. Defaults to `python3` if unset. |
| `PUBLIC_APP_URL` | Deployed HTTPS origin for trusted CORS/OAuth redirects. Existing host aliases are listed in the template. |
| `EXPO_PACKAGER_PROXY_URL`, `EXPO_WEB_PREVIEW_URL` | Optional trusted preview origins; do not add arbitrary origins or relax the owner gate. |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Optional paired backend provider settings for AI and file storage. These features need an approved reachable service. |
| `FMP_API_KEY`, `FMP_CHART_TIMEZONE` | Optional Financial Modeling Prep market data; timezone defaults to `America/New_York`. |
| `TRADELOCKER_*` | Optional market-data account configuration; use `demo` unless explicitly approved otherwise. Does not enable real-money order execution. |
| `EXPO_PUBLIC_EAS_PROJECT_ID`, `EXPO_PUSH_ACCESS_TOKEN` | Optional native push configuration; delivery also requires native device/provider setup. |

Canonical Manus settings take precedence over legacy aliases; do not leave an
empty canonical setting alongside a populated legacy alias. The app config maps
canonical OAuth settings to the browser-safe Expo runtime configuration.

Setup validates required presence, secret length, URL shapes, and local runtimes;
it does **not** prove OAuth credentials, market subscriptions, AI/storage access,
native builds, or push delivery work. Register the app's callback/deep-link URLs
with the OAuth provider, then verify owner sign-in in the intended deployment.
Do not replace missing provider credentials with fabricated values.

## Running and building

```bash
pnpm dev          # API :3000 plus Expo web/Metro :8081
pnpm dev:server   # API only, with TypeScript watch
pnpm dev:metro    # Expo frontend only
pnpm android     # Expo Android development (requires device/emulator tooling)
pnpm ios         # Expo iOS development (requires supported Apple tooling)
```

The API applies committed migrations **before listening**, in both development
and production, and exits unsuccessfully if initialization fails. Migration
execution is serialized with a MySQL advisory lock. Run from `zax-app/` so the
server can find `drizzle/` and `python/`. Back up an existing database before
upgrading; MySQL DDL is not fully transactional. A schema created outside Drizzle
needs reviewed reconciliation, not deletion or blindly rerunning SQL.

```bash
pnpm db:migrate  # Apply only committed migrations; safe to rerun after success
pnpm db:push     # Compatibility alias for db:migrate
pnpm db:generate # Maintainers only: generate a migration after schema changes
```

Production web + API:

```bash
# Configure production .env first; use a stable secret and approved HTTPS origins.
# Set EXPO_PUBLIC_API_BASE_URL= in .env for same-origin web hosting.
pnpm verify:setup
pnpm build:web
pnpm start
```

`pnpm build` builds the local native-chart runtime and the backend bundle only.
`pnpm build:web` additionally exports Expo to `web-dist/` and writes the required
release manifest. A backend-only build is insufficient for `pnpm start`, because
the production server also serves the web export. Keep `dist/`, `web-dist/`,
`drizzle/`, `python/`, and installed runtime dependencies with the deployment.
The existing Dockerfile performs both builds and installs Python; inject server
secrets at runtime, never into the image. Client OAuth/API configuration must also
be supplied at **build time**. Do not deploy this authenticated backend as a
static-only GitHub Pages site.

## Verification and troubleshooting

```bash
pnpm verify:setup                # Configuration, MySQL migration hashes, Python imports
pnpm verify:setup --config-only  # No database connection or Python invocation
pnpm verify:setup --skip-python  # Explicitly reduced verification
pnpm check                      # TypeScript
pnpm lint                       # Expo ESLint
pnpm test                       # Existing Vitest suite
```

After starting, check `http://localhost:3000/api/health` for API liveness.
That endpoint is not a database/provider readiness guarantee; use
`pnpm verify:setup` to recheck database connectivity and migrations. Production
also exposes `/api/release` to identify the exported web release.

- Missing configuration: fill the named settings in `zax-app/.env` or the service environment.
- Migration failure: check database existence, connection/TLS settings, DDL permissions,
  and migration history. Setup never creates/drops a database or generates new SQL.
- Python failure: check `PYTHON_EXECUTABLE`, Python version, and pip's dependency error;
  rerun setup. Missing `pdftoppm` affects PDF previews separately.
- Missing production web app/manifest: run `pnpm build:web`, not just `pnpm build`.
- OAuth/provider failure after local checks pass: verify approved service URLs,
  callback registration, owner identity, and external credentials.

### Python integration

The authenticated Node backend invokes `pattern_indexer.py`,
`research_engine.py`, and `orderbook_research.py` over bounded stdin/stdout JSON.
There is no separately exposed Python HTTP service. See the
[Python guide](zax-app/python/README.md) and
[order-book guide](zax-app/python/ORDERBOOK_README.md).
To run their existing tests from `zax-app/` after setup:

```bash
.venv/bin/python -m unittest discover -s python -p 'test_*.py'
```

Use `.venv/Scripts/python.exe` on Windows, or your configured interpreter.
The optional `vectorbt_adapter.py` is not an application dependency and is not
installed by setup; its separate license/runtime review remains required.
