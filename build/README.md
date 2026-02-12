# Build Resources

This directory contains resources used during the Electron packaging process.

## Required Icons

For production builds, you should add the following icon files:

- **icon.ico** - Windows icon (256x256 or larger, ICO format)
- **icon.icns** - macOS icon (512x512 or larger, ICNS format)
- **icon.png** - Linux icon (512x512 or larger, PNG format)

## Icon Generation

You can generate these icons from a single high-resolution PNG using tools like:

- **electron-icon-maker**: `npm install -g electron-icon-maker`
- **icon-gen**: `npm install -g icon-gen`

Example using electron-icon-maker:
```bash
electron-icon-maker --input=master-icon.png --output=./build
```

## Placeholder Icons

For development builds without icons, electron-builder will use default Electron icons.
This is acceptable for testing but should be replaced before release.
