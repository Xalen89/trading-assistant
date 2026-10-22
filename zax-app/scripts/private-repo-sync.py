#!/usr/bin/env python3
"""Reconcile a source-only private GitHub export with a managed Git worktree.

No network, credentials, Git commits, resets, remote changes or publishing.
The caller must authorize/fetch both repositories and review the resulting diff.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile

MANIFEST = "ZAX_SYNC_MANIFEST.json"
TRUSTED_ANCHOR = ".manus-private-sync-state.json"
EXPORT_ONLY = {MANIFEST, "README_GITHUB.md"}
BLOCKED_NAMES = {".netrc", "_netrc", ".git-credentials", ".pypirc", "credentials.json", TRUSTED_ANCHOR}
BLOCKED_PARTS = {
    ".git", "node_modules", ".pnpm-store", ".expo", ".cache", ".venv",
    "dist", "web-dist", "web-build", "artifacts", "completion", "uploads",
    "downloads", "__pycache__", ".webdev", ".aws", ".ssh",
}
BLOCKED_SUFFIXES = {".pem", ".key", ".p12", ".p8", ".jks", ".keystore", ".sqlite", ".sqlite3", ".db", ".pyc"}


class SyncError(Exception):
    pass


def git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True)
    if check and result.returncode:
        raise SyncError("Git operation failed: " + " ".join(args[:2]))
    return result


def export_only(path: str) -> bool:
    return path in EXPORT_ONLY or path.startswith("docs/product/")


def allowed(path: str) -> bool:
    parts = PurePosixPath(path).parts
    return bool(parts) and not path.startswith("/") and "\\" not in path and not any(
        part in {"", ".", ".."} or part in BLOCKED_PARTS for part in path.split("/")
    ) and not any(ord(c) < 32 for c in path) and not any(
        part.startswith(".env") and part != ".env.example" for part in parts
    ) and PurePosixPath(path).name not in BLOCKED_NAMES and PurePosixPath(path).suffix.lower() not in BLOCKED_SUFFIXES and not path.startswith((".github/workflows/", ".config/gh/"))


def head(repo: Path) -> str | None:
    result = git(repo, "rev-parse", "--verify", "HEAD", check=False)
    return result.stdout.decode().strip() if result.returncode == 0 else None


def clean(repo: Path) -> None:
    if git(repo, "status", "--porcelain", "--untracked-files=no").stdout.strip():
        raise SyncError("Commit or review tracked work before syncing: " + str(repo))


def snapshot(repo: Path, ref: str | None, strict: bool = False) -> dict[str, tuple[bytes, str]]:
    if ref is None:
        return {}
    tree = git(repo, "ls-tree", "-rz", "--full-tree", ref).stdout
    modes: dict[str, tuple[str, str]] = {}
    for entry in tree.split(b"\0"):
        if not entry:
            continue
        info, raw_path = entry.split(b"\t", 1)
        mode, kind, oid = info.decode().split()
        path = raw_path.decode("utf-8")
        if strict and (kind != "blob" or mode not in {"100644", "100755"}):
            raise SyncError("Symlinks/submodules are not supported: " + path)
        if strict and not allowed(path):
            raise SyncError("Excluded path in GitHub commit: " + path)
        if export_only(path):
            continue
        if not allowed(path):
            if strict:
                raise SyncError("Excluded path in GitHub commit: " + path)
            continue
        if kind != "blob" or mode not in {"100644", "100755"}:
            raise SyncError("Symlinks/submodules are not supported: " + path)
        modes[path] = (oid, mode)
    if not modes:
        return {}
    # Raw blobs deliberately bypass export-subst/export-ignore attributes.
    process = subprocess.run(
        ["git", "-C", str(repo), "cat-file", "--batch"],
        input="".join(oid + "\n" for oid, _ in modes.values()).encode(),
        capture_output=True,
    )
    if process.returncode:
        raise SyncError("Unable to read raw Git source blobs")
    data, offset = process.stdout, 0
    result = {}
    for path, (oid, mode) in modes.items():
        end = data.find(b"\n", offset)
        if end < 0:
            raise SyncError("Missing raw Git blob header")
        fields = data[offset:end].decode().split()
        if len(fields) != 3 or fields[0] != oid or fields[1] != "blob" or not fields[2].isdigit():
            raise SyncError("Unexpected raw Git blob response")
        size = int(fields[2])
        if size > 25 * 1024 * 1024:
            raise SyncError("Oversized source entry: " + path)
        start, offset = end + 1, end + 1 + size
        if data[offset:offset + 1] != b"\n":
            raise SyncError("Truncated raw Git blob")
        result[path] = (data[start:offset], mode)
        offset += 1
    if offset != len(data):
        raise SyncError("Unexpected trailing raw Git blob bytes")
    return result


def metadata(files: dict[str, tuple[bytes, str]]) -> dict:
    return {p: {"sha256": hashlib.sha256(v[0]).hexdigest(), "mode": v[1]} for p, v in sorted(files.items())}


def trusted_state_path(source: Path) -> Path:
    raw = Path(git(source, "rev-parse", "--git-path", "zax-private-sync-state.json").stdout.decode().strip())
    return raw if raw.is_absolute() else source / raw


def load_trusted_state(source: Path):
    path = trusted_state_path(source)
    if path.is_symlink():
        raise ValueError()
    if path.is_file():
        trusted = json.loads(path.read_text())
    else:
        result = git(source, "show", "HEAD:" + TRUSTED_ANCHOR, check=False)
        if result.returncode:
            raise ValueError()
        trusted = json.loads(result.stdout)
    anchor = source / TRUSTED_ANCHOR
    if anchor.is_symlink() or (anchor.exists() and json.loads(anchor.read_text()) != trusted):
        raise ValueError()
    return trusted


def save_trusted_state(source: Path, state: dict) -> None:
    path = trusted_state_path(source)
    anchor = source / TRUSTED_ANCHOR
    if path.is_symlink() or anchor.is_symlink():
        raise SyncError("Unsafe trusted local state")
    fd, temp = tempfile.mkstemp(prefix=".zax-baseline-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(state, stream, indent=2)
            stream.write("\n")
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    # This anchor is intentionally NOT exported/imported through GitHub. Save it
    # with an intentional managed checkpoint after reviewing the reconciliation.
    anchor.write_text(json.dumps(state, indent=2) + "\n")


def scan_secrets(files: dict[str, tuple[bytes, str]]) -> None:
    values = [v.encode() for k, v in os.environ.items() if re.search(
        r"(SECRET|KEY|KEY_ID|PASSWORD|TOKEN|DSN|DATABASE_URL)$", k
    ) and len(v) >= 16 and not v.startswith(("mtr_fake_", "{{secret:"))]
    for path, (data, _) in files.items():
        if any(value in data for value in values):
            raise SyncError("Configured credential detected in source: " + path)
        if PurePosixPath(path).name == ".npmrc" and re.search(
            rb"(?im)^\s*(?://[^=\r\n]+:)?(?:_auth(?:Token)?|_password|password|username)\s*=", data
        ):
            raise SyncError("Credential-bearing npm configuration: " + path)
        if re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", data):
            raise SyncError("Private key material detected in source: " + path)


def merge_entry(base, left, right, path: str):
    if left == right or right == base:
        return left
    if left == base:
        return right
    if base is None or left is None or right is None:
        raise SyncError("Add/add or delete/change conflict: " + path)
    mode = left[1] if right[1] == base[1] or left[1] == right[1] else right[1] if left[1] == base[1] else None
    if mode is None:
        raise SyncError("File mode conflict: " + path)
    if any(b"\0" in item[0] or len(item[0]) > 2 * 1024 * 1024 for item in (base, left, right)):
        raise SyncError("Binary/large-file conflict: " + path)
    try:
        for item in (base, left, right):
            item[0].decode("utf-8")
    except UnicodeDecodeError:
        raise SyncError("Non-text conflict: " + path) from None
    with tempfile.TemporaryDirectory(prefix="zax-code-merge-") as temp:
        paths = [Path(temp) / name for name in ("left", "base", "right")]
        for target, item in zip(paths, (left, base, right)):
            target.write_bytes(item[0])
        result = subprocess.run(["git", "merge-file", "-p", *map(str, paths)], capture_output=True)
    if result.returncode:
        raise SyncError("Text conflict: " + path)
    return result.stdout, mode


def reconcile(base, destination, incoming):
    merged = {}
    conflicts = []
    for path in sorted(set(base) | set(destination) | set(incoming)):
        try:
            entry = merge_entry(base.get(path), destination.get(path), incoming.get(path), path)
            if entry is not None:
                merged[path] = entry
        except SyncError as error:
            conflicts.append(str(error))
    if conflicts:
        raise SyncError("Sync stopped before writes: " + "; ".join(conflicts))
    scan_secrets(merged)
    return merged


def target_path(root: Path, rel: str) -> Path:
    target = root / rel
    if not allowed(rel) or not target.resolve().is_relative_to(root.resolve()):
        raise SyncError("Unsafe destination path: " + rel)
    for parent in [target, *target.parents]:
        if parent == root:
            break
        if parent.is_symlink():
            raise SyncError("Symlink destination: " + rel)
    return target


def apply_changes(root: Path, before, after):
    changes = [p for p in sorted(set(before) | set(after)) if before.get(p) != after.get(p)]
    # Validate ALL paths and the actual worktree before writing ANY file.
    for rel in changes:
        target = target_path(root, rel)
        for parent in target.parents:
            if parent == root:
                break
            if parent.exists() and not parent.is_dir():
                raise SyncError("Non-directory destination parent: " + rel)
        if before.get(rel) is None and target.exists():
            raise SyncError("Untracked destination collision: " + rel)
        if before.get(rel) is not None:
            old = before[rel]
            if not target.is_file() or target.read_bytes() != old[0] or bool(target.stat().st_mode & 0o111) != (old[1] == "100755"):
                raise SyncError("Worktree changed since planning: " + rel)
    for rel in changes:
        target = root / rel
        entry = after.get(rel)
        if entry is None:
            target.unlink()
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            fd, temp = tempfile.mkstemp(prefix=".zax-sync-", dir=target.parent)
            try:
                with os.fdopen(fd, "wb") as stream:
                    stream.write(entry[0])
                os.chmod(temp, 0o755 if entry[1] == "100755" else 0o644)
                os.replace(temp, target)
            finally:
                if os.path.exists(temp):
                    os.unlink(temp)
    return changes


def run(action: str, source: Path, export: Path, apply: bool = False, repository: str = "Xalen89/zax-trading-app"):
    source = source.resolve()
    export = export.resolve()
    if source == export or source.is_relative_to(export) or export.is_relative_to(source):
        raise SyncError("Source and export must be separate worktrees")
    clean(source)
    clean(export)
    source_head, export_head = head(source), head(export)
    if source_head is None:
        raise SyncError("Source has no committed baseline")
    current = snapshot(source, source_head)
    outgoing = snapshot(export, export_head, strict=True)
    scan_secrets(current)
    scan_secrets(outgoing)
    if action == "init":
        if export_head is not None or (export / MANIFEST).exists() or trusted_state_path(source).exists() or (source / TRUSTED_ANCHOR).exists():
            raise SyncError("Initialization requires a new empty export")
        base = {}
    else:
        manifest_path = export / MANIFEST
        if manifest_path.is_symlink() or not manifest_path.resolve().is_relative_to(export):
            raise SyncError("Unsafe manifest destination")
        try:
            state = json.loads((export / MANIFEST).read_text())
            if not isinstance(state, dict) or state.get("version") != 1 or state.get("repository") != repository:
                raise ValueError()
            trusted = load_trusted_state(source)
            if state != trusted:
                raise ValueError()
            commit = state["managed_source_commit"]
            if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40,64}", commit):
                raise ValueError()
            if git(source, "merge-base", "--is-ancestor", commit, source_head, check=False).returncode:
                raise ValueError()
            base = snapshot(source, commit)
            if state["files"] != metadata(base):
                raise ValueError()
        except (OSError, ValueError, KeyError, TypeError):
            raise SyncError("Missing/invalid trusted sync baseline; review or restore it, never trust export metadata alone") from None
    if action == "status":
        return {"source_commit": source_head, "github_commit": export_head,
                "outbound": [p for p in sorted(set(base) | set(current)) if base.get(p) != current.get(p)],
                "inbound": [p for p in sorted(set(base) | set(outgoing)) if base.get(p) != outgoing.get(p)]}
    destination = source if action == "pull" else export
    before, incoming = (current, outgoing) if action == "pull" else (outgoing, current)
    merged = reconcile(base, before, incoming)
    changes = [p for p in sorted(set(before) | set(merged)) if before.get(p) != merged.get(p)]
    if apply:
        clean(source)
        clean(export)
        if head(source) != source_head or head(export) != export_head:
            raise SyncError("A Git head changed during planning")
        if action != "pull":
            manifest_path = export / MANIFEST
            if manifest_path.is_symlink() or not manifest_path.resolve().is_relative_to(export):
                raise SyncError("Unsafe manifest destination")
        apply_changes(destination, before, merged)
        if action != "pull":
            state = {"version": 1, "repository": repository, "sync": "on-request",
                     "managed_source_commit": source_head, "files": metadata(current)}
            (export / MANIFEST).write_text(json.dumps(state, indent=2) + "\n")
            save_trusted_state(source, state)
    return {"action": action, "applied": apply, "changed_files": changes,
            "source_commit": source_head, "files": len(merged), "note": "Review changes; no Git commit/push/publication performed."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["init", "status", "push", "pull"])
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--export-dir", type=Path, required=True)
    parser.add_argument("--repository", default="Xalen89/zax-trading-app")
    parser.add_argument("--apply", action="store_true", help="Write a fully validated plan; default is dry run")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.action, args.source_dir, args.export_dir, args.apply, args.repository), indent=2))
    except SyncError as error:
        parser.exit(1, "Sync refused: " + str(error) + "\n")


if __name__ == "__main__":
    main()
