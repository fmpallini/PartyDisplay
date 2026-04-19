## Release Guidelines

### Version bump — 4 files only

| File | Field |
|------|-------|
| `app/package.json` | `"version"` |
| `app/src-tauri/Cargo.toml` | `version` |
| `app/src-tauri/tauri.conf.json` | `"version"` |
| `app/src-tauri/Cargo.lock` | `version` under `name = "party-display"` |

Then run `npm install` to update `package-lock.json`.

### Pre-work — run ALL three before proceeding

**P1. Simplify** — invoke `/simplify` skill. Fix any issues found. Commit.

**P2. Security review** — invoke `/security-review` skill. Fix any HIGH/MEDIUM findings. Commit.

**P3. Bug search** — spawn an Explore agent to hunt logic bugs, race conditions, null checks, and edge cases in all files changed since the last tag (`git diff <last-tag>..HEAD`). Fix any real bugs found. Commit.

Do not skip or batch these. Each must complete and be committed before moving to the release procedure.

### Release procedure

**1. Validate version**
- Read `app/package.json` for current version.
- `git tag` — confirm `vX.Y.Z` does not already exist.
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

**8. Give user manual GitHub release publish instructions**
