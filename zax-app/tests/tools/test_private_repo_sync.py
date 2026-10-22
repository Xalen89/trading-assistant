"""Local Git fixtures only: no GitHub, provider calls, owner rows or real credentials."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[2] / "scripts/private-repo-sync.py"
spec = importlib.util.spec_from_file_location("private_sync", MODULE)
assert spec is not None and spec.loader is not None
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def git(path, *args):
    return subprocess.check_output(["git", "-C", str(path), *args], stderr=subprocess.DEVNULL)


class SyncFixtures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.source, self.export = root / "source", root / "export"
        for repo in (self.source, self.export):
            repo.mkdir()
            git(repo, "init", "-b", "main")
            git(repo, "config", "user.name", "Fixture")
            git(repo, "config", "user.email", "fixture@example.invalid")
        self.original = b"one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n"
        (self.source / "app.ts").write_bytes(self.original)
        self.commit(self.source)
        sync.run("init", self.source, self.export, True)
        self.commit(self.export)

    def tearDown(self):
        self.temp.cleanup()

    def commit(self, repo):
        git(repo, "add", ".")
        git(repo, "commit", "-m", "fixture")

    def test_outbound_update_and_baseline(self):
        (self.source / "app.ts").write_bytes(self.original.replace(b"one\n", b"source\n"))
        self.commit(self.source)
        before = (self.export / "app.ts").read_bytes()
        dry = sync.run("push", self.source, self.export)
        self.assertEqual(dry["changed_files"], ["app.ts"])
        self.assertEqual((self.export / "app.ts").read_bytes(), before)
        sync.run("push", self.source, self.export, True)
        self.assertEqual((self.export / "app.ts").read_bytes(), (self.source / "app.ts").read_bytes())
        manifest = json.loads((self.export / sync.MANIFEST).read_text())
        self.assertEqual(manifest["managed_source_commit"], sync.head(self.source))

    def test_inbound_update_is_reviewable_not_committed(self):
        (self.export / "app.ts").write_bytes(self.original.replace(b"ten\n", b"github\n"))
        self.commit(self.export)
        previous = sync.head(self.source)
        sync.run("pull", self.source, self.export, True)
        self.assertEqual(sync.head(self.source), previous)
        self.assertIn(b"github", (self.source / "app.ts").read_bytes())
        self.assertTrue(git(self.source, "status", "--porcelain").strip())

    def test_disjoint_edits_merge_both_sides(self):
        (self.source / "app.ts").write_bytes(self.original.replace(b"one\n", b"source\n"))
        self.commit(self.source)
        (self.export / "app.ts").write_bytes(self.original.replace(b"ten\n", b"github\n"))
        self.commit(self.export)
        sync.run("pull", self.source, self.export, True)
        result = (self.source / "app.ts").read_bytes()
        self.assertIn(b"source", result)
        self.assertIn(b"github", result)

    def test_conflicts_stop_before_any_other_write(self):
        (self.source / "app.ts").write_bytes(self.original.replace(b"one\n", b"source\n"))
        self.commit(self.source)
        (self.export / "app.ts").write_bytes(self.original.replace(b"one\n", b"github\n"))
        (self.export / "new.ts").write_text("new\n")
        self.commit(self.export)
        before = (self.source / "app.ts").read_bytes()
        with self.assertRaises(sync.SyncError):
            sync.run("pull", self.source, self.export, True)
        self.assertEqual((self.source / "app.ts").read_bytes(), before)
        self.assertFalse((self.source / "new.ts").exists())

    def test_untracked_collision_preserves_local_file(self):
        (self.export / "new.ts").write_text("remote\n")
        self.commit(self.export)
        (self.source / "new.ts").write_text("local unsaved\n")
        with self.assertRaises(sync.SyncError):
            sync.run("pull", self.source, self.export, True)
        self.assertEqual((self.source / "new.ts").read_text(), "local unsaved\n")

    def test_dirty_tracked_source_refuses(self):
        (self.source / "app.ts").write_text("unsaved\n")
        with self.assertRaises(sync.SyncError):
            sync.run("push", self.source, self.export, True)

    def test_known_secret_refused(self):
        secret = "synthetic-fixture-secret-not-a-real-credential"
        (self.export / "new.ts").write_text(secret)
        self.commit(self.export)
        with patch.dict(os.environ, {"FIXTURE_API_KEY": secret}):
            with self.assertRaises(sync.SyncError):
                sync.run("pull", self.source, self.export, True)
        self.assertFalse((self.source / "new.ts").exists())

    def test_unsafe_paths_and_symlinks_refused(self):
        for path in ["../outside", "/absolute", ".env", "artifacts/log.txt", "key.pem", ".github/workflows/run.yml"]:
            self.assertFalse(sync.allowed(path))
        (self.export / "link.ts").symlink_to("app.ts")
        self.commit(self.export)
        with self.assertRaises(sync.SyncError):
            sync.run("pull", self.source, self.export, True)

    def test_delete_change_and_binary_conflict_refused(self):
        with self.assertRaises(sync.SyncError):
            sync.merge_entry((b"base", "100644"), None, (b"edit", "100644"), "app.ts")
        with self.assertRaises(sync.SyncError):
            sync.merge_entry((b"base\0", "100644"), (b"left\0", "100644"), (b"right\0", "100644"), "asset.bin")

    def test_manifest_tampering_refused(self):
        state = json.loads((self.export / sync.MANIFEST).read_text())
        state["files"]["app.ts"]["sha256"] = "0" * 64
        (self.export / sync.MANIFEST).write_text(json.dumps(state))
        self.commit(self.export)
        with self.assertRaises(sync.SyncError):
            sync.run("push", self.source, self.export, True)

    def test_forged_newer_baseline_cannot_hide_source_changes(self):
        (self.source / "app.ts").write_text("source change\n")
        self.commit(self.source)
        state = json.loads((self.export / sync.MANIFEST).read_text())
        state["managed_source_commit"] = sync.head(self.source)
        state["files"] = sync.metadata(sync.snapshot(self.source, sync.head(self.source)))
        (self.export / sync.MANIFEST).write_text(json.dumps(state))
        (self.export / "app.ts").write_text("github change\n")
        self.commit(self.export)
        with self.assertRaises(sync.SyncError):
            sync.run("pull", self.source, self.export, True)
        self.assertEqual((self.source / "app.ts").read_text(), "source change\n")

    def test_raw_blob_bytes_ignore_export_attributes(self):
        (self.source / "literal.txt").write_text("$Format:%H$\n")
        (self.source / ".gitattributes").write_text("literal.txt export-subst export-ignore\n")
        self.commit(self.source)
        snap = sync.snapshot(self.source, sync.head(self.source))
        self.assertEqual(snap["literal.txt"][0], b"$Format:%H$\n")

    def test_credential_filenames_and_configured_database_secret(self):
        for path in [".netrc", ".git-credentials", "credentials.json", ".aws/credentials", sync.TRUSTED_ANCHOR]:
            self.assertFalse(sync.allowed(path))
        sync.scan_secrets({".npmrc": (b"node-linker=hoisted\n", "100644")})
        with self.assertRaises(sync.SyncError):
            sync.scan_secrets({".npmrc": (b"//registry.npmjs.org/:_authToken=synthetic\n", "100644")})
        secret = "synthetic-fixture-database-connection-not-real"
        with patch.dict(os.environ, {"DATABASE_URL": secret}):
            with self.assertRaises(sync.SyncError):
                sync.scan_secrets({"app.ts": (secret.encode(), "100644")})

    def test_trusted_anchor_restores_after_local_state_loss(self):
        self.commit(self.source)
        sync.trusted_state_path(self.source).unlink()
        status = sync.run("status", self.source, self.export)
        self.assertEqual(status["outbound"], [])
        self.assertEqual(status["inbound"], [])

    def test_symlinked_manifest_refused(self):
        manifest = self.export / sync.MANIFEST
        external = Path(self.temp.name) / "external.json"
        external.write_text("[]")
        manifest.unlink()
        manifest.symlink_to(external)
        self.commit(self.export)
        with self.assertRaises(sync.SyncError):
            sync.run("pull", self.source, self.export, True)
        self.assertEqual((self.source / "app.ts").read_bytes(), self.original)

    def test_malformed_manifest_refused(self):
        (self.export / sync.MANIFEST).write_text("[]")
        self.commit(self.export)
        with self.assertRaises(sync.SyncError):
            sync.run("push", self.source, self.export, True)

    def test_export_only_symlink_refused(self):
        docs = self.export / "docs/product"
        docs.mkdir(parents=True)
        (docs / "PRD.md").symlink_to("../../app.ts")
        self.commit(self.export)
        with self.assertRaises(sync.SyncError):
            sync.run("pull", self.source, self.export, True)

    def test_export_only_product_docs_do_not_import(self):
        docs = self.export / "docs/product"
        docs.mkdir(parents=True)
        (docs / "PRD.md").write_text("Snapshot only\n")
        self.commit(self.export)
        result = sync.run("pull", self.source, self.export, True)
        self.assertEqual(result["changed_files"], [])
        self.assertFalse((self.source / "docs").exists())


if __name__ == "__main__":
    unittest.main()
