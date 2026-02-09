# Reformat

Offline image resizing and reformatting tool built with Electron and TypeScript.

## Features (V1 in progress)

- Offline-only image processing
- Batch image resizing and format conversion
- Matrix-style dark theme UI

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
  renderer/      # UI (HTML/CSS/TypeScript)
  shared/        # Shared types and utilities
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

## Known Limitations

V1 is currently in Phase A (scaffold + basic setup).

## License

ISC
