# Reformat

Offline image resizing and reformatting tool built with Electron and TypeScript.

## Features (V1 in progress)

- Offline-only image processing
- Batch image resizing and format conversion
- Drag-and-drop file/folder import
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

V1 is currently in Phase H (crop UI and pipeline complete).
- Animated GIF/WebP files are rejected
- Import is non-recursive (subfolders are skipped)
- Settings are saved to user data directory on change
- Batch crop workflow not yet implemented (planned for Phase I)
- 603 tests passing

## License

ISC
