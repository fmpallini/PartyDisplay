Party Display v0.9.11 — Windows 64-bit Portable
===============================================

  GitHub:  https://github.com/fmpallini/PartyDisplay
  License: GNU Affero General Public License v3 (see LICENSE.txt)


REQUIREMENTS
  - Windows 10 (build 1903+) or Windows 11
      Note: External source song info requires build 1903+ (May 2019 Update).
      Older builds can still run the app but will not show track metadata in External mode.
  - Microsoft Edge WebView2 Runtime
      Already installed on all Windows 11 machines and most Windows 10 machines.
      If missing, download from:
        https://developer.microsoft.com/en-us/microsoft-edge/webview2/


HOW TO RUN
  Double-click party-display.exe — no installation needed.
  All settings are stored in your Windows user profile (keyring + localStorage).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 FIRST LAUNCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 1. Double-click party-display.exe — no installation needed.

 2. The control panel opens with "External" audio source selected.
    Any audio playing on your PC will drive the visualizer and show
    song info automatically.

 3. Click "Open Display" to show the visualizer on a second monitor,
    projector, or TV.

 4. Optionally pick a photo folder — the app will automatically switch
    to photo mode when photos are loaded.


 OPTIONAL — SPOTIFY INTEGRATION

 If you want to use Party Display as a native Spotify Connect device:

 1. In the control panel, select the Spotify audio source and click
    "Connect Spotify".

 2. If this is your first launch, you will be prompted to enter your
    Spotify Client ID. Follow the on-screen steps to create a free app
    on developer.spotify.com and paste the Client ID. It is stored
    securely in the Windows Credential Store and never needs to be
    entered again.

 3. Your browser will open the Spotify login page. Log in and grant
    the requested permissions.

 4. The browser will redirect to 127.0.0.1:7357 (a local page served
    briefly by the app), then close automatically.

 NOTE: A Spotify Premium account is required to stream audio through
 the Party Display Spotify Connect device.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 EXTERNAL AUDIO
  - Pass-through mode for any audio playing on your PC — Spotify, browser,
    media player, YouTube, whatever
  - Numpad +/- send system-wide volume keys; 4/5/6 send media keys
  - WASAPI loopback drives the visualizer in real time
  - Song info (title, artist, album art) and lyrics fetched automatically when the
    active player registers with the Windows System Media Transport Controls (SMTC)
  - "Active player" = the media session Windows considers current (last interacted with)

  Supported players (register with SMTC automatically):
    Spotify desktop, Chrome, Edge, Firefox, Windows Media Player,
    Groove Music, VLC 3.x+, most modern UWP/store media apps

  Not supported (SMTC not registered — song info stays blank):
    Old VLC versions (pre-3.0), some games and legacy audio players,
    command-line players, and apps that output audio without using the
    Windows media session API

  If the active player is unsupported or nothing is playing, any previously
  displayed song info is cleared immediately — no stale data is shown.

 LOCAL FILES
  - Play audio files from a local folder through the built-in HTML5 player
  - Supported formats: MP3, FLAC, WAV, OGG, M4A, AAC, OPUS
  - Optional recursive subfolder scan
  - Play order: alphabetical or shuffle
  - Reads embedded metadata (title, artist, album art) from file tags

 DLNA / UPnP
  - Discovers UPnP/DLNA media servers on your local network
  - Browse server containers (folders) directly in the control panel
  - Stream audio tracks from a DLNA server (NAS, media server, etc.)
  - Use a DLNA container as the photo slideshow source
  - Seeking supported via HTTP range-request proxy

 SPOTIFY (optional)
  - Registers as a native Spotify Connect device (Web Playback SDK)
  - Client ID entered at runtime via guided setup — no config file needed
  - OAuth PKCE login — tokens saved in Windows Credential Store
  - Auto token refresh — sessions survive app restarts
  - Volume synced from your Spotify session on connect
  - Now playing card: album art, track name, artist, progress bar + seek
  - Transport controls: play/pause, previous, next, volume
  - Requires a Spotify Premium account

 PHOTO SLIDESHOW
  - Watches a local folder or DLNA container for images
  - Supported formats: JPEG, PNG, WebP, GIF, BMP, TIFF
  - Optional recursive subfolder scan (local source)
  - Play order: alphabetical or shuffle
  - Configurable display time per photo
  - 8 transition effects: fade, slide (4 directions), zoom in/out, blur, random
  - Configurable transition duration
  - Image fit: cover (fill/crop) or letterbox (contain)

 VISUALIZER
  - MilkDrop-style animated visualizer powered by Butterchurn (WebGL)
  - Real-time WASAPI loopback audio capture — no driver install needed
  - Three modes: photos only, photo/visualizer split view, fullscreen visualizer
  - 100 bundled presets — add your own by placing .json preset files in the
    presets\ folder next to party-display.exe
  - Preset cycling: manually (PgUp / PgDn), on every music change, or on a
    configurable timer (default every 1 minute)
  - Preset order: alphabetical or shuffle (default)

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

 PHONE REMOTE
  - Browser-based remote control served over Wi-Fi (no app install needed)
  - Enable in the control panel — shows URL and QR code for quick access
  - Controls: play/pause, previous/next track, volume, slideshow navigation,
    visualizer preset cycling, and all display toggles
  - Works from any phone or tablet browser on the local network

 DISPLAY WINDOW
  - Designed for a second monitor, projector, or TV
  - Native "Cast to TV" button to wirelessly connect to Roku/Fire Stick/Smart TVs
  - Auto-detects new wireless displays and seamlessly fullscreens the window
  - Auto-opens on first launch, positioned alongside the control panel;
    subsequent sessions restore last saved position
  - Fullscreen toggle, window position and state persisted across restarts
  - Mouse cursor hides after 3 seconds idle in fullscreen; restores on movement
  - Screensaver / sleep blocked while the display window is open
  - Song changed toast (album art + track name) and volume toast


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 KEYBOARD SHORTCUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 SLIDESHOW (display window focused)
  Arrow Right / Left    Next / previous photo
  Space                 Pause / resume slideshow

 VISUALIZER
  M                     Cycle visualizer mode (photos / split / fullscreen)
  Page Up               Next visualizer preset
  Page Down             Previous visualizer preset

 DISPLAY TOGGLES
  F                     Toggle fullscreen
  Esc                   Exit fullscreen
  Double-click          Toggle fullscreen
  T                     Toggle track overlay
  B                     Toggle battery icon
  P                     Toggle photo counter
  C                     Toggle clock & weather
  L                     Toggle lyrics

 MUSIC (numpad)
  Numpad 4 / 6          Previous / next track
  Numpad 5              Play / pause
  Numpad + / -          Volume up / down
                        (sends system volume keys when External source is active)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  App shows blank / white screen
    Install the WebView2 runtime (link in REQUIREMENTS above).

  Visualizer shows no animation
    Make sure audio is playing through your Windows default output device.
    Party Display captures the system loopback — it does not need a
    microphone or any driver. The visualizer reacts to all system audio,
    not exclusively Spotify.

  Lyrics not showing
    Not all tracks have synchronized lyrics in LRCLIB. If a track has no
    match, the overlay will not appear. Try toggling L to confirm it is
    enabled. If you are playing Local Files, ensure your audio file's
    embedded metadata (Artist and Title tags) perfectly match the LRCLIB
    database to fetch successfully.

  No audio when Casting to TV (Miracast)
    If the music continues playing on your laptop instead of the TV after
    connecting, click the Speaker icon in your Windows taskbar and change
    the output device to your TV. The visualizer will automatically switch
    to listen to the TV's audio.

  Poor image quality when casting to TV (Miracast/Chromecast)
    Because casting involves capturing and encoding your screen over Wi-Fi
    on the fly, high-motion graphics like the WebGL visualizer will show
    heavy compression artifacts (blockiness) and lag. While wireless streaming
    is usually fine for photo slideshows, the correct way to get high-quality,
    uncompressed video and audio for the visualizer is to use a direct HDMI
    cable, or a dedicated high-bitrate streaming solution like Sunshine/Moonlight.

  Song info / lyrics not showing in External mode
    Your media player must register with Windows System Media Transport Controls.
    Check whether Windows itself shows the media overlay (e.g. the volume
    flyout shows a Now Playing card). If it does not appear there, Party Display
    cannot read metadata from that app either.
    Switch focus to your media player (click its window) so Windows picks it as
    the active session, then switch back to Party Display.

  Lyrics out of sync / Progress bar shows wrong time (YouTube in Browser)
    Browsers (like Chrome or Edge) sometimes have bugs where they fail to update
    the Windows media timeline correctly when you open a new YouTube video, or
    they continue counting from the previous video's position. This causes the
    progress bar and lyrics in Party Display to be completely out of sync.

  Reset everything
    Open the Help panel (? button in the control panel) and click "Reset".
    This clears all saved settings and Spotify tokens and closes the app.
    Relaunch the app manually afterwards.

    You can also reset from the command line:

      party-display.exe --reset

    This clears all saved settings and Spotify credentials.
    Relaunch the app manually afterwards.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 CREDITS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 VISUALIZER PRESETS
  The bundled presets (presets\ folder) are sourced from the
  butterchurn-presets npm package — a free, open-source WebGL
  reimplementation of MilkDrop, the iconic Winamp visualizer plugin
  originally created by Ryan Geiss.

  More info: https://butterchurnviz.com