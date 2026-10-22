"""Validate the current source-driven feature guide without rewriting feature content.

Editorial normalization and guide output are owned by feature-purpose-data.json and
build-feature-guide.mjs. This legacy entry point remains safe for existing workflows.
"""
import json
from pathlib import Path

path = Path("lib/trading/feature-purpose-data.json")
groups = json.loads(path.read_text())
allowed_statuses = {
    "Operational",
    "Data required",
    "Deployment required",
    "Qualification required",
    "Device test required",
}
features = [feature for group in groups for feature in group["features"]]
assert all(group.get("guide_note", "").strip() for group in groups)
assert all(feature.get("status") in allowed_statuses for feature in features)
print(f"Current guide data validated: {len(groups)} groups / {len(features)} features.")
