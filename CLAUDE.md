# Party Display — Claude Code Notes

## Version bumps

When bumping the version, update these **4 files** and only these:

| File | Field | How |
|------|-------|-----|
| `app/package.json` | `"version"` | JSON string |
| `app/src-tauri/Cargo.toml` | `version` | TOML string |
| `app/src-tauri/tauri.conf.json` | `"version"` | JSON string |
| `app/src-tauri/Cargo.lock` | `version` under `name = "party-display"` | Lock file entry |

**Never use a broad `sed` on Cargo.lock.** Other packages in the lock file (e.g. `dlv-list`, `hermit-abi`, `redox_users`) may share the same version string and get incorrectly modified. Instead, edit `Cargo.lock` with a targeted replace that matches the `party-display` block specifically, or use the Edit tool on the exact lines.

Safe approach:
```bash
# Cargo.toml and tauri.conf.json — safe, unique strings
sed -i 's/^version = "X.Y.Z"$/version = "A.B.C"/' app/src-tauri/Cargo.toml
sed -i 's/"version": "X.Y.Z"/"version": "A.B.C"/' app/src-tauri/tauri.conf.json
sed -i 's/"version": "X.Y.Z"/"version": "A.B.C"/' app/package.json

# Cargo.lock — use the Edit tool targeting the party-display block, not sed
```

## Release procedure

Follow these steps **in order** when cutting a release.

### 1. Validate the version is new

- Read `app/package.json` to get the current version string.
- Run `git tag` and confirm no tag named `vX.Y.Z` already exists for that version.
- Run `git log --oneline origin/master..HEAD` to confirm there are unreleased commits on `dev`.
- If any check fails, stop and report to the user before continuing.

### 2. Verify docs are up to date

- Check that `README.md` (repo root) reflects the current version and feature set.
- Check that `docs/docs for release/README.txt` is consistent with the root README (build instructions, feature list, version number).
- If either is stale, update it and commit before continuing.

### 3. Build the release binary

Run the Tauri production build from the `app/` directory:

```bash
cd app && npm run tauri build
```

The unsigned installer and the standalone `.exe` are produced under:
```
app/src-tauri/target/release/party-display.exe          # standalone exe
app/src-tauri/target/release/bundle/                    # installer bundles (ignore for release zip)
```

Use the **standalone `party-display.exe`** (not the installer) as the release artifact.

### 4. Package the release zip

Create a zip named `party-display-vX.Y.Z.zip` containing:
- `party-display.exe` (from step 3)
- `docs/docs for release/README.txt`
- `docs/docs for release/LICENSE.txt`

```bash
VERSION=$(node -p "require('./app/package.json').version")
mkdir -p release_tmp
cp app/src-tauri/target/release/party-display.exe release_tmp/
cp "docs/docs for release/README.txt" release_tmp/
cp "docs/docs for release/LICENSE.txt" release_tmp/
cd release_tmp && zip -r "../party-display-v${VERSION}.zip" . && cd ..
rm -rf release_tmp
```

### 5. Ask the user to test

**Stop here.** Tell the user:
> "Release build is ready at `party-display-vX.Y.Z.zip`. Please test the `.exe` and confirm everything works before I proceed with the merge, tag, and GitHub release."

Do **not** proceed until the user explicitly confirms the build is good.

### 6. Merge dev → master

```bash
git checkout master
git merge --no-ff dev -m "release: vX.Y.Z"
git checkout dev
```

### 7. Tag the release

```bash
git tag -a "vX.Y.Z" -m "Party Display vX.Y.Z"
git push origin master
git push origin "vX.Y.Z"
```

### 8. Publish the GitHub release

```bash
gh release create "vX.Y.Z" \
  "party-display-vX.Y.Z.zip" \
  --title "Party Display vX.Y.Z" \
  --notes "See README for build instructions and full feature list." \
  --latest
```

The zip file is the **only** asset. Do not attach the installer bundles or the raw `.exe` separately.

After the release is published, delete the local zip and confirm the release URL to the user.
