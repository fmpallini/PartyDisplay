## Release Guidelines

### Before anything — branch and sync check

**B0. Verify dev branch** — release must start from `dev`:
- `git branch --show-current` — must output `dev`. Stop if not.

**B1. Pull dev** — ensure local dev is in sync with origin:
- `git pull origin dev` — fast-forward local dev to remote. If it fails (diverged), stop and report.

**B2. Sync with master** — ensure dev is not behind master:
- `git fetch origin`
- `git log --oneline HEAD..origin/master` — if any commits show, master is ahead. Rebase:
  ```
  git rebase origin/master
  ```
  Resolve any conflicts, then continue. If rebase fails, stop and report.

### Pre-work — run ALL steps in order before proceeding

**P0. Review changes since last tag** — get familiar with everything that changed:
- `git log --oneline <last-tag>..HEAD` — overview of commits.
- `git diff <last-tag>..HEAD` — full diff of changed code.
Use this context to inform all steps that follow.

**P1. Evaluate test coverage** — review changed and new code from P0. If any logic, edge case, or behaviour is not covered by existing tests, write the missing unit tests now. Commit.

**P2. Simplify** — invoke `/simplify` skill against the changed files. Fix any issues found. Commit.

**P3. Security review** — invoke `/security-review` skill. Fix any HIGH/MEDIUM findings. Commit.

**P4. Bug search** — spawn an Explore agent to hunt logic bugs, race conditions, null checks, and edge cases in all files changed since the last tag. Fix any real bugs found. Commit.

**P5. Run tests** — final gate after all pre-work changes:
- `cd app && npm test` — all frontend Vitest tests must pass.
- `cd app/src-tauri && cargo test --workspace` — all Rust tests must pass.
Do not proceed if any test fails. Fix the failure first.

Do not skip or batch these. Each must complete and be committed before moving to the release procedure.

### Release procedure

> The binary in every release is built by GitHub Actions directly from the signed tag — never from a local machine. Users can verify provenance with `gh attestation verify party-display-vX.Y.Z.zip --repo fmpal/vcup2`.

**1. Validate version**
- Read `app/package.json` for current version.
- `git tag` — check if `vX.Y.Z` already exists.
  - If tag **exists**: follow [`VERSION_BUMP.md`](VERSION_BUMP.md) to bump, then re-read the new version and continue.
  - If tag **does not exist**: current version is unreleased, no bump needed.
- `git log --oneline origin/master..HEAD` — confirm unreleased commits exist.
- Stop and report if any check fails.

**2. Check docs**
- `README.md` reflects current features.
- `docs/docs for release/README.txt` matches (version, features, build instructions). Skip the screenshot version reference.
- Update and commit if stale.

**3. Commit and push dev** — commit any files changed during the release process (docs, lock files, version bumps) and push:
- `git add -p` — stage pending changes, review each hunk.
- `git commit -m "chore: release prep vX.Y.Z"`
- `git push origin dev`

**4. Merge dev → master**

Master is branch-protected. Open a PR via gh CLI:
```
gh pr create --base master --head dev --title "release: vX.Y.Z" --body "..."
```
Wait for all required CI checks to pass, then merge:
```
gh pr merge <PR#> --merge
```
Pull master locally to sync: `git checkout master && git pull origin master`

**5. Tag — `vX.Y.Z`**

Push the tag to trigger the release build:
```
git tag vX.Y.Z
git push origin vX.Y.Z
```

The `.github/workflows/release.yml` workflow runs automatically. It builds `party-display.exe` from the tagged commit, assembles the zip, attests provenance via Sigstore, and creates a **draft** GitHub release with the zip and `checksums.txt` attached.

Watch the run: `gh run watch`

Do not proceed until the workflow completes successfully.

**6. Test the CI-built release**

Download the zip from the draft release:
```
gh release download vX.Y.Z --dir /tmp/release-test
```

Work through every item in [`docs/testing/release-checklist.md`](../../docs/testing/release-checklist.md) using the downloaded `party-display.exe`.
Do not proceed until all items are checked off.

**7. Publish the draft release**

Review and edit the auto-generated release notes, then publish:
```
gh release edit vX.Y.Z --draft=false
```
