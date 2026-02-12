/**
 * Renderer entry point.
 * Handles UI initialization, event binding, and store subscription.
 */

import './types'; // Import types to extend Window interface
import { store, formatItemInfo } from './store';
import type { ImageItem } from './types';

// DOM Elements
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const imageListContainer = document.getElementById('image-list-container') as HTMLDivElement;
const imageList = document.getElementById('image-list') as HTMLUListElement;
const listCount = document.getElementById('list-count') as HTMLSpanElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const warningsEl = document.getElementById('warnings') as HTMLDivElement;
const selectFilesBtn = document.getElementById('select-files-btn') as HTMLButtonElement;
const addMoreBtn = document.getElementById('add-more-btn') as HTMLButtonElement;
const clearAllBtn = document.getElementById('clear-all-btn') as HTMLButtonElement;

/**
 * Import files via the main process API.
 */
async function importFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  store.setImporting(true);
  store.setStatus('Importing files...');

  try {
    const existingPaths = store.getExistingPaths();
    const result = await window.reformat.importWithMetadata(paths, existingPaths);

    // Add imported items to store
    if (result.items.length > 0) {
      store.addItems(result.items);
    }

    // Build status message
    const warnings: string[] = [];
    if (result.duplicateCount > 0) {
      warnings.push(`${result.duplicateCount} duplicate(s) skipped`);
    }
    if (result.importWarnings.length > 0) {
      const unsupported = result.importWarnings.filter(w => w.type === 'unsupported-extension').length;
      if (unsupported > 0) {
        warnings.push(`${unsupported} unsupported file(s)`);
      }
    }
    if (result.metadataFailures.length > 0) {
      warnings.push(`${result.metadataFailures.length} file(s) could not be read`);
    }

    const added = result.items.length;
    const statusMsg = added > 0 
      ? `Added ${added} image${added !== 1 ? 's' : ''}`
      : 'No images added';
    
    store.setStatus(statusMsg, warnings);
  } catch (error) {
    console.error('Import failed:', error);
    store.setStatus('Import failed', [String(error)]);
  } finally {
    store.setImporting(false);
  }
}

/**
 * Handle file selection via dialog.
 */
async function handleSelectFiles(): Promise<void> {
  try {
    const result = await window.reformat.selectFiles();
    if (!result.cancelled && result.paths.length > 0) {
      await importFiles(result.paths);
    }
  } catch (error) {
    console.error('File selection failed:', error);
    store.setStatus('File selection failed', [String(error)]);
  }
}

/**
 * Set up drag and drop handlers.
 */
function setupDragAndDrop(): void {
  // Prevent default drag behaviors on window
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // Drop zone specific handlers
  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Only remove class if leaving the drop zone entirely
    if (!dropZone.contains(e.relatedTarget as Node)) {
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Extract file paths from dropped items
    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // In Electron, dropped files have a path property
      const filePath = (file as any).path;
      if (filePath) {
        paths.push(filePath);
      }
    }

    if (paths.length > 0) {
      await importFiles(paths);
    }
  });

  // Also handle drop on image list container when it's visible
  imageListContainer.addEventListener('dragenter', (e) => e.preventDefault());
  imageListContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageListContainer.classList.add('drag-over');
  });
  imageListContainer.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (!imageListContainer.contains(e.relatedTarget as Node)) {
      imageListContainer.classList.remove('drag-over');
    }
  });
  imageListContainer.addEventListener('drop', async (e) => {
    e.preventDefault();
    imageListContainer.classList.remove('drag-over');

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const filePath = (files[i] as any).path;
      if (filePath) {
        paths.push(filePath);
      }
    }

    if (paths.length > 0) {
      await importFiles(paths);
    }
  });
}

/**
 * Create a list item element for an image.
 */
function createListItem(item: ImageItem): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'image-list-item';
  li.dataset.id = item.id;

  const info = formatItemInfo(item);

  li.innerHTML = `
    <span class="item-name" title="${item.sourcePath || item.originalName}">${info.name}</span>
    <span class="item-dimensions">${info.dimensions}</span>
    <span class="item-size">${info.size}</span>
    <button class="item-remove" title="Remove">×</button>
  `;

  // Handle remove button
  const removeBtn = li.querySelector('.item-remove') as HTMLButtonElement;
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    store.removeItems([item.id]);
  });

  return li;
}

/**
 * Render the image list from store state.
 */
function renderImageList(): void {
  const state = store.getState();
  const items = state.items;

  // Toggle visibility
  if (items.length === 0) {
    dropZone.classList.remove('hidden');
    imageListContainer.classList.add('hidden');
  } else {
    dropZone.classList.add('hidden');
    imageListContainer.classList.remove('hidden');
  }

  // Update count
  listCount.textContent = `${items.length} image${items.length !== 1 ? 's' : ''}`;

  // Rebuild list (simple approach - could be optimized for large lists)
  imageList.innerHTML = '';
  for (const item of items) {
    imageList.appendChild(createListItem(item));
  }
}

/**
 * Update status display from store state.
 */
function renderStatus(): void {
  const state = store.getState();
  statusEl.textContent = state.statusMessage;
  warningsEl.textContent = state.warnings.join(' • ');
}

/**
 * Initialize the application.
 */
function init(): void {
  console.log('Reformat renderer loaded');

  // Check if API is available
  if (!window.reformat) {
    console.error('window.reformat API not available');
    statusEl.textContent = 'Error: Bridge not connected';
    return;
  }

  // Test bridge connection
  window.reformat.ping()
    .then((response) => {
      console.log('Bridge test:', response);
      store.setStatus('Ready');
    })
    .catch((err) => {
      console.error('Bridge test failed:', err);
      store.setStatus('Bridge connection failed');
    });

  // Set up event handlers
  setupDragAndDrop();

  selectFilesBtn.addEventListener('click', handleSelectFiles);
  addMoreBtn.addEventListener('click', handleSelectFiles);
  clearAllBtn.addEventListener('click', () => {
    store.clearItems();
    store.setStatus('Ready');
  });

  // Subscribe to store changes
  store.subscribe((state, event) => {
    if (event === 'items-added' || event === 'items-removed' || event === 'change') {
      renderImageList();
    }
    if (event === 'status' || event === 'change') {
      renderStatus();
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};

