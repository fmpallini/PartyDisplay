# Rust Test Speed: Workspace Split + Build Config

**Date:** 2026-04-27  
**Goal:** Reduce Rust test cycle from 6-7 min to under 2 min, both locally and in CI.  
**Approach:** Cargo workspace with extracted pure-logic crate + build config quick wins.

---

## Problem

Single binary crate pulls full Tauri dependency tree into every test compile. 48 lightweight unit tests run in milliseconds but every `cargo test` recompiles the entire Tauri stack. Root cause: testable pure logic lives inside the Tauri binary crate.

---

## Architecture

Convert `app/src-tauri/` into a Cargo workspace with two members:

```
app/src-tauri/
  Cargo.toml                   ← workspace manifest
  party-display/               ← binary crate (Tauri app, thin command layer)
    Cargo.toml
    src/
      main.rs
      audio.rs                 ← Tauri commands calling into core
      media_keys.rs            ← stays (enigo + Tauri window)
      window_manager.rs        ← stays (Tauri window API)
      remote_server.rs         ← stays (Tauri command handlers)
  party-display-core/          ← lib crate (pure logic, NO Tauri dep)
    Cargo.toml
    src/
      lib.rs
      smtc.rs                  ← 16 tests
      dlna.rs                  ← 6 tests
      dlna_proxy.rs            ← 5 tests
      auth.rs                  ← token logic + 1 test (keyring stays in binary)
      local_audio.rs           ← 5 tests
      presets.rs               ← 4 tests
      slideshow.rs             ← 5 tests
      system.rs                ← 6 tests
```

All 48 tests live in `party-display-core`. Running `cargo test -p party-display-core` or `cargo nextest run -p party-display-core` compiles zero Tauri code.

---

## Dependencies

### `party-display-core/Cargo.toml`
Only pure-logic deps — no Tauri, no Windows crate, no keyring, no cpal, no enigo:
- `serde`, `serde_json`
- `roxmltree`
- `rupnp` (only if DLNA discovery logic migrates cleanly — verify no async Tauri coupling during migration step)
- `tokio` (if async logic needed in core)
- `base64`
- `local-ip-address`

### `party-display/Cargo.toml`
Full Tauri stack (unchanged from current) plus:
```toml
[dependencies]
party-display-core = { path = "../party-display-core" }
```

### Workspace `Cargo.toml`
```toml
[workspace]
members = ["party-display", "party-display-core"]
resolver = "2"

[profile.test]
opt-level = 0
debug = 0
incremental = true
```

---

## Build Config

New file `.cargo/config.toml` at `app/src-tauri/`:
```toml
[build]
jobs = 8
```

---

## Migration Pattern

Each module extracted from binary to core follows this pattern:

**Before** (in `party-display`):
```rust
#[tauri::command]
pub fn parse_smtc(input: &str) -> Result<SmtcData, String> {
    // ... all logic here ...
}
```

**After** (in `party-display-core`):
```rust
// party-display-core/src/smtc.rs
pub fn parse_smtc(input: &str) -> Result<SmtcData, String> {
    // ... all logic here, with all tests ...
}
```

```rust
// party-display/src/smtc.rs (thin wrapper)
#[tauri::command]
pub fn parse_smtc_cmd(input: &str) -> Result<SmtcData, String> {
    party_display_core::smtc::parse_smtc(input)
}
```

---

## Migration Order

Each step must compile and pass all tests before proceeding:

1. **Create workspace** — convert `app/src-tauri/Cargo.toml` to workspace manifest, move existing crate content into `party-display/` subdirectory
2. **Create `party-display-core`** — empty lib crate, add as workspace member and dependency in `party-display`, verify compile
3. **Migrate modules one at a time** in this order (simplest first):
   - `dlna_proxy.rs` (already pure — no Tauri imports at all)
   - `system.rs` (battery parsing, pure logic)
   - `smtc.rs` (string/byte parsing, pure logic, most tests)
   - `dlna.rs` (XML parsing)
   - `auth.rs` (token serialization — strip keyring, keep in binary)
   - `local_audio.rs` (file scanning logic)
   - `presets.rs` (file read/write logic)
   - `slideshow.rs` (photo collection logic)
4. **Add build config** — `.cargo/config.toml` + `[profile.test]` in workspace manifest
5. **Update CI** — nextest + sccache, test command targets core crate only

---

## CI Changes (`test.yml`)

```yaml
- name: Install nextest
  uses: taiki-e/install-action@nextest

- name: Set up sccache
  uses: mozilla-actions/sccache-action@v0.0.5

- name: Run Rust tests
  run: cargo nextest run -p party-display-core
  working-directory: app/src-tauri
  env:
    SCCACHE_GHA_ENABLED: "true"
    RUSTC_WRAPPER: sccache
```

---

## Success Criteria

- `cargo nextest run -p party-display-core` completes in under 60 seconds locally
- CI Rust test job completes in under 2 minutes (warm cache)
- All 48 tests pass
- `cargo build` for the full binary still works (no regressions in Tauri app)
- Binary crate Tauri commands still registered and functional

---

## Out of Scope

- Adding new tests
- Async test infrastructure
- Migrating `audio.rs`, `media_keys.rs`, `window_manager.rs`, `remote_server.rs` (genuinely Tauri-coupled, no unit tests)
