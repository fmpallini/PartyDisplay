## Release Guidelines

### Pre-work — run ALL four before proceeding

**P1. Dependency updates** — update all npm and Cargo dependencies:
- `cd app && npm update && npm outdated` — install any remaining major-version bumps manually, run `tsc --noEmit` after, fix any type errors, commit.
- `cd app/src-tauri && cargo update` — then run `cargo audit`. Fix or document any HIGH vulnerabilities (if transitive/upstream-blocked, note them explicitly). Commit.

**P2. Simplify** — invoke `/simplify` skill. Fix any issues found. Commit.

**P3. Security review** — invoke `/security-review` skill. Fix any HIGH/MEDIUM findings. Commit.

**P4. Bug search** — spawn an Explore agent to hunt logic bugs, race conditions, null checks, and edge cases in all files changed since the last tag. Fix any real bugs found. Commit.

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

**4. Ask user to test — do not proceed until confirmed.**

**5. Package zip**
Create `party-display-vX.Y.Z.zip` containing:
- `party-display.exe`
- `docs/docs for release/README.txt`
- `docs/docs for release/LICENSE.txt`
- entire `presets/` folder

Move zip to `release/` at repo root.

**6. Merge dev → master**

**7. Tag — `vX.Y.Z`**

**8. Confirm the proposed release notes than do a release through gh cli**
