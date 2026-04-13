# Music Playback — Always-Visible Controls Per Source

**Date:** 2026-04-12
**Status:** Approved

## Goal

Refactor the Music card in `ControlPanel` so that the playback controls (track name/artist/album art, transport buttons, volume slider, spectrum analyzer) are always visible and always reflect the active source's state — rather than being conditionally rendered inside each source branch.

Each source retains its own independent playback state. Switching sources pauses the outgoing player and resumes display of the incoming source's last known state.

---

## Layout

The Music card becomes two zones:

### Zone 1 — Source config (conditional per source)

- **Source picker pills** — Spotify | Local Files | DLNA — always shown at top.
- **Spotify:** Login button in card header when unauthenticated; "Waiting for Spotify device…" while not ready; nothing shown once ready (no persistent config).
- **Local Files:** Folder picker + alphabetical/shuffle order radio + subfolders checkbox.
- **DLNA:** Server discover button + folder browser (breadcrumb, containers, track count).

### Zone 2 — Playback (always rendered)

Separated from Zone 1 by a thin horizontal divider. Always rendered regardless of source or auth/ready state.

- **`NowPlaying`** — album art (48×48), track name, artists. When `player.track === null`, shows a dim `"No track"` placeholder.
- **`PlayerControls`** — prev/play/next transport buttons (always clickable); seek bar and time display only render when `track != null` (existing behavior).
- **Volume slider + `SpectrumCanvas`** — always rendered, driven by `player.volume` / `player.setVolume`.

---

## State Preservation

Three separate hook instances (`spotifyPlayer`, `localPlayer`, `dlnaPlayer`) each hold their own `PlayerState`. The active `player` variable is a pointer to whichever is selected (`source === 'spotify' ? spotifyPlayer : source === 'dlna' ? dlnaPlayer : localPlayer`). Switching sources changes the pointer; no state is saved/restored manually — it persists naturally in each hook's `useState`.

**Volume** is per-source: each hook owns its own `volume` field. The always-visible slider reads from and writes to the active source only.

---

## Pause on Source Switch

All transitions are already handled:

| Transition | Mechanism |
|---|---|
| Any → Local/DLNA | `useLocalPlayer` pauses when its `active` flag becomes `false` |
| Any → Spotify | Existing `useEffect([source])` in `ControlPanel` calls `spotifyPlayer.togglePlay()` if not paused |

No new pause logic required.

---

## Files Changed

### `app/src/components/NowPlaying.tsx`

- Remove Spotify-specific null message (`"open Spotify and select this device"`).
- Replace with a generic dim placeholder: `"No track"`.

### `app/src/windows/control/ControlPanel.tsx`

- Trim each source branch (`spotify` / `local` / `dlna`) to contain only its config UI. Remove `NowPlaying`, `PlayerControls`, and volume/spectrum rows from inside the branches.
- After the source-branch block, render the always-visible playback zone once using the existing `player` variable:
  ```tsx
  <NowPlaying track={player.track} paused={player.paused} />
  <PlayerControls
    track={player.track}
    paused={player.paused}
    positionMs={player.positionMs}
    togglePlay={player.togglePlay}
    nextTrack={player.nextTrack}
    prevTrack={player.prevTrack}
    seek={player.seek}
  />
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <input type="range" min={0} max={1} step={0.02}
      value={player.volume}
      onChange={e => player.setVolume(Number(e.target.value))}
      style={{ width: 100, accentColor: '#1db954', cursor: 'pointer', flexShrink: 0 }}
    />
    <span style={{ color: '#555', fontSize: 11, minWidth: 28 }}>
      {Math.round(player.volume * 100)}%
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <SpectrumCanvas bins={bins} height={22}
        renderStyle={displaySettings.spectrumStyle}
        theme={displaySettings.spectrumTheme}
      />
    </div>
  </div>
  ```
- Add a thin divider between Zone 1 and Zone 2 (e.g. `borderTop: '1px solid #1e1e1e'` on the playback zone wrapper).

No new files, hooks, types, or abstractions needed.

---

## Out of Scope

- Persisting per-source volume to localStorage across app restarts (not requested).
- Any changes to the display window, hotkeys, or IPC events.
- Refactoring `useLocalPlayer` or `useSpotifyPlayer`.
