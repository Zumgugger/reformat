/**
 * Renderer entry point.
 * Handles UI initialization, event binding, and store subscription.
 */

import './types'; // Import types to extend Window interface
import { store, formatItemInfo } from './store';
import { settingsStore } from './settingsStore';
import type { ImageItem, OutputFormat, ResizeSettings, RunConfig, ExportProgress, ExportResult, Transform, Crop, CropRatioPreset, CropRect } from './types';
import { DEFAULT_TRANSFORM, DEFAULT_CROP } from './types';
import {
  rotateTransformCW,
  rotateTransformCCW,
  flipTransformH,
  flipTransformV,
  createIdentityTransform,
  isIdentityTransform,
  getTransformedDimensions,
  transformToCSS,
} from '../shared/transform';
import {
  getAspectRatioForPreset,
  createCenteredCropRect,
  isCropActive,
  cloneCrop,
  CROP_RATIO_PRESETS,
} from '../shared/crop';
import {
  createCenteredLens,
  calculateLensDimensions,
  normalizedToScreenLens,
  normalizedToPixelRegion,
  moveLens,
  clampLensPosition,
  isLensFullCoverage,
  type LensPosition,
} from '../shared/lens';

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

// Preview DOM Elements
const previewPanel = document.getElementById('preview-panel') as HTMLDivElement;
const previewContainer = document.getElementById('preview-container') as HTMLDivElement;
const previewPlaceholder = document.getElementById('preview-placeholder') as HTMLDivElement;
const previewWrapper = document.getElementById('preview-wrapper') as HTMLDivElement;
const previewImage = document.getElementById('preview-image') as HTMLImageElement;
const previewInfo = document.getElementById('preview-info') as HTMLSpanElement;
const previewMetadata = document.getElementById('preview-metadata') as HTMLDivElement;
const rotateCWBtn = document.getElementById('rotate-cw-btn') as HTMLButtonElement;
const rotateCCWBtn = document.getElementById('rotate-ccw-btn') as HTMLButtonElement;
const flipHBtn = document.getElementById('flip-h-btn') as HTMLButtonElement;
const flipVBtn = document.getElementById('flip-v-btn') as HTMLButtonElement;
const resetTransformBtn = document.getElementById('reset-transform-btn') as HTMLButtonElement;

// Crop DOM Elements
const cropEnabledCheckbox = document.getElementById('crop-enabled') as HTMLInputElement;
const cropRatioSelect = document.getElementById('crop-ratio') as HTMLSelectElement;
const cropOverlay = document.getElementById('crop-overlay') as HTMLDivElement;
const cropSelection = document.getElementById('crop-selection') as HTMLDivElement;
const cropShadeTop = cropOverlay?.querySelector('.crop-shade-top') as HTMLDivElement;
const cropShadeBottom = cropOverlay?.querySelector('.crop-shade-bottom') as HTMLDivElement;
const cropShadeLeft = cropOverlay?.querySelector('.crop-shade-left') as HTMLDivElement;
const cropShadeRight = cropOverlay?.querySelector('.crop-shade-right') as HTMLDivElement;

// Crop queue DOM Elements
const cropQueueContainer = document.getElementById('crop-queue-container') as HTMLDivElement;
const cropQueueIndex = document.getElementById('crop-queue-index') as HTMLSpanElement;
const cropApplyBtn = document.getElementById('crop-apply-btn') as HTMLButtonElement;
const cropCancelBtn = document.getElementById('crop-cancel-btn') as HTMLButtonElement;

// Lens (100% detail) DOM Elements
const lensEnabledCheckbox = document.getElementById('lens-enabled') as HTMLInputElement;
const lensOverlay = document.getElementById('lens-overlay') as HTMLDivElement;
const lensRect = document.getElementById('lens-rect') as HTMLDivElement;
const detailPanelContainer = document.getElementById('detail-panel-container') as HTMLDivElement;
const detailContainer = document.getElementById('detail-container') as HTMLDivElement;
const detailPlaceholder = document.getElementById('detail-placeholder') as HTMLDivElement;
const detailWrapper = document.getElementById('detail-wrapper') as HTMLDivElement;
const detailImage = document.getElementById('detail-image') as HTMLImageElement;
const detailInfo = document.getElementById('detail-info') as HTMLSpanElement;

// Export state
let isRunning = false;
let currentRunId: string | null = null;
let unsubscribeProgress: (() => void) | null = null;
const itemStatusMap = new Map<string, string>(); // itemId -> status

// Preview state
let selectedItemId: string | null = null;
const itemTransforms = new Map<string, Transform>(); // itemId -> transform
const itemCrops = new Map<string, Crop>(); // itemId -> crop
let isLoadingPreview = false;

// Crop drag state
let isCropDragging = false;
let cropDragMode: 'move' | 'resize' = 'move';
let cropDragHandle: string | null = null;
let cropDragStartX = 0;
let cropDragStartY = 0;
let cropDragStartRect: CropRect | null = null;
let previewImageRect: DOMRect | null = null;

// Crop queue state
let isInCropQueueMode = false;
let cropQueueItems: ImageItem[] = [];
let cropQueueCurrentIndex = 0;
let cropQueueCompletedIds: Set<string> = new Set();
let cropQueueCanceled = false;

// Lens (100% detail preview) state
let isLensEnabled = false;
let currentLensPosition: LensPosition | null = null;
let isLensDragging = false;
let lensDragStartX = 0;
let lensDragStartY = 0;
let lensDragStartPosition: LensPosition | null = null;
let isLoadingDetailPreview = false;

/**
 * Get or create transform for an item.
 */
function getItemTransform(itemId: string): Transform {
  let transform = itemTransforms.get(itemId);
  if (!transform) {
    transform = createIdentityTransform();
    itemTransforms.set(itemId, transform);
  }
  return transform;
}

/**
 * Set transform for an item.
 */
function setItemTransform(itemId: string, transform: Transform): void {
  itemTransforms.set(itemId, transform);
}

/**
 * Get or create crop for an item.
 */
function getItemCrop(itemId: string): Crop {
  let crop = itemCrops.get(itemId);
  if (!crop) {
    crop = { ...DEFAULT_CROP, rect: { ...DEFAULT_CROP.rect } };
    itemCrops.set(itemId, crop);
  }
  return crop;
}

/**
 * Set crop for an item.
 */
function setItemCrop(itemId: string, crop: Crop): void {
  itemCrops.set(itemId, cloneCrop(crop));
}

/**
 * Get current selected item.
 */
function getSelectedItem(): ImageItem | null {
  if (!selectedItemId) return null;
  const state = store.getState();
  return state.items.find((i) => i.id === selectedItemId) || null;
}

/**
 * Select an item for preview.
 */
function selectItem(itemId: string | null): void {
  // Update selection state
  const previousId = selectedItemId;
  selectedItemId = itemId;

  // Update visual selection in list
  if (previousId) {
    const prevListItem = imageList.querySelector(`[data-id="${previousId}"]`);
    if (prevListItem) {
      prevListItem.classList.remove('selected');
    }
  }

  if (itemId) {
    const listItem = imageList.querySelector(`[data-id="${itemId}"]`);
    if (listItem) {
      listItem.classList.add('selected');
    }
  }

  // Load preview
  loadPreview();
}

/**
 * Load and display preview for selected item.
 */
async function loadPreview(): Promise<void> {
  if (!selectedItemId) {
    showPreviewPlaceholder();
    return;
  }

  const state = store.getState();
  const item = state.items.find((i) => i.id === selectedItemId);
  if (!item || !item.sourcePath) {
    showPreviewPlaceholder();
    return;
  }

  // Don't load preview during export
  if (isRunning) {
    return;
  }

  isLoadingPreview = true;
  setTransformButtonsEnabled(false);

  try {
    const transform = getItemTransform(item.id);
    const result = await window.reformat.getPreview(item.sourcePath, {
      maxSize: 600,
      transform,
    });

    // Check if selection changed while loading
    if (selectedItemId !== item.id) {
      return;
    }

    // Display preview
    previewImage.src = result.dataUrl;
    previewWrapper.classList.remove('hidden');
    previewPlaceholder.classList.add('hidden');

    // Update info
    const dims = getTransformedDimensions(item.width, item.height, transform);
    previewInfo.textContent = `${dims.width} × ${dims.height}`;

    // Update metadata
    renderPreviewMetadata(item, transform);

    // Update crop overlay after image loads
    previewImage.onload = () => {
      updateCropOverlay();
      // Update lens if enabled
      if (isLensEnabled) {
        initializeLensForItem();
      }
    };
  } catch (error) {
    console.error('Failed to load preview:', error);
    showPreviewPlaceholder('Failed to load preview');
  } finally {
    isLoadingPreview = false;
    setTransformButtonsEnabled(true);
  }
}

/**
 * Show preview placeholder.
 */
function showPreviewPlaceholder(message = 'Select an image to preview'): void {
  previewWrapper.classList.add('hidden');
  previewPlaceholder.classList.remove('hidden');
  const textEl = previewPlaceholder.querySelector('.preview-placeholder-text');
  if (textEl) {
    textEl.textContent = message;
  }
  previewInfo.textContent = '';
  previewMetadata.innerHTML = '';
  hideCropOverlay();
}

/**
 * Render preview metadata.
 */
function renderPreviewMetadata(item: ImageItem, transform: Transform): void {
  const dims = getTransformedDimensions(item.width, item.height, transform);
  const parts: string[] = [];

  // Dimensions
  parts.push(`<span><span class="label">Size:</span> <span class="value">${dims.width} × ${dims.height}</span></span>`);

  // Format
  if (item.format) {
    parts.push(`<span><span class="label">Format:</span> <span class="value">${item.format.toUpperCase()}</span></span>`);
  }

  // Transform info
  if (!isIdentityTransform(transform)) {
    const transformParts: string[] = [];
    if (transform.rotateSteps > 0) {
      transformParts.push(`${transform.rotateSteps * 90}°`);
    }
    if (transform.flipH) {
      transformParts.push('H-flip');
    }
    if (transform.flipV) {
      transformParts.push('V-flip');
    }
    parts.push(`<span><span class="label">Transform:</span> <span class="value">${transformParts.join(', ')}</span></span>`);
  }

  // Crop info
  const item_ = getSelectedItem();
  if (item_) {
    const crop = getItemCrop(item_.id);
    if (isCropActive(crop)) {
      const cropDims = {
        width: Math.round(dims.width * crop.rect.width),
        height: Math.round(dims.height * crop.rect.height),
      };
      parts.push(`<span><span class="label">Crop:</span> <span class="value">${cropDims.width} × ${cropDims.height}</span></span>`);
    }
  }

  previewMetadata.innerHTML = parts.join('');
}

/**
 * Hide crop overlay.
 */
function hideCropOverlay(): void {
  if (cropOverlay) {
    cropOverlay.classList.add('hidden');
    cropOverlay.classList.remove('active');
  }
}

/**
 * Show crop overlay.
 */
function showCropOverlay(): void {
  if (cropOverlay) {
    cropOverlay.classList.remove('hidden');
    cropOverlay.classList.add('active');
  }
}

/**
 * Update crop overlay position based on current crop rect.
 */
function updateCropOverlay(): void {
  const item = getSelectedItem();
  if (!item || !cropOverlay || !cropSelection) return;

  const crop = getItemCrop(item.id);
  
  // Update UI controls to match crop state
  if (cropEnabledCheckbox) {
    cropEnabledCheckbox.checked = crop.active;
  }
  if (cropRatioSelect) {
    cropRatioSelect.value = crop.ratioPreset;
    cropRatioSelect.disabled = !crop.active;
  }

  if (!crop.active) {
    hideCropOverlay();
    return;
  }

  showCropOverlay();

  // Get the actual displayed image dimensions
  const imageRect = previewImage.getBoundingClientRect();
  previewImageRect = imageRect;
  
  // Calculate crop selection position in pixels
  const rect = crop.rect;
  const left = rect.x * imageRect.width;
  const top = rect.y * imageRect.height;
  const width = rect.width * imageRect.width;
  const height = rect.height * imageRect.height;

  // Position crop selection
  cropSelection.style.left = `${left}px`;
  cropSelection.style.top = `${top}px`;
  cropSelection.style.width = `${width}px`;
  cropSelection.style.height = `${height}px`;

  // Position shade regions
  if (cropShadeTop) {
    cropShadeTop.style.height = `${top}px`;
  }
  if (cropShadeBottom) {
    cropShadeBottom.style.top = `${top + height}px`;
    cropShadeBottom.style.height = `${imageRect.height - top - height}px`;
  }
  if (cropShadeLeft) {
    cropShadeLeft.style.top = `${top}px`;
    cropShadeLeft.style.width = `${left}px`;
    cropShadeLeft.style.height = `${height}px`;
  }
  if (cropShadeRight) {
    cropShadeRight.style.top = `${top}px`;
    cropShadeRight.style.left = `${left + width}px`;
    cropShadeRight.style.width = `${imageRect.width - left - width}px`;
    cropShadeRight.style.height = `${height}px`;
  }

  // Update metadata display
  const transform = getItemTransform(item.id);
  renderPreviewMetadata(item, transform);
}

/**
 * Initialize crop to centered rect with current ratio preset.
 */
function initializeCropForItem(itemId: string): void {
  const item = store.getState().items.find((i) => i.id === itemId);
  if (!item) return;

  const crop = getItemCrop(itemId);
  const transform = getItemTransform(itemId);
  const dims = getTransformedDimensions(item.width, item.height, transform);
  
  const aspectRatio = getAspectRatioForPreset(crop.ratioPreset, dims.width, dims.height);
  const rect = createCenteredCropRect(aspectRatio, dims.width, dims.height);
  
  crop.rect = rect;
  setItemCrop(itemId, crop);
  updateCropOverlay();
}

/**
 * Handle crop enable/disable toggle.
 */
function handleCropToggle(): void {
  const item = getSelectedItem();
  if (!item || isRunning) return;

  const crop = getItemCrop(item.id);
  crop.active = cropEnabledCheckbox.checked;
  
  if (crop.active) {
    // Initialize crop rect when enabling
    initializeCropForItem(item.id);
  }
  
  setItemCrop(item.id, crop);
  updateCropOverlay();
}

/**
 * Handle crop ratio preset change.
 */
function handleCropRatioChange(): void {
  const item = getSelectedItem();
  if (!item || isRunning) return;

  const crop = getItemCrop(item.id);
  crop.ratioPreset = cropRatioSelect.value as CropRatioPreset;
  
  // Recalculate crop rect for new ratio
  const transform = getItemTransform(item.id);
  const dims = getTransformedDimensions(item.width, item.height, transform);
  const aspectRatio = getAspectRatioForPreset(crop.ratioPreset, dims.width, dims.height);
  crop.rect = createCenteredCropRect(aspectRatio, dims.width, dims.height);
  
  setItemCrop(item.id, crop);
  updateCropOverlay();
}

/**
 * Handle crop drag start.
 */
function handleCropDragStart(e: MouseEvent, explicitHandle?: string): void {
  if (!selectedItemId || isRunning) return;
  
  const target = e.target as HTMLElement;
  const handle = explicitHandle || target.dataset.handle;
  
  isCropDragging = true;
  cropDragStartX = e.clientX;
  cropDragStartY = e.clientY;
  
  const crop = getItemCrop(selectedItemId);
  cropDragStartRect = { ...crop.rect };
  
  if (handle) {
    cropDragMode = 'resize';
    cropDragHandle = handle;
  } else {
    cropDragMode = 'move';
    cropDragHandle = null;
  }
  
  e.preventDefault();
}

/**
 * Handle crop drag move.
 */
function handleCropDragMove(e: MouseEvent): void {
  if (!isCropDragging || !selectedItemId || !cropDragStartRect || !previewImageRect) return;
  
  const item = getSelectedItem();
  if (!item) return;
  
  const crop = getItemCrop(selectedItemId);
  const rect = { ...cropDragStartRect };
  
  // Calculate delta in normalized coordinates
  const deltaX = (e.clientX - cropDragStartX) / previewImageRect.width;
  const deltaY = (e.clientY - cropDragStartY) / previewImageRect.height;
  
  if (cropDragMode === 'move') {
    // Move the entire crop area
    rect.x = Math.max(0, Math.min(1 - rect.width, cropDragStartRect.x + deltaX));
    rect.y = Math.max(0, Math.min(1 - rect.height, cropDragStartRect.y + deltaY));
  } else if (cropDragMode === 'resize' && cropDragHandle) {
    // Resize based on handle
    const transform = getItemTransform(selectedItemId);
    const dims = getTransformedDimensions(item.width, item.height, transform);
    const aspectRatio = getAspectRatioForPreset(crop.ratioPreset, dims.width, dims.height);
    
    // Calculate new bounds based on handle
    let newLeft = cropDragStartRect.x;
    let newTop = cropDragStartRect.y;
    let newRight = cropDragStartRect.x + cropDragStartRect.width;
    let newBottom = cropDragStartRect.y + cropDragStartRect.height;
    
    // Adjust based on handle being dragged
    if (cropDragHandle.includes('w')) {
      newLeft = Math.max(0, Math.min(newRight - 0.05, cropDragStartRect.x + deltaX));
    }
    if (cropDragHandle.includes('e')) {
      newRight = Math.max(newLeft + 0.05, Math.min(1, cropDragStartRect.x + cropDragStartRect.width + deltaX));
    }
    if (cropDragHandle.includes('n')) {
      newTop = Math.max(0, Math.min(newBottom - 0.05, cropDragStartRect.y + deltaY));
    }
    if (cropDragHandle.includes('s')) {
      newBottom = Math.max(newTop + 0.05, Math.min(1, cropDragStartRect.y + cropDragStartRect.height + deltaY));
    }
    
    rect.x = newLeft;
    rect.y = newTop;
    rect.width = newRight - newLeft;
    rect.height = newBottom - newTop;
    
    // Enforce aspect ratio if not free
    if (aspectRatio !== null && crop.ratioPreset !== 'free') {
      const imageRatio = dims.width / dims.height;
      const currentRatio = (rect.width * dims.width) / (rect.height * dims.height);
      
      if (currentRatio > aspectRatio) {
        // Too wide - shrink width
        rect.width = (aspectRatio / imageRatio) * rect.height;
      } else {
        // Too tall - shrink height
        rect.height = (imageRatio / aspectRatio) * rect.width;
      }
    }
  }
  
  crop.rect = rect;
  setItemCrop(selectedItemId, crop);
  updateCropOverlay();
}

/**
 * Handle crop drag end.
 */
function handleCropDragEnd(): void {
  isCropDragging = false;
  cropDragHandle = null;
  cropDragStartRect = null;
}

// ===== Lens (100% Detail Preview) Functions =====

/**
 * Show lens overlay.
 */
function showLensOverlay(): void {
  if (lensOverlay) {
    lensOverlay.classList.remove('hidden');
    lensOverlay.classList.add('active');
  }
}

/**
 * Hide lens overlay.
 */
function hideLensOverlay(): void {
  if (lensOverlay) {
    lensOverlay.classList.add('hidden');
    lensOverlay.classList.remove('active');
  }
}

/**
 * Show detail preview panel.
 */
function showDetailPanel(): void {
  if (detailPanelContainer) {
    detailPanelContainer.classList.remove('hidden');
  }
}

/**
 * Hide detail preview panel.
 */
function hideDetailPanel(): void {
  if (detailPanelContainer) {
    detailPanelContainer.classList.add('hidden');
  }
}

/**
 * Initialize lens position for current item.
 */
function initializeLensForItem(): void {
  const item = getSelectedItem();
  if (!item) {
    currentLensPosition = null;
    return;
  }

  // Get displayed image dimensions for lens calculation
  const imageRect = previewImage.getBoundingClientRect();
  if (!imageRect || imageRect.width === 0 || imageRect.height === 0) {
    // Image not loaded yet, retry after a small delay
    setTimeout(initializeLensForItem, 50);
    return;
  }

  // Calculate detail panel container size
  const detailRect = detailContainer?.getBoundingClientRect();
  const detailWidth = detailRect?.width ?? 300;
  const detailHeight = detailRect?.height ?? 300;

  // Get original image dimensions (accounting for transform)
  const transform = getItemTransform(item.id);
  const dims = getTransformedDimensions(item.width, item.height, transform);

  try {
    // Calculate lens dimensions based on detail panel size
    const lensDims = calculateLensDimensions(
      dims.width,
      dims.height,
      detailWidth,
      detailHeight,
      transform
    );

    // Create centered lens
    currentLensPosition = createCenteredLens(lensDims.width, lensDims.height);
    updateLensOverlay();
    loadDetailPreview();
  } catch (error) {
    console.error('Failed to initialize lens:', error);
    currentLensPosition = createCenteredLens(0.3, 0.3);
    updateLensOverlay();
  }
}

/**
 * Update lens overlay position on screen.
 */
function updateLensOverlay(): void {
  if (!lensOverlay || !lensRect || !currentLensPosition) return;

  const imageRect = previewImage.getBoundingClientRect();
  if (!imageRect || imageRect.width === 0) return;

  // Convert normalized lens position to screen coordinates
  const screen = normalizedToScreenLens(
    currentLensPosition,
    imageRect.width,
    imageRect.height
  );

  // Position the lens rect
  lensRect.style.left = `${screen.x}px`;
  lensRect.style.top = `${screen.y}px`;
  lensRect.style.width = `${screen.width}px`;
  lensRect.style.height = `${screen.height}px`;

  // Update detail info
  if (detailInfo) {
    const item = getSelectedItem();
    if (item) {
      const transform = getItemTransform(item.id);
      const dims = getTransformedDimensions(item.width, item.height, transform);
      const region = normalizedToPixelRegion(currentLensPosition, dims.width, dims.height, transform);
      detailInfo.textContent = `${region.width} × ${region.height}px`;
    }
  }
}

/**
 * Load detail preview for current lens position.
 */
async function loadDetailPreview(): Promise<void> {
  if (!isLensEnabled || !currentLensPosition || isLoadingDetailPreview) return;

  const item = getSelectedItem();
  if (!item || !item.sourcePath) {
    showDetailPlaceholder();
    return;
  }

  isLoadingDetailPreview = true;

  try {
    const transform = getItemTransform(item.id);
    const dims = getTransformedDimensions(item.width, item.height, transform);
    
    // Convert lens position to pixel region
    const region = normalizedToPixelRegion(
      currentLensPosition,
      dims.width,
      dims.height,
      transform
    );

    // Get detail preview from main process
    const result = await window.reformat.getDetailPreview(item.sourcePath, {
      region: {
        left: region.left,
        top: region.top,
        width: region.width,
        height: region.height,
      },
      transform,
    });

    // Check if lens is still enabled and item is still selected
    if (!isLensEnabled || selectedItemId !== item.id) {
      return;
    }

    // Display detail preview
    if (detailImage) {
      detailImage.src = result.dataUrl;
    }
    if (detailWrapper) {
      detailWrapper.classList.remove('hidden');
    }
    if (detailPlaceholder) {
      detailPlaceholder.classList.add('hidden');
    }
    if (detailInfo) {
      detailInfo.textContent = `${result.width} × ${result.height}px`;
    }
  } catch (error) {
    console.error('Failed to load detail preview:', error);
    showDetailPlaceholder('Failed to load detail');
  } finally {
    isLoadingDetailPreview = false;
  }
}

/**
 * Show detail placeholder.
 */
function showDetailPlaceholder(message = 'Enable 100% Detail to view'): void {
  if (detailWrapper) {
    detailWrapper.classList.add('hidden');
  }
  if (detailPlaceholder) {
    detailPlaceholder.classList.remove('hidden');
    const textEl = detailPlaceholder.querySelector('.detail-placeholder-text');
    if (textEl) {
      textEl.textContent = message;
    }
  }
  if (detailInfo) {
    detailInfo.textContent = '';
  }
}

/**
 * Handle lens enable/disable toggle.
 */
function handleLensToggle(): void {
  if (isRunning) return;

  isLensEnabled = lensEnabledCheckbox?.checked ?? false;

  if (isLensEnabled) {
    showDetailPanel();
    showLensOverlay();
    // Wait for detail panel to be visible before initializing lens
    requestAnimationFrame(() => {
      initializeLensForItem();
    });
  } else {
    hideDetailPanel();
    hideLensOverlay();
    currentLensPosition = null;
    showDetailPlaceholder();
  }
}

/**
 * Handle lens drag start.
 */
function handleLensDragStart(e: MouseEvent): void {
  if (!currentLensPosition || !isLensEnabled) return;

  e.preventDefault();
  isLensDragging = true;
  lensDragStartX = e.clientX;
  lensDragStartY = e.clientY;
  lensDragStartPosition = { ...currentLensPosition };
}

/**
 * Handle lens drag move.
 */
function handleLensDragMove(e: MouseEvent): void {
  if (!isLensDragging || !lensDragStartPosition) return;

  e.preventDefault();

  const imageRect = previewImage.getBoundingClientRect();
  if (!imageRect || imageRect.width === 0) return;

  // Calculate delta in normalized coordinates
  const deltaX = (e.clientX - lensDragStartX) / imageRect.width;
  const deltaY = (e.clientY - lensDragStartY) / imageRect.height;

  // Move lens with clamping
  currentLensPosition = moveLens(lensDragStartPosition, deltaX, deltaY);
  updateLensOverlay();
}

/**
 * Handle lens drag end.
 */
function handleLensDragEnd(): void {
  if (!isLensDragging) return;

  isLensDragging = false;
  lensDragStartPosition = null;

  // Load detail preview at new position
  loadDetailPreview();
}

/**
 * Enable/disable transform buttons.
 */
function setTransformButtonsEnabled(enabled: boolean): void {
  const buttons = [rotateCWBtn, rotateCCWBtn, flipHBtn, flipVBtn, resetTransformBtn];
  buttons.forEach((btn) => {
    if (btn) btn.disabled = !enabled || !selectedItemId || isRunning;
  });
}

/**
 * Handle rotate clockwise.
 */
function handleRotateCW(): void {
  if (!selectedItemId || isRunning) return;
  const current = getItemTransform(selectedItemId);
  const newTransform = rotateTransformCW(current);
  setItemTransform(selectedItemId, newTransform);
  loadPreview();
}

/**
 * Handle rotate counter-clockwise.
 */
function handleRotateCCW(): void {
  if (!selectedItemId || isRunning) return;
  const current = getItemTransform(selectedItemId);
  const newTransform = rotateTransformCCW(current);
  setItemTransform(selectedItemId, newTransform);
  loadPreview();
}

/**
 * Handle horizontal flip.
 */
function handleFlipH(): void {
  if (!selectedItemId || isRunning) return;
  const current = getItemTransform(selectedItemId);
  const newTransform = flipTransformH(current);
  setItemTransform(selectedItemId, newTransform);
  loadPreview();
}

/**
 * Handle vertical flip.
 */
function handleFlipV(): void {
  if (!selectedItemId || isRunning) return;
  const current = getItemTransform(selectedItemId);
  const newTransform = flipTransformV(current);
  setItemTransform(selectedItemId, newTransform);
  loadPreview();
}

/**
 * Handle reset transform.
 */
function handleResetTransform(): void {
  if (!selectedItemId || isRunning) return;
  setItemTransform(selectedItemId, createIdentityTransform());
  loadPreview();
}

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
      transform: getItemTransform(item.id),
      crop: getItemCrop(item.id),
    })),
  };
}

/**
 * Check if any item in the list has crop enabled (active and not full image).
 */
function hasAnyCropEnabled(items: ImageItem[]): boolean {
  for (const item of items) {
    const crop = getItemCrop(item.id);
    if (isCropActive(crop)) {
      return true;
    }
  }
  return false;
}

/**
 * Enter crop queue mode for one-by-one crop & export.
 */
function enterCropQueueMode(items: ImageItem[]): void {
  isInCropQueueMode = true;
  cropQueueItems = [...items]; // Preserve order
  cropQueueCurrentIndex = 0;
  cropQueueCompletedIds = new Set();
  cropQueueCanceled = false;
  
  // Lock settings for the duration
  settingsStore.setLocked(true);
  
  // Hide normal action buttons, show queue UI
  if (cropQueueContainer) {
    cropQueueContainer.classList.remove('hidden');
  }
  convertBtn.classList.add('hidden');
  addMoreBtn.disabled = true;
  clearAllBtn.disabled = true;
  
  // Update the queue display
  updateCropQueueDisplay();
  
  // Select and show the first item
  const firstItem = cropQueueItems[0];
  if (firstItem) {
    selectItem(firstItem.id);
    // Enable crop for the first item if not already active
    const crop = getItemCrop(firstItem.id);
    if (!crop.active) {
      crop.active = true;
      initializeCropForItem(firstItem.id);
      setItemCrop(firstItem.id, crop);
    }
    updateCropOverlay();
  }
  
  // Update list item styles
  renderCropQueueListStyles();
}

/**
 * Update crop queue index display.
 */
function updateCropQueueDisplay(): void {
  if (cropQueueIndex) {
    cropQueueIndex.textContent = `${cropQueueCurrentIndex + 1} / ${cropQueueItems.length}`;
  }
}

/**
 * Render queue status styles on list items.
 */
function renderCropQueueListStyles(): void {
  if (!isInCropQueueMode) {
    // Remove all queue styles
    imageList.querySelectorAll('.image-list-item').forEach((el) => {
      el.classList.remove('queue-current', 'queue-pending', 'queue-done');
    });
    return;
  }
  
  cropQueueItems.forEach((item, index) => {
    const listItem = imageList.querySelector(`[data-id="${item.id}"]`);
    if (listItem) {
      listItem.classList.remove('queue-current', 'queue-pending', 'queue-done');
      
      if (cropQueueCompletedIds.has(item.id)) {
        listItem.classList.add('queue-done');
      } else if (index === cropQueueCurrentIndex) {
        listItem.classList.add('queue-current');
      } else if (index > cropQueueCurrentIndex) {
        listItem.classList.add('queue-pending');
      }
    }
  });
}

/**
 * Exit crop queue mode.
 */
function exitCropQueueMode(): void {
  isInCropQueueMode = false;
  cropQueueItems = [];
  cropQueueCurrentIndex = 0;
  cropQueueCompletedIds = new Set();
  cropQueueCanceled = false;
  
  // Unlock settings
  settingsStore.setLocked(false);
  
  // Restore normal UI
  if (cropQueueContainer) {
    cropQueueContainer.classList.add('hidden');
  }
  convertBtn.classList.remove('hidden');
  addMoreBtn.disabled = false;
  clearAllBtn.disabled = false;
  
  // Remove queue styles from list
  renderCropQueueListStyles();
}

/**
 * Process the current crop queue item (export it).
 */
async function processCropQueueCurrentItem(): Promise<void> {
  if (!isInCropQueueMode || cropQueueCanceled) return;
  
  const currentItem = cropQueueItems[cropQueueCurrentIndex];
  if (!currentItem) {
    exitCropQueueMode();
    return;
  }
  
  // Disable buttons during processing
  if (cropApplyBtn) cropApplyBtn.disabled = true;
  
  try {
    // Build config for just this item
    const config = buildRunConfig([currentItem]);
    
    // Export the single item
    const result = await window.reformat.startRun([currentItem], config);
    
    // Mark as completed
    cropQueueCompletedIds.add(currentItem.id);
    updateItemStatus(currentItem.id, result.results[0]?.status || 'completed');
    
    // Update list styles
    renderCropQueueListStyles();
    
    // Check if canceled during processing
    if (cropQueueCanceled) {
      finishCropQueue('canceled');
      return;
    }
    
    // Advance to next item
    cropQueueCurrentIndex++;
    
    if (cropQueueCurrentIndex >= cropQueueItems.length) {
      // All items processed
      finishCropQueue('completed');
    } else {
      // Show next item
      advanceToNextCropQueueItem();
    }
  } catch (error) {
    console.error('Crop queue item processing failed:', error);
    updateItemStatus(currentItem.id, 'failed');
    
    // Still advance to next item
    cropQueueCurrentIndex++;
    if (cropQueueCurrentIndex >= cropQueueItems.length) {
      finishCropQueue('completed');
    } else {
      advanceToNextCropQueueItem();
    }
  } finally {
    if (cropApplyBtn) cropApplyBtn.disabled = false;
  }
}

/**
 * Advance to the next item in the crop queue.
 */
function advanceToNextCropQueueItem(): void {
  if (!isInCropQueueMode) return;
  
  const nextItem = cropQueueItems[cropQueueCurrentIndex];
  if (!nextItem) return;
  
  // Reset transform for the next item (per spec: "Rotate/flip resets per item when advancing")
  setItemTransform(nextItem.id, createIdentityTransform());
  
  // Initialize crop if not already active
  const crop = getItemCrop(nextItem.id);
  if (!crop.active) {
    crop.active = true;
    setItemCrop(nextItem.id, crop);
  }
  initializeCropForItem(nextItem.id);
  
  // Select the item
  selectItem(nextItem.id);
  
  // Update display
  updateCropQueueDisplay();
  renderCropQueueListStyles();
}

/**
 * Finish the crop queue and show summary.
 */
function finishCropQueue(reason: 'completed' | 'canceled'): void {
  const completed = cropQueueCompletedIds.size;
  const total = cropQueueItems.length;
  const remaining = total - completed;
  
  // Build status message
  let statusMsg: string;
  if (reason === 'canceled') {
    statusMsg = `${completed} converted, ${remaining} canceled`;
  } else {
    statusMsg = `${completed} converted`;
  }
  
  store.setStatus(statusMsg);
  
  // Try to open output folder if any items were exported
  if (completed > 0) {
    // Get the output folder from the last successful result
    // Note: This is a best-effort approach
    (async () => {
      try {
        const downloadsPath = await window.reformat.getDownloadsPath();
        await window.reformat.openFolder(downloadsPath);
      } catch (err) {
        console.warn('Failed to open output folder:', err);
      }
    })();
  }
  
  exitCropQueueMode();
}

/**
 * Cancel the crop queue.
 */
async function cancelCropQueue(): Promise<void> {
  if (!isInCropQueueMode) return;
  
  // Show confirmation
  const confirmed = window.confirm('Cancel remaining items?');
  if (!confirmed) return;
  
  cropQueueCanceled = true;
  
  // Mark remaining items as canceled
  for (let i = cropQueueCurrentIndex; i < cropQueueItems.length; i++) {
    const item = cropQueueItems[i];
    if (!cropQueueCompletedIds.has(item.id)) {
      updateItemStatus(item.id, 'canceled');
    }
  }
  
  finishCropQueue('canceled');
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
  
  // Update transform buttons
  setTransformButtonsEnabled(!running);
  
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
  
  // Check if we should enter crop queue mode:
  // - More than one item AND
  // - At least one item has crop enabled (active and different from full image)
  if (items.length > 1 && hasAnyCropEnabled(items)) {
    enterCropQueueMode(items);
    return;
  }
  
  // Normal export (no crop queue)
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
 * Cancel current export run with confirmation dialog.
 */
async function cancelExport(skipConfirm = false): Promise<void> {
  if (!currentRunId || !isRunning) return;
  
  // Show confirmation dialog unless skipped
  if (!skipConfirm) {
    const confirmed = window.confirm('Cancel remaining items?');
    if (!confirmed) return;
  }
  
  try {
    await window.reformat.cancelRun(currentRunId);
    store.setStatus('Canceling...');
  } catch (error) {
    console.error('Cancel failed:', error);
  }
}

/**
 * Handle keyboard shortcuts.
 */
function handleKeyDown(event: KeyboardEvent): void {
  // Esc key to cancel
  if (event.key === 'Escape') {
    event.preventDefault();
    if (isInCropQueueMode) {
      cancelCropQueue();
    } else if (isRunning) {
      cancelExport();
    }
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
  li.tabIndex = 0; // Make focusable for keyboard navigation

  const info = formatItemInfo(item);

  li.innerHTML = `
    <span class="item-name" title="${item.sourcePath || item.originalName}">${info.name}</span>
    <span class="item-dimensions">${info.dimensions}</span>
    <span class="item-size">${info.size}</span>
    <button class="item-remove" title="Remove">×</button>
  `;

  // Handle click for selection
  li.addEventListener('click', (e) => {
    // Don't select if clicking the remove button
    if ((e.target as HTMLElement).classList.contains('item-remove')) {
      return;
    }
    // Don't allow manual selection during crop queue mode
    if (isInCropQueueMode) {
      return;
    }
    selectItem(item.id);
  });

  // Handle keyboard selection
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Don't allow manual selection during crop queue mode
      if (isInCropQueueMode) {
        return;
      }
      selectItem(item.id);
    }
  });

  // Handle remove button
  const removeBtn = li.querySelector('.item-remove') as HTMLButtonElement;
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Don't allow removal during crop queue mode or regular run
    if (isInCropQueueMode || isRunning) {
      return;
    }
    // If this item is selected, clear selection
    if (selectedItemId === item.id) {
      selectItem(null);
    }
    store.removeItems([item.id]);
  });

  // Mark as selected if this is the currently selected item
  if (selectedItemId === item.id) {
    li.classList.add('selected');
  }

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

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyDown);

  selectFilesBtn.addEventListener('click', handleSelectFiles);
  addMoreBtn.addEventListener('click', handleSelectFiles);
  clearAllBtn.addEventListener('click', () => {
    selectItem(null); // Clear selection before clearing items
    store.clearItems();
    store.setStatus('Ready');
  });
  
  // Convert button
  convertBtn.addEventListener('click', startExport);
  
  // Cancel button (with confirmation dialog)
  cancelBtn.addEventListener('click', () => cancelExport());

  // Crop queue buttons
  if (cropApplyBtn) {
    cropApplyBtn.addEventListener('click', processCropQueueCurrentItem);
  }
  if (cropCancelBtn) {
    cropCancelBtn.addEventListener('click', cancelCropQueue);
  }

  // Preview transform buttons
  if (rotateCWBtn) rotateCWBtn.addEventListener('click', handleRotateCW);
  if (rotateCCWBtn) rotateCCWBtn.addEventListener('click', handleRotateCCW);
  if (flipHBtn) flipHBtn.addEventListener('click', handleFlipH);
  if (flipVBtn) flipVBtn.addEventListener('click', handleFlipV);
  if (resetTransformBtn) resetTransformBtn.addEventListener('click', handleResetTransform);

  // Crop controls
  if (cropEnabledCheckbox) {
    cropEnabledCheckbox.addEventListener('change', handleCropToggle);
  }
  if (cropRatioSelect) {
    cropRatioSelect.addEventListener('change', handleCropRatioChange);
  }

  // Crop overlay drag handlers
  if (cropSelection) {
    cropSelection.addEventListener('mousedown', handleCropDragStart);
  }
  document.addEventListener('mousemove', handleCropDragMove);
  document.addEventListener('mouseup', handleCropDragEnd);

  // Crop handle drag handlers
  const cropHandles = document.querySelectorAll('.crop-handle');
  cropHandles.forEach((handle) => {
    handle.addEventListener('mousedown', (e) => {
      const handleEl = e.target as HTMLElement;
      const handleType = handleEl.dataset.handle;
      if (handleType) {
        handleCropDragStart(e as MouseEvent, handleType);
      }
    });
  });

  // Lens (100% detail) controls
  if (lensEnabledCheckbox) {
    lensEnabledCheckbox.addEventListener('change', handleLensToggle);
  }

  // Lens drag handlers
  if (lensRect) {
    lensRect.addEventListener('mousedown', handleLensDragStart);
  }
  document.addEventListener('mousemove', handleLensDragMove);
  document.addEventListener('mouseup', handleLensDragEnd);

  // Initialize preview state
  setTransformButtonsEnabled(false);
  showPreviewPlaceholder();

  // Subscribe to store changes
  store.subscribe((state, event) => {
    if (event === 'items-added' || event === 'items-removed' || event === 'change') {
      renderImageList();
      
      // Handle selection when items change
      if (event === 'items-added' && state.items.length > 0 && !selectedItemId) {
        // Auto-select first item when adding to empty list
        selectItem(state.items[0].id);
      } else if (event === 'items-removed') {
        // Check if selected item was removed
        if (selectedItemId && !state.items.find((i) => i.id === selectedItemId)) {
          // Select first remaining item if any
          if (state.items.length > 0) {
            selectItem(state.items[0].id);
          } else {
            selectItem(null);
          }
        }
      }
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

