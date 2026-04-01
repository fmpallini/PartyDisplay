Party Display v0.6.0 — Windows 64-bit Portable
===============================================

  GitHub:  https://github.com/fmpallini/PartyDisplay
  License: GNU Affero General Public License v3 (see LICENSE.txt)


REQUIREMENTS
  - Windows 10 (build 1803+) or Windows 11
  - Microsoft Edge WebView2 Runtime
      Already installed on all Windows 11 machines and most Windows 10 machines.
      If missing, download from:
        https://developer.microsoft.com/en-us/microsoft-edge/webview2/
  - Spotify Premium account (required for Web Playback SDK streaming)


HOW TO RUN
  Double-click party-display.exe — no installation needed.
  All settings are stored in your Windows user profile (keyring + localStorage).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 FIRST LAUNCH — CONNECT SPOTIFY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 1. Double-click party-display.exe.

 2. In the control panel, click "Connect Spotify".

 3. Your browser will open the Spotify login page. Log in and grant
    the requested permissions.

 4. The browser will redirect to 127.0.0.1:7357 (a local page served
    briefly by the app), then close automatically.

 5. The control panel will show your account as connected.
    Pick a photo folder, open the display window, and enjoy.

 NOTE: A Spotify Premium account is required to stream audio to the
 Party Display player device.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 SPOTIFY
  - Registers as a Spotify Connect device (Web Playback SDK)
  - OAuth PKCE login — tokens saved in Windows Credential Store
  - Auto token refresh — sessions survive app restarts
  - Volume synced from your Spotify session on connect
  - Now playing card: album art, track name, artist, progress bar + seek
  - Transport controls: play/pause, previous, next, volume

 PHOTO SLIDESHOW
  - Watches a local folder for images (JPEG/PNG/WebP/GIF/BMP/TIFF)
  - Optional recursive subfolder scan
  - Play order: alphabetical or shuffle
  - Configurable display time per photo
  - 8 transition effects: fade, slide (4 directions), zoom in/out, blur, random
  - Configurable transition duration
  - Image fit: cover (fill/crop) or letterbox (contain)

 SPECTRUM ANALYSER
  - Real-time WASAPI loopback audio capture — no driver install needed
  - 64-bin FFT with logarithmic frequency mapping (40 Hz – 16 kHz)
  - 2 render styles (bars / lines) × 6 colour themes
  - Configurable height as % of screen

 LYRICS
  - Synchronized lyrics fetched from LRCLIB (free, no API key)
  - Overlay mode: 3-line karaoke (previous / current / next line)
  - Split view mode: photo on one side, full scrolling lyrics panel on the other
  - Falls back to plain-text if only unsynced lyrics are available

 CORNER WIDGETS
  - Track overlay   — artist + title pill, configurable font/size/colour
  - Clock & weather — live clock with temperature and weather icon (Open-Meteo)
  - Battery         — phone-style SVG icon with charge indicator
  - Photo counter   — x / y display at top-center

 DISPLAY WINDOW
  - Designed for a second monitor, projector, or TV
  - Fullscreen toggle, window position and state persisted across restarts
  - Screensaver / sleep blocked while the display window is open
  - Song changed toast (album art + track name) and volume toast


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 KEYBOARD SHORTCUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 SLIDESHOW (display window focused)
  Arrow Right / Left    Next / previous photo
  Space                 Pause / resume slideshow

 DISPLAY TOGGLES
  F                     Toggle fullscreen
  Esc                   Exit fullscreen
  Double-click          Toggle fullscreen
  S                     Toggle spectrum analyser
  T                     Toggle track overlay
  B                     Toggle battery icon
  P                     Toggle photo counter
  C                     Toggle clock & weather
  L                     Toggle lyrics

 MUSIC (numpad)
  Numpad 4 / 6          Previous / next Spotify track
  Numpad 5              Play / pause Spotify
  Numpad + / -          Volume up / down


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  App shows blank / white screen
    Install the WebView2 runtime (link in REQUIREMENTS above).

  No audio / spectrum is flat
    Make sure audio is playing through your Windows default output device.
    Party Display captures the system loopback — it does not need a
    microphone or any driver.

  Lyrics not showing
    Not all tracks have synchronized lyrics in LRCLIB. If a track has no
    match, the overlay will not appear. Try toggling L to confirm it is
    enabled.

  Reset everything
    Open the Help panel (? button in the control panel) and click "Reset app".
    This clears all saved settings and tokens and restarts the app.
