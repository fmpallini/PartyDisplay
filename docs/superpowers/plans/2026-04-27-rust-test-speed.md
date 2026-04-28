# Rust Test Speed: Workspace Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Rust test cycle from 6-7 min to under 2 min by extracting pure logic into a `party-display-core` lib crate with no Tauri dependency.

**Architecture:** Convert `app/src-tauri/` into a Cargo workspace where the existing binary stays in place as the root package, and a new `party-display-core/` lib crate holds all testable pure logic. Tests run via `cargo nextest run -p party-display-core` — zero Tauri compilation.

**Tech Stack:** Cargo workspaces, cargo-nextest, sccache, GitHub Actions

---

## File Map

**Created:**
- `app/src-tauri/party-display-core/Cargo.toml`
- `app/src-tauri/party-display-core/src/lib.rs`
- `app/src-tauri/party-display-core/src/dlna_proxy.rs`
- `app/src-tauri/party-display-core/src/system.rs`
- `app/src-tauri/party-display-core/src/smtc.rs`
- `app/src-tauri/party-display-core/src/dlna.rs`
- `app/src-tauri/party-display-core/src/local_audio.rs`
- `app/src-tauri/party-display-core/src/presets.rs`
- `app/src-tauri/party-display-core/src/slideshow.rs`
- `app/src-tauri/.cargo/config.toml`

**Modified:**
- `app/src-tauri/Cargo.toml` — add `[workspace]`, `[profile.test]`, core dep
- `app/src-tauri/src/dlna_proxy.rs` — replaced with core re-export
- `app/src-tauri/src/main.rs` — remove `mod dlna_proxy`, use core path
- `app/src-tauri/src/system.rs` — import types/fn from core, keep Win32 + Tauri cmds
- `app/src-tauri/src/smtc.rs` — import pure fns from core
- `app/src-tauri/src/dlna.rs` — import types/parsing from core, keep rupnp cmds
- `app/src-tauri/src/local_audio.rs` — thin Tauri wrapper over core fn
- `app/src-tauri/src/presets.rs` — import types/fn from core, keep path resolution
- `app/src-tauri/src/slideshow.rs` — import collect_photos from core
- `.github/workflows/test.yml` — nextest + sccache

---

## Task 1: Create workspace + empty core crate

**Files:**
- Modify: `app/src-tauri/Cargo.toml`
- Create: `app/src-tauri/.cargo/config.toml`
- Create: `app/src-tauri/party-display-core/Cargo.toml`
- Create: `app/src-tauri/party-display-core/src/lib.rs`

- [ ] **Step 1: Add workspace, profile.test, and core dep to Cargo.toml**

  Open `app/src-tauri/Cargo.toml`. Add at the top (before `[package]`):
  ```toml
  [workspace]
  members = [".", "party-display-core"]
  resolver = "2"
  
  ```
  Add at the bottom (after all existing sections):
  ```toml
  
  [profile.test]
  opt-level = 0
  debug = 0
  incremental = true
  ```
  Add to `[dependencies]`:
  ```toml
  party-display-core = { path = "party-display-core" }
  ```

- [ ] **Step 2: Create `.cargo/config.toml`**

  Create `app/src-tauri/.cargo/config.toml`:
  ```toml
  [build]
  jobs = 8
  ```

- [ ] **Step 3: Create core crate Cargo.toml**

  Create `app/src-tauri/party-display-core/Cargo.toml`:
  ```toml
  [package]
  name = "party-display-core"
  version = "0.1.0"
  edition = "2021"
  
  [dependencies]
  serde     = { version = "1", features = ["derive"] }
  serde_json = "1"
  roxmltree  = "0.20"
  reqwest    = { version = "0.12", features = ["json"] }
  tokio      = { version = "1", features = ["net", "io-util"] }
  futures    = "0.3"
  ```

- [ ] **Step 4: Create empty lib.rs**

  Create `app/src-tauri/party-display-core/src/lib.rs`:
  ```rust
  ```
  (empty for now — modules added per task)

- [ ] **Step 5: Verify workspace compiles**

  Run from `app/src-tauri/`:
  ```
  cargo build
  ```
  Expected: compiles successfully. No test failures.

- [ ] **Step 6: Commit**
  ```
  git add app/src-tauri/Cargo.toml app/src-tauri/.cargo/config.toml app/src-tauri/party-display-core/
  git commit -m "build: create cargo workspace with empty party-display-core crate"
  ```

---

## Task 2: Migrate dlna_proxy to core

`dlna_proxy.rs` has no Tauri imports — cleanest migration. Move entire module to core, replace binary module with re-export.

**Files:**
- Create: `app/src-tauri/party-display-core/src/dlna_proxy.rs`
- Modify: `app/src-tauri/party-display-core/src/lib.rs`
- Modify: `app/src-tauri/src/dlna_proxy.rs`

- [ ] **Step 1: Copy dlna_proxy.rs to core (unchanged)**

  Create `app/src-tauri/party-display-core/src/dlna_proxy.rs` with the full content of `app/src-tauri/src/dlna_proxy.rs` as-is. No changes needed — the module has no Tauri imports.

- [ ] **Step 2: Register module in lib.rs**

  Update `app/src-tauri/party-display-core/src/lib.rs`:
  ```rust
  pub mod dlna_proxy;
  ```

- [ ] **Step 3: Run core tests — verify 5 pass**

  Run from `app/src-tauri/`:
  ```
  cargo test -p party-display-core
  ```
  Expected: 5 tests pass (`allows_rfc1918_ranges`, `blocks_loopback`, `blocks_link_local_metadata`, `blocks_public_ips`, `blocks_hostnames_and_malformed`).

- [ ] **Step 4: Replace binary dlna_proxy.rs with re-export**

  Replace full content of `app/src-tauri/src/dlna_proxy.rs` with:
  ```rust
  pub use party_display_core::dlna_proxy::*;
  ```

- [ ] **Step 5: Verify binary still compiles**

  Run from `app/src-tauri/`:
  ```
  cargo build
  ```
  Expected: compiles. `main.rs` uses `dlna_proxy::start()` which now resolves via the re-export.

- [ ] **Step 6: Commit**
  ```
  git add app/src-tauri/party-display-core/src/ app/src-tauri/src/dlna_proxy.rs app/src-tauri/party-display-core/src/lib.rs
  git commit -m "refactor: migrate dlna_proxy to party-display-core"
  ```

---

## Task 3: Migrate pure system types to core

Tests cover `parse_ip_location` only. Move `IpLocation`, `BatteryStatus`, `parse_ip_location` to core. Binary keeps Win32 FFI, `prevent_sleep`, and Tauri commands.

**Files:**
- Create: `app/src-tauri/party-display-core/src/system.rs`
- Modify: `app/src-tauri/party-display-core/src/lib.rs`
- Modify: `app/src-tauri/src/system.rs`

- [ ] **Step 1: Create core system.rs with pure types and tests**

  Create `app/src-tauri/party-display-core/src/system.rs`:
  ```rust
  use serde::Serialize;
  
  #[derive(Debug, Serialize)]
  pub struct IpLocation {
      pub lat:     f64,
      pub lon:     f64,
      pub city:    String,
      pub country: String,
  }
  
  pub fn parse_ip_location(json: &serde_json::Value) -> Result<IpLocation, String> {
      if json["status"].as_str() != Some("success") {
          return Err(format!(
              "ip geolocation: {}",
              json["message"].as_str().unwrap_or("unknown"),
          ));
      }
      let lat     = json["lat"]    .as_f64() .ok_or_else(|| "missing lat".to_string())?;
      let lon     = json["lon"]    .as_f64() .ok_or_else(|| "missing lon".to_string())?;
      let city    = json["city"]   .as_str() .ok_or_else(|| "missing city".to_string())?   .to_string();
      let country = json["country"].as_str() .ok_or_else(|| "missing country".to_string())?.to_string();
      Ok(IpLocation { lat, lon, city, country })
  }
  
  #[derive(Serialize, Clone)]
  pub struct BatteryStatus {
      pub level:     u8,
      pub charging:  bool,
      pub available: bool,
  }
  
  #[cfg(test)]
  mod tests {
      use super::*;
      use serde_json::json;
  
      #[test]
      fn parse_valid_response() {
          let j = json!({
              "status": "success",
              "lat": 48.85, "lon": 2.35,
              "city": "Paris", "country": "France",
          });
          let loc = parse_ip_location(&j).unwrap();
          assert_eq!(loc.city, "Paris");
          assert_eq!(loc.country, "France");
          assert!((loc.lat - 48.85).abs() < 0.001);
          assert!((loc.lon - 2.35).abs() < 0.001);
      }
  
      #[test]
      fn parse_fails_when_status_is_not_success() {
          let j = json!({ "status": "fail", "message": "private range" });
          let err = parse_ip_location(&j).unwrap_err();
          assert!(err.contains("private range"), "expected 'private range' in: {err}");
      }
  
      #[test]
      fn parse_fails_when_status_absent() {
          let j = json!({ "lat": 0.0, "lon": 0.0, "city": "X", "country": "Y" });
          assert!(parse_ip_location(&j).is_err());
      }
  
      #[test]
      fn parse_fails_when_lat_missing() {
          let j = json!({ "status": "success", "lon": 2.35, "city": "Paris", "country": "France" });
          let err = parse_ip_location(&j).unwrap_err();
          assert!(err.contains("lat"), "expected 'lat' in: {err}");
      }
  
      #[test]
      fn parse_fails_when_city_missing() {
          let j = json!({ "status": "success", "lat": 0.0, "lon": 0.0, "country": "France" });
          let err = parse_ip_location(&j).unwrap_err();
          assert!(err.contains("city"), "expected 'city' in: {err}");
      }
  
      #[test]
      fn parse_unknown_failure_uses_fallback_message() {
          let j = json!({ "status": "fail" });
          let err = parse_ip_location(&j).unwrap_err();
          assert!(err.contains("unknown"), "expected 'unknown' in: {err}");
      }
  }
  ```

- [ ] **Step 2: Add module to lib.rs**

  Append to `app/src-tauri/party-display-core/src/lib.rs`:
  ```rust
  pub mod system;
  ```

- [ ] **Step 3: Run core tests — verify 6 new pass (11 total)**

  ```
  cargo test -p party-display-core
  ```
  Expected: 11 tests pass.

- [ ] **Step 4: Update binary system.rs to import from core**

  Replace full content of `app/src-tauri/src/system.rs`:
  ```rust
  pub use party_display_core::system::{IpLocation, BatteryStatus, parse_ip_location};
  
  // ── Windows platform ──────────────────────────────────────────────────────────
  
  #[cfg(target_os = "windows")]
  mod platform {
      use super::BatteryStatus;
  
      extern "system" {
          fn SetThreadExecutionState(esFlags: u32) -> u32;
          fn GetSystemPowerStatus(lpSystemPowerStatus: *mut SystemPowerStatus) -> i32;
      }
  
      const ES_CONTINUOUS:       u32 = 0x8000_0000;
      const ES_SYSTEM_REQUIRED:  u32 = 0x0000_0001;
      const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;
  
      #[repr(C)]
      struct SystemPowerStatus {
          ac_line_status:         u8,
          battery_flag:           u8,
          battery_life_percent:   u8,
          system_status_flag:     u8,
          battery_life_time:      u32,
          battery_full_life_time: u32,
      }
  
      pub fn set_prevent_sleep(active: bool) {
          unsafe {
              if active {
                  SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
              } else {
                  SetThreadExecutionState(ES_CONTINUOUS);
              }
          }
      }
  
      pub fn get_battery() -> BatteryStatus {
          let mut s = SystemPowerStatus {
              ac_line_status: 255, battery_flag: 128, battery_life_percent: 255,
              system_status_flag: 0, battery_life_time: 0, battery_full_life_time: 0,
          };
          let ok = unsafe { GetSystemPowerStatus(&mut s) };
          if ok == 0 {
              return BatteryStatus { level: 100, charging: false, available: false };
          }
          let no_battery = (s.battery_flag & 128) != 0 || s.battery_life_percent == 255;
          let charging   = (s.battery_flag &   8) != 0 || s.ac_line_status == 1;
          BatteryStatus {
              level:     if no_battery { 100 } else { s.battery_life_percent.min(100) },
              charging,
              available: !no_battery,
          }
      }
  }
  
  #[cfg(not(target_os = "windows"))]
  mod platform {
      use super::BatteryStatus;
      pub fn set_prevent_sleep(_active: bool) {}
      pub fn get_battery() -> BatteryStatus {
          BatteryStatus { level: 100, charging: false, available: false }
      }
  }
  
  pub fn prevent_sleep(active: bool) {
      platform::set_prevent_sleep(active);
  }
  
  #[tauri::command]
  pub fn get_battery_status() -> BatteryStatus {
      platform::get_battery()
  }
  
  #[tauri::command]
  pub async fn get_ip_location() -> Result<IpLocation, String> {
      let resp = reqwest::get("http://ip-api.com/json/")
          .await
          .map_err(|e| e.to_string())?;
      let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
      parse_ip_location(&json)
  }
  
  #[tauri::command]
  pub fn trigger_cast_flyout() -> Result<(), String> {
      use enigo::{Enigo, Key, Keyboard, Settings, Direction};
      let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
      enigo.key(Key::Meta, Direction::Press).map_err(|e| e.to_string())?;
      enigo.key(Key::Unicode('k'), Direction::Click).map_err(|e| e.to_string())?;
      enigo.key(Key::Meta, Direction::Release).map_err(|e| e.to_string())?;
      Ok(())
  }
  ```

- [ ] **Step 5: Verify binary compiles**

  ```
  cargo build
  ```
  Expected: compiles, no errors.

- [ ] **Step 6: Commit**
  ```
  git add app/src-tauri/party-display-core/src/system.rs app/src-tauri/party-display-core/src/lib.rs app/src-tauri/src/system.rs
  git commit -m "refactor: migrate system pure types to party-display-core"
  ```

---

## Task 4: Migrate pure smtc functions to core

Pure functions: `is_channel_artist`, `strip_title_noise`, `normalize_browser_track`, `detect_mime` + all 16 tests. Windows API polling stays in binary.

**Files:**
- Create: `app/src-tauri/party-display-core/src/smtc.rs`
- Modify: `app/src-tauri/party-display-core/src/lib.rs`
- Modify: `app/src-tauri/src/smtc.rs`

- [ ] **Step 1: Create core smtc.rs with pure functions and all 16 tests**

  Create `app/src-tauri/party-display-core/src/smtc.rs`:
  ```rust
  pub fn is_channel_artist(artist: &str) -> bool {
      let a = artist.to_lowercase();
      a.ends_with("vevo") || a.ends_with(" - topic") || a.ends_with("official")
  }
  
  pub fn strip_title_noise(title: &str) -> String {
      const NOISE: &[&str] = &[
          "official video", "official music video", "official audio",
          "official lyric video", "official visualizer", "official",
          "lyric video", "lyrics", "lyric", "audio",
          "music video", "video", "visualizer",
          "hd", "hq", "4k", "720p", "1080p",
          "explicit", "explicit version", "clean", "radio edit",
          "album version", "single version",
      ];
      let mut s = title.trim().to_string();
      loop {
          let before = s.clone();
          for (open, close) in [('(', ')'), ('[', ']')] {
              if s.ends_with(close) {
                  if let Some(pos) = s.rfind(open) {
                      let inner = s[pos + 1..s.len() - 1].trim().to_lowercase();
                      let is_noise = NOISE.contains(&inner.as_str())
                          || inner.contains("remaster")
                          || inner.contains("re-master");
                      if is_noise {
                          s = s[..pos].trim_end().to_string();
                          break;
                      }
                  }
              }
          }
          if s == before { break; }
      }
      s
  }
  
  pub fn normalize_browser_track(title: &str, artist: &str) -> (String, String) {
      let clean_artist = artist
          .strip_suffix(" - Topic")
          .or_else(|| artist.strip_suffix("VEVO"))
          .or_else(|| artist.strip_suffix("Official"))
          .unwrap_or(artist)
          .trim()
          .to_string();
      let channel = is_channel_artist(artist);
      let (raw_name, final_artist) = if let Some(dash) = title.find(" - ") {
          let left  = title[..dash].trim();
          let right = title[dash + 3..].trim();
          if !left.is_empty() && !right.is_empty()
              && (channel || left.eq_ignore_ascii_case(&clean_artist))
          {
              (right.to_string(), left.to_string())
          } else {
              (title.to_string(), clean_artist)
          }
      } else {
          (title.to_string(), clean_artist)
      };
      (strip_title_noise(&raw_name), final_artist)
  }
  
  pub fn detect_mime(bytes: &[u8]) -> Option<&'static str> {
      if bytes.starts_with(b"\xff\xd8\xff") {
          Some("image/jpeg")
      } else if bytes.starts_with(b"\x89PNG") {
          Some("image/png")
      } else {
          None
      }
  }
  
  #[cfg(test)]
  mod tests {
      use super::*;
  
      #[test]
      fn normalize_youtube_music_topic_suffix_stripped() {
          let (title, artist) = normalize_browser_track("Some Song", "Artist - Topic");
          assert_eq!(title, "Some Song");
          assert_eq!(artist, "Artist");
      }
  
      #[test]
      fn normalize_splits_title_when_topic_channel() {
          let (title, artist) = normalize_browser_track("Real Artist - Song Name", "Real Artist - Topic");
          assert_eq!(title, "Song Name");
          assert_eq!(artist, "Real Artist");
      }
  
      #[test]
      fn normalize_vevo_suffix_stripped() {
          let (title, artist) = normalize_browser_track("Artist - Song", "ArtistVEVO");
          assert_eq!(title, "Song");
          assert_eq!(artist, "Artist");
      }
  
      #[test]
      fn normalize_clean_title_and_artist_unchanged() {
          let (title, artist) = normalize_browser_track("Clean Title", "Regular Artist");
          assert_eq!(title, "Clean Title");
          assert_eq!(artist, "Regular Artist");
      }
  
      #[test]
      fn normalize_empty_artist_returns_title_as_is() {
          let (title, artist) = normalize_browser_track("Just A Title", "");
          assert_eq!(title, "Just A Title");
          assert_eq!(artist, "");
      }
  
      #[test]
      fn normalize_no_dash_in_title_returns_full_title() {
          let (title, artist) = normalize_browser_track("NoDashTitle", "Artist - Topic");
          assert_eq!(title, "NoDashTitle");
          assert_eq!(artist, "Artist");
      }
  
      #[test]
      fn strip_noise_official_video() {
          assert_eq!(strip_title_noise("My Song (Official Video)"), "My Song");
      }
  
      #[test]
      fn strip_noise_lyrics_parenthetical() {
          assert_eq!(strip_title_noise("My Song (Lyrics)"), "My Song");
      }
  
      #[test]
      fn strip_noise_remastered_with_year() {
          assert_eq!(strip_title_noise("Classic Track (Remastered 2011)"), "Classic Track");
      }
  
      #[test]
      fn strip_noise_official_audio() {
          assert_eq!(strip_title_noise("Song Title (Official Audio)"), "Song Title");
      }
  
      #[test]
      fn strip_noise_clean_title_unchanged() {
          assert_eq!(strip_title_noise("Normal Title"), "Normal Title");
      }
  
      #[test]
      fn strip_noise_bracket_noise_removed() {
          assert_eq!(strip_title_noise("Song [Official Video]"), "Song");
      }
  
      #[test]
      fn detect_mime_jpeg_magic_bytes() {
          let jpeg = b"\xff\xd8\xff\xe0some jpeg data";
          assert_eq!(detect_mime(jpeg), Some("image/jpeg"));
      }
  
      #[test]
      fn detect_mime_png_magic_bytes() {
          let png = b"\x89PNG\r\nsome png data";
          assert_eq!(detect_mime(png), Some("image/png"));
      }
  
      #[test]
      fn detect_mime_unknown_bytes_returns_none() {
          let unknown = b"\x00\x01\x02\x03";
          assert_eq!(detect_mime(unknown), None);
      }
  
      #[test]
      fn detect_mime_empty_slice_returns_none() {
          assert_eq!(detect_mime(&[]), None);
      }
  }
  ```

- [ ] **Step 2: Add module to lib.rs**

  Append to `app/src-tauri/party-display-core/src/lib.rs`:
  ```rust
  pub mod smtc;
  ```

- [ ] **Step 3: Run core tests — verify 16 new pass (27 total)**

  ```
  cargo test -p party-display-core
  ```
  Expected: 27 tests pass.

- [ ] **Step 4: Update binary smtc.rs to import pure functions from core**

  At the top of `app/src-tauri/src/smtc.rs`, replace:
  ```rust
  use base64::{Engine as _, engine::general_purpose};
  ```
  with:
  ```rust
  use base64::{Engine as _, engine::general_purpose};
  use party_display_core::smtc::{normalize_browser_track, detect_mime};
  ```

  Then delete these functions from `app/src-tauri/src/smtc.rs` (they now come from core):
  - `is_channel_artist`
  - `strip_title_noise`
  - `normalize_browser_track`
  - `detect_mime`
  - The entire `#[cfg(test)]` block

- [ ] **Step 5: Verify binary compiles**

  ```
  cargo build
  ```
  Expected: compiles. `try_poll_smtc` calls `normalize_browser_track` from core; `get_thumbnail` calls `detect_mime` from core.

- [ ] **Step 6: Commit**
  ```
  git add app/src-tauri/party-display-core/src/smtc.rs app/src-tauri/party-display-core/src/lib.rs app/src-tauri/src/smtc.rs
  git commit -m "refactor: migrate smtc pure functions to party-display-core"
  ```

---

## Task 5: Migrate pure dlna parsing to core

Pure: structs + `xml_escape`, `parse_duration`, `parse_didl_lite` + 6 tests. Binary keeps `dlna_discover` and `dlna_browse` Tauri commands (use rupnp).

**Files:**
- Create: `app/src-tauri/party-display-core/src/dlna.rs`
- Modify: `app/src-tauri/party-display-core/src/lib.rs`
- Modify: `app/src-tauri/src/dlna.rs`

- [ ] **Step 1: Create core dlna.rs with structs, parsing, and 6 tests**

  Create `app/src-tauri/party-display-core/src/dlna.rs`:
  ```rust
  use serde::Serialize;
  
  #[derive(Serialize, Clone, Debug)]
  pub struct DlnaServer {
      pub name:     String,
      pub location: String,
  }
  
  #[derive(Serialize, Clone, Debug)]
  pub struct DlnaContainer {
      pub id:    String,
      pub title: String,
  }
  
  #[derive(Serialize, Clone, Debug)]
  pub struct DlnaItem {
      pub id:          String,
      pub title:       String,
      pub artist:      Option<String>,
      pub album_art:   Option<String>,
      pub url:         String,
      pub mime:        String,
      pub duration_ms: Option<u64>,
  }
  
  #[derive(Serialize, Clone, Debug)]
  pub struct DlnaBrowseResult {
      pub containers: Vec<DlnaContainer>,
      pub items:      Vec<DlnaItem>,
  }
  
  pub fn xml_escape(s: &str) -> String {
      s.replace('&', "&amp;")
       .replace('<', "&lt;")
       .replace('>', "&gt;")
       .replace('"', "&quot;")
       .replace('\'', "&apos;")
  }
  
  pub fn parse_duration(s: &str) -> Option<u64> {
      let parts: Vec<&str> = s.splitn(3, ':').collect();
      if parts.len() < 3 { return None; }
      let h: u64  = parts[0].parse().ok()?;
      let m: u64  = parts[1].parse().ok()?;
      let sec_parts: Vec<&str> = parts[2].splitn(2, '.').collect();
      let s: u64  = sec_parts[0].parse().ok()?;
      if m > 59 || s > 59 { return None; }
      let ms: u64 = if sec_parts.len() > 1 {
          let frac = sec_parts[1];
          let trimmed: String = frac.chars().take(3).collect();
          format!("{:0<3}", trimmed).parse().unwrap_or(0)
      } else { 0 };
      Some((h * 3_600 + m * 60 + s) * 1_000 + ms)
  }
  
  pub fn parse_didl_lite(xml: &str) -> DlnaBrowseResult {
      let doc = match roxmltree::Document::parse(xml) {
          Ok(d)  => d,
          Err(e) => {
              eprintln!("[dlna] DIDL-Lite parse error: {e}");
              return DlnaBrowseResult { containers: vec![], items: vec![] };
          }
      };
      let mut containers = Vec::new();
      let mut items      = Vec::new();
      for node in doc.root().descendants() {
          if !node.is_element() { continue; }
          match node.tag_name().name() {
              "container" => {
                  let id    = node.attribute("id").unwrap_or("").to_owned();
                  let title = node.descendants()
                      .find(|n| n.tag_name().name() == "title")
                      .and_then(|n| n.text())
                      .unwrap_or("").to_owned();
                  containers.push(DlnaContainer { id, title });
              }
              "item" => {
                  let id    = node.attribute("id").unwrap_or("").to_owned();
                  let title = node.descendants()
                      .find(|n| n.tag_name().name() == "title")
                      .and_then(|n| n.text())
                      .unwrap_or("").to_owned();
                  let artist = node.descendants()
                      .find(|n| matches!(n.tag_name().name(), "creator" | "artist"))
                      .and_then(|n| n.text()).map(str::to_owned);
                  let album_art = node.descendants()
                      .find(|n| n.tag_name().name() == "albumArtURI")
                      .and_then(|n| n.text()).map(str::to_owned);
                  let res_node = node.descendants()
                      .find(|n| n.tag_name().name() == "res");
                  let url = res_node.and_then(|n| n.text()).unwrap_or("").trim().to_owned();
                  let mime = res_node
                      .and_then(|n| n.attribute("protocolInfo"))
                      .and_then(|p| p.split(':').nth(2))
                      .unwrap_or("").to_owned();
                  if url.is_empty() { continue; }
                  let duration_ms = res_node
                      .and_then(|n| n.attribute("duration"))
                      .and_then(parse_duration);
                  items.push(DlnaItem { id, title, artist, album_art, url, mime, duration_ms });
              }
              _ => {}
          }
      }
      DlnaBrowseResult { containers, items }
  }
  
  #[cfg(test)]
  mod tests {
      use super::*;
  
      const SAMPLE_DIDL: &str = r#"<?xml version="1.0"?>
  <DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL/"
             xmlns:dc="http://purl.org/dc/elements/1.1/"
             xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">
    <container id="10" parentID="0">
      <dc:title>Music</dc:title>
    </container>
    <item id="20" parentID="0">
      <dc:title>Test Track</dc:title>
      <dc:creator>Test Artist</dc:creator>
      <upnp:albumArtURI>http://server/art.jpg</upnp:albumArtURI>
      <res protocolInfo="http-get:*:audio/mpeg:*" duration="0:03:45.000">http://server/track.mp3</res>
    </item>
    <item id="21" parentID="0">
      <dc:title>Photo.jpg</dc:title>
      <res protocolInfo="http-get:*:image/jpeg:*">http://server/photo.jpg</res>
    </item>
  </DIDL-Lite>"#;
  
      #[test]
      fn test_parse_containers() {
          let result = parse_didl_lite(SAMPLE_DIDL);
          assert_eq!(result.containers.len(), 1);
          assert_eq!(result.containers[0].id, "10");
          assert_eq!(result.containers[0].title, "Music");
      }
  
      #[test]
      fn test_parse_items() {
          let result = parse_didl_lite(SAMPLE_DIDL);
          assert_eq!(result.items.len(), 2);
          let audio = &result.items[0];
          assert_eq!(audio.id, "20");
          assert_eq!(audio.title, "Test Track");
          assert_eq!(audio.artist.as_deref(), Some("Test Artist"));
          assert_eq!(audio.album_art.as_deref(), Some("http://server/art.jpg"));
          assert_eq!(audio.url, "http://server/track.mp3");
          assert_eq!(audio.mime, "audio/mpeg");
          assert_eq!(audio.duration_ms, Some(225_000));
      }
  
      #[test]
      fn test_parse_duration() {
          assert_eq!(parse_duration("0:03:45.000"), Some(225_000));
          assert_eq!(parse_duration("1:00:00.000"), Some(3_600_000));
          assert_eq!(parse_duration("0:00:01.500"), Some(1_500));
          assert_eq!(parse_duration("bad"),          None);
      }
  
      #[test]
      fn test_parse_duration_rejects_out_of_range() {
          assert_eq!(parse_duration("0:99:99.000"), None);
          assert_eq!(parse_duration("0:00:60.000"), None);
      }
  
      #[test]
      fn test_parse_empty_xml() {
          let result = parse_didl_lite(
              r#"<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL/"></DIDL-Lite>"#
          );
          assert_eq!(result.containers.len(), 0);
          assert_eq!(result.items.len(), 0);
      }
  
      #[test]
      fn test_parse_malformed_xml_returns_empty() {
          let result = parse_didl_lite("not xml at all");
          assert_eq!(result.containers.len(), 0);
          assert_eq!(result.items.len(), 0);
      }
  }
  ```

- [ ] **Step 2: Add module to lib.rs**

  Append to `app/src-tauri/party-display-core/src/lib.rs`:
  ```rust
  pub mod dlna;
  ```

- [ ] **Step 3: Run core tests — verify 6 new pass (33 total)**

  ```
  cargo test -p party-display-core
  ```
  Expected: 33 tests pass.

- [ ] **Step 4: Update binary dlna.rs — remove duplicated code, import from core**

  Replace full content of `app/src-tauri/src/dlna.rs`:
  ```rust
  pub use party_display_core::dlna::{
      DlnaServer, DlnaContainer, DlnaItem, DlnaBrowseResult, parse_didl_lite, xml_escape,
  };
  use party_display_core::dlna::xml_escape;
  
  #[tauri::command]
  pub async fn dlna_discover() -> Vec<DlnaServer> {
      use futures::TryStreamExt;
      let search_target = match "urn:schemas-upnp-org:device:MediaServer:1"
          .parse::<rupnp::ssdp::SearchTarget>()
      {
          Ok(st) => st,
          Err(e) => { eprintln!("[dlna] bad search target: {e}"); return vec![]; }
      };
      let mut servers = Vec::new();
      match rupnp::discover(&search_target, std::time::Duration::from_secs(3)).await {
          Ok(stream) => {
              futures::pin_mut!(stream);
              loop {
                  match stream.try_next().await {
                      Ok(Some(device)) => servers.push(DlnaServer {
                          name:     device.friendly_name().to_owned(),
                          location: device.url().to_string(),
                      }),
                      Ok(None) | Err(_) => break,
                  }
              }
          }
          Err(e) => eprintln!("[dlna] discovery error: {e}"),
      }
      servers
  }
  
  #[tauri::command]
  pub async fn dlna_browse(location: String, container_id: String) -> Result<DlnaBrowseResult, String> {
      use tokio::time::{timeout, Duration};
      let safe_id = xml_escape(&container_id);
      timeout(Duration::from_secs(10), async move {
          let url = location.parse::<rupnp::http::Uri>()
              .map_err(|e| format!("Invalid location URL: {e}"))?;
          let device = rupnp::Device::from_url(url).await
              .map_err(|e| format!("Could not reach device: {e}"))?;
          let urn = "urn:schemas-upnp-org:service:ContentDirectory:1"
              .parse::<rupnp::ssdp::URN>()
              .map_err(|e| format!("Bad URN: {e}"))?;
          let service = device.find_service(&urn)
              .ok_or_else(|| "ContentDirectory service not found on device".to_string())?;
          let payload = format!(
              "<ObjectID>{safe_id}</ObjectID>\
               <BrowseFlag>BrowseDirectChildren</BrowseFlag>\
               <Filter>*</Filter>\
               <StartingIndex>0</StartingIndex>\
               <RequestedCount>0</RequestedCount>\
               <SortCriteria></SortCriteria>"
          );
          let response = service.action(device.url(), "Browse", &payload).await
              .map_err(|e| format!("Browse action failed: {e}"))?;
          let didl = response.get("Result").map(String::as_str)
              .ok_or_else(|| "No Result field in Browse response".to_string())?;
          Ok::<DlnaBrowseResult, String>(parse_didl_lite(didl))
      })
      .await
      .map_err(|_| "Browse timed out after 10s".to_string())?
  }
  ```

  > Note: The `pub use` for `xml_escape` and the `use` import both exist — remove the duplicate. The file should have `use party_display_core::dlna::xml_escape;` (not pub use) since `xml_escape` is only used internally. Clean up to:
  ```rust
  use party_display_core::dlna::{
      DlnaServer, DlnaBrowseResult, parse_didl_lite, xml_escape,
  };
  pub use party_display_core::dlna::{DlnaContainer, DlnaItem};
  ```
  (Keep `DlnaContainer` and `DlnaItem` as pub use since main.rs may reference them through `dlna::`)

- [ ] **Step 5: Verify binary compiles**

  ```
  cargo build
  ```
  Expected: compiles.

- [ ] **Step 6: Commit**
  ```
  git add app/src-tauri/party-display-core/src/dlna.rs app/src-tauri/party-display-core/src/lib.rs app/src-tauri/src/dlna.rs
  git commit -m "refactor: migrate dlna pure parsing to party-display-core"
  ```

---

## Task 6: Migrate local_audio to core

All logic + 5 tests move to core. Binary becomes a one-line Tauri command wrapper.

**Files:**
- Create: `app/src-tauri/party-display-core/src/local_audio.rs`
- Modify: `app/src-tauri/party-display-core/src/lib.rs`
- Modify: `app/src-tauri/src/local_audio.rs`

- [ ] **Step 1: Create core local_audio.rs**

  Create `app/src-tauri/party-display-core/src/local_audio.rs` with content identical to the current `app/src-tauri/src/local_audio.rs` **except** remove the `#[tauri::command]` attribute from `scan_audio_folder`.

  The only change: remove `#[tauri::command]` line above `pub fn scan_audio_folder`.

- [ ] **Step 2: Add module to lib.rs**

  Append to `app/src-tauri/party-display-core/src/lib.rs`:
  ```rust
  pub mod local_audio;
  ```

- [ ] **Step 3: Run core tests — verify 5 new pass (38 total)**

  ```
  cargo test -p party-display-core
  ```
  Expected: 38 tests pass.

- [ ] **Step 4: Replace binary local_audio.rs with thin Tauri wrapper**

  Replace full content of `app/src-tauri/src/local_audio.rs`:
  ```rust
  use party_display_core::local_audio::scan_audio_folder as scan_impl;
  
  #[tauri::command]
  pub fn scan_audio_folder(path: String, recursive: bool) -> Result<Vec<String>, String> {
      scan_impl(path, recursive)
  }
  ```

- [ ] **Step 5: Verify binary compiles**

  ```
  cargo build
  ```
  Expected: compiles.

- [ ] **Step 6: Commit**
  ```
  git add app/src-tauri/party-display-core/src/local_audio.rs app/src-tauri/party-display-core/src/lib.rs app/src-tauri/src/local_audio.rs
  git commit -m "refactor: migrate local_audio to party-display-core"
  ```

---

## Task 7: Migrate presets to core

`PresetFile` + `collect_presets_from_dir` + 4 tests move to core. Binary keeps `presets_dir()` path resolution and thin Tauri wrapper.

**Files:**
- Create: `app/src-tauri/party-display-core/src/presets.rs`
- Modify: `app/src-tauri/party-display-core/src/lib.rs`
- Modify: `app/src-tauri/src/presets.rs`

- [ ] **Step 1: Create core presets.rs**

  Create `app/src-tauri/party-display-core/src/presets.rs`:
  ```rust
  #[derive(serde::Serialize)]
  pub struct PresetFile {
      pub name:    String,
      pub content: String,
  }
  
  pub fn collect_presets_from_dir(dir: &std::path::Path) -> Vec<PresetFile> {
      let Ok(entries) = std::fs::read_dir(dir) else { return vec![]; };
      let mut presets: Vec<PresetFile> = entries
          .filter_map(|e| e.ok())
          .filter(|e| {
              e.path().extension()
                  .and_then(|s| s.to_str())
                  .map(|s| s.eq_ignore_ascii_case("json"))
                  .unwrap_or(false)
          })
          .filter_map(|e| {
              let path = e.path();
              let name = path.file_stem()
                  .and_then(|s| s.to_str()).unwrap_or("").to_string();
              let content = std::fs::read_to_string(&path).ok()?;
              Some(PresetFile { name, content })
          })
          .collect();
      presets.sort_by(|a, b| a.name.cmp(&b.name));
      presets
  }
  
  #[cfg(test)]
  mod tests {
      use super::*;
      use std::fs;
  
      #[test]
      fn collect_only_json_files() {
          let dir = std::env::temp_dir().join("party_display_presets_test");
          fs::create_dir_all(&dir).unwrap();
          fs::write(dir.join("alpha.json"), r#"{"name":"alpha"}"#).unwrap();
          fs::write(dir.join("beta.json"),  r#"{"name":"beta"}"#).unwrap();
          fs::write(dir.join("ignore.txt"), "not a preset").unwrap();
          fs::write(dir.join("ignore.milk"), "not a preset").unwrap();
          let result = collect_presets_from_dir(&dir);
          assert_eq!(result.len(), 2);
          assert_eq!(result[0].name, "alpha");
          assert_eq!(result[1].name, "beta");
          for f in ["alpha.json", "beta.json", "ignore.txt", "ignore.milk"] {
              let _ = fs::remove_file(dir.join(f));
          }
      }
  
      #[test]
      fn collect_returns_sorted_by_name() {
          let dir = std::env::temp_dir().join("party_display_presets_sort_test");
          fs::create_dir_all(&dir).unwrap();
          for name in ["zebra", "apple", "mango"] {
              fs::write(dir.join(format!("{name}.json")), "{}").unwrap();
          }
          let result = collect_presets_from_dir(&dir);
          let names: Vec<&str> = result.iter().map(|p| p.name.as_str()).collect();
          assert_eq!(names, ["apple", "mango", "zebra"]);
          for name in ["zebra", "apple", "mango"] {
              let _ = fs::remove_file(dir.join(format!("{name}.json")));
          }
      }
  
      #[test]
      fn collect_returns_empty_for_nonexistent_dir() {
          let result = collect_presets_from_dir(std::path::Path::new("/nonexistent/path/xyz"));
          assert!(result.is_empty());
      }
  
      #[test]
      fn collect_reads_file_content() {
          let dir = std::env::temp_dir().join("party_display_presets_content_test");
          fs::create_dir_all(&dir).unwrap();
          fs::write(dir.join("test.json"), r#"{"key":"value"}"#).unwrap();
          let result = collect_presets_from_dir(&dir);
          assert_eq!(result.len(), 1);
          assert_eq!(result[0].content, r#"{"key":"value"}"#);
          let _ = fs::remove_file(dir.join("test.json"));
      }
  }
  ```

- [ ] **Step 2: Add module to lib.rs**

  Append to `app/src-tauri/party-display-core/src/lib.rs`:
  ```rust
  pub mod presets;
  ```

- [ ] **Step 3: Run core tests — verify 4 new pass (42 total)**

  ```
  cargo test -p party-display-core
  ```
  Expected: 42 tests pass.

- [ ] **Step 4: Replace binary presets.rs**

  Replace full content of `app/src-tauri/src/presets.rs`:
  ```rust
  use std::path::PathBuf;
  pub use party_display_core::presets::{PresetFile, collect_presets_from_dir};
  
  fn presets_dir() -> PathBuf {
      if let Ok(exe) = std::env::current_exe() {
          let candidate = exe
              .parent()
              .unwrap_or(std::path::Path::new("."))
              .join("presets");
          if candidate.exists() {
              return candidate;
          }
      }
      PathBuf::from(env!("CARGO_MANIFEST_DIR"))
          .join("..")
          .join("..")
          .join("presets")
  }
  
  #[tauri::command]
  pub fn get_presets() -> Vec<PresetFile> {
      let dir = presets_dir();
      if !dir.exists() {
          eprintln!("presets dir not found: {}", dir.display());
          return vec![];
      }
      collect_presets_from_dir(&dir)
  }
  ```

- [ ] **Step 5: Verify binary compiles**

  ```
  cargo build
  ```
  Expected: compiles.

- [ ] **Step 6: Commit**
  ```
  git add app/src-tauri/party-display-core/src/presets.rs app/src-tauri/party-display-core/src/lib.rs app/src-tauri/src/presets.rs
  git commit -m "refactor: migrate presets to party-display-core"
  ```

---

## Task 8: Migrate slideshow pure functions to core

`collect_photos` + `collect_photos_inner` + `PHOTO_EXTENSIONS` + 5 tests → core. Binary keeps `SlideshowState`, `PhotoListPayload`, `watch_folder`, `get_photos`.

**Files:**
- Create: `app/src-tauri/party-display-core/src/slideshow.rs`
- Modify: `app/src-tauri/party-display-core/src/lib.rs`
- Modify: `app/src-tauri/src/slideshow.rs`

- [ ] **Step 1: Create core slideshow.rs**

  Create `app/src-tauri/party-display-core/src/slideshow.rs`:
  ```rust
  use std::path::PathBuf;
  
  pub static PHOTO_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp"];
  
  pub fn collect_photos(folder: &std::path::Path, recursive: bool) -> Vec<PathBuf> {
      let mut photos = Vec::new();
      collect_photos_inner(folder, recursive, &mut photos);
      photos.sort();
      photos
  }
  
  fn collect_photos_inner(folder: &std::path::Path, recursive: bool, out: &mut Vec<PathBuf>) {
      let Ok(entries) = std::fs::read_dir(folder) else { return };
      for entry in entries.flatten() {
          let path = entry.path();
          if path.is_dir() && recursive {
              collect_photos_inner(&path, recursive, out);
          } else if path.is_file()
              && path.extension()
                  .and_then(|e| e.to_str())
                  .map(|e| PHOTO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
                  .unwrap_or(false)
          {
              out.push(path);
          }
      }
  }
  
  #[cfg(test)]
  mod tests {
      use super::*;
      use std::fs;
  
      #[test]
      fn collect_photos_filters_extensions() {
          let dir = std::env::temp_dir().join("party_display_test_flat");
          fs::create_dir_all(&dir).unwrap();
          let keep = ["a.jpg", "b.jpeg", "c.png", "d.webp"];
          let skip = ["e.txt", "f.mp4", "g.pdf"];
          for name in keep.iter().chain(skip.iter()) {
              fs::write(dir.join(name), b"").unwrap();
          }
          let result = collect_photos(&dir, false);
          let names: Vec<&str> = result.iter()
              .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
          for k in &keep { assert!(names.contains(k), "expected {k}"); }
          for s in &skip { assert!(!names.contains(s), "did not expect {s}"); }
          for name in keep.iter().chain(skip.iter()) {
              let _ = fs::remove_file(dir.join(name));
          }
      }
  
      #[test]
      fn collect_photos_recursive_finds_nested() {
          let root = std::env::temp_dir().join("party_display_test_recursive");
          let sub  = root.join("sub");
          fs::create_dir_all(&sub).unwrap();
          fs::write(root.join("top.jpg"), b"").unwrap();
          fs::write(sub.join("nested.png"), b"").unwrap();
          fs::write(sub.join("skip.txt"), b"").unwrap();
          let flat      = collect_photos(&root, false);
          let recursive = collect_photos(&root, true);
          let flat_names: Vec<&str> = flat.iter()
              .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
          let rec_names: Vec<&str> = recursive.iter()
              .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
          assert!(flat_names.contains(&"top.jpg"));
          assert!(!flat_names.contains(&"nested.png"));
          assert!(rec_names.contains(&"top.jpg"));
          assert!(rec_names.contains(&"nested.png"));
          assert!(!rec_names.contains(&"skip.txt"));
          let _ = fs::remove_file(root.join("top.jpg"));
          let _ = fs::remove_file(sub.join("nested.png"));
          let _ = fs::remove_file(sub.join("skip.txt"));
          let _ = fs::remove_dir(&sub);
          let _ = fs::remove_dir(&root);
      }
  
      #[test]
      fn collect_photos_case_insensitive_extensions() {
          let dir = std::env::temp_dir().join("party_display_test_case");
          fs::create_dir_all(&dir).unwrap();
          let files = ["upper.JPG", "mixed.Png", "lower.webp"];
          for name in &files { fs::write(dir.join(name), b"").unwrap(); }
          let result = collect_photos(&dir, false);
          let names: Vec<&str> = result.iter()
              .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
          for f in &files { assert!(names.contains(f), "expected {f}"); }
          for name in &files { let _ = fs::remove_file(dir.join(name)); }
      }
  
      #[test]
      fn collect_photos_recursive_includes_subdirectory() {
          let dir    = std::env::temp_dir().join("party_display_test_recursive2");
          let subdir = dir.join("sub");
          fs::create_dir_all(&subdir).unwrap();
          fs::write(dir.join("top.jpg"), b"").unwrap();
          fs::write(subdir.join("deep.jpg"), b"").unwrap();
          let flat      = collect_photos(&dir, false);
          let recursive = collect_photos(&dir, true);
          let flat_names: Vec<&str> = flat.iter()
              .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
          let rec_names: Vec<&str> = recursive.iter()
              .map(|p| p.file_name().unwrap().to_str().unwrap()).collect();
          assert!(flat_names.contains(&"top.jpg"));
          assert!(!flat_names.contains(&"deep.jpg"));
          assert!(rec_names.contains(&"top.jpg"));
          assert!(rec_names.contains(&"deep.jpg"));
          let _ = fs::remove_file(dir.join("top.jpg"));
          let _ = fs::remove_file(subdir.join("deep.jpg"));
          let _ = fs::remove_dir(subdir);
      }
  
      #[test]
      fn collect_photos_empty_dir_returns_empty() {
          let dir = std::env::temp_dir().join("party_display_test_empty");
          fs::create_dir_all(&dir).unwrap();
          let result = collect_photos(&dir, false);
          assert!(result.is_empty());
      }
  }
  ```

- [ ] **Step 2: Add module to lib.rs**

  Append to `app/src-tauri/party-display-core/src/lib.rs`:
  ```rust
  pub mod slideshow;
  ```

- [ ] **Step 3: Run core tests — verify 5 new pass (47 total)**

  ```
  cargo test -p party-display-core
  ```
  Expected: 47 tests pass.

- [ ] **Step 4: Update binary slideshow.rs — import collect_photos from core, remove duplication**

  In `app/src-tauri/src/slideshow.rs`:
  - Remove the `PHOTO_EXTENSIONS` static, `collect_photos` fn, `collect_photos_inner` fn, and `#[cfg(test)]` block
  - Add at the top:
    ```rust
    use party_display_core::slideshow::collect_photos;
    ```
  - Keep everything else unchanged: `SlideshowState`, `PhotoListPayload`, `watch_folder`, `get_photos`
  - The `watch_folder` body calls `collect_photos` — it now resolves to the core import

- [ ] **Step 5: Verify binary compiles**

  ```
  cargo build
  ```
  Expected: compiles.

- [ ] **Step 6: Commit**
  ```
  git add app/src-tauri/party-display-core/src/slideshow.rs app/src-tauri/party-display-core/src/lib.rs app/src-tauri/src/slideshow.rs
  git commit -m "refactor: migrate slideshow pure functions to party-display-core"
  ```

---

## Task 9: Verify final test count and run full benchmark

- [ ] **Step 1: Run all core tests**

  From `app/src-tauri/`:
  ```
  cargo test -p party-display-core
  ```
  Expected: **47 tests pass** (5 dlna_proxy + 6 system + 16 smtc + 6 dlna + 5 local_audio + 4 presets + 5 slideshow).

- [ ] **Step 2: Time the core test run**

  ```
  Measure-Command { cargo test -p party-display-core }
  ```
  Expected: under 60 seconds (likely under 30s after first compile with warm cache).

- [ ] **Step 3: Verify full workspace still compiles and binary tests pass**

  ```
  cargo test
  ```
  Expected: all tests pass including the `auth::tests::token_round_trip` integration test in the binary.

- [ ] **Step 4: Commit if any fixups were needed**
  ```
  git add -A
  git commit -m "test: verify 47 core tests pass, full workspace builds"
  ```

---

## Task 10: Update CI — nextest + sccache

**Files:**
- Modify: `.github/workflows/test.yml`

- [ ] **Step 1: Update the Rust job in test.yml**

  Replace the `rust:` job with:
  ```yaml
  rust:
    name: Rust (cargo nextest)
    runs-on: windows-latest
    defaults:
      run:
        working-directory: app/src-tauri
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: mozilla-actions/sccache-action@v0.0.5
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: app/src-tauri
      - uses: taiki-e/install-action@nextest
      - name: Run core tests
        run: cargo nextest run -p party-display-core
        env:
          SCCACHE_GHA_ENABLED: "true"
          RUSTC_WRAPPER: sccache
  ```

- [ ] **Step 2: Commit and push to dev**

  ```
  git add .github/workflows/test.yml
  git commit -m "ci: use nextest and sccache for rust tests, target party-display-core"
  git push origin dev
  ```

- [ ] **Step 3: Watch the CI run pass**

  Open the Actions tab on GitHub and confirm the Rust job completes in under 2 minutes on a warm cache run.

---

## Notes

- `auth.rs` intentionally not migrated. Its single test (`token_round_trip`) is an integration test that writes to the OS keyring — not unit-testable in core.
- `audio.rs`, `media_keys.rs`, `window_manager.rs`, `remote_server.rs` intentionally not migrated — all are genuine Tauri command modules with no unit tests.
- After workspace creation, `CARGO_MANIFEST_DIR` in `presets_dir()` still points to `app/src-tauri/` (the workspace root package), so the `../../presets` relative path is unchanged.
