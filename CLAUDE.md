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
