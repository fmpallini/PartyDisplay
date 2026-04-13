# Party Display — Release & Build Guidelines

## Version bumps

When bumping the version, update these **4 files** and only these:

| File | Field | How |
|------|-------|-----|
| `app/package.json` | `"version"` | JSON string |
| `app/src-tauri/Cargo.toml` | `version` | TOML string |
| `app/src-tauri/tauri.conf.json` | `"version"` | JSON string |
| `app/src-tauri/Cargo.lock` | `version` under `name = "party-display"` | Lock file entry |

Also run the "npm install" to force updating the package-lock.json correcly.

## Release procedure

Follow these steps **in order** when cutting a release.

### 1. Validate the version is new

- Read `app/package.json` to get the current version string.
- Run `git tag` and confirm no tag named `vX.Y.Z` already exists for that version.
- Run `git log --oneline origin/master..HEAD` to confirm there are unreleased commits on `dev`.
- If any check fails, stop and report to the user before continuing.

### 2. Verify docs are up to date

- Check that `README.md` (repo root) reflects the current version and feature set.
- Check that `docs/docs for release/README.txt` is consistent with the root README (build instructions, feature list, version number) - remember not need to bump the reference in the screenshot picture since its from a previous version.
- If either is stale, update it and commit before continuing.

### 3. Build the release binary

Run the Tauri production build from the `app/` directory:

```
cd app && npm run tauri build
```

Use the **standalone `party-display.exe`** (not the installer) as the release artifact.

### 4. Ask the user to test

Do **not** proceed until the user explicitly confirms the build is good.

### 5. Package the release zip

Create a zip named `party-display-vX.Y.Z.zip` containing:
- `party-display.exe` (from step 3)
- `docs/docs for release/README.txt`
- `docs/docs for release/LICENSE.txt`
- Move that to the `release/` folder at the repo root.

### 6. Merge dev → master

### 7. Tag the release — `vX.Y.Z`

### 8. Publish the GitHub release
I don't have the GitHub CLI installed so just provide the instructions for doing manually.