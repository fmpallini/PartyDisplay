# Release Test Checklist

Run against the built `party-display.exe` release artifact.

**Pass criteria:** every box checked. Any failure = stop release, file a bug.

> Each section maps to a future automated scenario (tauri-driver + Playwright).
> Keep items atomic with clear pass/fail criteria to ease that migration.

---

## 1. App Launch

- [ ] App opens without crash or error dialog
- [ ] Control panel renders fully; no visible console errors (open DevTools to verify)
- [ ] Display window opens when clicking "Open Display Window"

---

## 2. Spotify Player

- [ ] Login flow completes: clicking Login opens browser, OAuth redirect returns to app
- [ ] Now Playing shows track title and artist for the active track
- [ ] Lyrics appear in the lyrics panel and advance in sync with playback
- [ ] Play/Pause button toggles playback correctly
- [ ] Next/Previous track buttons work
- [ ] SongToast overlay appears on track change and auto-dismisses

---

## 3. Local Player

- [ ] Folder picker selects a directory containing audio files
- [ ] Audio files from the selected folder appear in the playlist
- [ ] A track plays and produces audio
- [ ] Play/Pause/Skip controls respond correctly
- [ ] Visualizer (butterchurn) animates in response to audio

---

## 4. External Player (SMTC)

- [ ] Play media in a browser (YouTube or Spotify Web)
- [ ] Track info appears in Now Playing within ~3 seconds
- [ ] Artist/title are normalized: no "- Topic", "VEVO", "(Official Video)", "(Lyrics)"
- [ ] Stopping media in the browser clears Now Playing

---

## 5. DLNA Browser

- [ ] DLNA sources appear in the browser panel *(skip if no UPnP device is available on the network)*
- [ ] Selecting a DLNA source initiates playback

---

## 6. Slideshow

- [ ] Folder picker loads photos into the slideshow
- [ ] Slideshow cycles through images in the display window
- [ ] Toggling "Recursive" correctly includes or excludes photos from subfolders

---

## 7. Visualizer Presets

- [ ] Preset list populates from the `presets/` folder
- [ ] Switching presets changes the active visualization in the display window

---

## 8. Widgets

- [ ] Clock shows the correct local time and updates every second
- [ ] Weather widget shows a city name and a weather icon
- [ ] Battery widget shows the current level (or "N/A" gracefully on desktops without a battery)

---

## 9. Settings Persistence

- [ ] Change a display setting (e.g. zoom level, widget toggle)
- [ ] Quit and relaunch the app
- [ ] The changed setting is retained after restart

---

## 10. Hotkeys

- [ ] Numpad 5 (or configured play/pause hotkey) toggles playback
- [ ] Numpad 4 / 6 (prev/next) change tracks
- [ ] PageUp / PageDown cycle visualizer presets
