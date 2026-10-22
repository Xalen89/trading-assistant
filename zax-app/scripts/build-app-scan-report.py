"""Assemble the private app scan and repairs from scope-owned Markdown reports."""
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[1]
SAVED_REPORTS = ROOT / "research" / "app-audit"
AUDIT = SAVED_REPORTS if SAVED_REPORTS.is_dir() else ROOT / "artifacts" / "app-audit"
AREAS = [
    ("01-ai", "AI Coach and scenarios"),
    ("02-chart", "Chart, layers and phone context"),
    ("03-feeds", "Feeds, timeframe and source provenance"),
    ("04-paper", "Paper sizing and lifecycle"),
    ("05-strategies", "Strategy rules and confluence"),
    ("06-alerts", "Alerts and automatic paper"),
    ("07-library", "Private Library and uploads"),
    ("08-quant", "Quant research and no-code rules"),
    ("09-auth", "Owner security and workspace portability"),
    ("10-journal", "Discipline, journals and trade screenshots"),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--passed", type=int, required=True)
    parser.add_argument("--skipped", type=int, default=1)
    parser.add_argument("--failed", type=int, default=0)
    parser.add_argument("--summary", required=True, help="Path to the parent-verified final status text")
    args = parser.parse_args()
    summary = Path(args.summary).read_text().strip()
    assert summary
    chunks = [
        "# Zax — application scan and repair report\n",
        "**19 October 2026. Private owner-only, paper-only.** This report separates code and fixture evidence from actual model service, provider, phone and production behavior. No public release, broker execution, test paper order, live upload/deletion or new schedule was created by this work.\n",
        "## Current result\n\n" + summary + "\n",
        f"Final software result: **{args.passed} passed, {args.failed} failed, {args.skipped} skipped**. The existing skipped authentication integration case is not presented as verified. Scope-specific reports below record their own checks; tests are not proof of every device or connected service.\n",
        "## The screenshot's AI error\n\nThe one allowed current Deep-mode check used the live project catalog and existing server helper with a short non-trading prompt and no retry. It returned the safe kind **terminal-unavailable**. No raw service body, account balance or credential was retained in this report. Code changes improve classification, transport lifecycle and preserved-input behavior; they do not establish restored managed inference. For service-account assistance use https://help.manus.im. There was no alternate-provider bypass, second completion or invented AI scenario. Deterministic chart, historical replay and source-based ORB remain separate.\n",
        "## Verification boundaries\n\nThis scan covered ten application areas and inspected source, mocked/pure regressions, current language diagnostics and builds/source exports. Physical iPhone/iPad, signed iOS/Android builds, restored managed inference, every live market feed, trained/calibrated edge, actual automatic paper fills and production callback/push display are not proven by this work. Existing data and consent were preserved; no automatic consent was enabled.\n",
        "| Area | Read-only scan | Scoped repair record |\n|---|---|---|",
    ]
    for ident, title in AREAS:
        assert (AUDIT / f"{ident}.md").is_file(), ident
        assert (AUDIT / f"repair-{ident}.md").is_file(), ident
        chunks.append(f"| {title} | Completed | Included below; see remaining limits |")
    for ident, title in AREAS:
        audit = (AUDIT / f"{ident}.md").read_text().strip()
        repair = (AUDIT / f"repair-{ident}.md").read_text().strip()
        assert audit and repair
        chunks.extend([
            f"\n## {title}\n",
            "### Repair record\n\n" + repair + "\n",
            "### Original read-only findings and evidence\n\n" + audit + "\n",
        ])
    for name, title in [
        ("repair-cleanup.md", "Protected original cleanup boundary"),
        ("final-integration-review.md", "Final scoped integration review"),
    ]:
        extra = (AUDIT / name).read_text().strip()
        assert extra
        chunks.append(f"\n## {title}\n\n{extra}\n")
    output = ROOT / "APP_SCAN_AND_REPAIRS.md"
    output.write_text("\n".join(chunks).rstrip() + "\n")
    print("Complete scan report:", output)
    print("Areas:", len(AREAS), "Bytes:", output.stat().st_size)


if __name__ == "__main__":
    main()
