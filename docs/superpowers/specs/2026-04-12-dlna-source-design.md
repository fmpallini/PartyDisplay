# DLNA/UPnP Source — Design Spec

**Date:** 2026-04-12
**Status:** Approved

## Summary

Add DLNA/UPnP as a third media source for both audio playback and photo slideshow. Party Display acts as a UPnP control point: it discovers MediaServer devices on the local network, lets the user browse their content directory tree, and streams audio/photo URLs into the existing player and slideshow pipelines. DLNA is an optional, independent source — the app works normally when no server is present.

---

## Scope

- **In scope:** DLNA/UPnP ContentDirectory browsing (control point role), audio and photo sources, tree navigation UI, persistence of last-used server + container.
- **Out of scope:** DLNA renderer role (receiving pushes), Matter, Chromecast/AirPlay, authenticated servers (Plex/Jellyfin tokens), pagination of large libraries (deferred to a future version).

---

## Architecture

### Rust backend — `dlna.rs`

New module following the same pattern as `local_audio.rs`. Registered in `main.rs` alongside existing modules.

**Dependencies added to `Cargo.toml`:**
- `rupnp` — SSDP discovery + UPnP service action invocation
- `roxmltree` — lightweight DIDL-Lite XML parsing

**Tauri commands:**

#### `dlna_discover() → Vec<DlnaServer>`

Runs an SSDP M-SEARCH for `urn:schemas-upnp-org:device:MediaServer:1` with a 3-second timeout. Fetches each discovered device's description XML to extract the friendly name and ContentDirectory service control URL. Returns an empty list (not an error) if no servers are found.

```rust
#[derive(Serialize)]
pub struct DlnaServer {
    pub name:     String,   // UPnP friendlyName
    pub location: String,   // device description URL — used as stable ID
}
```

#### `dlna_browse(location: String, container_id: String) → Result<DlnaBrowseResult, String>`

Posts a UPnP SOAP `Browse(BrowseDirectChildren, Filter="*", RequestedCount=0)` action to the ContentDirectory service at `location`. Parses the DIDL-Lite XML result with `roxmltree`. Returns subfolders (containers) and playable items separately. Root container ID is `"0"` per the DLNA spec.

```rust
#[derive(Serialize)]
pub struct DlnaBrowseResult {
    pub containers: Vec<DlnaContainer>,
    pub items:      Vec<DlnaItem>,
}

#[derive(Serialize)]
pub struct DlnaContainer {
    pub id:    String,
    pub title: String,
}

#[derive(Serialize)]
pub struct DlnaItem {
    pub id:          String,
    pub title:       String,
    pub artist:      Option<String>,
    pub album_art:   Option<String>,   // URL string
    pub url:         String,           // HTTP media URL (res element)
    pub mime:        String,           // e.g. "audio/mpeg", "image/jpeg"
    pub duration_ms: Option<u64>,
}
```

Rust returns all items regardless of MIME type. MIME filtering to audio or image happens in the frontend hook.

---

### Frontend — `useDlnaBrowser` hook

**File:** `app/src/hooks/useDlnaBrowser.ts`

Generic hook, used independently for music and photos. Carries no audio/photo-specific logic.

```typescript
export function useDlnaBrowser(storageKey: string): {
  servers:     DlnaServer[]
  discovering: boolean
  discover:    () => void
  server:      DlnaServer | null
  breadcrumb:  DlnaContainer[]      // navigation stack
  containers:  DlnaContainer[]      // subfolders in current view
  items:       DlnaItem[]           // all items in current view (unfiltered)
  loading:     boolean
  error:       string | null
  selectServer:(server: DlnaServer) => void
  browse:      (container: DlnaContainer) => void
  back:        () => void
  reset:       () => void
}
```

**Navigation model:** `breadcrumb` is a stack of containers navigated so far. `browse()` pushes a container and calls `dlna_browse`. `back()` pops the top and re-browses the parent (or root if the stack becomes empty). `selectServer()` sets the active server and browses the root (`id = "0"`).

**Persistence:** On state changes the hook serializes `{ location, name, breadcrumb }` to `localStorage[storageKey]`. On mount it reads this key and, if present, attempts to restore by calling `dlna_browse` on the last container directly — the user lands back where they left off. If the server is unreachable the hook silently falls back to the server picker (no error banner on restore failure).

---

## Music source integration

### New source pill

`ControlPanel.tsx` gains a **"DLNA"** pill alongside "Spotify" and "Local Files". The existing `pd_music_source` localStorage key gains a new value `"dlna"`.

### Browser UI (music card)

When DLNA is the active source, the music card body shows:
1. A "Discover" button → triggers `discover()`, shows spinner while running.
2. Server list (once discovered) — click to select.
3. Breadcrumb + folder/item list — navigate until audio items appear.
4. "No DLNA servers found" message + Retry button if discovery returns empty.

MIME filter applied: only items where `mime.startsWith('audio/')` are shown and used as the playlist.

### `useLocalPlayer` change

One-line guard in `loadIndex` to handle HTTP URLs from DLNA alongside local `asset://` paths:

```typescript
audioRef.current.src = path.startsWith('http') ? path : convertFileSrc(path)
```

### Metadata

`DlnaItem` carries pre-fetched metadata (title, artist, album art URL) from DIDL-Lite. To avoid redundant `music-metadata` fetching for DLNA items, `useLocalPlayer`'s playlist type is extended to accept an optional pre-fetched metadata object alongside each path. When present, the `loadedmetadata` handler skips the `fetch` + `parseBlob` call and uses the provided values directly.

### Active/inactive behaviour

The DLNA player instance receives `active = (source === 'dlna')`, identical to how Local Files works today. Switching away pauses playback.

---

## Photo source integration

### New photo source toggle

`SlideshowConfigPanel` gains a **"Local Folder" / "DLNA Server"** toggle. A new `pd_photo_source` localStorage key stores `"local"` (default) or `"dlna"`.

### Browser UI (slideshow config)

When DLNA is selected, the folder picker is replaced by the `useDlnaBrowser` UI (separate instance, `storageKey = "pd_dlna_photos"`). MIME filter: only `image/*` items are shown and emitted.

### Feeding the display window

When a DLNA container is selected, `ControlPanel` emits the item URLs via the existing `photo-list` IPC event — the same channel the file-system watcher uses. `usePhotoLibrary` in the display window receives them unchanged.

### `SlideshowView.tsx` change

One-line guard in the existing `convertFileSrc` call (line 20):

```typescript
const src = photo.startsWith('http') ? photo : convertFileSrc(photo)
```

No file watcher is involved for DLNA photos. The list is static (one browse result). Order (shuffle/alpha) and all transition settings apply unchanged.

---

## Persistence summary

| Key | Values | Scope |
|-----|--------|-------|
| `pd_music_source` | `"spotify"` \| `"local"` \| `"dlna"` | existing key, gains `"dlna"` |
| `pd_dlna_music` | `{ location, name, breadcrumb: [{id, title}] }` | new |
| `pd_photo_source` | `"local"` \| `"dlna"` | new, defaults to `"local"` |
| `pd_dlna_photos` | `{ location, name, breadcrumb: [{id, title}] }` | new |

---

## Error handling

| Scenario | Behaviour |
|----------|-----------|
| Discovery returns empty | "No DLNA servers found" message + Retry button |
| Server offline at startup (restore) | Silent fallback to server picker |
| `dlna_browse` returns error | Error banner in browser UI; existing playlist unchanged |
| Container has no items or subfolders | "Folder is empty" message |
| DLNA audio URL fails to load in HTML5 player | Existing `useLocalPlayer` error/skip logic handles it |

---

## Files changed

| File | Change |
|------|--------|
| `app/src-tauri/src/dlna.rs` | New — discovery + browse commands |
| `app/src-tauri/src/main.rs` | Register `dlna` module + commands |
| `app/src-tauri/Cargo.toml` | Add `rupnp`, `roxmltree` |
| `app/src/hooks/useDlnaBrowser.ts` | New — generic DLNA browser hook |
| `app/src/hooks/useLocalPlayer.ts` | Guard `convertFileSrc` for HTTP URLs; support pre-fetched metadata |
| `app/src/windows/control/ControlPanel.tsx` | DLNA music pill + browser UI; photo source toggle |
| `app/src/components/SlideshowConfigPanel.tsx` | Photo source toggle (local/DLNA) |
| `app/src/components/SlideshowView.tsx` | Guard `convertFileSrc` for HTTP URLs |
