
# Reformat — Implementation Blueprint (V1)

Date: 2026-02-08

This blueprint turns the V1 spec into an incremental, test-driven build plan for an Electron + TypeScript desktop app that resizes/reformats images using `sharp`.

## 0. Non-negotiables (from spec)
- Offline-only: no outbound network requests; prefer disabling/denying network APIs.
- No external dependencies: ship codecs/libs with the app (via `sharp` bundled native modules per platform).
- Outputs always go to OS Downloads (with subfolder rules); never overwrite; always append `_reformat` (and suffix).
- Settings persist across launches.
- Batch: parallel execution with fixed concurrency 4; per-file failures don’t abort run.
- Crop queue: if crop enabled with multiple files, user crops one-by-one; no Back in V1.
- UI is “matrix-style” (dark, green accents, monospace). Implement via simple CSS variables + a single stylesheet.

## 1. High-level architecture

### 1.1 Process split
- **Main process** (Node APIs):
  - File picking, folder reading, Downloads path resolution.
  - Image metadata extraction (dimensions, file size) and best-effort format detection.
  - Worker pool for image processing with `sharp` (concurrency 4).
  - Output naming + collision avoidance + timestamp preservation.
  - Blocking/denying network access.
  - IPC API surface (typed) exposed to renderer.

- **Renderer process** (UI):
  - Selection UI (button, drag/drop, paste).
  - Bottom list with status + estimated output size.
  - Preview (main) with crop overlay + rotate/flip.
  - Detail (100%) preview driven by a draggable lens.
  - Settings panel (output format, resize mode, quality, target size, keep ratio).
  - Orchestrates crop queue (one-by-one) when needed.

### 1.2 Code organization (suggested)
Keep business logic pure/testable in `src/shared/` and `src/main/` modules. UI glue in `src/renderer/`.

Suggested tree:
- `src/shared/`
  - `types.ts` (shared domain types)
  - `bytes.ts` (MiB conversions)
  - `naming.ts` (output filename rules)
  - `paths.ts` (Downloads folder + output folder resolution)
  - `dedupe.ts` (path de-dup)
  - `estimates.ts` (best-effort size estimation)
  - `settings.ts` (defaults + validation + persistence shape)
  - `errors.ts` (error normalization)

- `src/main/`
  - `main.ts` (Electron app bootstrap)
  - `ipc.ts` (IPC registration)
  - `security.ts` (network blocking)
  - `files.ts` (picker + folder import)
  - `metadata.ts` (read dimensions + transparency best-effort)
  - `heicSupport.ts` (startup capability check)
  - `processor/`
	 - `workerPool.ts` (concurrency 4)
	 - `pipeline.ts` (rotate/flip -> crop -> resize -> encode)
	 - `targetSize.ts` (iterative downscale until size tolerance)
	 - `exporter.ts` (write file, timestamps)

- `src/renderer/`
  - `index.tsx` + minimal component structure
  - `state/` (single store for selection + settings + run status)
  - `components/` (Preview, DetailPreview, BottomList, SettingsPanel)
  - `styles/` (matrix theme)

### 1.3 IPC design (typed, minimal)
Use `ipcMain.handle` + `contextBridge` with a single `window.reformat` API.

Minimal IPC endpoints (expand only as needed):
- `selectFiles(): Promise<FileDescriptor[]>`
- `importDroppedPaths(paths: string[]): Promise<FileDescriptor[]>` (supports files + folder non-recursive)
- `pasteFromClipboard(mode: 'replace'|'append'): Promise<FileDescriptor[]>`
- `getHeicEncodeSupport(): Promise<{ supported: boolean; reason?: string }>`
- `startRun(config, items): Promise<RunId>`
- `cancelRun(runId): Promise<void>`
- `onRunEvent((evt) => void): unsubscribe` (progress, per-file status, warnings)
- `openOutputFolder(path): Promise<void>`
- `getDownloadsPath(): Promise<string>` (main owns path logic)
- `getExportedFilePath(itemId): Promise<string | null>` (for drag-out)

Notes:
- Make renderer “dumb”: it never touches Node `fs` directly.
- Keep IPC payloads serializable; don’t pass Buffers except for preview images if absolutely needed.

## 2. Key domain decisions (make explicit early)

### 2.1 Domain types
Define these shared concepts early and keep them stable:
- `ImageItem` (id, source kind: file/clipboard, inputPath?, originalName?, bytes, width, height, format?, hasAlpha?)
- `Transform` (rotate steps, flipH, flipV)
- `Crop` (ratioPreset, rect normalized or pixel-based, active flag)
- `ResizeMode` = `pixels | percent | targetMiB`
- `ResizeSettings`:
  - pixels: `{ mode: 'pixels', keepRatio: boolean, driving: 'width'|'height'|'maxSide', width?, height?, maxSide? }`
  - percent: `{ mode: 'percent', percent: number }`
  - targetMiB: `{ mode: 'targetMiB', targetMiB: number }`
- `OutputFormat` = `same | jpg | png | heic | webp | tiff | bmp`
- `RunConfig` (settings snapshot for a run; locked during processing)

### 2.2 Output folder rules (pure function)
Implement as deterministic logic with tests:
- Single file: Downloads root
- Batch from one folder: `Downloads/<source-folder-name>/`
- Mixed source folders: `Downloads/Reformat/`
- Clipboard during a run: same destination as that run

### 2.3 Output naming rules (pure function)
Implement as pure function + collision resolver with `fs.access` injected/mocked in tests.
- Always append `_reformat`.
- If collision, append `-1`, `-2`, ...
- Minimal sanitization: replace only illegal filename characters for current OS.

### 2.4 Transparency auto-switch (per-file)
- If output format is `jpg` and `hasAlpha === true`, encode as `png` for that file; record warning and increment summary.

### 2.5 HEIC encode support
- Determined once at startup in main.
- If unsupported: disable HEIC option in UI; if last saved was HEIC, auto-switch to JPG and show warning.
- If output format is `same`: per-file fallback to JPG when encoding fails.

## 3. Testing strategy (start early, keep it fast)

### 3.1 Test layers
1. **Pure unit tests (fastest)** for shared logic:
	- bytes/MiB conversions
	- naming + sanitization
	- output folder selection
	- resize math (keep ratio, maxSide)
	- target-size loop decisions (without real image encoding)
2. **Main-process unit/integration tests** (Node environment) for:
	- worker pool concurrency behavior
	- pipeline calls to `sharp` (use small generated images in-memory)
	- timestamp preservation (where feasible; guard platform-specific expectations)
3. **Renderer unit tests** (minimal): store reducers/selectors.
4. **End-to-end smoke test (optional for V1)**: Playwright + Electron launch to ensure app boots and basic selection UI renders.

### 3.2 Test data policy
- Generate test images programmatically via `sharp` (solid colors, with/without alpha) to avoid committing large binaries.
- For HEIC: don’t require HEIC fixtures. Treat HEIC encode support as a capability check + conditional tests.

### 3.3 “No orphan code” rule
Every step must:
- compile,
- have tests (when logic is non-trivial),
- wire code into a runnable path (even if UI is minimal).

## 4. Build setup decisions (V1)
- Electron + TypeScript.
- Renderer: React (or vanilla) is acceptable; choose React if it speeds iterative UI and state management.
- Bundler: Vite for renderer + Electron main build (or electron-vite).
- Tests: Vitest for unit tests; optionally Playwright for e2e.
- Packaging: electron-builder.

## 5. Incremental build plan (chunks → substeps)

Each chunk below is designed to be implementable safely, with strong tests, and to leave the app runnable.

### Chunk A — Repo scaffold + CI-like test loop
Goal: project boots, tests run, and a minimal window appears.

Steps:
1. Initialize Electron + TS project structure (main + renderer).
2. Add Vitest and a “shared” test folder; add one trivial unit test to prove wiring.
3. Add basic app window with a placeholder UI and the “matrix-style” base CSS.
4. Add `preload` + `contextBridge` with a single `window.reformat.ping()` API; write a renderer test that calls it via a mocked bridge.

Acceptance:
- `npm test` passes.
- `npm run dev` launches a window.

### Chunk B — Shared domain + deterministic output rules
Goal: implement pure logic with tests first.

Steps:
1. Add shared domain types (`ImageItem`, settings types).
2. Implement MiB conversions and formatting (`2.3 MiB`), tests.
3. Implement output folder resolution, tests.
4. Implement filename sanitization + `_reformat` naming + collision suffix generator (with injectable `exists`), tests.

Acceptance:
- Shared logic is 100% covered by unit tests for edge cases.

### Chunk C — Import pipeline (files + folder drop + dedupe)
Goal: main can import paths and return metadata items.

Steps:
1. Implement `selectFiles` in main using Electron dialog, returning file paths.
2. Implement `importDroppedPaths`:
	- accept array of paths
	- if folder: list immediate children (non-recursive)
	- filter supported extensions
	- track skipped unsupported items and subfolders
3. Implement de-dup by file path, returning warnings for duplicates.
4. Implement metadata read: file size + pixel dimensions via `sharp.metadata()`.
5. Wire renderer: drag/drop box + “Select files…” button populates bottom list.

Tests:
- Unit test dedupe.
- Main-process tests for folder import filtering (use temp directories).
- Metadata extraction test using generated images.

Acceptance:
- Dropping a folder imports only supported images (non-recursive) with a warning count for skipped.

### Chunk D — Settings persistence + UI controls (locked during run)
Goal: settings panel exists and persists; no processing yet.

Steps:
1. Define persisted settings schema (versioned) and defaults.
2. Implement load/save using Electron `app.getPath('userData')` + JSON file.
3. Renderer store: selected items + active item + settings.
4. Implement settings UI:
	- output format dropdown (includes Same as input)
	- resize mode selector (default Pixels)
	- keep ratio + driving dimension + maxSide option
	- quality slider visibility rules
5. Add “locked” UI state flag (preparing for runs).

Tests:
- Settings validation and migration tests (v0 → v1 if needed).
- UI store tests for “lock disables edits”.

Acceptance:
- Relaunch preserves last output format + resize settings.

### Chunk E — Worker pool + minimal export run (no crop, no target-size)
Goal: click Convert/Export runs `sharp` pipeline for all items with concurrency 4.

Steps:
1. Implement worker pool (promise queue) with concurrency 4; tests verifying max in-flight.
2. Implement export pipeline (initial):
	- read input
	- apply orientation correctly (use `sharp().rotate()` to respect EXIF)
	- resize modes: Pixels, Percent
	- encode to chosen format (same/jpg/png/webp/tiff/bmp) with quality where applicable
	- convert to sRGB + embed profile (best-effort) via `sharp` APIs
3. Implement output destination + naming + collision avoidance.
4. Implement IPC `startRun` and `onRunEvent` progress events.
5. Renderer:
	- Convert/Export button
	- bottom list shows status per file and overall progress
	- lock settings + lock preview switching during run
6. After run: auto-open output folder.

Tests:
- Pipeline integration tests with generated images.
- Naming collision test using temp dir.
- Progress event ordering tests (basic).

Acceptance:
- Batch runs 4 at a time, skips failures, shows summary count.

### Chunk F — Cancel behavior
Goal: cancel stops remaining work and keeps already-exported files.

Steps:
1. Add cancel token / abort flag in worker pool.
2. IPC `cancelRun` flips flag; workers check between tasks.
3. Renderer: Cancel button + Esc shortcut with confirmation dialog.
4. Ensure partial exports remain; remaining items become “Canceled” or “Skipped”.

Tests:
- Worker pool cancellation test.

### Chunk G — Preview rendering + rotate/flip (single + crop-queue only)
Goal: show preview and allow rotate/flip adjustments.

Steps:
1. Decide preview transport:
	- simplest: main returns a downscaled preview as `data:` URL (base64) per active item.
2. IPC `getPreview(itemId, maxSize)` returns preview image.
3. Renderer preview panel displays preview and basic metadata.
4. Add rotate/flip controls (per-item transient state):
	- store transforms in renderer state
	- include transform in run config per item
5. Ensure rotate/flip resets per item in crop queue workflow.

Tests:
- Transform math tests.
- Preview generation test with sharp.

### Chunk H — Crop UI (single image) + apply crop in export pipeline
Goal: user crops in preview; export respects crop.

Steps:
1. Implement crop overlay in renderer:
	- ratio preset dropdown (Original, Free, 1:1, 4:5, 3:4, 9:16, 16:9, 2:3, 3:2)
	- initialize centered crop rectangle matching selected ratio
	- show rule-of-thirds grid
	- store crop rectangle in normalized coordinates (0..1) relative to displayed image
2. Convert normalized crop to pixel crop using original image dimensions + current transform orientation.
3. Update export pipeline to apply crop before resize.
4. Update “keep ratio” enforcement to use post-crop ratio.

Tests:
- Crop conversion math tests.
- Pipeline crop test with a synthetic image (e.g., quadrant colors).

### Chunk I — Batch crop queue workflow
Goal: when crop enabled and multiple files selected, enforce one-by-one crop & export.

Steps:
1. Define “crop enabled” meaning: crop rect differs from full image OR user toggles crop mode.
2. When user clicks Convert/Export with N>1 and crop enabled:
	- enter queue mode
	- show current item index
	- show single action button: “Apply crop & export”
	- on click: export current item, advance automatically
	- no Back
3. Cancel stops remaining.
4. Queue order must match selection order.

Tests:
- Store tests for queue advancement + cancellation.

### Chunk J — 100% detail preview (lens)
Goal: a second preview shows 1:1 pixel region controlled by a lens overlay.

Steps:
1. Renderer:
	- lens rectangle overlay on main preview; draggable within bounds
	- detail panel shows cropped region at 1:1 (no scaling up beyond 1:1)
2. Implementation option A (simplest):
	- main process generates a crop of the original image at the lens location (in pixels) and returns it as a PNG data URL.
3. Ensure detail preview area size matches main preview area.

Tests:
- Lens coordinate conversion tests.

### Chunk K — Target size mode (MiB) with tolerance
Goal: support target size by iterative downscaling until within ±10% or 48×48 minimum.

Steps:
1. Implement target-size algorithm in main:
	- fixed encode quality if lossy
	- reduce pixel dimensions iteratively (e.g., binary search on scale or progressive downscale)
	- stop when within tolerance or at min size
2. Add per-file warnings when target not reachable.
3. Add real-time estimates:
	- estimated output pixel dimensions from target MiB
	- estimated file size from current settings
	- show per-file estimates in bottom list

Tests:
- Algorithm unit tests (with mocked “encode size” function for determinism).
- Integration test on a generated image for at least one lossy format.

### Chunk L — Clipboard paste
Goal: Ctrl+V/Cmd+V adds images from clipboard.

Steps:
1. Main: `clipboard.readImage()`; if empty, return none.
2. Convert to PNG buffer and treat as an `ImageItem` with source `clipboard`.
3. Naming uses `clipboard_reformat` rules.
4. Renderer:
	- when idle: paste replaces list
	- when running: paste appends to queue (processed with locked settings)

Tests:
- Clipboard logic tests via main function abstraction (mock).

### Chunk M — Drag-out export (move semantics)
Goal: after export, user can drag file(s) out and it moves from Downloads.

Steps:
1. Renderer: enable drag only for exported rows.
2. Use Electron drag APIs (`webContents.startDrag`) from main:
	- provide file path(s)
3. Implement move semantics:
	- detect successful drop target move vs copy (platform-specific; may require a post-drop hook).
	- If true move cannot be guaranteed, implement best-effort: after drag start, offer a “Move to…” flow is NOT allowed (would add UX). Prefer platform-native drag with `startDrag` and accept that OS handles.
4. Collision prompt UI: Overwrite / Overwrite all / Rename / Cancel.

Risk note:
- Drag-out move semantics and collision prompting can be tricky cross-platform. Keep this chunk isolated and behind clean IPC so it doesn’t destabilize processing.

### Chunk N — Hardening: network blocking + temp cleanup
Goal: enforce offline-only behavior and no residual temp files.

Steps:
1. Main: deny network requests using `session.defaultSession.webRequest.onBeforeRequest` and block `http:`/`https:`/`ws:`/`wss:`.
2. Disable navigation and new windows.
3. Ensure any temp files (if introduced) are created under OS temp and deleted promptly; register shutdown cleanup.

Tests:
- Unit test for URL blocking function.

### Chunk O — Packaging (Windows installer + macOS dmg)
Goal: produce installers per spec.

Steps:
1. electron-builder config for:
	- Windows: NSIS installer
	- macOS: dmg with app bundle
2. Verify `sharp` native module bundling works for each target.
3. Add build metadata (version, build date) for About screen.
4. Add minimal About menu.

Acceptance:
- Builds produce expected artifacts; app runs offline.

## 6. Iteration: right-sizing the steps (safety checklist)

Before implementing any chunk, validate the chunk is “right sized”:
- Can it be completed in a single PR without half-wired UI?
- Does it introduce only one new axis of complexity?
- Are all non-trivial rules backed by unit tests?
- Does the app still run at the end of the chunk?

If a chunk feels too big, split it by:
- isolating pure logic first (tests)
- then adding IPC
- then wiring minimal UI

## 7. Copilot prompt series (TDD, incremental)

Use these prompts sequentially. Each prompt assumes the previous one is merged and green.

### Prompt 1 — Scaffold project + test harness
“Create an Electron + TypeScript app with separate main/renderer and a preload bridge. Add Vitest and a single passing unit test. Add npm scripts: `dev`, `build`, `test`. Keep the window minimal with placeholder text and a dark/green monospace stylesheet. Ensure `npm test` passes and `npm run dev` launches.”

### Prompt 2 — Shared bytes + formatting utilities (tests first)
“Add `src/shared/bytes.ts` implementing MiB conversions (1 MiB = 1,048,576 bytes) and formatting with 1 decimal place (e.g., 2.3 MiB). Write Vitest unit tests covering rounding and edge cases.”

### Prompt 3 — Output folder rules (tests first)
“Add `src/shared/paths.ts` with a pure function that selects the output folder based on input items: single file => Downloads root; batch same source folder => Downloads/<folder>; mixed => Downloads/Reformat. Write tests using fake paths; do not use OS APIs in shared code.”

### Prompt 4 — Output naming + collision handling (tests first)
“Add `src/shared/naming.ts` implementing: sanitize filename minimally for Windows/macOS, always append `_reformat`, and if collision append `-1`, `-2`… Provide a function that takes an injected async `exists(path)` checker so it can be unit-tested without touching disk. Write thorough tests.”

### Prompt 5 — De-dup and supported format filtering (tests first)
“Add `src/shared/dedupe.ts` and `src/shared/supportedFormats.ts` to (a) dedupe by canonicalized file path, (b) filter supported extensions for V1 (jpg/jpeg/png/heic/heif/webp/tiff/bmp) and explicitly reject animated GIF/animated WebP. Add unit tests.”

### Prompt 6 — Main: file picker + folder drop import (real Electron + fs)
“Implement main-process functions for selecting files and importing dropped paths (files or a folder, non-recursive). Use real Electron dialog APIs and Node `fs/promises` for directory listing. Return a list of file paths + warnings (unsupported, duplicates). Add Node-side tests using temp dirs.”

### Prompt 7 — Main: metadata extraction via sharp (real call)
“Add `src/main/metadata.ts` that reads file size and pixel dimensions using `sharp.metadata()`; return a `FileDescriptor` with width/height/bytes and a best-effort `hasAlpha`. Write integration tests by generating images with `sharp` into a temp dir (one with alpha, one without).”

### Prompt 8 — IPC bridge for importing + renderer list UI
“Create typed IPC handlers and preload bridge exposing `selectFiles` and `importDroppedPaths`. In renderer, build: Select files button + drop zone + bottom list showing base filename, dimensions, and size MiB. Ensure drag/drop uses the bridge (no direct fs). Add renderer store unit tests (selection order preserved).”

### Prompt 9 — Settings persistence (main) + settings panel UI
“Implement persisted settings JSON in userData with versioning, load on startup, save on change. In renderer, add settings panel controls: output format dropdown, resize mode selector (default Pixels), keep ratio toggle, driving dimension and maxSide, quality slider (bounds 40..100 default 85) visible per rules. Add tests for schema validation + defaulting.”

### Prompt 10 — Worker pool concurrency=4 (tests first)
“Implement `src/main/processor/workerPool.ts` as a promise queue with fixed concurrency 4 and cancellation token support. Write tests that assert no more than 4 tasks run concurrently and cancel stops scheduling remaining tasks.”

### Prompt 11 — Export pipeline v1 (pixels + percent)
“Implement `src/main/processor/pipeline.ts` using real `sharp`: rotate to respect EXIF, apply resize (pixels, percent; keep ratio rules), encode to requested format with quality when applicable, convert to sRGB and embed profile best-effort. Write integration tests using generated images and assert output dimensions and format.”

### Prompt 12 — Destination + naming + timestamps
“Implement exporter that chooses destination folder using the shared rule, generates non-colliding output filenames, writes outputs, and preserves modified timestamp where possible. Add temp-dir tests for collision and a best-effort timestamp check.”

### Prompt 13 — Start run + progress events + UI lock
“Add IPC `startRun` that takes a locked settings snapshot and items, runs processing via worker pool, and emits per-file progress/status events. In renderer, wire Convert/Export button, lock settings during run, show per-row status and overall progress, and show completion summary with failures.”

### Prompt 14 — Cancel UX
“Add Cancel button + Esc shortcut. Show confirmation dialog ‘Cancel remaining items?’ If confirmed, cancel the worker pool and mark remaining items canceled. Add tests for cancel flow in store and worker pool.”

### Prompt 15 — Preview images + rotate/flip controls
“Implement IPC `getPreview` that returns a downscaled PNG/JPG data URL for the active item. In renderer, show left preview and add rotate/flip buttons that update per-item transform state. Ensure transform resets per item in crop queue mode later.”

### Prompt 16 — Crop UI (single)
“Implement crop overlay with ratio presets and rule-of-thirds grid. Store crop rectangle normalized. Add math utilities to convert normalized crop to pixel crop; tests cover ratio presets and bounds. Update pipeline to apply crop before resize.”

### Prompt 17 — Batch crop queue workflow
“When multiple items and crop enabled, enforce one-by-one queue: show ‘Apply crop & export’ button per item, auto-advance, no Back. Cancel stops remaining. Add store tests for queue behavior and ensure selection order preserved.”

### Prompt 18 — 100% detail preview (lens)
“Add draggable lens overlay on main preview and a right-side detail preview that shows a 1:1 cropped region from the original (via main IPC). Add conversion tests for lens-to-pixel mapping.”

### Prompt 19 — Target size mode (MiB) algorithm + estimates
“Implement target-size resize mode: fixed quality (if lossy), downscale until within ±10% of target MiB or minimum 48×48. Use a deterministic unit-tested core algorithm (mock encode size), then integrate with real `sharp`. Add UI estimates for output dimensions and per-file estimated MiB.”

### Prompt 20 — Clipboard paste behavior
“Implement clipboard import: Ctrl+V/Cmd+V reads clipboard image, creates an item, and applies replace/append rules depending on idle vs running. Add tests for idle/append behavior and naming rules (`clipboard_reformat`).”

### Prompt 21 — HEIC encode support detection + UI disable
“Implement startup HEIC encode support check in main (best-effort); expose via IPC; disable HEIC option with tooltip when unsupported; auto-switch persisted HEIC to JPG with warning. Add tests for the decision logic. In ‘same as input’, if encoding fails for a file, fall back to JPG and warn.”

### Prompt 22 — Offline enforcement + cleanup hardening
“Block all outbound network requests using Electron session webRequest. Disable navigation/new windows. Add unit tests for URL blocking predicate. Audit any temp file usage and ensure cleanup on shutdown.”

### Prompt 23 — Packaging + About
“Add electron-builder config for Windows NSIS and macOS dmg, inject version/build date into About menu, and produce build artifacts. Add a minimal About area showing app name, version, build date (no website link).”

## 8. Known risks / watch-outs
- `sharp` + HEIC encode support varies by platform and build; keep the app robust by disabling unsupported outputs and falling back per-file.
- Drag-out “move semantics” can be platform tricky; keep it isolated and don’t block core V1.
- Color management and ICC embedding in `sharp` is best-effort; verify output visually on both platforms.

