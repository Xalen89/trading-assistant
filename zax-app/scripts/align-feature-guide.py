"""Validate source-guide alignment without mutating the audited inventory.

The guide is intentionally generated from the complete current data file. Retained raw
research remains outside this utility and is never rewritten here.
"""
import json
from pathlib import Path

path = Path("lib/trading/feature-purpose-data.json")
groups = json.loads(path.read_text())
required = {
    "name",
    "purpose",
    "location",
    "how_to_use",
    "output",
    "next_action",
    "status",
    "limits",
}
features = [feature for group in groups for feature in group["features"]]
assert len({group["id"] for group in groups}) == len(groups)
assert all(required <= set(feature) for feature in features)
assert all(feature["name"].strip() for feature in features)
print(f"Guide alignment validated: {len(groups)} groups / {len(features)} features.")
