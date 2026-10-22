"""Package tracked StratDesk source only; never database/storage/credentials."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parent / "stratdesk-deliverables"
OUTPUT.mkdir(exist_ok=True)
files = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
excluded = {"node_modules", ".git", ".expo", ".cache", "dist", "web-dist", "artifacts", "__pycache__"}
selected = []
for rel in filter(None, files):
    path = Path(rel)
    if any(part in excluded for part in path.parts):
        continue
    if path.name.startswith(".env") and path.name != ".env.example":
        continue
    if path.suffix.lower() in {".pem", ".key", ".p12", ".keystore"}:
        continue
    if (ROOT / path).is_file():
        selected.append(rel)
required = [
    "lib/trading/orb-market-profile.ts", "server/trading/orb-instrument-preparation.ts",
    "server/_core/llm-errors.ts", "tests/trading/llm-errors.test.ts",
    "tests/trading/orb-instrument-preparation.test.ts", "tests/trading/orb-nas100-integration.test.ts", "tests/trading/orb-nas100-paper-fill.test.ts", "scripts/check-nas100-orb.ts",
    "lib/trading/instrument-setup-types.ts", "lib/trading/previous-provider-day.ts",
    "server/trading/instrument-facts-service.ts", "server/trading/instrument-preparation.ts",
    "tests/trading/instrument-preparation.test.ts", "tests/trading/provider-day-autofill.test.ts", "tests/trading/broker-instrument-facts.test.ts",
    "scripts/check-instrument-preparation.ts", "research/session-strategies/INSTRUMENT_METADATA_SOURCES.md",
    "SESSION_STRATEGIES_UPDATE.md", "lib/trading/session-strategy-model.ts", "lib/trading/session-strategy-presets.ts", "lib/trading/session-range-strategies.ts", "lib/trading/pdc-continuation.ts",
    "lib/trading/session-paper-geometry.ts", "lib/trading/session-auto-types.ts", "lib/trading/timeframes.ts",
    "server/trading/session-auto-paper.ts", "server/trading/strategy-quote-observations.ts", "server/trading/background-strategy-status.ts", "server/trading/scheduled-scan-budget.ts",
    "components/trading/session-strategy-editor.tsx", "components/trading/session-auto-paper.tsx", "app/(tabs)/alerts.tsx",
    "tests/trading/session-range-strategies.test.ts", "tests/trading/pdc-continuation.test.ts", "tests/trading/strategy-quote-observations.test.ts", "tests/trading/session-auto-paper.test.ts", "tests/trading/session-auto-flow.test.ts",
    "tests/trading/session-strategy-integration.test.ts", "tests/trading/session-paper-fill.test.ts", "tests/trading/session-source-acquisition.test.ts", "tests/trading/scheduled-scan-budget.test.ts", "tests/trading/session-background.test.ts", "tests/trading/timeframes.test.ts",
    "research/session-strategies/Pasted_content_08.txt", "scripts/update-session-feature-guide.py",
    "ORB_STRATEGY_UPDATE.md", "lib/trading/orb-model.ts", "lib/trading/orb-presets.ts", "lib/trading/orb-strategy.ts",
    "lib/trading/orb-auto-types.ts", "server/trading/orb-auto-paper.ts", "components/trading/orb-strategy-editor.tsx", "components/trading/orb-auto-paper.tsx",
    "tests/trading/orb-strategy.test.ts", "tests/trading/orb-integration.test.ts", "tests/trading/orb-auto-paper.test.ts", "tests/trading/orb-auto-flow.test.ts",
    "research/orb-video/VIDEO_ANALYSIS.md", "research/orb-video/transcript.json", "research/orb-video/VIDEO_PROVENANCE.json",
    "lib/trading/ai-quality.ts", "server/trading/ai-model-policy.ts", "components/trading/ai-quality-selector.tsx",
    "lib/trading/coach-ui-state.ts", "lib/trading/coach-types.ts", "server/trading/coach-router.ts",
    "tests/trading/coach-ui-state.test.ts", "tests/trading/coach.test.ts", "tests/trading/ai-model-policy.test.ts",
    "tests/trading/forecast-output-recovery.test.ts", "tests/trading/ai-quality-storage.test.ts",
    "scripts/check-ai-scenario-recovery.ts",
    "server/trading/coinbase-window.ts", "tests/trading/coinbase-window.test.ts", "tests/trading/forecast-auto.test.ts",
    "tests/trading/broker-read-refresh.test.ts", "scripts/check-selected-forecast-source.ts",
    "SCENARIO_LAYERS_UPDATE.md", "lib/trading/scenario-layer-types.ts", "lib/trading/scenario-layers.ts",
    "lib/trading/scenario-layer-storage.ts",
    "server/trading/scenario-layer-schema.ts", "server/trading/scenario-router.ts", "server/trading/forecast-source.ts",
    "components/trading/scenario-layer-manager.tsx", "tests/trading/scenario-layers.test.ts", "tests/trading/scenario-layer-controller.test.ts",
    "ZAX_UPDATE.md", "ZAX_FIX_TRACKER.md", "requirements/zax-quant-scope-06.txt", "requirements/zax-fixes-scope-07.txt",
    "server/trading/source-preview.ts", "server/trading/source-analysis-jobs.ts", "server/trading/workspace-tools.ts",
    "server/trading/app-quota.ts", "server/trading/paper-processing.ts", "server/trading/quant-rules-router.ts",
    "lib/trading/device-local-lock.native.ts", "lib/trading/market-making-methods.ts", "lib/trading/purged-validation.ts",
    "components/trading/owner-privacy-boundary.tsx", "components/trading/ai-rate-controls.tsx",
    "components/trading/owned-source-preview.tsx", "components/trading/owned-source-analysis.tsx", "components/trading/owned-workspace-tools.tsx",
    "drizzle/0007_harsh_archangel.sql",
    "FORECAST_SCREENSHOT_UPDATE.md", "server/trading/forecast-router.ts", "server/trading/forecast-service.ts",
    "lib/trading/ai-forecast.ts", "lib/trading/forecast-display.ts", "components/trading/ai-forecast-panel.tsx",
    "lib/trading/trade-screenshot-types.ts", "server/trading/trade-screenshot-service.ts", "server/trading/trade-screenshot-router.ts", "components/trading/trade-screenshot-panel.tsx",
    "lib/trading/timeframe-bias.ts", "server/trading/bias-router.ts", "components/trading/timeframe-bias-table.tsx",
    "lib/trading/vwap-stdv.ts", "lib/trading/cointegration.ts", "third-party/cointegration-statsmodels/LICENSE",
    "LATEST_FOUNDRY_UPDATE.md", "AI_FOUNDRY_UPDATE.md", "FOUNDRY_STRATEGY_STATUS.md", "plan.md", "TODO.md",
    "lib/trading/generated/lightweight-runtime.ts", "components/trading/candle-chart.tsx",
    "third-party/lightweight-charts/LICENSE", "third-party/lightweight-charts/NOTICE",
    "requirements/foundry-scope-04.txt", "requirements/confluence-scope-05.txt",
    "lib/trading/web-chart-document.ts", "lib/trading/chart-presentation.ts",
    "components/trading/disclosure.tsx", "tests/trading/web-chart-document.test.ts",
    "app/coach.tsx", "components/trading/ai-coach.tsx", "components/trading/library-ai-panel.tsx",
    "components/trading/quant-workbench.tsx", "components/trading/confluence-editor.tsx",
    "components/trading/trading-lessons.tsx", "components/trading/learning-dashboard.tsx",
    "server/trading/coach-service.ts", "server/trading/quant-router.ts", "server/trading/venue-depth.ts",
    "server/trading/paper-gate.ts", "server/trading/library-blueprint.ts", "server/trading/public-context.ts",
    "lib/trading/confluence-runtime.ts", "lib/trading/confluence-analytics.ts", "lib/trading/paper-observations.ts",
    "FEATURE_PURPOSE_GUIDE.md", "app/features.tsx", "components/trading/feature-guide.tsx",
    "lib/trading/feature-purpose-data.json", "lib/trading/quant-workbench-config.ts",
    "server/trading/quant-service.ts", "server/trading/quant-request.ts",
    "lib/trading/upload-byte-limits.ts", "tests/trading/venue-depth.test.ts",
    "tests/trading/feature-purpose-guide.test.ts", "tests/trading/quant-workbench-config.test.ts",
    "lib/trading/chart-sessions.ts", "lib/trading/session-background-primitive.ts",
    "tests/trading/chart-sessions.test.ts", "tests/trading/chart-session-settings.test.ts", "tests/trading/session-background.test.ts",
]
required.extend([
    "APP_SCAN_AND_REPAIRS.md", "scripts/build-app-scan-report.py",
    "lib/trading/ai-request-lifecycle.ts", "lib/trading/discipline-guard-ack.ts",
    "lib/trading/paper-risk-template.ts", "lib/trading/source-cleanup.ts", "lib/trading/source-purpose.ts",
    "lib/trading/strategies05-revision-restore.ts", "lib/trading/weekly-context-copy.ts",
    "server/_core/auth-security.ts", "server/trading/alert-delivery-state.ts", "server/trading/paper-balance.ts",
    "server/trading/source-identity.ts", "server/trading/source-intake-validation.ts",
    "tests/auth-audit-09.test.ts", "tests/trading/ai-request-lifecycle.test.ts", "tests/trading/alerts-audit-06.test.ts",
    "tests/trading/app-quota-reservation.test.ts", "tests/trading/discipline-guard-ack.test.ts",
    "tests/trading/learning-upload.test.ts", "tests/trading/no-code-quant.test.ts", "tests/trading/paper-balance.test.ts",
    "tests/trading/paper-plan-sheet.test.ts", "tests/trading/paper-proposal-canonical-balance.test.ts",
    "tests/trading/setup-history-source-identity.test.ts", "tests/trading/source-cleanup.test.ts",
    "tests/trading/source-intake-validation.test.ts", "tests/trading/source-public-dto.test.ts", "tests/trading/source-purpose.test.ts",
    "tests/trading/strategies05-revision-restore.test.ts", "tests/trading/strategies05-session-paper-geometry.test.ts",
    "tests/trading/trade-screenshot-router.test.ts", "tests/trading/weekly-context-copy.test.ts",
])
required.extend([
    "components/trading/scenario-provider-setup.tsx", "server/trading/openai-scenario-client.ts",
    "server/trading/scenario-provider-vault.ts", "server/trading/scenario-provider-security.ts",
    "tests/trading/openai-scenario-client.test.ts", "tests/trading/scenario-provider-vault.test.ts",
    "tests/trading/scenario-provider-security.test.ts", "tests/trading/scenario-provider-router.test.ts",
    "tests/trading/direct-scenario-service.test.ts", "research/ai4trade/DIRECT_OPENAI_CONTRACT.md",
    "research/ai4trade/2026-10-19-provider-check.md",
])
required.extend([
    "server/_core/web-app.ts", "scripts/write-web-release.mjs", "tests/trading/web-app-serving.test.ts",
    "Dockerfile", ".npmrc", "package.json", "pnpm-lock.yaml",
])
for scope in ["01-ai", "02-chart", "03-feeds", "04-paper", "05-strategies", "06-alerts", "07-library", "08-quant", "09-auth", "10-journal"]:
    required.extend([f"research/app-audit/{scope}.md", f"research/app-audit/repair-{scope}.md"])
required.extend(["research/app-audit/repair-cleanup.md", "research/app-audit/final-integration-review.md", "research/app-audit/FINAL_STATUS.md"])
for family in ["ob", "stdv", "core", "sma", "macd", "ema", "breakout", "bb", "pairs", "momentum", "making", "macro", "ml"]:
    required.append(f"research/foundry-audit/{family}.md")
for family in ["pairs", "momentum", "making", "macro", "ml"]:
    required.append(f"lib/trading/quant-{family}.ts")
for rel in required:
    assert rel in selected and (ROOT / rel).stat().st_size > 0, rel
for rel in ["LATEST_FOUNDRY_UPDATE.md", "FOUNDRY_STRATEGY_STATUS.md", "plan.md", "TODO.md"]:
    assert (ROOT / rel).read_text().endswith("\n"), rel
archive = OUTPUT / "Zax-source-2026-10-19.zip"
temporary = archive.with_suffix(".zip.tmp")
manifest = {
    "date": "2026-10-19",
    "local_source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip(),
    "recorded_checkpoint": False,
    "published": False,
    "files": {rel: hashlib.sha256((ROOT / rel).read_bytes()).hexdigest() for rel in selected},
}
with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as output:
    for rel in sorted(selected):
        output.write(ROOT / rel, "stratdesk/" + rel)
    output.writestr("stratdesk/SOURCE_BACKUP_MANIFEST.json", json.dumps(manifest, indent=2) + "\n")
with zipfile.ZipFile(temporary) as output:
    assert output.testzip() is None
    assert all("stratdesk/" + rel in output.namelist() for rel in required)
temporary.replace(archive)
print("Source backup verified:", archive)
print("Archived source files:", len(selected))
print("ZIP bytes:", archive.stat().st_size)
print("ZIP SHA256:", hashlib.sha256(archive.read_bytes()).hexdigest())
for rel in ["LATEST_FOUNDRY_UPDATE.md", "FOUNDRY_STRATEGY_STATUS.md", "plan.md", "TODO.md"]:
    print("Complete handoff file:", ROOT / rel)
