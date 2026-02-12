# Reformat

Offline image resizing and reformatting tool built with Electron and TypeScript.

## Features (V1 in progress)

- Offline-only image processing
- Batch image resizing and format conversion
- Drag-and-drop file/folder import
- **Clipboard paste support (Ctrl+V / Cmd+V)**
- Supported formats: JPG, PNG, HEIC, WebP, TIFF, BMP, GIF (static only)
- Matrix-style dark theme UI
- Concurrent export with progress tracking (concurrency: 4)
- Cancellation support during batch processing (Cancel button or Esc key)
- Settings persistence across sessions
- **Image preview with selection**
- **Rotate (90° CW/CCW) and flip (horizontal/vertical) transformations**
- **Per-image transform state preserved during export**
- **Crop with ratio presets (Free, 1:1, 4:5, 3:4, 9:16, 16:9, 2:3, 3:2)**
- **Draggable crop overlay with rule-of-thirds grid**
- **Batch crop queue: one-by-one crop & export when multiple images have crop enabled**
- **100% detail preview with draggable lens for pixel-perfect inspection**
- **Target size mode: automatically downscale to achieve target MiB (±10% tolerance)**
- **Output estimates: estimated dimensions and file size shown in settings panel**
- **Drag-out export: drag completed files to move them to another location**
- **Context menu for exported items: Show in folder, Copy path**
- **Offline enforcement: blocks all outbound network requests (http/https/ws/wss)**
- **Security hardening: disables navigation and new window creation**
- **Temp file cleanup: automatic cleanup of stale temp files on startup**

## Development Setup

### Prerequisites

- Node.js v18 or higher (LTS recommended)
- npm v9 or higher
- Git configured with GitHub authentication

**WSL Users:** Node.js was installed via nvm. Use the included `run-wsl.sh` helper:
```bash
./run-wsl.sh npm test
./run-wsl.sh npm run build
```

### Installation

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the application
npm run build

# Development mode (opens dev tools)
npm run dev

# Production mode
npm start
```

## Project Structure

```
src/
  main/          # Electron main process (Node.js)
    import.ts    # File/folder import with validation
    metadata.ts  # Image metadata extraction (sharp)
    preview.ts   # Preview image generation
    clipboard.ts # Clipboard image import
    dragOut.ts   # Drag-out export (Electron drag API)
    security.ts  # Offline enforcement (network blocking)
    cleanup.ts   # Temp file cleanup
    settingsStore.ts  # Settings persistence
    ipc.ts       # IPC handlers
    processor/   # Image processing pipeline
      workerPool.ts   # Concurrent task execution (4 workers)
      pipeline.ts     # Image transformation (sharp)
      exporter.ts     # Batch export orchestration
  renderer/      # UI (HTML/CSS/TypeScript)
    store.ts     # Reactive state management (images)
    settingsStore.ts  # Settings state management
    cropQueue.ts # Batch crop queue state management
    types.ts     # Renderer type definitions
  shared/        # Shared types and utilities
    types.ts     # Domain types (ImageItem, Transform, etc.)
    settings.ts  # Settings schema, validation, migrations
    bytes.ts     # MiB conversions and formatting
    paths.ts     # Output folder rules
    naming.ts    # Output naming and collision handling
    transform.ts # Transform utilities (rotate/flip)
    crop.ts      # Crop utilities (ratio presets, coordinate conversion)
    lens.ts      # Lens utilities (100% detail preview)
    targetSize.ts # Target size algorithm (iterative downscale)
    collision.ts # Collision handling for drag-out (overwrite/rename)
    supportedFormats.ts  # Format validation
    dedupe.ts    # Path deduplication
docs/
  blueprint.md   # Implementation blueprint
  specs.md       # Feature specifications
  todo.md        # Development checklist
```

## Scripts

- `npm test` - Run unit tests with Vitest
- `npm run test:watch` - Run tests in watch mode
- `npm run build` - Build main and renderer for production
- `npm run build:main` - Build only the main process
- `npm run build:renderer` - Build only the renderer
- `npm run dev` - Start development mode with hot reload
- `npm start` - Start the built application
- `npm run dist` - Build and package for all platforms
- `npm run dist:win` - Build and package for Windows (NSIS installer)
- `npm run dist:mac` - Build and package for macOS (DMG)
- `npm run dist:linux` - Build and package for Linux (AppImage)

## Packaging / Distribution

The application uses electron-builder for packaging. Build artifacts are placed in the `release/` directory.

### Windows
```bash
npm run dist:win
```
Creates:
- `release/win-unpacked/` - Unpacked application directory
- `release/Reformat Setup X.Y.Z.exe` - NSIS installer (requires Wine when building from Linux/WSL)

### macOS
```bash
npm run dist:mac
```
Creates:
- `release/mac-arm64/` or `release/mac-x64/` - Unpacked application
- `release/Reformat-X.Y.Z.dmg` - DMG installer

### Linux
```bash
npm run dist:linux
```
Creates:
- `release/Reformat-X.Y.Z.AppImage` - AppImage executable

### Cross-Platform Building Notes
- Building Windows NSIS installer from Linux/WSL requires Wine
- Building macOS DMG from non-macOS requires additional setup
- For full cross-platform builds, use CI/CD or build on native platforms

### Custom Icons (Optional)
Place icons in the `build/` directory:
- `icon.ico` - Windows (256x256 or larger)
- `icon.icns` - macOS (512x512 or larger)
- `icon.png` - Linux (512x512 or larger)

## About Dialog

The application includes an About dialog accessible via:
- **Windows/Linux**: Help menu → About Reformat
- **macOS**: Application menu → About Reformat
- **UI**: Click "About" button in the footer

Shows app name, version, and build date.

## Platform Support

- Windows (primary development target)
- macOS (planned)
- Linux (planned)

## Git Workflow

This project uses conventional commit messages and phase-based development. The repository is configured for SSH authentication.

```bash
# Run tests
npm test

# Build the project
npm run build

# Commit changes
git add -A
git commit -m "descriptive message"

# Push to GitHub (requires SSH key)
git push origin main
```

**SSH Setup:**
- Remote URL: `git@github.com:Zumgugger/reformat.git`
- Requires SSH key configured in your environment
- For WSL users: ensure your SSH key is copied to `~/.ssh/` with proper permissions (600 for private key)

## Dependencies

- **Electron** - Cross-platform desktop application framework
- **sharp** - High-performance image processing
- **Vite** - Fast build tool for renderer
- **Vitest** - Unit testing framework
- **TypeScript** - Type safety

## Known Limitations

V1 is complete with all spec gaps implemented.
- Animated GIF/WebP files are rejected
- Import is non-recursive (subfolders are skipped)
- Settings are saved to user data directory on change
- Network blocking is disabled in development mode (to allow Vite dev server)
- Cross-platform installer builds may require native platform or additional tools (Wine for Windows NSIS from Linux/WSL)
- Electron cannot run in WSL (use PowerShell/CMD for development on Windows)
- 902 tests passing

## License

ISC
