# Music Playback — Always-Visible Controls Per Source

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Music card so that NowPlaying, PlayerControls, volume, and SpectrumCanvas are always visible and driven by the active source's player — rather than conditionally rendered inside each source branch.

**Architecture:** Each source branch is trimmed to config-only UI (auth/device status for Spotify, folder picker + options for Local, DLNA browser). After the source branches a single always-visible playback zone renders using the existing `player` variable (already the correct active player). State preservation and pause-on-switch are already handled correctly by the three independent hook instances and `useLocalPlayer`'s `active` flag.

**Tech Stack:** React 18, TypeScript, Tauri 2, Vite — `npm run tauri dev` from `app/` to run.

---

## Files Changed

- **Modify:** `app/src/components/NowPlaying.tsx` — generic null-track placeholder
- **Modify:** `app/src/windows/control/ControlPanel.tsx` — trim source branches; add always-visible playback zone

---

### Task 1: Genericise the NowPlaying null state

**Files:**
- Modify: `app/src/components/NowPlaying.tsx:6`

`NowPlaying` currently returns a Spotify-specific message when `track` is null. Change it to a generic dim placeholder so it reads cleanly when any source has no track loaded.

- [ ] **Step 1: Edit `NowPlaying.tsx`**

Replace line 6 in `app/src/components/NowPlaying.tsx`:

```tsx
// Before
if (!track) return <p style={{ color: '#666', fontSize: 13 }}>No track playing — open Spotify and select this device.</p>

// After
if (!track) return <p style={{ margin: 0, color: '#555', fontSize: 12 }}>No track</p>
```

Full file after edit:

```tsx
import type { TrackInfo } from '../lib/player-types'

interface Props { track: TrackInfo | null; paused: boolean }

export default function NowPlaying({ track, paused: _paused }: Props) {
  if (!track) return <p style={{ margin: 0, color: '#555', fontSize: 12 }}>No track</p>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}>
      {track.albumArt && (
        <img src={track.albumArt} alt="album art" width={48} height={48} style={{ borderRadius: 4 }} />
      )}
      <div>
        <p style={{ margin: 0, fontWeight: 'bold', color: '#eee', fontSize: 14 }}>
          {track.name}
        </p>
        <p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>{track.artists}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd app && git add src/components/NowPlaying.tsx && git commit -m "fix(nowplaying): generic no-track placeholder"
```

---

### Task 2: Restructure ControlPanel Music card

**Files:**
- Modify: `app/src/windows/control/ControlPanel.tsx:488-743`

Replace the entire source-branch block (lines 488–743) with:
1. Source branches containing config UI only (no playback controls inside).
2. A new always-visible playback zone after the branches.

- [ ] **Step 1: Replace the source-branch + playback block**

In `app/src/windows/control/ControlPanel.tsx`, find and replace the block that starts at:
```tsx
          {source === 'spotify' ? (
            /* ── Spotify ── */
```
and ends at:
```tsx
          )}
        </Card>

        {/* ── Slideshow card
```

Replace with the following (keep the `</Card>` and the Slideshow comment that follows — replace only up to and including the closing `)}` of the source ternary at line 743):

```tsx
          {source === 'spotify' ? (
            /* ── Spotify ── */
            !authenticated ? (
              <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
                Connect Spotify to get started.
              </p>
            ) : !spotifyPlayer.ready ? (
              <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
                Waiting for Spotify device…
              </p>
            ) : null
          ) : source === 'local' ? (
            /* ── Local Files ── */
            <>
              <FolderPicker
                folder={localFolder}
                photoCount={localPlaylist.length}
                onPick={setLocalFolder}
                itemLabel="track"
                dialogTitle="Select audio folder"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#aaa' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="radio" name="local-order" value="alpha"
                    checked={localOrder === 'alpha'}
                    onChange={() => setLocalOrder('alpha')}
                    style={{ accentColor: '#1db954' }}
                  /> Alphabetical
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="radio" name="local-order" value="shuffle"
                    checked={localOrder === 'shuffle'}
                    onChange={() => setLocalOrder('shuffle')}
                    style={{ accentColor: '#1db954' }}
                  /> Shuffle
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={localRecursive}
                    onChange={e => setLocalRecursive(e.target.checked)}
                    style={{ accentColor: '#1db954' }}
                  /> Subfolders
                </label>
              </div>
              {!localFolder && (
                <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
                  Pick a folder to start playing.
                </p>
              )}
              {localFolder && localPlaylist.length === 0 && (
                <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
                  No audio files found in this folder.
                </p>
              )}
            </>
          ) : (
            /* ── DLNA ── */
            <>
              {!dlnaBrowserMusic.server ? (
                /* Server picker */
                <>
                  <button
                    onClick={dlnaBrowserMusic.discover}
                    disabled={dlnaBrowserMusic.discovering}
                    style={{
                      background: '#1db95418', border: '1px solid #1db95444', color: '#1db954',
                      borderRadius: 4, padding: '4px 12px', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                    }}
                  >
                    {dlnaBrowserMusic.discovering ? 'Searching…' : 'Discover DLNA Servers'}
                  </button>
                  {!dlnaBrowserMusic.discovering && dlnaBrowserMusic.servers.length === 0 && (
                    <p style={{ margin: 0, color: '#555', fontSize: 12 }}>
                      No DLNA servers found. Press Discover to search.
                    </p>
                  )}
                  {dlnaBrowserMusic.servers.map(s => (
                    <button
                      key={s.location}
                      onClick={() => dlnaBrowserMusic.selectServer(s)}
                      style={{
                        background: 'none', border: '1px solid #2a2a2a', color: '#ccc',
                        borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </>
              ) : (
                /* Browser */
                <>
                  {/* Breadcrumb / back navigation */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <button
                      onClick={dlnaBrowserMusic.reset}
                      style={{ background: 'none', border: 'none', color: '#1db954', cursor: 'pointer', fontSize: 12, padding: 0 }}
                      title="Back to server list"
                    >
                      ⌂ {dlnaBrowserMusic.server.name}
                    </button>
                    {dlnaBrowserMusic.breadcrumb.map(c => (
                      <span key={c.id} style={{ color: '#555', fontSize: 11 }}>/ {c.title}</span>
                    ))}
                    {dlnaBrowserMusic.breadcrumb.length > 0 && (
                      <button
                        onClick={dlnaBrowserMusic.back}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 11, marginLeft: 4 }}
                      >
                        ← Back
                      </button>
                    )}
                  </div>

                  {dlnaBrowserMusic.loading && (
                    <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Loading…</p>
                  )}
                  {dlnaBrowserMusic.error && <ErrBanner>{dlnaBrowserMusic.error}</ErrBanner>}

                  {/* Subfolders */}
                  {dlnaBrowserMusic.containers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => dlnaBrowserMusic.browse(c)}
                      style={{
                        background: 'none', border: '1px solid #2a2a2a', color: '#aaa',
                        borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
                      }}
                    >
                      📁 {c.title}
                    </button>
                  ))}

                  {/* Audio item count */}
                  {dlnaBrowserMusic.items.filter(i => i.mime.startsWith('audio/')).length > 0 && (
                    <p style={{ margin: 0, color: '#555', fontSize: 11 }}>
                      {dlnaBrowserMusic.items.filter(i => i.mime.startsWith('audio/')).length} audio track(s) ready
                    </p>
                  )}

                  {/* Empty folder message */}
                  {!dlnaBrowserMusic.loading &&
                    dlnaBrowserMusic.containers.length === 0 &&
                    dlnaBrowserMusic.items.filter(i => i.mime.startsWith('audio/')).length === 0 && (
                    <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Folder is empty.</p>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Zone 2: Playback — always visible ─────────────────────── */}
          <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              <input
                type="range" min={0} max={1} step={0.02}
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
          </div>
```

- [ ] **Step 2: Type-check**

```bash
cd app && npx tsc --noEmit
```

Expected: no errors. If TypeScript reports errors, fix them before continuing.

- [ ] **Step 3: Run the app and verify**

```bash
cd app && npm run tauri dev
```

Verify the following manually:

**Spotify source:**
- Playback zone (NowPlaying + controls + volume + spectrum) is visible immediately on load, even before auth.
- "No track" placeholder shows when not authenticated or device not ready.
- After authenticating and selecting a Spotify device: album art / track / controls populate correctly.
- Switching to another source pauses Spotify playback (existing behavior, confirm still works).

**Local Files source:**
- Folder picker and order/recursive options show above the divider.
- Playback zone always shows below divider.
- "No track" shows until a folder is picked and a track loads.
- Pick a folder → track loads → NowPlaying populates, seek bar appears, controls work.
- Volume slider and spectrum always visible.

**DLNA source:**
- DLNA browser (server picker or breadcrumb browser) shows above the divider.
- Playback zone always shows below divider.
- "No track" shows until a folder with audio is browsed.
- Once audio tracks are ready, play → NowPlaying populates with track metadata.

**Source switching:**
- Switch Spotify → Local: Spotify pauses; Local source shows last-known state (or "No track" if none loaded yet).
- Switch Local → DLNA: Local audio pauses; DLNA shows its state.
- Switch DLNA → Spotify: DLNA audio pauses; Spotify shows its state.
- Volume is independent per source (change Spotify volume, switch to Local, volume is unchanged; switch back, Spotify volume restored).

- [ ] **Step 4: Commit**

```bash
cd app && git add src/windows/control/ControlPanel.tsx && git commit -m "feat(control): always-visible playback zone per source in Music card"
```
