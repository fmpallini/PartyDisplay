# Photo Counter Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `photo x/y` overlay to the display window, togglable via a checkbox in Display Settings and the `P` hotkey, fixed at top-center.

**Architecture:** Extend the `photo-advance` event payload with `index` and `total` from the control panel; display window listens independently to track counter state; overlay rendered as a fixed-style pill component in `DisplayWindow.tsx`.

**Tech Stack:** React, TypeScript, Tauri events (`@tauri-apps/api/event`)

> **Note:** No commits — user wants to test before committing.

---

## File Map

| File | Change |
|------|--------|
| `app/src/hooks/useDisplaySync.ts` | Add `index`/`total` params to `advancePhoto` and event payload |
| `app/src/windows/control/ControlPanel.tsx` | Pass index/total in `showAt`; add `togglePhotoCounter`; wire hotkey |
| `app/src/components/DisplaySettingsPanel.tsx` | Add `photoCounterVisible` to interface, defaults, persistence, and UI |
| `app/src/hooks/useHotkeys.ts` | Add `onTogglePhotoCounter?` handler bound to `p`/`P` |
| `app/src/windows/display/DisplayWindow.tsx` | Listen for counter data; render overlay; wire hotkey |
| `app/src/components/HelpPanel.tsx` | Add `P` to HOTKEYS table |

---

### Task 1: Extend `advancePhoto` to carry index and total

**Files:**
- Modify: `app/src/hooks/useDisplaySync.ts`

- [ ] **Step 1: Update `advancePhoto` signature and payload**

In `app/src/hooks/useDisplaySync.ts`, change the exported function at the bottom:

```ts
// Call this from the control window to push the next photo to the display
export async function advancePhoto(photo: string, index: number, total: number) {
  await emit('photo-advance', { photo, index, total })
}
```

- [ ] **Step 2: Update the `listen` type in `useDisplaySync`**

The hook listens to `photo-advance` internally. Update the type annotation so TypeScript knows the payload shape (even though `useDisplaySync` doesn't use index/total — the display window will listen separately):

```ts
const unlisten = listen<{ photo: string; index: number; total: number }>('photo-advance', ({ payload }) => {
```

---

### Task 2: Pass index/total from ControlPanel

**Files:**
- Modify: `app/src/windows/control/ControlPanel.tsx`

- [ ] **Step 1: Update the `advancePhoto` call in `showAt`**

Find the `showAt` callback (~line 109). Change:

```ts
advancePhoto(photo).catch(console.error)
```

to:

```ts
advancePhoto(photo, i, library.photos.length).catch(console.error)
```

---

### Task 3: Add `photoCounterVisible` to DisplaySettings

**Files:**
- Modify: `app/src/components/DisplaySettingsPanel.tsx`

- [ ] **Step 1: Add field to the `DisplaySettings` interface**

Add after `trackBgOpacity`:

```ts
photoCounterVisible: boolean
```

- [ ] **Step 2: Add default in `readDisplaySettings`**

Add after `trackBgOpacity` line:

```ts
photoCounterVisible: localStorage.getItem('pd_photo_counter_visible') !== 'false',
```

(Defaults to `true` — only `'false'` string disables it.)

- [ ] **Step 3: Persist in the `useEffect`**

In the `useEffect` that calls `localStorage.setItem` for all settings, add:

```ts
localStorage.setItem('pd_photo_counter_visible', String(settings.photoCounterVisible))
```

- [ ] **Step 4: Add "Photo counter" section to the settings UI**

After the closing `</div>` of the Track overlay section (near the end of the returned JSX), add:

```tsx
{/* ── Photo counter ─────────────────────────────────────────────── */}
<p style={subHead}>Photo counter <span style={{ color: '#444', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(P to toggle)</span></p>

<label style={{ ...checkRow, marginBottom: 8 }}>
  <input type="checkbox" checked={settings.photoCounterVisible}
    onChange={e => set({ photoCounterVisible: e.target.checked })}
    style={{ accentColor: '#1db954', cursor: 'pointer' }}
  />
  Show on display
</label>
```

---

### Task 4: Add `onTogglePhotoCounter` to useHotkeys

**Files:**
- Modify: `app/src/hooks/useHotkeys.ts`

- [ ] **Step 1: Add handler to the `Handlers` interface**

Add after `onToggleBattery?`:

```ts
onTogglePhotoCounter?: () => void
```

- [ ] **Step 2: Destructure it in the function signature**

```ts
export function useHotkeys({ onNext, onPrev, onTogglePause, onToggleSpectrum, onToggleTrackOverlay, onToggleFullscreen, onToggleBattery, onTogglePhotoCounter }: Handlers) {
```

- [ ] **Step 3: Add the key binding in the switch**

After the `case 'b': case 'B':` line:

```ts
case 'p': case 'P': e.preventDefault(); onTogglePhotoCounter?.(); break
```

- [ ] **Step 4: Add to the `useEffect` dependency array**

```ts
}, [onNext, onPrev, onTogglePause, onToggleSpectrum, onToggleTrackOverlay, onToggleFullscreen, onToggleBattery, onTogglePhotoCounter])
```

---

### Task 5: Wire counter toggle in ControlPanel

**Files:**
- Modify: `app/src/windows/control/ControlPanel.tsx`

- [ ] **Step 1: Add `togglePhotoCounter` callback**

After `toggleBattery`:

```ts
const togglePhotoCounter = useCallback(() => {
  setDisplaySettings(s => ({ ...s, photoCounterVisible: !s.photoCounterVisible }))
}, [])
```

- [ ] **Step 2: Wire to `useHotkeys`**

In the `useHotkeys({...})` call, add:

```ts
onTogglePhotoCounter: togglePhotoCounter,
```

- [ ] **Step 3: Wire to `display-hotkey` listener**

In the `listen<{ action: string }>('display-hotkey', ...)` handler, add:

```ts
if (payload.action === 'counter') togglePhotoCounter()
```

---

### Task 6: Render PhotoCounterOverlay in DisplayWindow

**Files:**
- Modify: `app/src/windows/display/DisplayWindow.tsx`

- [ ] **Step 1: Add counter state**

After the existing `useState` declarations, add:

```ts
const [photoCounter, setPhotoCounter] = useState<{ index: number; total: number } | null>(null)
```

- [ ] **Step 2: Listen to `photo-advance` for counter data**

Add a new `useEffect` after the track listener:

```ts
useEffect(() => {
  const unlisten = listen<{ photo: string; index: number; total: number }>('photo-advance', ({ payload }) => {
    setPhotoCounter({ index: payload.index, total: payload.total })
  })
  return () => { unlisten.then(fn => fn()) }
}, [])
```

- [ ] **Step 3: Add `togglePhotoCounter` and wire hotkeys**

After `toggleBattery`:

```ts
const togglePhotoCounter = useCallback(() => {
  setDisplaySettings(s => ({ ...s, photoCounterVisible: !s.photoCounterVisible }))
}, [])
```

In the `useHotkeys({...})` call, add:

```ts
onTogglePhotoCounter: () => emit('display-hotkey', { action: 'counter' }).catch(console.error),
```

In the `listen<{ action: string }>('display-hotkey', ...)` handler, add:

```ts
if (payload.action === 'counter') togglePhotoCounter()
```

- [ ] **Step 4: Render the overlay**

After the `{displaySettings.trackOverlayVisible && currentTrack && ...}` block, add:

```tsx
{displaySettings.photoCounterVisible && photoCounter !== null && (
  <PhotoCounterOverlay index={photoCounter.index} total={photoCounter.total} />
)}
```

- [ ] **Step 5: Add `PhotoCounterOverlay` component**

At the bottom of `DisplayWindow.tsx`, after `TrackOverlay`:

```tsx
// ── Photo counter overlay ─────────────────────────────────────────────────────

function PhotoCounterOverlay({ index, total }: { index: number; total: number }) {
  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 15,
      pointerEvents: 'none',
      padding: '4px 10px',
      borderRadius: 999,
      background: 'rgba(0,0,0,0.45)',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: 13,
      letterSpacing: '0.5px',
      backdropFilter: 'blur(2px)',
      whiteSpace: 'nowrap',
    }}>
      photo {index + 1}/{total}
    </div>
  )
}
```

---

### Task 7: Add P hotkey to HelpPanel

**Files:**
- Modify: `app/src/components/HelpPanel.tsx`

- [ ] **Step 1: Add entry to HOTKEYS array**

After the `{ key: 'T', ... }` line:

```ts
{ key: 'P',         action: 'Toggle photo counter'   },
```

---

### Task 8: Manual verification

- [ ] Run `cd app && npm run dev` (or tauri dev)
- [ ] Open the display window — photo counter should appear at top-center showing `photo 1/N`
- [ ] Advance photos — counter should update
- [ ] Press `P` — counter should hide/show
- [ ] Open Display Settings → expand → check "Photo counter" section
- [ ] Toggle checkbox — counter hides/shows on display
- [ ] Open Help panel — `P` should appear in the hotkeys table
