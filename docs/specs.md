# Reformat — Image Resize/Reformat Desktop App (Spec)

Date: 2026-02-08

## 1. Goal
Build a small cross-platform desktop GUI tool that helps a user quickly inspect and resize/reformat images (single or batch), and then export the results into the OS Downloads folder.

Primary user value: “a simple GUI wrapper for ImageMagick-style convert operations” with predictable output sizing.

## 2. Target Platforms
- Windows (single download; installer required for V1)
- macOS (single download; `.dmg` containing a `.app` bundle)

Supported OS versions (V1):
- Windows 11
- macOS 12 (Monterey) or newer

CPU architecture targets (V1):
- Windows: x64
- macOS: Universal (Intel + Apple Silicon)

Packaging note (important):
- On macOS, apps are typically distributed as a `.app` bundle (appears as one file in Finder but is a directory internally).
- Electron apps are usually shipped as an `.exe` installer/portable on Windows and an `.app` (often inside a `.dmg`) on macOS; they are not typically a single standalone binary.
- Python apps can be packaged into a single-file executable in some cases (e.g., PyInstaller one-file), but image processing libraries/codecs may still require bundling native dependencies.

## 3. Core Use Cases
### 3.1 Single image
1. User provides an image via:
	 - Drag & drop into the app
	 - OR file picker (“Select…”)
2. App displays input info:
	 - Pixel dimensions (W×H)
	 - File size in MiB
3. User chooses a resize target via one of:
	 - Pixels (absolute width/height)
	 - Percentage scale
	 - Target file size in MiB (approximate)
4. App processes the image and writes the output file to the user’s Downloads folder.

### 3.2 Batch processing
1. User selects multiple images (drag & drop or multi-select in picker)
2. User chooses one set of resize/reformat settings
3. App processes all images with the same settings
4. App writes all outputs to Downloads.

Batch + cropping:
- Default: batch processing supports resizing/reformat only (no cropping).
- If the user enables cropping while multiple files are selected, the app uses a “crop queue” workflow:
	- The app prompts the user to crop images one at a time (in sequence).
	- Queue order: the order the user selected/dropped the files.
	- After each crop is confirmed, the app applies the selected resize/reformat settings and exports that item.
		- Confirmation control (V1): a single button per item: “Apply crop & export”, which exports the current item and advances to the next item automatically.
		- No “Back” navigation in V1.
	- The queue continues until all items are cropped and exported.
	- Cancel behavior (V1): cancel stops processing the remaining items and keeps any files already exported.

Batch error handling:
- If an individual file fails to process (e.g., corrupted/unsupported), skip it and continue processing remaining files.
- At the end (or in a status area), show a summary like “3 files failed” with basic reasons.
- No “Retry failed” button in V1; user re-runs by reselecting files.

## 4. Functional Requirements (Draft)
### 4.1 Inputs
- Supported input: common camera/phone image formats.
- Supported input formats (V1):
	- JPEG/JPG
	- PNG
	- HEIC/HEIF
	- WebP
	- TIFF
	- BMP
- Not supported in V1:
	- Animated images (e.g., GIF, animated WebP). These should be treated as unsupported and skipped (with a warning/summary).
- Explicitly not supported in V1:
	- RAW camera formats (e.g., DNG/CR2/NEF/ARW). Rationale: reliable RAW decoding typically requires heavyweight native dependencies and increases packaging complexity for a single-file cross-platform app.
- Input methods:
	- Drag & drop
	- File picker with multi-select
	- Drag & drop folder (batch): dropping a folder imports all supported images inside that folder (non-recursive).
	- If a dropped folder contains unsupported files or subfolders, the app skips them and shows a small summary warning (e.g., “Skipped 12 unsupported items”).
	- Clipboard paste: Ctrl+V (Windows) / Cmd+V (macOS) to add an image from the clipboard (if the clipboard currently contains an image).
		- If the app is idle (all files processed/failed), paste replaces the current list (single-item workflow).
		- If a conversion is in progress, paste appends to the current queue (processed with the same locked settings).

De-duplication:
- If the same file path is added more than once, the app de-duplicates automatically and processes it only once.
- The app records a warning indicating how many duplicates were skipped.

### 4.2 Displayed metadata
- For each selected image:
	- Pixel dimensions (W×H)
	- File size (MiB)
	- (Optional TBD) file format, color mode, EXIF orientation

Formatting:
- Display MiB values with 1 decimal place (e.g., `2.3 MiB`).

Right-side info display (V1):
- Show both:
	- Original (input) pixel dimensions
	- Estimated output pixel dimensions (after crop + resize settings)

### 4.3 Resize / Reformat operations
- Must support resizing by:
	- Absolute pixels
	- Percentage
- Default resize behavior: keep aspect ratio.
	- When “keep ratio” is enabled, changing width auto-calculates height (and vice versa).
	- User may still enter both values, but the app enforces the ratio:
		- If a crop is active, the enforced ratio is the post-crop ratio.
		- Otherwise, the enforced ratio is the original image ratio.
	- Pixels mode provides a lock selector for the primary dimension:
		- User can choose whether Width or Height is the “driving” value.
		- Default: Width is locked (user edits width; height auto-calculates).
	- Pixels mode also supports a “Long edge / Max side” option:
		- User sets a single pixel value for the maximum side length.
		- The app scales the image to fit within that max side while preserving aspect ratio.

Default/prefill behavior:
- Resize controls are prefilled with the last-used settings (persisted across launches) and remain as-is until the user edits them.
- On first launch (no saved settings yet): default is “no resize” (keep original pixel size unless the user changes settings).
- Upscaling:
	- The app allows upscaling (resizing larger than original dimensions).
	- If the user selects settings that upscale, the UI must display a warning that upscaling reduces perceived quality/sharpness.

Resize quality:
- Always use a high-quality resizing algorithm (no user-facing “fast vs quality” toggle in V1).

Global settings:
- In V1, resize/reformat settings are global for the current list/queue (no per-file output settings).

Export variants:
- Single output per run (no exporting multiple format variants in one run).

Quality control (lossy formats):
- When the chosen output format supports a “quality” parameter (lossy formats), the app exposes a quality slider.
	- Applicable formats (V1): JPG, WebP, HEIC/HEIF.
	- If output format is set to “Same as input”, the quality slider applies per-file only when that file’s input/output format is one of: JPG, WebP, HEIC/HEIF.
	- The slider sets the export/encode quality in all resize modes (Pixels / % / Target size).
	- Quality slider bounds (V1): min 40, default 85, max 100.

Out of scope (V1):
- No watermark feature.

Target size operation (MiB):
- Must support “target size” operation:
	- User enters a target file size in MiB.
	- Definition: $1$ MiB $= 1{,}048{,}576$ bytes.
	- Strategy to reach the target size:
		- If the chosen output format supports a “quality” parameter (lossy formats), the app uses the selected quality slider value as a FIXED export quality.
		- The app then reduces pixel dimensions as needed until the target size is reached.
		- If the chosen output format is not quality-based (e.g., PNG/BMP), the app reduces pixel dimensions until the target size is reached.
		- Minimum size constraint (V1): do not reduce below 48×48 pixels.
	- Acceptance tolerance: output file size within ±10% of the target MiB is acceptable.
	- If the target cannot be reached within tolerance without going below 48×48, the app exports at the minimum size (best-effort) and shows a warning that the target size could not be met.
	- The app displays:
		- Estimated file size from pixel dimensions (format-dependent; best-effort)
		- Estimated pixel dimensions from a target size (MiB) (best-effort)
	- Estimates update in real time based on current settings:
		- Output format selection
		- Quality slider value (if applicable)
		- Crop (if any)
		- Resize mode/target (pixels / % / target size (MiB))

	Estimate display locations (V1):
	- Right-side settings panel: show estimates for the currently selected image.
	- Bottom file list: show per-file estimated output size.

### 4.4 Preview + Crop
- The app shows an image preview for the currently selected image.
- The user can change the aspect ratio by cropping directly in the preview.
	- Cropping is a visual interaction (crop rectangle) applied before resizing/export.
	- The crop operation defines the final aspect ratio that subsequent resize uses.
	- Crop UX supports:
		- Freeform crop (no ratio constraint)
		- Aspect-ratio constrained crop via a dropdown of common ratios
			- When a ratio is selected, the crop rectangle is constrained to that ratio and the user chooses the area of the picture to keep.
			- An “Original” option constrains to the image’s current ratio.
		- Ratio preset dropdown list (V1): `Original`, `Free`, `1:1`, `4:5`, `3:4`, `9:16`, `16:9`, `2:3`, `3:2`.
	- Initial crop rectangle (V1): when cropping starts, initialize a centered crop matching the currently selected ratio preset.
	- Crop overlay (V1): show a rule-of-thirds grid inside the crop rectangle.

Preview edit tools (V1):
- Provide basic rotate/flip controls in the preview panel:
	- Rotate 90° left
	- Rotate 90° right
	- Flip horizontal
	- Flip vertical
- These edits apply to the export pipeline before crop and resize.
- Batch behavior:
	- Rotate/flip is not a global batch setting.
	- Rotate/flip is available for single-image workflows.
	- In the batch crop queue workflow (one-by-one), rotate/flip can be adjusted per item before “Apply crop & export”.
	- In crop queue, rotate/flip resets for each new item (no carry-over).

### 4.5 Quality preview (100% detail)
- The UI shows a second preview intended to represent output “quality” at 100% (1:1) pixel scale.
	- It displays only a small region of the image at 100% zoom.
	- The on-screen size (width/height) of this detail preview matches the main picture preview area.
	- The region is chosen via a draggable “lens/box” overlay on the main preview; moving the lens changes what the detail preview shows.

### 4.6 Output
- Output location:
	- Single-file export: OS Downloads folder (directly in Downloads root).
	- Batch export (multiple files): export into a subfolder within Downloads named after the source folder (example: input files from `.../pics/` export to `Downloads/pics/`).
	- Mixed-source batches (files from different folders): export into `Downloads/Reformat/`.
- Output naming:
	- Never overwrite existing files in Downloads.
	- Always append `_reformat` to the base filename (even if there is no collision).
		- Example: `IMG_0001.HEIC` -> `IMG_0001_reformat.jpg`
	- If the output name would collide, append an incrementing suffix (e.g., `_reformat-1`, `_reformat-2`).
	- Filename sanitization: minimal. Preserve the original base name as much as possible; replace only characters that are illegal on the current OS/filesystem.

Clipboard naming:
- Clipboard-pasted images have no original filename.
- Use base name `clipboard_reformat` with the chosen output extension.
- Apply the same collision rule (`clipboard_reformat-1`, `clipboard_reformat-2`, ...).

Clipboard output location when queued:
- If clipboard images are appended during an in-progress conversion, they export into the same output folder used by that run:
	- If the run’s output is Downloads root, clipboard outputs go to Downloads root.
	- If the run’s output is `Downloads/<source-folder-name>/`, clipboard outputs go to that same subfolder.
	- If the run’s output is `Downloads/Reformat/` (mixed-source batch), clipboard outputs go to `Downloads/Reformat/`.
- Output format:
	- User-selectable via dropdown
	- Options (V1): Same as input, JPG, PNG, HEIC/HEIF, WebP, TIFF, BMP
	- Default output format: Same as input
	- Dropdown behavior (V1): the user may switch the output format freely at any time before clicking “Convert/Export”. “Same as input” is a normal selectable option (not a special locked mode).
		- The last selected output format is persisted across launches.
	- “Same as input” behavior:
		- Each file is exported using its original format/extension.
		- If a particular format cannot be encoded on the current OS/build (e.g., HEIC/HEIF export unavailable), automatically fall back to JPG for those files and show a warning.
			- Fallback naming: keep the standard naming rules (no extra `heic2jpg` hint in the filename).

Platform support note:
- HEIC/HEIF export is best-effort: if the current OS/build cannot encode HEIC/HEIF reliably, the option should be shown but disabled/greyed out in the dropdown with a tooltip (e.g., “HEIC export not supported on this system”).
	- Support detection (V1): determined once at app startup.
	- If HEIC/HEIF export is unsupported, the app must not allow starting an export run with output format explicitly set to HEIC/HEIF.
		- If the last-saved/persisted output format was HEIC/HEIF and the app starts on a system without HEIC encode support, the app auto-switches the selection to JPG and shows a non-blocking warning (so the user understands why the selection changed).

Transparency handling:
- If an input image contains transparency and the selected output format is JPG, the app must automatically switch the output format to PNG for that export and inform the user (since JPG does not support transparency).
	- In batch mode, apply the rule per-file and include the count of auto-switched items in the completion summary.

Timestamps:
- Preserve the original file “modified” timestamp on exported outputs where the OS/filesystem allows it.

### 4.7 Metadata + color management
- Preserve metadata on export (as much as the chosen output format supports):
	- EXIF/metadata (including date, camera model, GPS if present)
	- Orientation handling should be correct.

Color management (V1):
- Convert output images to sRGB by default for consistent appearance.
- Embed an sRGB ICC profile in the output where the format supports it.

Orientation behavior (V1):
- Auto-apply EXIF orientation on import so the preview appears upright.
- Exports should produce correctly oriented pixels in common viewers.

## 5. Non-Functional Requirements (Draft)
- Simple distribution: one downloadable app package per OS.
- No external dependencies: the app must not rely on the user having ImageMagick or other tools installed; all required libraries/codecs must ship with the app.
- Fast enough for typical photos (performance targets TBD).
- No command line required for normal use.
- Works offline.
- Persist last-used settings across launches (output format, resize mode, quality, crop ratio preset, etc.).
- macOS distribution requirements (V1): code signing + notarization (to avoid Gatekeeper warnings).
- Updates (V1): no auto-update; users manually download/install new versions.
- Telemetry (V1): no analytics/telemetry.
- Logging (V1): no exportable debug log file.

Privacy/Security constraints (V1):
- No network access: the app must not perform any outbound network requests.
	- No update checks, no remote config, no analytics.
	- If feasible in Electron, explicitly block/disable network APIs so accidental requests fail.
- No residual data: the app must not leave behind thumbnails, previews, temp images, or intermediate files after exit.
	- Preferred: generate previews/thumbnails in memory.
	- If temporary disk files are unavoidable for processing, store them in an OS temp directory and delete them immediately after use and on app shutdown.

Permissions:
- No special OS permissions required beyond normal file access for user-selected inputs and writing outputs to the configured Downloads destination.

## 6. UX (Draft)
- Main window supports drag & drop.

Visual style request (V1): “matrix-style” aesthetic for the entire app UI:
- Dark theme
- Green text accents
- Monospace / terminal-like typography
	- The bottom file/progress area should lean into this look most strongly (highest contrast / most “terminal-like”).

Layout (V1):
- Top: “Select files…” button + a drop zone/box for drag & drop.
- Middle split:
	- Left: picture preview + crop controls (ratio dropdown, crop interaction).
	- Right: 100% detail/quality preview + reformatting options (output format dropdown, resize controls, quality slider when applicable, target-size controls).
- Bottom: file list + progress list.

Interaction elements:
- A list of selected images with dimensions + size.
- A main image preview area for the currently selected image.
- A crop interaction in the main preview to adjust aspect ratio.
- A second preview area for 100% (1:1) detail/quality.
- Controls to pick resize mode (pixels / % / target size (MiB)).
- Default active resize mode: Pixels.
- When the output format supports it, show a quality slider.
	- Shown/active whenever the selected output format is a lossy format (JPG/WebP/HEIC) or when “Same as input” is selected (applies per-file as applicable).
	- The slider controls export/encode quality in all resize modes; in Target-size mode it is the fixed quality used while the app reduces pixel dimensions to reach the target size.
- A “Convert/Export” button.

Convert/Export behavior:
- “Convert/Export” processes all files currently in the list/queue.
- No separate “Export selected” action in V1.

Batch progress UI:
- Show per-file progress in the bottom list (icons + text status such as ✓ Done, ✗ Failed).
	- Failure reasons are shown on hover tooltip (keep rows clean).
- Also show overall progress (e.g., “Processed X / N”).
- Before export, show per-file estimated output size in the bottom list (based on current settings).
	- Estimates update live when settings change.
	- If cropping is enabled for a multi-file crop queue, the estimate may be shown as “Pending (needs crop)” until each item’s crop is confirmed.
- Bottom list columns (V1, compact): Status + Filename + Estimated Output Size (MiB).
	- Filename display (V1): base name only (no full path).
	- Show full path on hover tooltip for the filename.
	- Order (V1): fixed order in which files were added (no sorting).
- While processing:
	- Visually highlight the currently processing row.
	- Show an overlay progress bar on each row that is currently processing.
	- Mark completed items as processed (and failures as failed) in the list.


File list editing:
- No list editing controls in V1 (no remove item, no clear-all). To change the selection, the user re-selects files.

Active preview selection:
- The first-added file is the default “active” image shown in the left/right previews.
- Clicking a row in the bottom list sets that file as the active preview image.

Drag-out export:
- Support dragging output file(s) out of the app to Explorer/Finder to place copies in a user-chosen folder.
- Dragging is available only after a file has been exported via “Convert/Export” (no export-on-drop behavior in V1).
- Drag-out operation semantics (V1): move the exported file to the drop location (remove it from Downloads if the drop succeeds).
- No confirmation dialog for drag-out moves in V1.
- No Undo for drag-out moves in V1.
- If the drag-out destination already contains a file with the same name, prompt the user with options:
	- Overwrite
	- Overwrite all (only shown when moving multiple files and multiple collisions occur; applies only to remaining collisions in the current drag-out operation)
	- Rename (auto-append suffix)
	- Cancel
	- Default button/selection: Overwrite

Warnings / notifications (V1):
- Show small, human-readable warnings (non-blocking) for:
	- Skipped unsupported items (file types, subfolders when dropping a folder)
	- Skipped duplicate files
	- Auto-switched format due to transparency (JPG -> PNG)
	- Upscaling quality warning

Workflow controls:
- During batch export and crop-queue workflows, provide a “Cancel” control to stop remaining items (pause/resume not required).
	- Clicking “Cancel” shows a confirmation dialog: “Cancel remaining items?”
	- If confirmed: stop remaining items and keep already-exported outputs.
- After export finishes, automatically open the output folder in the OS file manager.
 - No “Reset settings to defaults” button is required in V1.

Keyboard shortcuts (V1):
- Ctrl+O / Cmd+O: Select files
- Ctrl+V / Cmd+V: Paste image from clipboard
- Enter: Convert/Export
- Esc: Cancel while conversion is running (shows a confirmation dialog: “Cancel remaining items?”)
	- If confirmed: stop remaining items and keep already-exported outputs.

About:
- Include an “About” area/menu in V1 that shows:
	- App name
	- Version
	- Build date
	- (V1) No project website link/button yet

Processing trigger:
- The app does not auto-start conversion when files are added.
- Conversion starts only when the user clicks “Convert/Export”.

Selection behavior (Select files…):
- When the app is idle (all files already processed or failed), selecting files replaces the current list.
- When a conversion is in progress, selecting additional files appends them to the current list/queue (to be processed with the same active settings).

Settings during processing:
- While conversion is in progress, reformat/resize settings are locked (UI controls disabled) so the run uses one consistent configuration.
- Appending files during conversion is allowed; appended files are processed with the same locked settings.
- During conversion, the preview selection is locked (user cannot switch the active preview by clicking other rows).
	- The preview remains on the active image that was selected when conversion started.

Batch execution model (V1):
- Batch processing runs in parallel.
- Use a fixed concurrency of 4 workers to balance performance and responsiveness.
- Not user-configurable in V1.

## 7. Open Questions (We will resolve iteratively)
None currently that block V1 implementation.

Minor UI details may be chosen during implementation if not specified (e.g., exact lens size for the 100% detail preview, and whether to show extra optional metadata fields).

Implementation approach (V1 decision):
- Electron app (TypeScript/JavaScript) for GUI.
- Image processing via `sharp` (libvips) bundled with the app (native module per OS/arch).
	- HEIC/HEIF decode/encode is best-effort and depends on the shipped libvips/libheif build; if encode is not available, the HEIC option is disabled and “Same as input” falls back to JPG per-file as specified.

Additional (new):
- Crop UX: list of ratio presets; default crop; how cropping interacts with batch processing.
- 100% detail preview: behavior is a draggable lens overlay; remaining details TBD (e.g., lens size).

---

## Working Notes
This spec is intentionally incomplete and will be refined one question at a time.

