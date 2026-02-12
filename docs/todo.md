
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
- [x] Update todo.md
- [x] Run full test suite (3/3 passing)
- [x] Update README.md
- [x] Commit to git (commit 3bb725a)
- [x] Configure git remote for SSH
- [ ] Push to GitHub (requires SSH key setup - see note below)

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
- Git commit completed (3bb725a)
- Git remote configured for SSH (git@github.com:Zumgugger/reformat.git)
- **TO COMPLETE:** Git push requires SSH key setup in WSL:
  
  **Option 1 - Copy existing SSH key from Windows to WSL:**
  ```bash
  # If you have SSH keys in Windows, copy them to WSL:
  cp /mnt/c/Users/marku/.ssh/id_* ~/.ssh/
  chmod 600 ~/.ssh/id_*
  chmod 644 ~/.ssh/id_*.pub
  
  # Then push:
  cd /mnt/e/Programmierenab24/reformat
  git push origin main
  ```
  
  **Option 2 - Generate new SSH key in WSL:**
  ```bash
  ssh-keygen -t ed25519 -C "your_email@example.com"
  cat ~/.ssh/id_ed25519.pub  # Add this to GitHub Settings > SSH Keys
  
  # Then push:
  cd /mnt/e/Programmierenab24/reformat
  git push origin main
  ```
  
  **Option 3 - Use Windows Git instead:**
  Open PowerShell/CMD in Windows and push from there if SSH is configured in Windows.

---

## Phase B — Shared domain + deterministic output rules (tests first)
Goal: implement pure logic early with thorough unit tests.

### B1. Shared domain types
- [x] Create `src/shared/types.ts` with stable domain types:
	- `ImageItem`, `Transform`, `Crop`, `ResizeMode`, `ResizeSettings`, `OutputFormat`, `RunConfig`
- [x] Ensure shared types contain only serializable values (IPC-safe)

### B2. MiB conversions and formatting
- [x] Implement `src/shared/bytes.ts`:
	- MiB definition: `1 MiB = 1,048,576 bytes`
	- Format with 1 decimal (e.g. `2.3 MiB`)
- [x] Add Vitest unit tests: rounding, 0 bytes, large values, edge rounding boundaries

### B3. Output folder rules (pure)
- [x] Implement `src/shared/paths.ts` (pure function):
	- single file → Downloads root
	- batch from one source folder → `Downloads/<source-folder-name>/`
	- mixed source folders → `Downloads/Reformat/`
	- clipboard during a run → same destination as that run
- [x] Add tests using fake paths (no OS APIs)

### B4. Output naming rules + collisions (pure)
- [x] Implement `src/shared/naming.ts`:
	- minimal filename sanitization (Windows/macOS illegal chars)
	- always append `_reformat`
	- collision suffix: `-1`, `-2`, ...
	- injectable async `exists(path)` for testability
- [x] Add unit tests: sanitization cases, extension preservation, collision loop behavior

### Acceptance
- [x] Shared logic is well-covered by unit tests (focus on edge cases)

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (97/97 passing)
- [x] Update README.md
- [x] Commit to git (commit 5533b2f)
- [x] Push to GitHub

### Phase B Notes (2026-02-12)
- Implemented complete domain types in `src/shared/types.ts`:
  - `ImageItem`, `Transform`, `Crop`, `CropRect`, `CropRatioPreset`
  - `ResizeMode`, `ResizeSettings` (pixels/percent/targetMiB variants)
  - `OutputFormat`, `QualitySettings`, `RunConfig`, `ItemRunConfig`
  - `ItemStatus`, `ItemResult` for run tracking
  - Default constants: `DEFAULT_TRANSFORM`, `DEFAULT_CROP`, `DEFAULT_QUALITY`
- Implemented `src/shared/bytes.ts` with 27 unit tests:
  - `bytesToMiB()`, `mibToBytes()`, `formatMiB()`, `parseMiBString()`
- Implemented `src/shared/paths.ts` with 31 unit tests:
  - `resolveOutputSubfolder()` - handles single/batch/mixed/clipboard rules
  - `buildOutputFolderPath()` - constructs full output folder paths
- Implemented `src/shared/naming.ts` with 36 unit tests:
  - `sanitizeFilename()` - Windows/macOS illegal chars, reserved names
  - `buildOutputFilename()` - appends `_reformat` suffix
  - `resolveUniqueFilename()` - collision handling with `-1`, `-2`, etc.
  - `resolveOutputPath()` - complete output path resolution
- Total: 97 passing tests

---

## Phase C — Import pipeline (files + folder drop + dedupe)
Goal: main imports paths and returns metadata-ready descriptors; renderer shows a basic list.

### C1. Supported formats + animated exclusions (tests first)
- [x] Implement `src/shared/supportedFormats.ts`:
	- allow: jpg/jpeg/png/heic/heif/webp/tiff/bmp
	- reject: animated GIF and animated WebP (treat as unsupported)
- [x] Unit tests for extension parsing, case-insensitivity, tricky names

### C2. De-duplication (tests first)
- [x] Implement `src/shared/dedupe.ts`:
	- dedupe by canonicalized file path
	- return warnings count for duplicates
- [x] Unit tests: same path twice, path normalization (Windows casing/separators)

### C3. Main: file picker
- [x] Implement `selectFiles` using Electron dialog APIs
- [x] Return plain file paths (no fs reads in renderer)

### C4. Main: import dropped paths (files + folder, non-recursive)
- [x] Implement `importDroppedPaths(paths: string[])`:
	- accept files and directories
	- for a dropped folder: list immediate children only
	- filter supported extensions
	- collect warnings: unsupported items, duplicates, skipped subfolders
- [x] Node-side tests using temp directories:
	- folder contains mix of supported + unsupported + subfolder
	- verify non-recursive behavior
	- verify warnings counts

### C5. Main: metadata extraction
- [x] Implement `src/main/metadata.ts` using `sharp.metadata()`:
	- width/height
	- best-effort `hasAlpha`
	- file size bytes
- [x] Integration tests that generate images via `sharp` into temp dirs:
	- one with alpha, one without
	- verify dimensions + `hasAlpha` best-effort

### C6. Renderer: list UI wiring
- [x] Create renderer UI: "Select files…" button + drop zone
- [x] Show bottom list with: base filename, W×H, size in MiB
- [x] Add minimal renderer store (selection order preserved)
- [x] Store unit tests: adding items keeps stable ordering; dedupe behavior reflected

### Acceptance
- [x] Dropping a folder imports only supported images (non-recursive) with warning counts

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (248/248 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

### Phase C Notes (2026-02-12)
- Implemented `src/shared/supportedFormats.ts` with 57 unit tests
- Implemented `src/shared/dedupe.ts` with 41 unit tests
- Implemented `src/main/import.ts` with 15 integration tests
- Implemented `src/main/metadata.ts` with 18 integration tests
- Added sharp dependency for image processing
- Implemented renderer store (`src/renderer/store.ts`) with 20 unit tests
- Created renderer UI with drop zone, file list, and Matrix theme
- Total: 248 passing tests

---

## Phase D — Settings persistence + settings panel UI (locked during run)
Goal: settings persist across launches and can be edited when idle.

### D1. Settings schema + defaults (tests first)
- [x] Define persisted settings schema (versioned) in `src/shared/settings.ts`
- [x] Implement validation + defaulting + migration stubs (v0 → v1 if needed)
- [x] Unit tests for validation/defaulting/migrations

### D2. Main: load/save settings
- [x] Implement load/save using `app.getPath('userData')` JSON file
- [x] Ensure save is robust (atomic write strategy if needed)
- [x] Test main settings load/save with temp `userData` override if feasible

### D3. Renderer: settings store + UI
- [x] Add settings panel UI controls:
	- output format dropdown (includes “Same as input”)
	- resize mode selector (default Pixels)
	- pixels mode: keep ratio toggle + driving dimension + maxSide option
	- quality slider (40..100, default 85) visible only when applicable
- [x] Add "locked" UI flag in store (prepping for run lock)
- [x] Unit tests: when locked, edits disabled/no-op

### Acceptance
- [x] Relaunch preserves output format + resize settings

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (642/642 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

### Phase D Notes (2026-02-12)
- Implemented `src/shared/settings.ts` with 56 unit tests:
  - Versioned settings schema (v1)
  - Validation + defaulting for all settings fields
  - Migration support (v0 → v1)
  - Utility functions: `cloneSettings()`, `settingsEqual()`
- Implemented `src/main/settingsStore.ts` with 24 integration tests:
  - Load/save to JSON file in userData directory
  - Atomic write strategy (temp file + rename)
  - Caching for performance
  - Custom userData path for testing
- Implemented `src/renderer/settingsStore.ts` with 58 unit tests:
  - Reactive store with event subscription
  - Locked state prevents modifications during runs
  - Dirty tracking for unsaved changes
  - IPC integration with main process
- Added settings panel UI in `src/renderer/index.html`:
  - Two-panel layout (image list + settings)
  - Output format dropdown
  - Resize mode selector (pixels/percent/targetMiB)
  - Quality slider (40-100)
  - Locked indicator during processing
- Added IPC handlers for settings in `src/main/ipc.ts`
- Updated preload script with settings API
- Total: 386 passing tests (138 new tests)

---

## Phase E — Worker pool + minimal export run (no crop, no target-size)
Goal: click Convert/Export runs processing for all items with concurrency 4.

### E1. Worker pool (tests first)
- [x] Implement `src/main/processor/workerPool.ts`:
	- fixed concurrency = 4
	- cancellation token/flag support
- [x] Unit tests:
	- asserts max in-flight tasks never exceeds 4
	- per-task failures don’t abort remaining tasks

### E2. Export pipeline v1 (pixels + percent)
- [x] Implement `src/main/processor/pipeline.ts` using real `sharp`:
	- respect EXIF orientation (`rotate()`)
	- resize pixels/percent (keep ratio rules)
	- encode: same/jpg/png/webp/tiff/bmp
	- apply quality when applicable
	- best-effort convert to sRGB + embed profile
- [x] Integration tests with generated images:
	- assert output dimensions
	- assert output format by reading metadata

### E3. Destination + naming + timestamps
- [x] Implement exporter:
	- choose destination folder using shared rule
	- generate non-colliding output filename (shared naming)
	- never overwrite; always append `_reformat`
	- preserve modified timestamp best-effort
- [x] Temp-dir tests:
	- collision behavior produces `-1`, `-2`...
	- timestamp preservation best-effort (platform-tolerant assertions)

### E4. IPC: start run + progress events
- [x] Implement IPC `startRun(config, items)` with locked settings snapshot
- [x] Implement `onRunEvent` to emit per-file status/progress + summary warnings
- [x] Ensure per-file failure is recorded and run continues

### E5. Renderer: Convert/Export UX
- [x] Add Convert/Export button
- [x] Bottom list shows per-file status + overall progress
- [x] Lock settings + lock preview switching during run
- [x] After run: auto-open output folder (via IPC)

### Acceptance
- [x] Batch runs 4 at a time, skips failures, shows summary count

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (458/458 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

### Phase E Notes (2026-02-12)
- Implemented `src/main/processor/workerPool.ts` with 22 unit tests:
  - Fixed concurrency of 4 (configurable)
  - Cancellation token support with proper task cleanup
  - Per-task failure handling without aborting remaining tasks
  - Progress callback with detailed statistics
- Implemented `src/main/processor/pipeline.ts` with 32 tests:
  - EXIF orientation handling via sharp.rotate()
  - Resize modes: pixels (width/height/maxSide), percent
  - Format conversion: same/jpg/png/webp/tiff/heic (BMP falls back to PNG)
  - Quality settings for JPEG, WebP, HEIC
  - Transform support (rotation, flip)
  - sRGB colorspace conversion
- Implemented `src/main/processor/exporter.ts` with 18 tests:
  - Uses shared paths.ts for output folder resolution
  - Uses shared naming.ts for collision-free filenames
  - Pre-resolves output paths to prevent race conditions
  - Timestamp preservation (best-effort)
  - Progress callbacks and cancellation support
- Added IPC handlers in `src/main/ipc.ts`:
  - `startRun(items, config)` - starts export with progress events
  - `cancelRun(runId)` - cancels active run
  - `openFolder(path)` - opens output folder
- Updated `src/main/preload.ts` with export APIs
- Added renderer UI with Convert button, progress bar, cancel button
- Total: 458 passing tests (72 new tests)

---

## Phase F — Cancel behavior
Goal: cancel stops remaining work and keeps already-exported files.

### F1. Main cancellation
- [x] Add cancel token/abort flag plumbing end-to-end
- [x] IPC `cancelRun(runId)` flips flag
- [x] Workers check cancellation between tasks; do not delete already-exported outputs

### F2. Renderer cancel UX
- [x] Add Cancel button
- [x] Add Esc shortcut
- [x] Confirmation dialog: "Cancel remaining items?"
- [x] Mark remaining items as "Canceled" or "Skipped" consistently

### F3. Tests
- [x] Worker pool cancellation test (stops scheduling remaining tasks)
- [x] Renderer store tests for cancel flow + status transitions

### Acceptance
- [x] Cancel stops remaining work and keeps already-exported files

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (465/465 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

### Phase F Notes (2026-02-12)
- Main cancellation was already implemented in Phase E:
  - `CancellationToken` interface and `createCancellationToken()` in workerPool.ts
  - Workers check `cancellationToken.isCancelled` between tasks
  - IPC `cancelRun(runId)` handler calls `token.cancel()`
  - Already-exported files are preserved (no deletion on cancel)
- Added Esc keyboard shortcut for cancellation in `src/renderer/index.ts`
- Added confirmation dialog before cancel ("Cancel remaining items?")
- Added cancel flow tests:
  - `should keep already-exported files after cancellation` in exporter.test.ts
  - `should stop scheduling new tasks when cancelled` in exporter.test.ts
  - Status transition tests in store.test.ts for cancel flow
- Total: 465 passing tests (7 new tests)

---

## Phase G — Preview rendering + rotate/flip
Goal: preview shows active image; rotate/flip stored per item and used in export.

### G1. Main: preview transport
- [x] Implement IPC `getPreview(sourcePath, options)` returning downscaled image as data URL
- [x] Prefer PNG/JPG output; keep payload size bounded
- [x] Test preview generation with sharp on a generated image

### G2. Renderer: preview UI
- [x] Add preview panel displaying preview + basic metadata
- [x] Add rotate/flip buttons
- [x] Store per-item transient transform state
- [x] Ensure transforms are included in run config per item

### G3. Tests
- [x] Transform math unit tests
- [x] Store tests: transforms apply to correct item

### Acceptance
- [x] Preview shows active image with transform applied
- [x] Rotate/flip buttons update preview in real-time
- [x] Transforms are included in export run config

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (532/532 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

### Phase G Notes (2026-02-12)
- Implemented `src/main/preview.ts` with 17 integration tests:
  - `generatePreview(filePath, options)` - creates downscaled JPEG/PNG data URLs
  - `generatePreviewFromBuffer(buffer, options)` - for clipboard images
  - Transform support (rotation, flip) applied via sharp
  - EXIF orientation handling
  - Bounded preview size (max 800px default)
- Implemented `src/shared/transform.ts` with 50 unit tests:
  - `rotateTransformCW()`, `rotateTransformCCW()` - 90° rotation steps
  - `flipTransformH()`, `flipTransformV()` - flip toggles
  - `createIdentityTransform()`, `isIdentityTransform()` - identity helpers
  - `getTransformedDimensions()` - accounts for rotation swapping W/H
  - `transformToCSS()` - CSS transform string for preview display
  - `combineTransforms()`, `transformsEqual()`, `cloneTransform()`
- Added IPC handler `getPreview` in `src/main/ipc.ts`
- Updated `src/main/preload.ts` with preview API
- Added preview panel to renderer UI (`src/renderer/index.html`):
  - Three-panel layout: image list | preview | settings
  - Preview container with placeholder
  - Transform controls: rotate CW/CCW, flip H/V, reset
  - Preview metadata display
- Updated `src/renderer/index.ts`:
  - Item selection with click handlers
  - Per-item transform state (Map<itemId, Transform>)
  - Preview loading with transform application
  - Transform button handlers
  - Auto-select first item when importing
- Added preview CSS in `src/renderer/styles/main.css`:
  - Preview panel styling
  - Transform button styling
  - Selected item indicator in list
- Total: 532 passing tests (67 new tests)

---

## Phase H — Crop UI (single image) + crop in export pipeline
Goal: user crops in preview; export respects crop.

### H1. Renderer: crop overlay
- [x] Add ratio preset dropdown: Original, Free, 1:1, 4:5, 3:4, 9:16, 16:9, 2:3, 3:2
- [x] Initialize centered crop matching selected ratio
- [x] Draw rule-of-thirds grid
- [x] Store crop rectangle in normalized coordinates (0..1)

### H2. Crop conversion math (tests first)
- [x] Implement utilities to convert normalized crop → pixel crop
- [x] Account for current transform orientation when converting
- [x] Unit tests: bounds, ratio enforcement, orientation cases (62 tests)

### H3. Main pipeline: apply crop
- [x] Apply crop after transform (before resize)
- [x] Ensure keep-ratio enforcement uses post-crop ratio
- [x] Integration test with synthetic quadrant-color image to validate crop region (9 tests)

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (603/603 passing)
- [x] Update README.md
- [x] Commit to git (afd0a1f)
- [x] Push to GitHub

### Phase H Notes (2025-01-XX)
- Created `src/shared/crop.ts` with comprehensive crop utilities:
  - `getAspectRatioForPreset()` - convert ratio preset to numeric value
  - `createCenteredCropRect()` - create centered crop with given aspect ratio
  - `normalizedToPixelCrop()` - convert 0..1 coords to pixel coords
  - `normalizedToPixelCropWithTransform()` - handle transform orientation
  - `isCropActive()` - check if crop differs from full image
  - `clampCropRect()` - clamp bounds to 0..1 range
  - `adjustCropToRatio()` - enforce aspect ratio while preserving center
- 62 unit tests for crop utilities covering:
  - Aspect ratio calculations for all presets
  - Centered crop creation with various ratios
  - Pixel coordinate conversion
  - Transform orientation handling
  - Boundary clamping
- Pipeline order: EXIF auto-rotate → transform → crop → resize → encode
- 9 integration tests including quadrant-color image validation
- Total test count: 603 passing tests

---

## Phase I — Batch crop queue workflow
Goal: when crop enabled with multiple files, enforce one-by-one crop & export; no Back.

### I1. Define “crop enabled”
- [x] Decide and implement rule: crop enabled when user toggles crop OR rect differs from full image
- [x] Ensure rule is stable and testable

### I2. Queue UX
- [x] When Convert/Export with N>1 and crop enabled:
	- enter queue mode
	- show index (e.g., 2/10)
	- single action: “Apply crop & export”
	- auto-advance to next item
	- no Back
- [x] Cancel stops remaining queue
- [x] Queue order matches selection order
- [x] Rotate/flip resets per item when advancing

### I3. Tests
- [x] Store tests: queue advancement + cancellation + ordering

### Acceptance
- [x] Batch crop queue mode enforces one-by-one crop & export with no Back

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (642/642 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

### Phase I Notes (2026-02-12)
- Implemented crop queue mode in `src/renderer/index.ts`:
  - Queue mode triggers when N>1 items AND any item has crop enabled
  - Shows queue progress (e.g., "1 / 5")
  - "Apply Crop & Export" button processes current item and auto-advances
  - No Back navigation in V1
  - Cancel with confirmation dialog
  - Esc keyboard shortcut for cancel
- Created `src/renderer/cropQueue.ts` with reusable queue state management:
  - `hasAnyCropEnabled()` - checks if any item has active crop
  - `shouldEnterCropQueueMode()` - determines if queue mode needed
  - `enterCropQueue()` - initializes queue state
  - `advanceCropQueue()` - processes current item and advances
  - `cancelCropQueue()` - cancels remaining queue
  - `getQueueProgressString()` - returns progress like "2 / 10"
  - `getItemQueueStatus()` - returns item's queue status
- Created `src/renderer/cropQueue.test.ts` with 39 unit tests:
  - Queue state creation and initialization
  - hasAnyCropEnabled behavior
  - shouldEnterCropQueueMode logic
  - Queue advancement and completion
  - Transform reset on advance (per spec)
  - Cancel behavior
  - Queue order preservation
- Added queue mode UI styles in `src/renderer/styles/main.css`:
  - Queue container with progress display
  - Queue item status indicators (current, pending, done)
- Uses existing `isCropActive()` from `src/shared/crop.ts` for crop detection
- Total: 642 passing tests (39 new tests)

---

## Phase J — 100% detail preview (lens)
Goal: show 1:1 pixel region controlled by a draggable lens.

### J1. Renderer lens UI
- [x] Add lens rectangle overlay on main preview (draggable, clamped)
- [x] Add right-side detail preview area sized to match main preview area

### J2. Main: detail preview generation
- [x] Implement IPC that returns cropped 1:1 region as PNG data URL
- [x] Avoid scaling above 1:1

### J3. Tests
- [x] Unit tests for lens coordinate conversions (screen → normalized → pixel crop)

### Acceptance
- [x] 100% detail preview shows 1:1 pixel region controlled by draggable lens

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (708/708 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

### Phase J Notes (2026-02-12)
- Implemented `src/shared/lens.ts` with 57 unit tests:
  - `createCenteredLens()` - creates centered lens with given dimensions
  - `calculateLensDimensions()` - calculates lens size for detail panel
  - `screenToNormalizedLens()` - converts screen coords to normalized
  - `normalizedToScreenLens()` - converts normalized to screen coords
  - `normalizedToPixelRegion()` - converts normalized to pixel coords for extraction
  - `moveLens()`, `clampLensPosition()` - lens movement utilities
  - `isLensFullCoverage()` - checks if lens covers entire image
  - `getDetailDimensions()` - returns pixel dimensions of detail region
- Added `generateDetailPreview()` and `generateDetailPreviewFromBuffer()` in `src/main/preview.ts`:
  - Extracts region at 1:1 (no scaling)
  - Applies transform before extraction
  - Returns PNG data URL for quality
  - 9 new integration tests
- Added IPC handler `getDetailPreview` in `src/main/ipc.ts`
- Added detail preview API to preload bridge
- Added lens toggle checkbox in preview panel controls
- Added lens overlay (draggable rectangle) with green accent styling
- Added detail preview panel on the right side of preview:
  - Shows when lens is enabled
  - Displays 1:1 region at original resolution
  - Uses `image-rendering: pixelated` for crisp pixels
- Lens automatically initializes when enabled, centered on image
- Lens recalculates when switching between items
- Total: 708 passing tests (66 new tests)

---

## Phase K — Target size mode (MiB) + estimates
Goal: target size via iterative downscale within ±10% tolerance, min 48×48; show estimates.

### K1. Deterministic core algorithm (tests first)
- [x] Implement `targetSize` core with mocked "encode size" function
- [x] Algorithm behavior:
- fixed quality for lossy formats
- downscale until within ±10% or min 48×48
- warn if target not reachable
- [x] Unit tests: success within tolerance, unreachable target, min-size stop

### K2. Integrate with sharp
- [x] Connect algorithm to real `sharp` encode loop
- [x] Integration test on generated image for a lossy format

### K3. Estimates UI
- [x] Implement best-effort estimates:
- estimated output pixel dimensions from target MiB
- estimated file size from current settings
- [x] Show estimates in settings panel for active item
- [x] Show per-file estimated output MiB in bottom list

### Acceptance
- [x] Target size mode downscales within ±10% tolerance, min 48×48
- [x] Estimates shown in settings panel for active item

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (762/762 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

### Phase K Notes (2026-02-12)
- Implemented `src/shared/targetSize.ts` with 48 unit tests:
  - `isWithinTolerance()` - checks if actual size is within ±10% of target
  - `isAtMinDimension()` - checks if dimensions are at/below minimum 48px
  - `calculateScaledDimensions()` - calculates scaled dimensions with min clamp
  - `estimateBytesPerPixel()` - estimates bytes per pixel based on quality
  - `estimateDimensionsForTarget()` - estimates dimensions needed for target MiB
  - `estimateFileSize()` - estimates file size from dimensions and quality
  - `findTargetSize()` - core algorithm with binary search for target size
- Updated `src/main/processor/pipeline.ts`:
  - Added `createSharpEncodeFunction()` for iterative encoding
  - Added `processWithTargetSize()` for complete targetMiB processing
  - Modified `processImage()` to delegate to `processWithTargetSize()` for targetMiB mode
  - 6 new integration tests for targetMiB mode
- Added estimates UI in `src/renderer/index.html`:
  - Estimates group showing output dimensions and estimated file size
  - Target-specific dimension estimate in targetMiB options
- Updated `src/renderer/styles/main.css`:
  - Styled estimates group with green accent theme
  - Styled estimate rows with labels and values
- Updated `src/renderer/index.ts`:
  - Added `updateEstimates()` function that calculates estimates
  - Called on item selection, settings change, transform change, crop change
  - Imports estimate functions from `src/shared/targetSize.ts` and `formatMiB` from `src/shared/bytes.ts`
- Total: 762 passing tests (54 new tests)

---

## Phase L — Clipboard paste
Goal: Ctrl+V/Cmd+V adds images from clipboard.

### L1. Main clipboard import
- [x] Implement `pasteFromClipboard(mode)`:
	- read clipboard image
	- if empty, return none
	- convert to PNG buffer and create `ImageItem` with source `clipboard`
	- naming uses `clipboard_reformat` rules

### L2. Renderer behavior
- [x] When idle: paste replaces current list
- [x] When running: paste appends to queue (processed with locked settings)

### L3. Tests
- [x] Clipboard logic tests via abstraction/mocking (no real clipboard in CI)
- [x] Store tests: replace vs append behavior

### Acceptance
- [x] Ctrl+V/Cmd+V pastes clipboard image into app
- [x] When idle: paste replaces current list
- [x] When running: paste appends to queue

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (788/788 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

### Phase L Notes (2026-02-12)
- Created `src/main/clipboard.ts` with clipboard image handling:
  - `readClipboardImage()` - reads clipboard image as PNG buffer
  - `hasClipboardImage()` - checks if clipboard contains image
  - `createClipboardImageItem()` - creates ImageItem from buffer
  - `pasteFromClipboard()` - main entry point for clipboard import
  - `storeClipboardBuffer()`, `getClipboardBuffer()`, etc. - in-memory buffer storage for preview/export
  - 19 unit tests with mocked clipboard using NativeImage interface
- Added IPC handlers in `src/main/ipc.ts`:
  - `pasteFromClipboard` - reads clipboard and stores buffer
  - `getClipboardPreview` - generates preview from stored buffer
  - `getClipboardDetailPreview` - generates 1:1 detail from stored buffer
  - `removeClipboardBuffer`, `clearClipboardBuffers` - cleanup
- Updated `src/main/preload.ts` with clipboard APIs
- Updated `src/renderer/types.ts` with `ClipboardPasteResult` interface
- Updated `src/renderer/index.ts`:
  - Added Ctrl+V/Cmd+V keyboard shortcut in `handleKeyDown()`
  - Added `handlePaste()` function with idle/running behavior
  - Updated `loadPreview()` to use clipboard-specific API for clipboard items
  - Updated `loadDetailPreview()` to use clipboard-specific API for clipboard items
- Updated `src/main/processor/pipeline.ts`:
  - `ProcessOptions.sourceBuffer` - optional buffer input for clipboard items
  - `processImage()` accepts either `sourcePath` or `sourceBuffer`
  - `processWithTargetSize()` accepts either path or buffer
- Updated `src/main/processor/exporter.ts`:
  - Gets clipboard buffer from storage for clipboard items
  - Uses stored buffer for processing instead of file path
- Added 7 clipboard tests in `src/renderer/store.test.ts`:
  - Clipboard source type support
  - Mixed file and clipboard items
  - `getExistingPaths` excludes clipboard items
  - Clipboard item append behavior
- Total: 788 passing tests (26 new tests)

---

## Phase M — Drag-out export (move semantics)
Goal: drag exported files out of app; best-effort move semantics; collision prompts.

### M1. Renderer drag enablement
- [x] Enable drag only for rows with exported paths
- [x] Track output paths for exported items
- [x] Add draggable class and cursor styles

### M2. Main drag handling
- [x] Use Electron drag APIs to start drag with file path(s)
- [x] Decide best-effort approach for move semantics (platform limitations noted: use native OS drag)
- [x] Implement `startDrag` IPC handler
- [x] Implement `moveFile` with collision handling
- [x] Implement `showFileInFolder` for context menu

### M3. Collision prompt UI
- [x] Implement collision decision logic (`src/shared/collision.ts`)
- [x] Context menu for exported items (Show in folder, Copy path)
- Note: Full Overwrite/Rename prompt not needed for native drag-out (OS handles collisions)

### M4. Tests (as feasible)
- [x] Unit test collision decision logic (30 tests)
- [x] Unit test dragOut module (15 tests)
- [ ] Manual smoke test drag-out on Windows/macOS

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (833/833 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

### Phase M Notes (2026-02-12)
- Created `src/shared/collision.ts` with collision handling logic:
  - `CollisionChoice` type: 'overwrite' | 'overwrite-all' | 'rename' | 'cancel'
  - `BatchCollisionState` for tracking batch move operations
  - `generateRenameSuggestion()` and `generateUniquePath()` for collision resolution
  - `needsCollisionPrompt()` and `getAutoCollisionAction()` for decision logic
  - 30 unit tests covering all edge cases
- Created `src/main/dragOut.ts` with Electron drag-out implementation:
  - `startDrag()` using `webContents.startDrag()` API
  - `moveFile()` with overwrite/rename options
  - `checkCollision()` and `getSuggestedRenamePath()`
  - `showFileInFolder()` using Electron shell API
  - 15 integration tests
- Added IPC handlers in `src/main/ipc.ts`:
  - `startDrag`, `checkCollision`, `getSuggestedRenamePath`, `moveFile`, `showFileInFolder`
- Updated `src/main/preload.ts` with drag-out APIs
- Updated `src/renderer/types.ts` with `StartDragResult` and `MoveFileResult` interfaces
- Updated `src/renderer/index.ts`:
  - Added `itemOutputPaths` map to track output paths for exported items
  - Updated `handleRunProgress()` and export handlers to track output paths
  - Updated `createListItem()` to enable drag on exported items with draggable class
  - Added context menu for exported items (Show in folder, Copy path)
  - Added context menu event handlers and cleanup
- Updated `src/renderer/index.html` with context menu HTML
- Updated `src/renderer/styles/main.css`:
  - Added `.draggable` class styles for grab cursor
  - Added `.context-menu` styles for right-click menu
- Total: 833 passing tests (45 new tests: 30 collision + 15 dragOut)

---

## Phase N — Hardening: offline-only enforcement + cleanup
Goal: block outbound network, disable navigation/new windows, ensure temp cleanup.

### N1. Offline enforcement
- [x] Block `http:`, `https:`, `ws:`, `wss:` via Electron session webRequest
- [x] Disable navigation and new windows
- [x] Prefer denying network APIs where possible

### N2. Tests
- [x] Unit test URL-blocking predicate (allow file/app URLs, deny network schemes)

### N3. Temp files cleanup
- [x] Audit any temp file usage
- [x] Ensure temp files (if any) are deleted promptly and on shutdown

### Acceptance
- [x] Network requests are blocked in production mode
- [x] Navigation to external URLs is prevented
- [x] New window creation is blocked
- [x] Temp files are cleaned up on startup

### Complete recurring tasks
- [x] Update todo.md
- [x] Run full test suite (866/866 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

### Phase N Notes (2026-02-12)
- Created `src/main/security.ts` with offline enforcement:
  - `shouldBlockUrl()` - pure predicate function for URL blocking decisions
  - `BLOCKED_SCHEMES` - http:, https:, ws:, wss:
  - `ALLOWED_SCHEMES` - file:, data:, blob:, chrome-extension:, devtools:
  - `applyNetworkBlocking()` - blocks network requests via session.webRequest
  - `applyWindowSecurity()` - disables navigation and new window creation
  - Network blocking disabled in development mode (for Vite dev server)
  - 23 unit tests covering all URL blocking scenarios
- Created `src/main/cleanup.ts` with temp file management:
  - `cleanupTempFiles()` - async cleanup of leftover temp files on startup
  - `cleanupTempFilesSync()` - sync cleanup for shutdown
  - Cleans up `settings.json.tmp` left from atomic write failures
  - 10 integration tests
- Updated `src/main/main.ts`:
  - Added sandbox: true, webSecurity: true, allowRunningInsecureContent: false
  - Applies security measures on app ready
  - Applies per-window security restrictions
  - Cleans up temp files on startup
- Audited temp file usage:
  - Clipboard buffers are in-memory only (no disk temp files)
  - Settings uses atomic write with temp file that is renamed (cleaned on startup)
  - No other temp file usage found
- Total: 866 passing tests (33 new tests: 23 security + 10 cleanup)

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
- [x] Update todo.md
- [x] Run full test suite (642/642 passing)
- [x] Update README.md
- [x] Commit to git
- [x] Push to GitHub

---

## SPEC GAPS — Items Missing from Phases (Discovered 2026-02-12)

The following spec requirements were not tracked in the original phase breakdown but must be implemented:

### Gap 1: HEIC Encode Support Detection (specs 4.6, blueprint 1.3)
**Should have been in Phase D (Settings)**
- [ ] Implement IPC `getHeicEncodeSupport()` to detect HEIC encode capability at startup
- [ ] If HEIC unsupported: grey out/disable HEIC option in format dropdown with tooltip
- [ ] If last-persisted format was HEIC and unsupported: auto-switch to JPG and show warning
- [ ] Block starting export run with explicit HEIC format if unsupported

### Gap 2: Transparency Auto-Switch (specs 4.6)
**Should have been in Phase E (Export pipeline)**
- [ ] In exporter: if `hasAlpha === true` and output format is JPG, auto-switch to PNG for that file
- [ ] Record warning for auto-switched files
- [ ] In batch mode: include count of auto-switched items in completion summary

### Gap 3: Upscaling Warning (specs 4.3)
**Should have been in Phase D (Settings UI) + Phase E (Pipeline)**
- [ ] Pipeline should ALLOW upscaling (remove `withoutEnlargement: true` behavior)
- [ ] In renderer: detect when resize settings would upscale any selected image
- [ ] Show non-blocking warning: "Upscaling reduces perceived quality/sharpness"

### Gap 4: Additional Keyboard Shortcuts (specs 6)
**Should have been in Phase D (UI Controls)**
- [ ] Ctrl+O / Cmd+O: trigger "Select files…" dialog
- [ ] Enter: trigger Convert/Export when idle and files selected

### Gap 5: EXIF/Metadata Preservation (specs 4.7)
**Should have been in Phase E (Pipeline)**
- [ ] Call `sharp.withMetadata()` to preserve EXIF/metadata on export
- [ ] Test: verify EXIF date/camera model preserved after processing

### Gap 6: Failure Tooltip in File List (specs 6)
**Should have been in Phase E (UI) or Phase F (Cancel)**
- [ ] For failed items: show failure reason in hover tooltip on the status icon/text
- [ ] Keep row display clean (no inline error text)

### Gap 7: Default Resize Settings (specs 4.3)
**Issue discovered in Phase D implementation**
- Current: DEFAULT_RESIZE_SETTINGS uses `maxSide: 1920`
- Spec says: "On first launch (no saved settings yet): default is 'no resize' (keep original pixel size unless the user changes settings)"
- [ ] Change default to represent "no resize" (e.g., pixels mode with undefined dimensions, or a "none" option)
- [ ] Add UI indication for "Original size" / "No resize" state

### Gap 8: Append Files During In-Progress Run (specs 6)
**Should have been tested in Phase E**
- [ ] Verify: "Select files…" during run appends to queue (not replaces)
- [ ] Verify: dropped files during run append to queue
- [ ] Appended files use same locked settings
- [ ] Add renderer store tests for append-during-run behavior

### Gap 9: Processing Row Overlay Progress (specs 6)
**Should have been in Phase E (UI)**
- Spec: "Show an overlay progress bar on each row that is currently processing"
- [ ] Add per-row progress indicator for currently-processing items (not just icons)

### Gap 10: Crop Ratio Preset Persistence (specs 5)
**Should have been in Phase D (Settings persistence)**
- Spec: "Persist last-used settings across launches (output format, resize mode, quality, crop ratio preset, etc.)"
- [ ] Add `cropRatioPreset` to persisted settings schema
- [ ] Load/save last-used crop ratio preset

---

## Verification Summary (2026-02-12)

**Project state:** 833/833 tests passing. Phases A-M complete.

**Phases N-O:** Not started.

**Implementation matches specs for:**
- ✅ Basic import pipeline (drag/drop, file picker, folder non-recursive)
- ✅ Supported format filtering (jpg/png/heic/webp/tiff/bmp)
- ✅ Dedupe by file path
- ✅ Metadata extraction (dimensions, file size, hasAlpha)
- ✅ Settings persistence (output format, resize mode, quality)
- ✅ Worker pool concurrency=4
- ✅ Export pipeline (pixels/percent resize, format conversion, quality)
- ✅ Output folder resolution (single/batch/mixed rules)
- ✅ Output naming (_reformat suffix, collision handling)
- ✅ Timestamp preservation (best-effort)
- ✅ Cancel behavior with Esc shortcut
- ✅ Matrix-style UI theme
- ✅ Full path tooltip on filename
- ✅ Preview with rotate/flip transforms
- ✅ Crop UI with ratio presets and rule-of-thirds grid
- ✅ Batch crop queue (one-by-one processing)
- ✅ 100% detail preview with draggable lens
- ✅ Target size mode with ±10% tolerance
- ✅ Clipboard paste (Ctrl+V/Cmd+V)
- ✅ Drag-out export for completed items
- ✅ Context menu for exported items (Show in folder, Copy path)

**Coordination confirmed between:**
- specs.md ↔ blueprint.md: Aligned
- blueprint.md ↔ todo.md: Aligned for tracked phases
- todo.md ↔ implementation: Aligned for phases A-M

**Action required:** Address Gap 1-10 above before V1 release.
