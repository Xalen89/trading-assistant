# Zax private GitHub export and on-request sync

Destination: **https://github.com/Xalen89/zax-trading-app**. This is a separate private source repository. The managed mobile project's active repository stays Manus-managed, preserving its mobile workflow. This is not automatic GitHub integration, a deployment, a native build, or a backup of account records or uploaded Library originals.

The initial export is a clean current-source snapshot with fresh GitHub history. Previous Git history, generated artifacts, environment secrets, credential files, caches, database files and runtime records are excluded. The dated PRD and feature specification are included under `docs/product/`; they are documentation snapshots, not part of the bidirectional source set.

## What to ask for

Say **“Sync my latest Zax changes to GitHub”** to export reviewed source updates, or **“Pull my GitHub changes into Zax”** to import and review your GitHub edits. Nothing runs while you are away. Conflicts must be resolved without discarding either side; publication is a separate action.

## Worktrees and authorization

In this task's sandbox, the app worktree is `/home/ubuntu/stratdesk` and the independent GitHub worktree is `/home/ubuntu/zax-github-export`. The owner approved GitHub CLI authorization under `Xalen89`. Its credential directory is outside both repositories at `/home/ubuntu/.config/zax-github-export`, restricted to the sandbox user. No credential is stored in this document or the GitHub repository. A different environment requires its own owner-approved GitHub login and accessible managed-source history.

Use the approved CLI profile for GitHub operations in this environment, since the earlier ambient GitHub credential lacked access to this new private repository:

```bash
export GH_CONFIG_DIR=/home/ubuntu/.config/zax-github-export
unset GH_TOKEN GITHUB_TOKEN
export GH_PAGER=cat GH_PROMPT_DISABLED=1 TERM=dumb NO_COLOR=1
```

Do not replace the managed app's `origin`, its credential helper, upstream or canonical provider. An isolated export clone may use the GitHub CLI credential helper per command:

```bash
git -C /home/ubuntu/zax-github-export \
  -c credential.helper= -c 'credential.helper=!gh auth git-credential' \
  fetch origin main
```

Verify the destination is still private and writable before an upload. Fetch and inspect current source and GitHub heads. Preserve dirty/untracked work; do not reset, clean, stash automatically, force-push, or overwrite a nonempty remote. Integrate an advanced GitHub `origin/main` normally before reconciliation, stopping if that integration conflicts.

## Reconciliation helper

`scripts/private-repo-sync.py` is local tooling, not a service. It makes **no network calls, Git commits, pushes, remote changes or publication requests**. `ZAX_SYNC_MANIFEST.json` in the GitHub worktree must exactly match the accepted baseline retained outside that worktree. Trusted state is held in the source Git directory and persisted as `.manus-private-sync-state.json` with an intentional managed checkpoint; that anchor is never exported to or imported from GitHub. After a sandbox replacement, the committed managed-only anchor can restore the baseline. Missing/mismatched state stops rather than trusting editable GitHub metadata. The baseline must also be an ancestor of the current managed source. Fetch that source history if it is absent.

Reconciliation reads raw Git blobs, not an archive with attribute substitution. Credential files such as `.netrc`, `.git-credentials`, `.pypirc`, AWS/SSH stores and `credentials.json` are excluded. The required safe `.npmrc` install policy is retained, but credential-bearing npm configuration is refused. Configured key/token/password/database connection values and private-key material are checked before writes. These checks complement—not replace—review for unknown secrets.

Both worktrees must have clean tracked state. Untracked files are preserved; an incoming path that collides with an untracked file is refused. Secret/unsafe-path, symlink, submodule, add/add, delete/change, binary and overlapping text conflicts stop the entire plan before any source write. Disjoint text edits merge against the shared baseline. Known configured credential values and private-key material are refused; this is not a guarantee that every possible unknown secret can be detected, so review the diff before upload.

For status or an outbound plan:

```bash
python3 scripts/private-repo-sync.py status \
  --source-dir /home/ubuntu/stratdesk --export-dir /home/ubuntu/zax-github-export
python3 scripts/private-repo-sync.py push \
  --source-dir /home/ubuntu/stratdesk --export-dir /home/ubuntu/zax-github-export
```

After reviewing the plan, repeat `push` with `--apply`, inspect the GitHub worktree diff, scan all intended staged files including documentation for secrets, make a normal GitHub commit, fetch the latest remote main again, reconcile any intervening advance, and push without force. A GitHub push does not create a Manus checkpoint.

For an inbound plan, run the same command with `pull`. After review, add `--apply`. This prepares reviewable changes in the managed app worktree; it **does not commit or promote them**. Inspect all incoming code before executing it, run the affected project checks, intentionally commit, then fetch/integrate canonical main and push through the existing managed transport to save a checkpoint. Keep auto-publish off. Finish with an outbound reconciliation to advance the shared manifest after both sides agree.

An outbound `--apply` also prepares the managed-only baseline anchor. Intentionally save that metadata change to the managed repository, without publication, so future tasks can recover the same trusted baseline. Do not stage the anchor into the GitHub repository. Do not edit either baseline copy to conceal a source conflict.

Initial `init --apply` is only for a new empty export worktree and must never overwrite an existing GitHub history. Repeated initialization is refused. The source baseline and metadata must not be edited to conceal a conflict.

## Validation boundaries

Local fixtures exercise outbound/inbound changes, preserved disjoint edits, rejection before any conflicting write, untracked collisions, dirty tracked work, known-secret refusal, unsafe paths/symlinks, binary/delete conflicts, manifest tampering and export-only documentation. An initial private upload plus an unchanged inbound dry run verifies setup without inserting a fake trade, account record or production change. Actual future GitHub edits remain subject to review and affected checks.
