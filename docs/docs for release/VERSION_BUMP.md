## Version Bump

Update version in **4 files only**:

| File | Field |
|------|-------|
| `app/package.json` | `"version"` |
| `app/src-tauri/Cargo.toml` | `version` under `[workspace.package]` |
| `app/src-tauri/tauri.conf.json` | `"version"` |
| `app/src-tauri/Cargo.lock` | `version` under `name = "party-display"` AND `name = "party-display-core"` |

Then run `npm install` in `app/` to update `package-lock.json`.
