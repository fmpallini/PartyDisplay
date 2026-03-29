# Photo Counter Overlay — Design Spec

**Date:** 2026-03-29

## Overview

Add a "photo x/y" counter overlay to the display window. Fixed position (top-center), fixed style (semi-transparent pill), togglable via a checkbox in Display Settings and a `P` hotkey.

---

## Feature Description

- Displays `photo x/y` (e.g. `photo 3/47`) in the center-top of the display window
- Fixed visual style: small white monospace text, semi-transparent dark background pill, no user-configurable styling
- Single setting: `photoCounterVisible: boolean`, default `true`
- Toggleable via `P` / `p` hotkey (same pattern as S, T, B)

---

## Data Flow

The control panel already tracks `indexRef.current` (0-based) and `library.photos.length`. Currently `advancePhoto(photo)` only emits the photo path.

**Change:** `advancePhoto(photo, index, total)` emits `{ photo, index, total }` via the `photo-advance` event.

The display window adds a dedicated `listen('photo-advance', ...)` to track `{ currentIndex, totalPhotos }` state for the overlay. This is independent of `useDisplaySync` — no changes to `SlideshowView` or the `useDisplaySync` public API.

---

## Files Changed

### 1. `app/src/hooks/useDisplaySync.ts`
- `advancePhoto(photo: string, index: number, total: number)` — add `index` and `total` to the emitted `photo-advance` payload

### 2. `app/src/windows/control/ControlPanel.tsx`
- Pass `indexRef.current` and `library.photos.length` in all `advancePhoto` calls (inside `showAt`)
- Add `togglePhotoCounter` callback: toggles `displaySettings.photoCounterVisible`
- Wire `action: 'counter'` in the `display-hotkey` listener
- Add `onTogglePhotoCounter: togglePhotoCounter` to `useHotkeys`

### 3. `app/src/windows/display/DisplayWindow.tsx`
- Add `useState<{ currentIndex: number; totalPhotos: number } | null>(null)` for counter state
- Add `listen('photo-advance', ...)` to update counter state from event payload
- Render `<PhotoCounterOverlay>` when `displaySettings.photoCounterVisible && counterState !== null`
- Add `onTogglePhotoCounter` to `useHotkeys` call
- Handle `action: 'counter'` in `display-hotkey` listener
- Add `PhotoCounterOverlay` inline component: top-center, `zIndex: 15`, `pointerEvents: none`, fixed pill style

### 4. `app/src/components/DisplaySettingsPanel.tsx`
- Add `photoCounterVisible: boolean` to `DisplaySettings` interface
- Default: `true` (read from `localStorage.getItem('pd_photo_counter_visible') !== 'false'`)
- Persist: `localStorage.setItem('pd_photo_counter_visible', String(...))`
- Emit in the existing `display-settings-changed` effect (automatic — it emits the full settings object)
- Add "Photo counter" section with a single checkbox: "Show on display"

### 5. `app/src/hooks/useHotkeys.ts`
- Add `onTogglePhotoCounter?: () => void` to `Handlers` interface
- Bind to `case 'p': case 'P':` in the switch

### 6. `app/src/components/HelpPanel.tsx`
- Add `{ key: 'P', action: 'Toggle photo counter' }` to the `HOTKEYS` array

---

## PhotoCounterOverlay Style

Fixed, not configurable:

```
position: absolute
top: 16px
left: 50%
transform: translateX(-50%)
zIndex: 15
pointerEvents: none
padding: 4px 10px
borderRadius: 999px
background: rgba(0,0,0,0.45)
color: #fff
fontFamily: monospace
fontSize: 13px
letterSpacing: 0.5px
backdropFilter: blur(2px)
```

Text: `photo {currentIndex + 1}/{totalPhotos}`

---

## Settings Persistence

| Key | Type | Default |
|-----|------|---------|
| `pd_photo_counter_visible` | boolean string | `'true'` |

Read default: `localStorage.getItem('pd_photo_counter_visible') !== 'false'` (truthy by default)

---

## Out of Scope

- No position picker
- No font/color/size options
- No fade-in/out animation on the counter itself
