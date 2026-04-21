# Deferred Architectural Changes

Items skipped during simplify pass — require larger refactors. Decide before next major release.

---

## 1. `src-tauri/src/window_manager.rs` — Multiple file reads per operation

> **Resolved:** 2026-04-20 — `snapshot_window_state` now returns the `DisplayState` it writes; callers reuse it instead of calling `load_state_file` again.

**What:** Window manager reads config/state files multiple times per request instead of loading once and passing around.

**Impact:**
- Extra disk I/O on every window operation
- TOCTOU risk: file content can change between reads in same logical operation
- Fix: load file once, pass parsed struct to sub-functions

**Effort:** Medium — touches internal Rust function signatures, no IPC surface change.

---

## 2. `src-tauri/src/audio.rs` — PCM event batching

**What:** Audio hook emits one Tauri event per PCM sample chunk. High-frequency emissions flood the event bus.

**Impact:**
- CPU overhead from event serialization per chunk
- Frontend event handler fires too frequently, causes excess re-renders in visualizer
- Fix: batch N chunks into one event, or throttle emit to ~60fps cadence

**Effort:** Medium — Rust side batching logic + frontend consumer update. Risk: visualizer smoothness if batch size wrong.

---

## 3. `app/src/hooks/useDisplayWindow.ts` — Raw setter exposure

> **Resolved:** 2026-04-20 — `setSelectedMonitor`/`setFullscreen` raw dispatchers wrapped in typed `useCallback` actions; `selectMonitor` exported by name.

**What:** Hook exposes raw internal setState or direct ref setters through its return value, leaking implementation details to consumers.

**Impact:**
- Consumers can mutate state in ways the hook doesn't expect
- Makes future refactor of hook internals a breaking change
- Fix: expose only typed action functions, hide setters behind named callbacks

**Effort:** Low-Medium — audit all call sites in ControlPanel + DisplayWindow, replace raw setter calls with named actions.

---

## 4. `app/src/hooks/useLocalPlayer.ts` — `shuffleOn` state consolidation

> **Resolved:** 2026-04-20 — `shuffleOn` removed; `PlayerState.shuffle` is now the single source of truth, initialized from localStorage and toggled via `setState`.

**What:** Shuffle state lives in a separate `useState` (`shuffleOn`) alongside the main `PlayerState` object which also has a `shuffle` field. Two sources of truth — hook merges them on return.

**Impact:**
- Confusing: `state.shuffle` (from PlayerState) vs `shuffleOn` (local state) serve same purpose
- Bug surface: if merge logic drifts, consumers get stale value
- Fix: fold `shuffleOn` into main `PlayerState` object, remove the separate useState

**Effort:** Medium — need to audit all `setState` calls that spread `...s` to ensure shuffle isn't clobbered.

---

## 5. `app/src/hooks/useHotkeys.ts` — Parameter sprawl

> **Resolved:** Already done — hook accepts a typed `Handlers` config object; call site passes an object literal. No changes needed.

**What:** Hook accepts many individual props/params instead of a config object. New keybindings require adding new parameters.

**Impact:**
- Function signature grows with every new hotkey
- All call sites need updating when signature changes
- Fix: group params into a typed config object `{ onPlay, onNext, onPrev, onVolUp, ... }`

**Effort:** Low — pure refactor, no logic change. All call sites (likely just ControlPanel) need update.

---

## Priority Suggestion

| # | Item | Risk | Effort | Recommend |
|---|------|------|--------|-----------|
| 4 | shuffleOn consolidation | Medium (bug surface) | Medium | Do soon |
| 3 | useDisplayWindow setter exposure | Low | Low | Do soon |
| 5 | useHotkeys param sprawl | Low | Low | Do with next hotkey addition |
| 2 | PCM event batching | High (perf) | Medium | Do if visualizer lags reported |
| 1 | window_manager multi-read | Low (desktop app) | Medium | Do if startup perf matters |
