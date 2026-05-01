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

**P1. Dependency updates** — update minor/patch versions only; skip major bumps unless the package is deprecated or has a security fix:
- `cd app && npm update && npm outdated` — `npm update` handles minor/patch. For any remaining outdated package, only bump to a new major if it is deprecated or flagged by audit. Run `tsc --noEmit` after, fix any type errors, commit.
- `cd app/src-tauri && cargo update` — updates within compatible (minor/patch) ranges. Then run `cargo audit`. Fix or document any HIGH vulnerabilities (if transitive/upstream-blocked, note them explicitly). Commit.

**P2. Evaluate test coverage** — review changed and new code from P0. If any logic, edge case, or behaviour is not covered by existing tests, write the missing unit tests now. Commit.

**P3. Simplify** — invoke `/simplify` skill against the changed files. Fix any issues found. Commit.

**P4. Security review** — invoke `/security-review` skill. Fix any HIGH/MEDIUM findings. Commit.

**P5. Bug search** — spawn an Explore agent to hunt logic bugs, race conditions, null checks, and edge cases in all files changed since the last tag. Fix any real bugs found. Commit.

**P6. Run tests** — final gate after all pre-work changes:
- `cd app && npm test` — all frontend Vitest tests must pass.
- `cd app/src-tauri && cargo test --workspace` — all Rust tests must pass.
Do not proceed if any test fails. Fix the failure first.

Do not skip or batch these. Each must complete and be committed before moving to the release procedure.

### Release procedure

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

**3. Build**
```
cd app && npm run release
```

Artifact: standalone `party-display.exe` at `src-tauri/target/release/` with `presets/` alongside it.

**4. Test against release build**
Work through every item in [`docs/testing/release-checklist.md`](../../docs/testing/release-checklist.md) using the built `party-display.exe`.
Do not proceed until all items are checked off.

**5. Package zip**
Create `party-display-vX.Y.Z.zip` containing:
- `party-display.exe`
- `docs/docs for release/README.txt`
- `docs/docs for release/LICENSE.txt`
- entire `presets/` folder

Move zip to `release/` at repo root.

**6. Commit and push dev** — commit any files changed during the release process (docs, lock files, version bumps) and push:
- `git add -p` — stage pending changes, review each hunk.
- `git commit -m "chore: release prep vX.Y.Z"`
- `git push origin dev`

**7. Merge dev → master**

**8. Tag — `vX.Y.Z`**

**9. Confirm the proposed release notes than do a release through gh cli**
