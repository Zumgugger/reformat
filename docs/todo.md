
# Reformat — Detailed TODO (V1)

Date: 2026-02-08

This is the execution checklist derived from `docs/blueprint.md` (chunks A–O) and aligned with `docs/specs.md`.

## Recurring meta tasks (do after every phase)
- [ ] Update this `docs/todo.md` (check off completed items, add notes/decisions, add any follow-up tasks discovered)
- [ ] Run full test suite (`npm test` and any additional suites added later, e.g. e2e)
- [ ] Update `README.md` (new scripts, setup steps, known limitations, platform notes)
- [ ] Commit to git (meaningful message)
- [ ] Push to GitHub

---

## Phase A — Repo scaffold + CI-like test loop
Goal: project boots, tests run, and a minimal window appears.

### A1. Project initialization
- [x] Create Electron + TypeScript project structure with separate main/renderer
- [x] Add build tooling (choose Vite + Electron build approach; keep it simple and stable)
- [x] Add `preload` script and enable `contextIsolation`
- [x] Implement minimal window creation (single BrowserWindow)

### A2. Scripts + tests
- [x] Add npm scripts: `dev`, `build`, `test`
- [x] Add Vitest and a single passing unit test to prove wiring
- [x] Ensure `npm test` passes clean on Windows

### A3. Minimal UI + theme
- [x] Minimal renderer UI placeholder text
- [x] Matrix-style base CSS (dark background, green accents, monospace) via a single stylesheet and CSS variables

### A4. Minimal bridge
- [x] Expose a single `window.reformat.ping()` via `contextBridge`
- [x] Add renderer-side test with a mocked bridge (no Node APIs in renderer)

### Acceptance
- [x] `npm run dev` launches a window
- [x] `npm test` passes

### Complete recurring tasks
- [x] Complete recurring meta tasks

### Phase A Notes (2026-02-09)
- Installed Node.js v24.13.0 LTS via nvm in WSL
- All scripts configured and working:
  - `npm test` - passes 3 unit tests
  - `npm run build` - compiles main + renderer successfully
  - `npm run dev` - available (requires display for Electron)
  - `npm run dev:simple` - added for simpler testing
- Project structure created with src/main, src/renderer, src/shared
- TypeScript configured with separate tsconfig for main and renderer
- Vite configured for renderer bundling
- Vitest configured for unit testing
- IPC bridge established with ping/pong test handler
- Matrix theme CSS implemented with green-on-black aesthetic
- README.md created with setup instructions

---

## Phase B — Shared domain + deterministic output rules (tests first)
Goal: implement pure logic early with thorough unit tests.

### B1. Shared domain types
- [ ] Create `src/shared/types.ts` with stable domain types:
	- `ImageItem`, `Transform`, `Crop`, `ResizeMode`, `ResizeSettings`, `OutputFormat`, `RunConfig`
- [ ] Ensure shared types contain only serializable values (IPC-safe)

### B2. MiB conversions and formatting
- [ ] Implement `src/shared/bytes.ts`:
	- MiB definition: `1 MiB = 1,048,576 bytes`
	- Format with 1 decimal (e.g. `2.3 MiB`)
- [ ] Add Vitest unit tests: rounding, 0 bytes, large values, edge rounding boundaries

### B3. Output folder rules (pure)
- [ ] Implement `src/shared/paths.ts` (pure function):
	- single file → Downloads root
	- batch from one source folder → `Downloads/<source-folder-name>/`
	- mixed source folders → `Downloads/Reformat/`
	- clipboard during a run → same destination as that run
- [ ] Add tests using fake paths (no OS APIs)

### B4. Output naming rules + collisions (pure)
- [ ] Implement `src/shared/naming.ts`:
	- minimal filename sanitization (Windows/macOS illegal chars)
	- always append `_reformat`
	- collision suffix: `-1`, `-2`, ...
	- injectable async `exists(path)` for testability
- [ ] Add unit tests: sanitization cases, extension preservation, collision loop behavior

### Acceptance
- [ ] Shared logic is well-covered by unit tests (focus on edge cases)

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase C — Import pipeline (files + folder drop + dedupe)
Goal: main imports paths and returns metadata-ready descriptors; renderer shows a basic list.

### C1. Supported formats + animated exclusions (tests first)
- [ ] Implement `src/shared/supportedFormats.ts`:
	- allow: jpg/jpeg/png/heic/heif/webp/tiff/bmp
	- reject: animated GIF and animated WebP (treat as unsupported)
- [ ] Unit tests for extension parsing, case-insensitivity, tricky names

### C2. De-duplication (tests first)
- [ ] Implement `src/shared/dedupe.ts`:
	- dedupe by canonicalized file path
	- return warnings count for duplicates
- [ ] Unit tests: same path twice, path normalization (Windows casing/separators)

### C3. Main: file picker
- [ ] Implement `selectFiles` using Electron dialog APIs
- [ ] Return plain file paths (no fs reads in renderer)

### C4. Main: import dropped paths (files + folder, non-recursive)
- [ ] Implement `importDroppedPaths(paths: string[])`:
	- accept files and directories
	- for a dropped folder: list immediate children only
	- filter supported extensions
	- collect warnings: unsupported items, duplicates, skipped subfolders
- [ ] Node-side tests using temp directories:
	- folder contains mix of supported + unsupported + subfolder
	- verify non-recursive behavior
	- verify warnings counts

### C5. Main: metadata extraction
- [ ] Implement `src/main/metadata.ts` using `sharp.metadata()`:
	- width/height
	- best-effort `hasAlpha`
	- file size bytes
- [ ] Integration tests that generate images via `sharp` into temp dirs:
	- one with alpha, one without
	- verify dimensions + `hasAlpha` best-effort

### C6. Renderer: list UI wiring
- [ ] Create renderer UI: “Select files…” button + drop zone
- [ ] Show bottom list with: base filename, W×H, size in MiB
- [ ] Add minimal renderer store (selection order preserved)
- [ ] Store unit tests: adding items keeps stable ordering; dedupe behavior reflected

### Acceptance
- [ ] Dropping a folder imports only supported images (non-recursive) with warning counts

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase D — Settings persistence + settings panel UI (locked during run)
Goal: settings persist across launches and can be edited when idle.

### D1. Settings schema + defaults (tests first)
- [ ] Define persisted settings schema (versioned) in `src/shared/settings.ts`
- [ ] Implement validation + defaulting + migration stubs (v0 → v1 if needed)
- [ ] Unit tests for validation/defaulting/migrations

### D2. Main: load/save settings
- [ ] Implement load/save using `app.getPath('userData')` JSON file
- [ ] Ensure save is robust (atomic write strategy if needed)
- [ ] Test main settings load/save with temp `userData` override if feasible

### D3. Renderer: settings store + UI
- [ ] Add settings panel UI controls:
	- output format dropdown (includes “Same as input”)
	- resize mode selector (default Pixels)
	- pixels mode: keep ratio toggle + driving dimension + maxSide option
	- quality slider (40..100, default 85) visible only when applicable
- [ ] Add “locked” UI flag in store (prepping for run lock)
- [ ] Unit tests: when locked, edits disabled/no-op

### Acceptance
- [ ] Relaunch preserves output format + resize settings

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase E — Worker pool + minimal export run (no crop, no target-size)
Goal: click Convert/Export runs processing for all items with concurrency 4.

### E1. Worker pool (tests first)
- [ ] Implement `src/main/processor/workerPool.ts`:
	- fixed concurrency = 4
	- cancellation token/flag support
- [ ] Unit tests:
	- asserts max in-flight tasks never exceeds 4
	- per-task failures don’t abort remaining tasks

### E2. Export pipeline v1 (pixels + percent)
- [ ] Implement `src/main/processor/pipeline.ts` using real `sharp`:
	- respect EXIF orientation (`rotate()`)
	- resize pixels/percent (keep ratio rules)
	- encode: same/jpg/png/webp/tiff/bmp
	- apply quality when applicable
	- best-effort convert to sRGB + embed profile
- [ ] Integration tests with generated images:
	- assert output dimensions
	- assert output format by reading metadata

### E3. Destination + naming + timestamps
- [ ] Implement exporter:
	- choose destination folder using shared rule
	- generate non-colliding output filename (shared naming)
	- never overwrite; always append `_reformat`
	- preserve modified timestamp best-effort
- [ ] Temp-dir tests:
	- collision behavior produces `-1`, `-2`...
	- timestamp preservation best-effort (platform-tolerant assertions)

### E4. IPC: start run + progress events
- [ ] Implement IPC `startRun(config, items)` with locked settings snapshot
- [ ] Implement `onRunEvent` to emit per-file status/progress + summary warnings
- [ ] Ensure per-file failure is recorded and run continues

### E5. Renderer: Convert/Export UX
- [ ] Add Convert/Export button
- [ ] Bottom list shows per-file status + overall progress
- [ ] Lock settings + lock preview switching during run
- [ ] After run: auto-open output folder (via IPC)

### Acceptance
- [ ] Batch runs 4 at a time, skips failures, shows summary count

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase F — Cancel behavior
Goal: cancel stops remaining work and keeps already-exported files.

### F1. Main cancellation
- [ ] Add cancel token/abort flag plumbing end-to-end
- [ ] IPC `cancelRun(runId)` flips flag
- [ ] Workers check cancellation between tasks; do not delete already-exported outputs

### F2. Renderer cancel UX
- [ ] Add Cancel button
- [ ] Add Esc shortcut
- [ ] Confirmation dialog: “Cancel remaining items?”
- [ ] Mark remaining items as “Canceled” or “Skipped” consistently

### F3. Tests
- [ ] Worker pool cancellation test (stops scheduling remaining tasks)
- [ ] Renderer store tests for cancel flow + status transitions

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase G — Preview rendering + rotate/flip
Goal: preview shows active image; rotate/flip stored per item and used in export.

### G1. Main: preview transport
- [ ] Implement IPC `getPreview(itemId, maxSize)` returning downscaled image as data URL
- [ ] Prefer PNG/JPG output; keep payload size bounded
- [ ] Test preview generation with sharp on a generated image

### G2. Renderer: preview UI
- [ ] Add preview panel displaying preview + basic metadata
- [ ] Add rotate/flip buttons
- [ ] Store per-item transient transform state
- [ ] Ensure transforms are included in run config per item

### G3. Tests
- [ ] Transform math unit tests
- [ ] Store tests: transforms apply to correct item

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase H — Crop UI (single image) + crop in export pipeline
Goal: user crops in preview; export respects crop.

### H1. Renderer: crop overlay
- [ ] Add ratio preset dropdown: Original, Free, 1:1, 4:5, 3:4, 9:16, 16:9, 2:3, 3:2
- [ ] Initialize centered crop matching selected ratio
- [ ] Draw rule-of-thirds grid
- [ ] Store crop rectangle in normalized coordinates (0..1)

### H2. Crop conversion math (tests first)
- [ ] Implement utilities to convert normalized crop → pixel crop
- [ ] Account for current transform orientation when converting
- [ ] Unit tests: bounds, ratio enforcement, orientation cases

### H3. Main pipeline: apply crop
- [ ] Apply crop before resize
- [ ] Ensure keep-ratio enforcement uses post-crop ratio
- [ ] Integration test with synthetic quadrant-color image to validate crop region

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase I — Batch crop queue workflow
Goal: when crop enabled with multiple files, enforce one-by-one crop & export; no Back.

### I1. Define “crop enabled”
- [ ] Decide and implement rule: crop enabled when user toggles crop OR rect differs from full image
- [ ] Ensure rule is stable and testable

### I2. Queue UX
- [ ] When Convert/Export with N>1 and crop enabled:
	- enter queue mode
	- show index (e.g., 2/10)
	- single action: “Apply crop & export”
	- auto-advance to next item
	- no Back
- [ ] Cancel stops remaining queue
- [ ] Queue order matches selection order
- [ ] Rotate/flip resets per item when advancing

### I3. Tests
- [ ] Store tests: queue advancement + cancellation + ordering

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase J — 100% detail preview (lens)
Goal: show 1:1 pixel region controlled by a draggable lens.

### J1. Renderer lens UI
- [ ] Add lens rectangle overlay on main preview (draggable, clamped)
- [ ] Add right-side detail preview area sized to match main preview area

### J2. Main: detail preview generation
- [ ] Implement IPC that returns cropped 1:1 region as PNG data URL
- [ ] Avoid scaling above 1:1

### J3. Tests
- [ ] Unit tests for lens coordinate conversions (screen → normalized → pixel crop)

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase K — Target size mode (MiB) + estimates
Goal: target size via iterative downscale within ±10% tolerance, min 48×48; show estimates.

### K1. Deterministic core algorithm (tests first)
- [ ] Implement `targetSize` core with mocked “encode size” function
- [ ] Algorithm behavior:
	- fixed quality for lossy formats
	- downscale until within ±10% or min 48×48
	- warn if target not reachable
- [ ] Unit tests: success within tolerance, unreachable target, min-size stop

### K2. Integrate with sharp
- [ ] Connect algorithm to real `sharp` encode loop
- [ ] Integration test on generated image for a lossy format

### K3. Estimates UI
- [ ] Implement best-effort estimates:
	- estimated output pixel dimensions from target MiB
	- estimated file size from current settings
- [ ] Show estimates in settings panel for active item
- [ ] Show per-file estimated output MiB in bottom list

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase L — Clipboard paste
Goal: Ctrl+V/Cmd+V imports clipboard image; replace when idle, append when running.

### L1. Main clipboard import
- [ ] Implement `pasteFromClipboard(mode)`:
	- read clipboard image
	- if empty, return none
	- convert to PNG buffer and create `ImageItem` with source `clipboard`
	- naming uses `clipboard_reformat` rules

### L2. Renderer behavior
- [ ] When idle: paste replaces current list
- [ ] When running: paste appends to queue (processed with locked settings)

### L3. Tests
- [ ] Clipboard logic tests via abstraction/mocking (no real clipboard in CI)
- [ ] Store tests: replace vs append behavior

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase M — Drag-out export (move semantics)
Goal: drag exported files out of app; best-effort move semantics; collision prompts.

### M1. Renderer drag enablement
- [ ] Enable drag only for rows with exported paths

### M2. Main drag handling
- [ ] Use Electron drag APIs to start drag with file path(s)
- [ ] Decide best-effort approach for move semantics (platform limitations noted)

### M3. Collision prompt UI
- [ ] Implement prompt choices: Overwrite / Overwrite all / Rename / Cancel
- [ ] Keep UI minimal (no new flows)

### M4. Tests (as feasible)
- [ ] Unit test collision decision logic
- [ ] Manual smoke test drag-out on Windows/macOS

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase N — Hardening: offline-only enforcement + cleanup
Goal: block outbound network, disable navigation/new windows, ensure temp cleanup.

### N1. Offline enforcement
- [ ] Block `http:`, `https:`, `ws:`, `wss:` via Electron session webRequest
- [ ] Disable navigation and new windows
- [ ] Prefer denying network APIs where possible

### N2. Tests
- [ ] Unit test URL-blocking predicate (allow file/app URLs, deny network schemes)

### N3. Temp files cleanup
- [ ] Audit any temp file usage
- [ ] Ensure temp files (if any) are deleted promptly and on shutdown

### Complete recurring tasks
- [ ] Complete recurring meta tasks

---

## Phase O — Packaging (Windows installer + macOS dmg) + About
Goal: ship installers, bundle sharp correctly, show About info.

### O1. electron-builder config
- [ ] Configure electron-builder:
	- Windows: NSIS installer
	- macOS: dmg with app bundle
- [ ] Verify `sharp` native modules bundle correctly per target

### O2. About UI/menu
- [ ] Add minimal About menu/area
- [ ] Show: app name, version, build date (no website link)

### O3. Release verification
- [ ] Build artifacts on Windows
- [ ] Build artifacts on macOS
- [ ] Smoke test: app runs offline, imports, exports to Downloads

### Complete recurring tasks
- [ ] Complete recurring meta tasks

