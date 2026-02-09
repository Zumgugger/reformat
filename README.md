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

## Known Limitations

V1 is currently in Phase A (scaffold + basic setup).

## License

ISC
