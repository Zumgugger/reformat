/**
 * Renderer entry point.
 * Handles UI initialization, event binding, and store subscription.
 */

import './types'; // Import types to extend Window interface
import { store, formatItemInfo } from './store';
import { settingsStore } from './settingsStore';
import type { ImageItem, OutputFormat, ResizeSettings, RunConfig, ExportProgress, ExportResult } from './types';
import { DEFAULT_TRANSFORM, DEFAULT_CROP } from './types';

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
const convertBtn = document.getElementById('convert-btn') as HTMLButtonElement;
const progressContainer = document.getElementById('progress-container') as HTMLDivElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLSpanElement;
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;

// Settings DOM Elements
const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement;
const outputFormatSelect = document.getElementById('output-format') as HTMLSelectElement;
const resizeModeRadios = document.querySelectorAll('input[name="resize-mode"]') as NodeListOf<HTMLInputElement>;
const pixelsOptions = document.getElementById('pixels-options') as HTMLDivElement;
const percentOptions = document.getElementById('percent-options') as HTMLDivElement;
const targetOptions = document.getElementById('target-options') as HTMLDivElement;
const keepRatioCheckbox = document.getElementById('keep-ratio') as HTMLInputElement;
const drivingDimensionSelect = document.getElementById('driving-dimension') as HTMLSelectElement;
const maxSizeInput = document.getElementById('max-size') as HTMLInputElement;
const scalePercentInput = document.getElementById('scale-percent') as HTMLInputElement;
const targetMibInput = document.getElementById('target-mib') as HTMLInputElement;
const qualitySlider = document.getElementById('quality-slider') as HTMLInputElement;
const qualityValue = document.getElementById('quality-value') as HTMLSpanElement;
const qualityGroup = document.getElementById('quality-group') as HTMLDivElement;
const settingsLocked = document.getElementById('settings-locked') as HTMLDivElement;

// Export state
let isRunning = false;
let currentRunId: string | null = null;
let unsubscribeProgress: (() => void) | null = null;
const itemStatusMap = new Map<string, string>(); // itemId -> status

/**
 * Build run config from current settings and items.
 */
function buildRunConfig(items: ImageItem[]): RunConfig {
  const settings = settingsStore.getSettings();
  return {
    outputFormat: settings.outputFormat as OutputFormat,
    resizeSettings: settings.resize,
    quality: settings.quality,
    items: items.map((item) => ({
      itemId: item.id,
      transform: DEFAULT_TRANSFORM,
      crop: DEFAULT_CROP,
    })),
  };
}

/**
 * Update UI to reflect running state.
 */
function setRunningState(running: boolean): void {
  isRunning = running;
  
  // Lock settings
  settingsStore.setLocked(running);
  
  // Update buttons
  convertBtn.disabled = running;
  addMoreBtn.disabled = running;
  clearAllBtn.disabled = running;
  
  // Show/hide progress
  progressContainer.classList.toggle('hidden', !running);
  
  if (running) {
    progressBar.style.width = '0%';
    progressText.textContent = '0 / 0';
    itemStatusMap.clear();
  }
}

/**
 * Update item status in UI.
 */
function updateItemStatus(itemId: string, status: string): void {
  itemStatusMap.set(itemId, status);
  const listItem = imageList.querySelector(`[data-id="${itemId}"]`);
  if (listItem) {
    // Remove all status classes
    listItem.classList.remove('processing', 'completed', 'failed', 'canceled');
    // Add new status class
    if (status === 'processing' || status === 'completed' || status === 'failed' || status === 'canceled') {
      listItem.classList.add(status);
    }
  }
}

/**
 * Handle run progress updates.
 */
function handleRunProgress(progress: ExportProgress): void {
  if (progress.runId !== currentRunId) return;
  
  // Update progress bar
  const percent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${progress.completed} / ${progress.total}`;
  
  // Update item status
  if (progress.latest) {
    updateItemStatus(progress.latest.itemId, progress.latest.status);
  }
}

/**
 * Start export run.
 */
async function startExport(): Promise<void> {
  const items = store.getState().items;
  if (items.length === 0) {
    store.setStatus('No images to convert');
    return;
  }
  
  setRunningState(true);
  store.setStatus('Processing...');
  
  // Subscribe to progress events
  unsubscribeProgress = window.reformat.onRunProgress(handleRunProgress);
  
  try {
    const config = buildRunConfig(items);
    const result = await window.reformat.startRun(items, config);
    
    currentRunId = result.runId;
    
    // Update final statuses for all items
    for (const itemResult of result.results) {
      updateItemStatus(itemResult.itemId, itemResult.status);
    }
    
    // Build status message
    const { summary, outputFolder } = result;
    const parts: string[] = [];
    
    if (summary.succeeded > 0) {
      parts.push(`${summary.succeeded} converted`);
    }
    if (summary.failed > 0) {
      parts.push(`${summary.failed} failed`);
    }
    if (summary.canceled > 0) {
      parts.push(`${summary.canceled} canceled`);
    }
    
    const statusMsg = parts.join(', ') || 'Complete';
    store.setStatus(statusMsg);
    
    // Open output folder (only if some succeeded)
    if (summary.succeeded > 0 && outputFolder) {
      try {
        await window.reformat.openFolder(outputFolder);
      } catch (err) {
        console.warn('Failed to open output folder:', err);
      }
    }
  } catch (error) {
    console.error('Export failed:', error);
    store.setStatus('Export failed', [String(error)]);
  } finally {
    setRunningState(false);
    currentRunId = null;
    
    if (unsubscribeProgress) {
      unsubscribeProgress();
      unsubscribeProgress = null;
    }
  }
}

/**
 * Cancel current export run.
 */
async function cancelExport(): Promise<void> {
  if (!currentRunId) return;
  
  try {
    await window.reformat.cancelRun(currentRunId);
    store.setStatus('Canceling...');
  } catch (error) {
    console.error('Cancel failed:', error);
  }
}

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
 * Show/hide resize mode options based on current mode.
 */
function showResizeModeOptions(mode: string): void {
  pixelsOptions.classList.toggle('hidden', mode !== 'pixels');
  percentOptions.classList.toggle('hidden', mode !== 'percent');
  targetOptions.classList.toggle('hidden', mode !== 'targetMiB');
}

/**
 * Update quality slider visibility based on output format.
 */
function updateQualityVisibility(): void {
  const format = settingsStore.getState().settings.outputFormat;
  const showQuality = settingsStore.formatUsesQuality(format);
  qualityGroup.classList.toggle('hidden', !showQuality);
}

/**
 * Render settings panel from settings store state.
 */
function renderSettingsPanel(): void {
  const state = settingsStore.getState();
  const settings = state.settings;

  // Output format
  outputFormatSelect.value = settings.outputFormat;

  // Resize mode
  const resizeMode = settings.resize.mode;
  resizeModeRadios.forEach((radio) => {
    radio.checked = radio.value === resizeMode;
  });
  showResizeModeOptions(resizeMode);

  // Pixels mode options
  if (settings.resize.mode === 'pixels') {
    keepRatioCheckbox.checked = settings.resize.keepRatio;
    drivingDimensionSelect.value = settings.resize.driving;
    
    // Set the appropriate size value
    if (settings.resize.driving === 'maxSide' && settings.resize.maxSide !== undefined) {
      maxSizeInput.value = String(settings.resize.maxSide);
    } else if (settings.resize.driving === 'width' && settings.resize.width !== undefined) {
      maxSizeInput.value = String(settings.resize.width);
    } else if (settings.resize.driving === 'height' && settings.resize.height !== undefined) {
      maxSizeInput.value = String(settings.resize.height);
    }
  }

  // Percent mode options
  if (settings.resize.mode === 'percent') {
    scalePercentInput.value = String(settings.resize.percent);
  }

  // Target size mode options
  if (settings.resize.mode === 'targetMiB') {
    targetMibInput.value = String(settings.resize.targetMiB);
  }

  // Quality slider
  const effectiveQuality = settingsStore.getEffectiveQuality();
  if (effectiveQuality !== null) {
    qualitySlider.value = String(effectiveQuality);
    qualityValue.textContent = String(effectiveQuality);
  }
  updateQualityVisibility();

  // Locked state
  settingsPanel.classList.toggle('locked', state.locked);
  settingsLocked.classList.toggle('hidden', !state.locked);
}

/**
 * Set up settings panel event handlers.
 */
function setupSettingsPanel(): void {
  // Output format change
  outputFormatSelect.addEventListener('change', () => {
    settingsStore.setOutputFormat(outputFormatSelect.value as OutputFormat);
    settingsStore.save();
  });

  // Resize mode change
  resizeModeRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        const mode = radio.value as 'pixels' | 'percent' | 'targetMiB';
        let newSettings: ResizeSettings;

        if (mode === 'pixels') {
          const currentSettings = settingsStore.getSettings().resize;
          newSettings = {
            mode: 'pixels',
            keepRatio: true,
            driving: 'maxSide',
            maxSide: 1920,
            ...(currentSettings.mode === 'pixels' ? currentSettings : {}),
          };
        } else if (mode === 'percent') {
          newSettings = {
            mode: 'percent',
            percent: 100,
          };
        } else {
          newSettings = {
            mode: 'targetMiB',
            targetMiB: 2,
          };
        }

        settingsStore.setResizeSettings(newSettings);
        settingsStore.save();
      }
    });
  });

  // Keep ratio checkbox
  keepRatioCheckbox.addEventListener('change', () => {
    const current = settingsStore.getSettings().resize;
    if (current.mode === 'pixels') {
      settingsStore.setResizeSettings({
        ...current,
        keepRatio: keepRatioCheckbox.checked,
      });
      settingsStore.save();
    }
  });

  // Driving dimension select
  drivingDimensionSelect.addEventListener('change', () => {
    const current = settingsStore.getSettings().resize;
    if (current.mode === 'pixels') {
      const driving = drivingDimensionSelect.value as 'width' | 'height' | 'maxSide';
      const size = parseInt(maxSizeInput.value, 10) || 1920;
      
      const newSettings: ResizeSettings = {
        mode: 'pixels',
        keepRatio: current.keepRatio,
        driving,
      };

      // Set the appropriate dimension
      if (driving === 'maxSide') {
        newSettings.maxSide = size;
      } else if (driving === 'width') {
        newSettings.width = size;
      } else {
        newSettings.height = size;
      }

      settingsStore.setResizeSettings(newSettings);
      settingsStore.save();
    }
  });

  // Max size input
  maxSizeInput.addEventListener('change', () => {
    const current = settingsStore.getSettings().resize;
    if (current.mode === 'pixels') {
      const size = Math.max(1, Math.min(50000, parseInt(maxSizeInput.value, 10) || 1920));
      
      const newSettings: ResizeSettings = {
        mode: 'pixels',
        keepRatio: current.keepRatio,
        driving: current.driving,
      };

      if (current.driving === 'maxSide') {
        newSettings.maxSide = size;
      } else if (current.driving === 'width') {
        newSettings.width = size;
      } else {
        newSettings.height = size;
      }

      settingsStore.setResizeSettings(newSettings);
      settingsStore.save();
    }
  });

  // Scale percent input
  scalePercentInput.addEventListener('change', () => {
    const percent = Math.max(1, Math.min(1000, parseInt(scalePercentInput.value, 10) || 100));
    settingsStore.setResizeSettings({
      mode: 'percent',
      percent,
    });
    settingsStore.save();
  });

  // Target MiB input
  targetMibInput.addEventListener('change', () => {
    const targetMiB = Math.max(0.1, Math.min(100, parseFloat(targetMibInput.value) || 2));
    settingsStore.setResizeSettings({
      mode: 'targetMiB',
      targetMiB,
    });
    settingsStore.save();
  });

  // Quality slider
  qualitySlider.addEventListener('input', () => {
    const value = parseInt(qualitySlider.value, 10);
    qualityValue.textContent = String(value);
  });

  qualitySlider.addEventListener('change', () => {
    const value = parseInt(qualitySlider.value, 10);
    const format = settingsStore.getState().settings.outputFormat;
    
    // Update the appropriate quality based on format
    if (format === 'same' || format === 'jpg') {
      settingsStore.setQuality('jpg', value);
    }
    if (format === 'webp') {
      settingsStore.setQuality('webp', value);
    }
    if (format === 'heic') {
      settingsStore.setQuality('heic', value);
    }
    
    settingsStore.save();
  });
}

/**
 * Initialize the application.
 */
async function init(): Promise<void> {
  console.log('Reformat renderer loaded');

  // Check if API is available
  if (!window.reformat) {
    console.error('window.reformat API not available');
    statusEl.textContent = 'Error: Bridge not connected';
    return;
  }

  // Test bridge connection
  try {
    const response = await window.reformat.ping();
    console.log('Bridge test:', response);
    store.setStatus('Ready');
  } catch (err) {
    console.error('Bridge test failed:', err);
    store.setStatus('Bridge connection failed');
    return;
  }

  // Load settings from main process
  try {
    await settingsStore.load();
    console.log('Settings loaded');
  } catch (err) {
    console.error('Failed to load settings:', err);
  }

  // Set up event handlers
  setupDragAndDrop();
  setupSettingsPanel();

  selectFilesBtn.addEventListener('click', handleSelectFiles);
  addMoreBtn.addEventListener('click', handleSelectFiles);
  clearAllBtn.addEventListener('click', () => {
    store.clearItems();
    store.setStatus('Ready');
  });
  
  // Convert button
  convertBtn.addEventListener('click', startExport);
  
  // Cancel button
  cancelBtn.addEventListener('click', cancelExport);

  // Subscribe to store changes
  store.subscribe((state, event) => {
    if (event === 'items-added' || event === 'items-removed' || event === 'change') {
      renderImageList();
    }
    if (event === 'status' || event === 'change') {
      renderStatus();
    }
  });

  // Subscribe to settings store changes
  settingsStore.subscribe(() => {
    renderSettingsPanel();
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};

