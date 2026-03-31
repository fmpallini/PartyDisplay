Party Display v0.5.0 Beta — Windows 64-bit Portable
=====================================================

  GitHub:  https://github.com/fmpallini/PartyDisplay
  License: GNU Affero General Public License v3 (see LICENSE.txt)

REQUIREMENTS
  - Windows 10 (build 1803+) or Windows 11
  - Microsoft Edge WebView2 Runtime
      Already installed on all Windows 11 machines and most Windows 10 machines.
      If missing, download from:
        https://developer.microsoft.com/en-us/microsoft-edge/webview2/

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
    You can now pick a Spotify device, load a photo folder, and open
    the display window.

 NOTE: A Spotify Premium account is required to stream audio to the
 Party Display player device.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - Spotify playback control and streaming (Web Playback SDK)
  - Photo slideshow with configurable transitions and intervals
  - Spectrum analyser overlay (real-time WASAPI loopback capture)
  - Track info overlay (font, size, position, colour, opacity)
  - Battery widget
  - Screensaver / clock mode
  - Multi-monitor display window (movable, resizable, fullscreen)

 KEYBOARD SHORTCUTS (display window focused)
  Arrow Right / Left   Next / previous photo
  Space                Pause / resume slideshow
  F                    Toggle fullscreen
  S                    Toggle spectrum analyser
  T                    Toggle track info overlay
  B                    Toggle battery icon
  ?                    Open help / about panel


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  App shows blank / white screen
    → Install the WebView2 runtime (link in REQUIREMENTS above).

  No audio / spectrum is flat
    → Make sure audio is playing through your Windows default
      output device. Party Display captures the system loopback.

  Reset everything
    → Open the Help panel (? button) and click "Reset app".
    → This clears all saved settings and tokens and restarts the app.
