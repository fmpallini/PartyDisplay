# Party Display — Plan 1: Foundation & Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the production Tauri v2 app in `app/`, wire up two windows (control panel + display), establish typed IPC, and implement Spotify OAuth PKCE via a deep-link callback — leaving the user fully authenticated with a stored, refreshable token.

**Architecture:** Single Vite/React frontend served to both WebView2 windows; window label (`getCurrentWebviewWindow().label`) determines which component tree renders. Rust backend handles token storage via OS keyring and exposes Tauri commands. OAuth uses PKCE (no client_secret needed) — browser opens via `tauri-plugin-shell`, Spotify redirects to `party-display://callback`, `tauri-plugin-deep-link` fires a Rust event, frontend completes token exchange and persists via keyring command.

**Tech Stack:** Tauri v2 · Rust · React 18 · TypeScript · Vite 5 · @tauri-apps/api v2 · tauri-plugin-deep-link v2 · tauri-plugin-shell v2 · keyring crate v3 · Web Crypto API (SHA-256 for PKCE in browser)

---

## Prerequisites (human action required before starting)

1. Register a Spotify Developer App at https://developer.spotify.com/dashboard — note the `client_id`.
2. Add `party-display://callback` as a Redirect URI in the Spotify app settings.
3. Set env var `VITE_SPOTIFY_CLIENT_ID=<your_client_id>` (or create `app/.env.local` with that line). The plan references this as `import.meta.env.VITE_SPOTIFY_CLIENT_ID`.
4. Rust toolchain installed (`rustup`, stable). Node ≥ 18. `npm` available.
5. WebView2 Runtime installed (ships with Windows 11, or install from Microsoft).

---

## File Map

**Rust / Tauri backend**
- Create: `app/src-tauri/Cargo.toml`
- Create: `app/src-tauri/build.rs`
- Create: `app/src-tauri/src/main.rs` — app builder: registers plugins, commands, manages auth state
- Create: `app/src-tauri/src/auth.rs` — Tauri commands: `store_tokens`, `load_tokens`, `clear_tokens`
- Create: `app/src-tauri/tauri.conf.json` — two windows, deep-link scheme, security config
- Create: `app/src-tauri/capabilities/default.json` — plugin permissions

**Frontend**
- Create: `app/package.json`
- Create: `app/vite.config.ts`
- Create: `app/tsconfig.json`
- Create: `app/index.html` — single HTML entry for both windows
- Create: `app/src/main.tsx` — React root
- Create: `app/src/App.tsx` — window-label router (control vs display)
- Create: `app/src/windows/control/ControlPanel.tsx` — control panel root component
- Create: `app/src/windows/display/DisplayWindow.tsx` — display window root component
- Create: `app/src/lib/ipc.ts` — shared TypeScript types for all IPC payloads
- Create: `app/src/lib/spotify-auth.ts` — PKCE utilities + token exchange fetch
- Create: `app/src/hooks/useAuth.ts` — React hook: auth state, login(), logout()
- Create: `app/src/components/LoginButton.tsx` — Spotify login/logout button

---

## Task 1: Scaffold the Tauri v2 app

**Files:**
- Create: `app/package.json`
- Create: `app/vite.config.ts`
- Create: `app/tsconfig.json`
- Create: `app/index.html`
- Create: `app/src/main.tsx`
- Create: `app/src-tauri/Cargo.toml`
- Create: `app/src-tauri/build.rs`
- Create: `app/src-tauri/src/main.rs`
- Create: `app/src-tauri/tauri.conf.json`

- [ ] **Step 1: Create `app/package.json`**

```json
{
  "name": "party-display",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-deep-link": "^2",
    "@tauri-apps/plugin-shell": "^2",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5",
    "vite": "^5",
    "@vitejs/plugin-react": "^4"
  }
}
```

- [ ] **Step 2: Create `app/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome105'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
```

- [ ] **Step 3: Create `app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "useDefineForClassFields": true,
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `app/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Party Display</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `app/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 6: Create `app/src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 7: Create `app/src-tauri/Cargo.toml`**

```toml
[package]
name = "party-display"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri              = { version = "2", features = ["devtools"] }
tauri-plugin-deep-link = "2"
tauri-plugin-shell     = "2"
serde      = { version = "1", features = ["derive"] }
serde_json = "1"
keyring    = "3"
```

- [ ] **Step 8: Create minimal `app/src-tauri/src/main.rs`** (no auth commands yet — just boots)

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 9: Create `app/src-tauri/tauri.conf.json`**

```json
{
  "productName": "Party Display",
  "version": "0.1.0",
  "identifier": "com.partydisplay.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420"
  },
  "app": {
    "withGlobalTauri": false,
    "windows": [
      {
        "label": "control",
        "title": "Party Display — Control",
        "width": 900,
        "height": 650,
        "resizable": true
      },
      {
        "label": "display",
        "title": "Party Display — Display",
        "width": 1280,
        "height": 720,
        "resizable": true,
        "visible": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["party-display"]
      }
    }
  },
  "bundle": {
    "active": false
  }
}
```

- [ ] **Step 10: Create `app/src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability",
  "windows": ["control", "display"],
  "permissions": [
    "core:default",
    "shell:default",
    "deep-link:default"
  ]
}
```

- [ ] **Step 11: Install npm dependencies**

```bash
cd app && npm install
```

Expected: node_modules created, no errors.

- [ ] **Step 12: Verify the app boots**

```bash
cd app && npm run tauri dev
```

Expected: two windows open. Both show blank white page (React root not rendering yet). No Rust compile errors. Close the app.

- [ ] **Step 13: Commit**

```bash
cd app && git add -A
git commit -m "feat: scaffold Tauri v2 app with React+TS+Vite, two windows"
```

---

## Task 2: Two-window routing

**Files:**
- Create: `app/src/App.tsx`
- Create: `app/src/windows/control/ControlPanel.tsx`
- Create: `app/src/windows/display/DisplayWindow.tsx`

- [ ] **Step 1: Create `app/src/windows/control/ControlPanel.tsx`**

```tsx
export default function ControlPanel() {
  return (
    <div style={{ fontFamily: 'monospace', padding: 24, background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h2 style={{ color: '#1db954', margin: '0 0 16px' }}>Party Display — Control Panel</h2>
      <p>Auth and playback controls go here.</p>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/src/windows/display/DisplayWindow.tsx`**

```tsx
export default function DisplayWindow() {
  return (
    <div style={{ background: '#000', color: '#fff', width: '100vw', height: '100vh',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'monospace' }}>
      <p>Display window — slideshow renders here.</p>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/src/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import ControlPanel from './windows/control/ControlPanel'
import DisplayWindow from './windows/display/DisplayWindow'

export default function App() {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    setLabel(getCurrentWebviewWindow().label)
  }, [])

  if (label === null) return null
  if (label === 'display') return <DisplayWindow />
  return <ControlPanel />
}
```

- [ ] **Step 4: Run and verify**

```bash
cd app && npm run tauri dev
```

Expected:
- Control window shows green "Party Display — Control Panel" heading.
- Display window shows dark background with "Display window" text.

- [ ] **Step 5: Commit**

```bash
git add app/src/
git commit -m "feat: two-window routing via window label detection"
```

---

## Task 3: Typed IPC foundation (ping command)

**Files:**
- Create: `app/src/lib/ipc.ts`
- Modify: `app/src-tauri/src/main.rs`

This task establishes the IPC pattern used by all future commands. The ping command proves the entire frontend → Rust → frontend path works before adding auth complexity.

- [ ] **Step 1: Create `app/src/lib/ipc.ts`**

```typescript
// Single source of truth for all IPC command names and payload types.
// Rust command names must match these strings exactly (snake_case in Rust maps to camelCase here).

export interface TokenPayload {
  access_token: string
  refresh_token: string
  expires_at: number // unix timestamp ms
}

export interface AuthState {
  authenticated: boolean
  token: TokenPayload | null
}
```

- [ ] **Step 2: Add ping command to `app/src-tauri/src/main.rs`**

Replace the entire file:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;

#[tauri::command]
fn ping() -> &'static str {
    "pong"
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            ping,
            auth::store_tokens,
            auth::load_tokens,
            auth::clear_tokens,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Create empty `app/src-tauri/src/auth.rs`** (so the module compiles)

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenPayload {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: u64,
}

#[tauri::command]
pub fn store_tokens(_tokens: TokenPayload) -> Result<(), String> {
    Ok(()) // stub — implemented in Task 4
}

#[tauri::command]
pub fn load_tokens() -> Result<Option<TokenPayload>, String> {
    Ok(None) // stub — implemented in Task 4
}

#[tauri::command]
pub fn clear_tokens() -> Result<(), String> {
    Ok(()) // stub — implemented in Task 4
}
```

- [ ] **Step 4: Verify ping from ControlPanel — add a test button to `app/src/windows/control/ControlPanel.tsx`**

```tsx
import { invoke } from '@tauri-apps/api/core'
import { useState } from 'react'

export default function ControlPanel() {
  const [pong, setPong] = useState('')

  async function testPing() {
    const result = await invoke<string>('ping')
    setPong(result)
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: 24, background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h2 style={{ color: '#1db954', margin: '0 0 16px' }}>Party Display — Control Panel</h2>
      <button onClick={testPing} style={{ background: '#1db954', border: 'none', padding: '8px 20px', cursor: 'pointer', borderRadius: 4 }}>
        Test IPC ping
      </button>
      {pong && <p>Response: {pong}</p>}
    </div>
  )
}
```

- [ ] **Step 5: Run and verify**

```bash
cd app && npm run tauri dev
```

Click "Test IPC ping" in the control window. Expected: `Response: pong` appears below the button.

- [ ] **Step 6: Remove the test button from ControlPanel** (revert to Step 1 version of ControlPanel)

```tsx
export default function ControlPanel() {
  return (
    <div style={{ fontFamily: 'monospace', padding: 24, background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h2 style={{ color: '#1db954', margin: '0 0 16px' }}>Party Display — Control Panel</h2>
      <p>Auth and playback controls go here.</p>
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add app/src-tauri/src/ app/src/lib/ipc.ts app/src/windows/
git commit -m "feat: typed IPC foundation with ping command, auth stubs"
```

---

## Task 4: OAuth PKCE — Rust keyring commands

**Files:**
- Modify: `app/src-tauri/src/auth.rs`

- [ ] **Step 1: Write Rust unit test for token round-trip (failing first)**

Replace `app/src-tauri/src/auth.rs` entirely:

```rust
use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "party-display";
const USER:    &str = "spotify-tokens";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenPayload {
    pub access_token:  String,
    pub refresh_token: String,
    pub expires_at:    u64, // unix timestamp ms
}

#[tauri::command]
pub fn store_tokens(tokens: TokenPayload) -> Result<(), String> {
    let json = serde_json::to_string(&tokens).map_err(|e| e.to_string())?;
    Entry::new(SERVICE, USER)
        .map_err(|e| e.to_string())?
        .set_password(&json)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_tokens() -> Result<Option<TokenPayload>, String> {
    let entry = Entry::new(SERVICE, USER).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(json) => {
            let tokens: TokenPayload =
                serde_json::from_str(&json).map_err(|e| e.to_string())?;
            Ok(Some(tokens))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn clear_tokens() -> Result<(), String> {
    let entry = Entry::new(SERVICE, USER).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_round_trip() {
        let tokens = TokenPayload {
            access_token:  "test_access".into(),
            refresh_token: "test_refresh".into(),
            expires_at:    9999999999,
        };
        store_tokens(tokens.clone()).unwrap();
        let loaded = load_tokens().unwrap().expect("tokens should exist after store");
        assert_eq!(loaded.access_token,  tokens.access_token);
        assert_eq!(loaded.refresh_token, tokens.refresh_token);
        assert_eq!(loaded.expires_at,    tokens.expires_at);
        clear_tokens().unwrap();
        let after_clear = load_tokens().unwrap();
        assert!(after_clear.is_none(), "tokens should be gone after clear");
    }
}
```

- [ ] **Step 2: Run the test — expect PASS**

```bash
cd app/src-tauri && cargo test auth::tests::token_round_trip -- --nocapture
```

Expected output:
```
test auth::tests::token_round_trip ... ok
test result: ok. 1 passed; 0 failed
```

If `NoEntry` error appears: the keyring crate may require Windows Credential Store to be unlocked — run as normal user (not admin) and retry.

- [ ] **Step 3: Commit**

```bash
git add app/src-tauri/src/auth.rs
git commit -m "feat: keyring token storage commands with passing round-trip test"
```

---

## Task 5: OAuth PKCE — frontend utilities

**Files:**
- Create: `app/src/lib/spotify-auth.ts`

- [ ] **Step 1: Create `app/src/lib/spotify-auth.ts`**

```typescript
const CLIENT_ID   = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string
const REDIRECT_URI = 'party-display://callback'
const SCOPES       = 'streaming user-read-playback-state user-modify-playback-state user-read-currently-playing'

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifierBytes = randomBytes(64)
  const verifier      = base64url(verifierBytes.buffer)
  const digest        = await crypto.subtle.digest('SHA-256', verifierBytes)
  const challenge     = base64url(digest)
  return { verifier, challenge }
}

export function buildAuthUrl(challenge: string): string {
  const params = new URLSearchParams({
    client_id:             CLIENT_ID,
    response_type:         'code',
    redirect_uri:          REDIRECT_URI,
    scope:                 SCOPES,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
  })
  return `https://accounts.spotify.com/authorize?${params}`
}

// ── Token exchange ────────────────────────────────────────────────────────────

export interface RawTokenResponse {
  access_token:  string
  refresh_token: string
  expires_in:    number
}

export async function exchangeCode(code: string, verifier: string): Promise<RawTokenResponse> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<RawTokenResponse>
}

export async function refreshAccessToken(refresh_token: string): Promise<RawTokenResponse> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      grant_type:    'refresh_token',
      refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<RawTokenResponse>
}

export function expiresAt(expires_in: number): number {
  // Subtract 60s buffer so we refresh before actual expiry
  return Date.now() + (expires_in - 60) * 1000
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/lib/spotify-auth.ts
git commit -m "feat: Spotify OAuth PKCE utilities (challenge, exchange, refresh)"
```

---

## Task 6: OAuth PKCE — deep-link handler and auth hook

**Files:**
- Create: `app/src/hooks/useAuth.ts`

The deep-link plugin emits an event on the `deep-link://new-url` channel when `party-display://callback?code=...` is intercepted. The hook listens for this, extracts `code`, exchanges it, and persists tokens.

- [ ] **Step 1: Create `app/src/hooks/useAuth.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { open } from '@tauri-apps/plugin-shell'
import type { TokenPayload } from '../lib/ipc'
import {
  buildAuthUrl,
  exchangeCode,
  expiresAt,
  generatePkce,
  refreshAccessToken,
} from '../lib/spotify-auth'

export interface AuthState {
  authenticated: boolean
  accessToken: string | null
  loading: boolean
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    accessToken: null,
    loading: true,
    error: null,
  })

  // Store verifier in a ref so the deep-link callback can access it
  const verifierRef = useRef<string | null>(null)

  // ── Persist + update state ────────────────────────────────────────────────

  async function persistTokens(raw: { access_token: string; refresh_token: string; expires_in: number }) {
    const payload: TokenPayload = {
      access_token:  raw.access_token,
      refresh_token: raw.refresh_token,
      expires_at:    expiresAt(raw.expires_in),
    }
    await invoke('store_tokens', { tokens: payload })
    setState({ authenticated: true, accessToken: raw.access_token, loading: false, error: null })
  }

  // ── On mount: load persisted tokens, refresh if expired ─────────────────

  useEffect(() => {
    async function bootstrap() {
      try {
        const stored = await invoke<TokenPayload | null>('load_tokens')
        if (!stored) {
          setState(s => ({ ...s, loading: false }))
          return
        }
        if (Date.now() < stored.expires_at) {
          setState({ authenticated: true, accessToken: stored.access_token, loading: false, error: null })
          return
        }
        // Token expired — refresh
        const refreshed = await refreshAccessToken(stored.refresh_token)
        await persistTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? stored.refresh_token })
      } catch (e) {
        setState({ authenticated: false, accessToken: null, loading: false, error: String(e) })
      }
    }
    bootstrap()
  }, [])

  // ── Deep-link listener: fires when Spotify redirects to party-display:// ─

  useEffect(() => {
    const unlisten = onOpenUrl((urls) => {
      const url = urls[0]
      if (!url) return
      const parsed = new URL(url)
      const code   = parsed.searchParams.get('code')
      const error  = parsed.searchParams.get('error')

      if (error) {
        setState(s => ({ ...s, loading: false, error: `Spotify auth error: ${error}` }))
        return
      }
      if (!code || !verifierRef.current) return

      const verifier = verifierRef.current
      verifierRef.current = null

      exchangeCode(code, verifier)
        .then(persistTokens)
        .catch(e => setState(s => ({ ...s, loading: false, error: String(e) })))
    })

    return () => { unlisten.then(fn => fn()) }
  }, [])

  // ── login / logout ────────────────────────────────────────────────────────

  const login = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const { verifier, challenge } = await generatePkce()
      verifierRef.current = verifier
      await open(buildAuthUrl(challenge))
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: String(e) }))
    }
  }, [])

  const logout = useCallback(async () => {
    await invoke('clear_tokens')
    setState({ authenticated: false, accessToken: null, loading: false, error: null })
  }, [])

  return { ...state, login, logout }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/hooks/useAuth.ts
git commit -m "feat: useAuth hook — PKCE login, deep-link callback, token refresh on boot"
```

---

## Task 7: Login UI

**Files:**
- Create: `app/src/components/LoginButton.tsx`
- Modify: `app/src/windows/control/ControlPanel.tsx`

- [ ] **Step 1: Create `app/src/components/LoginButton.tsx`**

```tsx
interface Props {
  authenticated: boolean
  loading: boolean
  onLogin: () => void
  onLogout: () => void
}

export default function LoginButton({ authenticated, loading, onLogin, onLogout }: Props) {
  if (loading) return <button disabled style={btnStyle('#444', '#888')}>Connecting…</button>
  if (authenticated) return <button onClick={onLogout} style={btnStyle('#c0392b', '#fff')}>Disconnect Spotify</button>
  return <button onClick={onLogin} style={btnStyle('#1db954', '#000')}>Connect Spotify</button>
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, border: 'none', padding: '10px 24px', borderRadius: 20,
           fontWeight: 'bold', cursor: 'pointer', fontSize: 14 }
}
```

- [ ] **Step 2: Replace `app/src/windows/control/ControlPanel.tsx`**

```tsx
import LoginButton from '../../components/LoginButton'
import { useAuth } from '../../hooks/useAuth'

export default function ControlPanel() {
  const { authenticated, loading, accessToken, error, login, logout } = useAuth()

  return (
    <div style={{ fontFamily: 'monospace', padding: 24, background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h2 style={{ color: '#1db954', margin: '0 0 20px' }}>Party Display</h2>

      <LoginButton
        authenticated={authenticated}
        loading={loading}
        onLogin={login}
        onLogout={logout}
      />

      {authenticated && (
        <p style={{ color: '#1db954', marginTop: 12 }}>
          ✅ Authenticated — token: {accessToken?.slice(0, 20)}…
        </p>
      )}

      {error && <p style={{ color: '#e74c3c', marginTop: 12 }}>❌ {error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Run and verify full OAuth flow**

```bash
cd app && npm run tauri dev
```

Manual verification checklist:
- [ ] App opens. "Connect Spotify" button visible.
- [ ] Click "Connect Spotify" → system browser opens to Spotify login page.
- [ ] Log in / approve. Browser shows redirect attempt to `party-display://callback`.
- [ ] App receives deep-link, button changes to "Disconnect Spotify".
- [ ] Token prefix shown under button (first 20 chars of access_token).
- [ ] Close and reopen app → still shows authenticated (token loaded from keyring).
- [ ] Click "Disconnect Spotify" → button returns to "Connect Spotify", token cleared.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/ app/src/windows/
git commit -m "feat: Spotify login UI with auth state display"
```

---

## Task 8: Auto-refresh background timer

**Files:**
- Modify: `app/src/hooks/useAuth.ts`

Token expires in 1 hour. We need a timer that refreshes it ~60s before expiry.

- [ ] **Step 1: Add refresh timer to `useAuth.ts`**

Add this `useEffect` block inside the `useAuth` function, after the deep-link listener `useEffect`:

```typescript
  // ── Auto-refresh timer ────────────────────────────────────────────────────

  useEffect(() => {
    if (!state.authenticated) return

    async function doRefresh() {
      try {
        const stored = await invoke<TokenPayload | null>('load_tokens')
        if (!stored) return
        const refreshed = await refreshAccessToken(stored.refresh_token)
        await persistTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? stored.refresh_token })
      } catch (e) {
        console.error('Auto-refresh failed:', e)
      }
    }

    async function scheduleRefresh() {
      const stored = await invoke<TokenPayload | null>('load_tokens')
      if (!stored) return
      const msUntilExpiry = stored.expires_at - Date.now()
      // expires_at already has 60s buffer subtracted (see expiresAt() in spotify-auth.ts)
      const delay = Math.max(0, msUntilExpiry)
      const id = setTimeout(doRefresh, delay)
      return id
    }

    let timerId: ReturnType<typeof setTimeout> | undefined
    scheduleRefresh().then(id => { timerId = id })

    return () => { if (timerId !== undefined) clearTimeout(timerId) }
  }, [state.authenticated])
```

- [ ] **Step 2: Verify the timer fires (manual)**

Run the app, log in. Open devtools console (`Ctrl+Shift+I` on the control window). Run in console:

```javascript
// Force-expire the token to test refresh
await window.__TAURI_INTERNALS__.invoke('load_tokens')
```

Expected: returns token object. The timer schedules a refresh at `expires_at`. No action needed — just confirm no console errors after login.

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks/useAuth.ts
git commit -m "feat: auto-refresh token timer before expiry"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|---|---|
| Tauri v2 on Windows | Task 1 |
| React + TypeScript + Vite | Task 1 |
| Two windows (control + display) | Task 1 + Task 2 |
| Typed IPC | Task 3 (`ipc.ts`) |
| Spotify OAuth PKCE | Tasks 5, 6 |
| `party-display://` deep-link | Task 1 (`tauri.conf.json`) + Task 6 |
| Token stored in OS keyring | Task 4 |
| Token refresh on boot | Task 6 (`useAuth` bootstrap) |
| Auto-refresh before expiry | Task 8 |
| Login / logout UI | Task 7 |

**No placeholders found.** All steps contain complete code.

**Type consistency:**
- `TokenPayload` defined in both `src/lib/ipc.ts` (TS) and `src-tauri/src/auth.rs` (Rust) with identical field names.
- `invoke('store_tokens', { tokens: payload })` matches `pub fn store_tokens(tokens: TokenPayload)` in Rust.
- `invoke<TokenPayload | null>('load_tokens')` matches `-> Result<Option<TokenPayload>, String>` in Rust.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-28-plan1-foundation-auth.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration. Use skill: `superpowers:subagent-driven-development`

**2. Inline Execution** — execute tasks in this session with checkpoints. Use skill: `superpowers:executing-plans`

Which approach?
