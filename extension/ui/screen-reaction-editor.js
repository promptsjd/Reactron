/**
 * Reactron Screen C: Reaction Configuration Editor
 * 
 * Capabilities:
 * - Two radio buttons ("Gif/Image" and "Text") disabled until an area is selected.
 * - Single reaction configured per slot with its own unique ID and parent regionId link.
 * - No "Independent Reactions" notice box and no "Enable GIF/Text" checkboxes.
 * - No manual Reaction Name input (uses centralized "Reaction 1", "Reaction 2" naming rule).
 * - Order of controls once radio option is selected:
 *   1. Load from Library (recent on top, usable items only)
 *   2. Media/Text & styling controls (with filler defaults)
 *   3. Reposition button ("Reposition" <-> "Done Repositioning")
 *   4. Preview button (fires immediately on click, independent of trigger delay)
 *   5. Trigger Delay slider
 *   6. Display Duration slider
 *   7. Save to Reaction Library checkbox
 *   8. Cancel & Save buttons
 */

import {
  createButton,
  createTextInput,
  createSlider,
  createSelect,
  createColorPicker,
  createRadioGroup,
  createPresetDropdown
} from './components.js';
import {
  FONT_OPTIONS,
  ANIMATION_OPTIONS,
  REACTION_CONFIG_CONSTANTS
} from '../shared/types.js';
import { VALIDATION_LIMITS, validateReactionContent } from '../shared/validation.js';
import { RegionManagementService } from '../services/region-management-service.js';
import { MediaService } from '../services/media-service.js';
import { OverlayEngineService } from '../services/overlay-engine.js';
import { mediaStorage } from '../services/media-storage.js';
import { persistenceService } from '../services/persistence-service.js';

export function createReactionEditor({
  config,
  configIndex = 0,
  isAreaSelected = false,
  onSave,
  onCancel
}) {
  const editorRoot = document.createElement('div');
  editorRoot.className = 'r-reaction-editor';

  // State: deep clone to ensure atomic cancel leaves original intact
  const workingConfig = RegionManagementService.cloneConfiguration(config);
  const generatedLabel = RegionManagementService.formatConfigurationLabel(workingConfig, configIndex);

  const gifFiller = REACTION_CONFIG_CONSTANTS.FILLER_DEFAULTS.GIF;
  const textFiller = REACTION_CONFIG_CONSTANTS.FILLER_DEFAULTS.TEXT;

  // Determine initial selected radio type ('gif' | 'text' | null)
  let selectedType =
    workingConfig.type ||
    (workingConfig.gifReaction?.enabled
      ? REACTION_CONFIG_CONSTANTS.TYPES.GIF
      : workingConfig.textReaction?.enabled
        ? REACTION_CONFIG_CONSTANTS.TYPES.TEXT
        : null);

  // Active reposition tracking
  let activeRepositionType = null; // 'gif' | 'text' | null

  // Snapshots of loaded presets to detect whether any modification was made
  let loadedGifPresetSnapshot = null;
  let loadedTextPresetSnapshot = null;

  // Ensure working sub-objects exist with clean defaults
  const gifData = workingConfig.gifReaction || {
    enabled: selectedType === REACTION_CONFIG_CONSTANTS.TYPES.GIF,
    name: generatedLabel,
    fileUrl: '',
    fileName: '',
    size: gifFiller.size,
    delaySeconds: gifFiller.delaySeconds,
    durationSeconds: gifFiller.durationSeconds,
    saveToLibrary: false,
    position: { ...gifFiller.position }
  };
  gifData.name = generatedLabel;
  if (gifData.fileUrl === undefined || gifData.fileUrl === null) {
    gifData.fileUrl = '';
  }
  if (gifData.fileName === undefined || gifData.fileName === null) {
    gifData.fileName = '';
  }
  workingConfig.gifReaction = gifData;

  const textData = workingConfig.textReaction || {
    enabled: selectedType === REACTION_CONFIG_CONSTANTS.TYPES.TEXT,
    name: generatedLabel,
    text: '',
    fontSize: textFiller.fontSize,
    fontColor: textFiller.fontColor,
    fontType: textFiller.fontType,
    animationStyle: textFiller.animationStyle,
    delaySeconds: textFiller.delaySeconds,
    durationSeconds: textFiller.durationSeconds,
    saveToLibrary: false,
    position: { ...textFiller.position }
  };
  textData.name = generatedLabel;
  if (textData.text === undefined || textData.text === null) {
    textData.text = '';
  }
  workingConfig.textReaction = textData;

  function buildGifSnapshot(data) {
    return JSON.stringify({
      mediaAssetId: data.mediaAssetId || null,
      fileUrl: data.fileUrl || '',
      fileName: data.fileName || '',
      size: data.size || gifFiller.size,
      delaySeconds: data.delaySeconds ?? gifFiller.delaySeconds,
      durationSeconds: data.durationSeconds || gifFiller.durationSeconds,
      position: data.position || gifFiller.position
    });
  }

  function buildTextSnapshot(data) {
    return JSON.stringify({
      text: (data.text || '').trim(),
      fontSize: data.fontSize || textFiller.fontSize,
      fontColor: data.fontColor || textFiller.fontColor,
      fontType: data.fontType || textFiller.fontType,
      animationStyle: data.animationStyle || textFiller.animationStyle,
      delaySeconds: data.delaySeconds ?? textFiller.delaySeconds,
      durationSeconds: data.durationSeconds || textFiller.durationSeconds,
      position: data.position || textFiller.position
    });
  }

  function isLoadedPresetUnchanged(type) {
    if (type === REACTION_CONFIG_CONSTANTS.TYPES.GIF) {
      if (!loadedGifPresetSnapshot) return false;
      return buildGifSnapshot(gifData) === loadedGifPresetSnapshot;
    }
    if (type === REACTION_CONFIG_CONSTANTS.TYPES.TEXT) {
      if (!loadedTextPresetSnapshot) return false;
      return buildTextSnapshot(textData) === loadedTextPresetSnapshot;
    }
    return false;
  }

  function syncTypeState(type) {
    selectedType = type;
    workingConfig.type = type;
    gifData.enabled = type === REACTION_CONFIG_CONSTANTS.TYPES.GIF;
    textData.enabled = type === REACTION_CONFIG_CONSTANTS.TYPES.TEXT;
    gifData.name = generatedLabel;
    textData.name = generatedLabel;
  }

  syncTypeState(selectedType);

  // ==========================================
  // RADIO BUTTONS: "Gif/Image" and "Text"
  // Disabled until an area is selected
  // ==========================================
  const radioGroup = createRadioGroup({
    name: `reaction-type-${workingConfig.id}`,
    options: REACTION_CONFIG_CONSTANTS.RADIO_OPTIONS,
    selectedValue: selectedType,
    disabled: !isAreaSelected,
    onChange: async (newType) => {
      if (activeRepositionType && activeRepositionType !== newType) {
        await OverlayEngineService.cancelReposition(null);
        activeRepositionType = null;
        document.body.classList.remove('r-reposition-lock');
        repositionGifBtn.classList.remove('r-reposition-active-btn', 'r-btn-primary');
        repositionTextBtn.classList.remove('r-reposition-active-btn', 'r-btn-primary');
      }
      syncTypeState(newType);
      updateVisiblePanel();
      syncSaveButtonState();
    }
  });
  editorRoot.appendChild(radioGroup);

  const panelsWrapper = document.createElement('div');
  panelsWrapper.className = 'r-editor-panels';

  // Helper to build immediate preview config (delaySeconds = 0 so preview appears immediately on click)
  function buildImmediatePreviewConfig(type) {
    if (type === REACTION_CONFIG_CONSTANTS.TYPES.GIF) {
      return {
        id: workingConfig.id,
        regionId: workingConfig.regionId,
        type: REACTION_CONFIG_CONSTANTS.TYPES.GIF,
        gifReaction: {
          ...gifData,
          enabled: true,
          delaySeconds: 0,
          durationSeconds: gifData.durationSeconds || gifFiller.durationSeconds
        },
        textReaction: { enabled: false }
      };
    }
    return {
      id: workingConfig.id,
      regionId: workingConfig.regionId,
      type: REACTION_CONFIG_CONSTANTS.TYPES.TEXT,
      gifReaction: { enabled: false },
      textReaction: {
        ...textData,
        enabled: true,
        delaySeconds: 0,
        durationSeconds: textData.durationSeconds || textFiller.durationSeconds
      }
    };
  }

  // ==========================================
  // PANEL 1: GIF / Image Reaction Settings
  // ==========================================
  const gifPanel = document.createElement('div');
  gifPanel.className = 'r-editor-panel';

  const gifFieldsContainer = document.createElement('div');
  gifFieldsContainer.className = 'r-subfields';

  // 1. Load from Library Selector (GIF - visual thumbnail dropdown)
  const gifPresetDropdown = createPresetDropdown({
    label: 'Load from Library',
    placeholder: '-- Select saved GIF preset --',
    presets: [],
    resolveMedia: (assetId) => mediaStorage.getMedia(assetId),
    onSelect: (preset) => {
      if (!preset) return;

      fileErrorEl.classList.remove('visible');
      fileErrorEl.textContent = '';

      const cloned = preset.content
        ? JSON.parse(JSON.stringify(preset.content))
        : {
            size: gifFiller.size,
            delaySeconds: gifFiller.delaySeconds,
            durationSeconds: gifFiller.durationSeconds,
            position: { ...gifFiller.position }
          };

      gifData.enabled = true;
      gifData.name = generatedLabel;
      gifData.mediaAssetId = cloned.mediaAssetId || preset.mediaAssetId || null;
      gifData.fileUrl = cloned.fileUrl || '';
      gifData.fileName = cloned.fileName || '';
      gifData.size = cloned.size || gifFiller.size;
      gifData.delaySeconds = cloned.delaySeconds ?? gifFiller.delaySeconds;
      gifData.durationSeconds = cloned.durationSeconds || gifFiller.durationSeconds;
      gifData.saveToLibrary = false;
      gifData.libraryPresetId = null;
      gifData._createNewLibraryPreset = true;
      gifData.position = cloned.position ? { ...cloned.position } : { ...gifFiller.position };
      workingConfig.gifReaction = gifData;

      sizeSlider.setValue(gifData.size);
      gifDelaySlider.setValue(gifData.delaySeconds);
      gifDurationSlider.setValue(gifData.durationSeconds);
      gifSaveCheckbox.checked = false;
      updateFileDisplay();

      loadedGifPresetSnapshot = buildGifSnapshot(gifData);
      syncSaveButtonState();

      if (gifData.mediaAssetId && !gifData.fileUrl) {
        mediaStorage.getMedia(gifData.mediaAssetId).then((media) => {
          if (media && media.dataUrl) {
            gifData.fileUrl = media.dataUrl;
            if (media.fileName) gifData.fileName = media.fileName;
            updateFileDisplay();
            loadedGifPresetSnapshot = buildGifSnapshot(gifData);
            syncSaveButtonState();
          }
        }).catch((err) => {
          console.warn('[ReactionEditor] Failed to hydrate preset media:', err);
        });
      }
    }
  });

  persistenceService.getLibraryPresets('gif').then((presets) => {
    const validGifPresets = (Array.isArray(presets) ? presets : []).filter(
      (p) => p && (p.mediaAssetId || p.content?.mediaAssetId || p.content?.fileUrl || p.summary)
    );
    gifPresetDropdown.setPresets(validGifPresets);
  }).catch((err) => {
    console.warn('[ReactionEditor] Could not load GIF presets:', err);
  });

  gifFieldsContainer.appendChild(gifPresetDropdown);

  // 2. File Selection Area with Genuine Validation
  const fileArea = document.createElement('div');
  fileArea.className = 'r-file-selection-area';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/gif,image/png,image/jpeg,image/webp';
  fileInput.style.display = 'none';

  const filePreviewBox = document.createElement('div');
  filePreviewBox.className = 'r-file-preview-box';

  function updateFileDisplay() {
    const hasImg = Boolean((gifData.fileUrl || '').trim());
    filePreviewBox.innerHTML = `
      <div class="r-file-thumb-wrapper">
        ${hasImg ? `<img src="${gifData.fileUrl}" class="r-file-thumb" alt="Thumbnail" />` : '<span class="r-file-icon">🖼️</span>'}
      </div>
      <div class="r-file-info">
        <span class="r-file-name">${gifData.fileName || 'No file selected'}</span>
        <span class="r-file-meta">${hasImg ? 'Custom image loaded' : 'Select a GIF, PNG, JPG, or WebP file'}</span>
      </div>
    `;
  }
  updateFileDisplay();

  // Hydrate binary media from mediaStorage if mediaAssetId is present and fileUrl is missing
  if (gifData.mediaAssetId && !gifData.fileUrl) {
    mediaStorage.getMedia(gifData.mediaAssetId).then((media) => {
      if (media && media.dataUrl) {
        gifData.fileUrl = media.dataUrl;
        if (!gifData.fileName && media.fileName) gifData.fileName = media.fileName;
        updateFileDisplay();
      }
    }).catch((err) => {
      console.warn('[ReactionEditor] Failed to fetch media from IndexedDB:', err);
    });
  }

  const fileSelectBtn = createButton({
    text: 'Select File',
    variant: 'outline',
    className: 'r-btn-sm',
    onClick: () => fileInput.click()
  });

  const fileErrorEl = document.createElement('div');
  fileErrorEl.className = 'r-field-error';

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    fileErrorEl.classList.remove('visible');
    fileErrorEl.textContent = '';

    const result = await MediaService.validateAndProcessFile(file);
    if (!result.isValid) {
      fileErrorEl.textContent = result.error;
      fileErrorEl.classList.add('visible');
      return;
    }

    gifData.fileUrl = result.dataUrl;
    gifData.fileName = result.fileName;
    gifData.mediaAssetId = null;
    updateFileDisplay();
    syncSaveButtonState();
  });

  fileArea.appendChild(filePreviewBox);
  fileArea.appendChild(fileSelectBtn);
  fileArea.appendChild(fileInput);
  gifFieldsContainer.appendChild(fileArea);
  gifFieldsContainer.appendChild(fileErrorEl);

  // 3. Size Slider
  const sizeSlider = createSlider({
    label: 'Overlay Size',
    min: 80,
    max: 400,
    step: 10,
    value: gifData.size || gifFiller.size,
    unit: 'px',
    helperText: 'Controls displayed image width on the game screen',
    onChange: (val) => {
      gifData.size = val;
      syncSaveButtonState();
    }
  });
  gifFieldsContainer.appendChild(sizeSlider);

  // 4. Reposition Button (GIF)
  const repositionGifBtn = createButton({
    text: 'Reposition GIF/Image',
    variant: 'secondary',
    className: 'r-btn-full r-mb-sm',
    onClick: async () => {
      if (activeRepositionType === 'gif') {
        await commitActiveRepositionIfNeeded();
      } else {
        const val = validateReactionContent(REACTION_CONFIG_CONSTANTS.TYPES.GIF, gifData, textData);
        if (!val.isValid) {
          fileErrorEl.textContent = val.error;
          fileErrorEl.classList.add('visible');
          return;
        }
        await commitActiveRepositionIfNeeded();
        activeRepositionType = 'gif';
        await OverlayEngineService.startReposition(null, 'gif', gifData);
        repositionGifBtn.innerHTML = '<span class="r-btn-text">Done Repositioning</span>';
        repositionGifBtn.classList.add('r-btn-primary', 'r-reposition-active-btn');
        document.body.classList.add('r-reposition-lock');
      }
    }
  });
  gifFieldsContainer.appendChild(repositionGifBtn);

  // 5. Preview Button (GIF) - Appears right after Reposition button, before Trigger Delay & Display Duration
  const previewGifBtn = createButton({
    text: 'Preview',
    variant: 'secondary',
    className: 'r-btn-full r-mb-md',
    onClick: async () => {
      const val = validateReactionContent(REACTION_CONFIG_CONSTANTS.TYPES.GIF, gifData, textData);
      if (!val.isValid) {
        fileErrorEl.textContent = val.error;
        fileErrorEl.classList.add('visible');
        return;
      }
      await commitActiveRepositionIfNeeded();
      const immediateConfig = buildImmediatePreviewConfig(REACTION_CONFIG_CONSTANTS.TYPES.GIF);
      await OverlayEngineService.previewReaction(null, immediateConfig);
    }
  });
  gifFieldsContainer.appendChild(previewGifBtn);

  // 6. Trigger Delay Slider (not part of preview)
  const gifDelaySlider = createSlider({
    label: 'Trigger Delay',
    min: VALIDATION_LIMITS.DELAY_MIN,
    max: VALIDATION_LIMITS.DELAY_MAX,
    step: VALIDATION_LIMITS.DELAY_STEP,
    value: gifData.delaySeconds ?? gifFiller.delaySeconds,
    unit: 's',
    helperText: 'Delay before overlay appears after trigger',
    onChange: (val) => {
      gifData.delaySeconds = val;
      syncSaveButtonState();
    }
  });
  gifFieldsContainer.appendChild(gifDelaySlider);

  // 7. Display Duration Slider (not part of preview)
  const gifDurationSlider = createSlider({
    label: 'Display Duration',
    min: VALIDATION_LIMITS.DURATION_MIN,
    max: VALIDATION_LIMITS.DURATION_MAX,
    step: VALIDATION_LIMITS.DURATION_STEP,
    value: gifData.durationSeconds || gifFiller.durationSeconds,
    unit: 's',
    helperText: 'How long the GIF remains on screen',
    onChange: (val) => {
      gifData.durationSeconds = val;
      syncSaveButtonState();
    }
  });
  gifFieldsContainer.appendChild(gifDurationSlider);

  // 8. Save to Library Checkbox
  const gifLibraryBox = document.createElement('div');
  gifLibraryBox.className = 'r-checkbox-group';
  gifLibraryBox.innerHTML = `
    <label class="r-checkbox-label">
      <input type="checkbox" class="r-gif-lib-check" ${gifData.saveToLibrary ? 'checked' : ''} />
      <span>Save to Reaction Library</span>
    </label>
    <p class="r-checkbox-hint r-gif-lib-hint">
      Will be accessible from Reaction Library across all games.
    </p>
  `;
  gifFieldsContainer.appendChild(gifLibraryBox);

  const gifSaveCheckbox = gifLibraryBox.querySelector('.r-gif-lib-check');
  const gifLibHint = gifLibraryBox.querySelector('.r-gif-lib-hint');
  gifSaveCheckbox.addEventListener('change', () => {
    gifData.saveToLibrary = gifSaveCheckbox.checked;
    syncSaveButtonState();
  });

  gifPanel.appendChild(gifFieldsContainer);

  // ==========================================
  // PANEL 2: Text Reaction Settings
  // ==========================================
  const textPanel = document.createElement('div');
  textPanel.className = 'r-editor-panel';

  const textFieldsContainer = document.createElement('div');
  textFieldsContainer.className = 'r-subfields';

  // 1. Load from Library Selector (Text - visual thumbnail dropdown)
  const textPresetDropdown = createPresetDropdown({
    label: 'Load from Library',
    placeholder: '-- Select saved Text preset --',
    presets: [],
    onSelect: (preset) => {
      if (!preset) return;

      const fallbackText = preset.summary
        ? preset.summary.split('•')[0].replace(/"/g, '').trim()
        : '';

      const cloned = preset.content
        ? JSON.parse(JSON.stringify(preset.content))
        : {
            text: fallbackText,
            fontSize: textFiller.fontSize,
            fontColor: textFiller.fontColor,
            fontType: textFiller.fontType,
            animationStyle: textFiller.animationStyle,
            delaySeconds: textFiller.delaySeconds,
            durationSeconds: textFiller.durationSeconds,
            position: { ...textFiller.position }
          };

      textData.enabled = true;
      textData.name = generatedLabel;
      textData.text = MediaService.sanitizeText(cloned.text || fallbackText || '');
      textData.fontSize = cloned.fontSize || textFiller.fontSize;
      textData.fontColor = cloned.fontColor || textFiller.fontColor;
      textData.fontType = cloned.fontType || textFiller.fontType;
      textData.animationStyle = cloned.animationStyle || textFiller.animationStyle;
      textData.delaySeconds = cloned.delaySeconds ?? textFiller.delaySeconds;
      textData.durationSeconds = cloned.durationSeconds || textFiller.durationSeconds;
      textData.saveToLibrary = false;
      textData.libraryPresetId = null;
      textData._createNewLibraryPreset = true;
      textData.position = cloned.position ? { ...cloned.position } : { ...textFiller.position };
      workingConfig.textReaction = textData;

      textInputField.setValue(textData.text);
      textInputField.setError(null);

      const sizeSelectEl = sizeSelect.querySelector('select');
      if (sizeSelectEl) sizeSelectEl.value = String(textData.fontSize);
      colorPicker.setValue(textData.fontColor);
      const fontSelectEl = fontSelect.querySelector('select');
      if (fontSelectEl) fontSelectEl.value = textData.fontType;
      const animSelectEl = animSelect.querySelector('select');
      if (animSelectEl) animSelectEl.value = textData.animationStyle;

      textDelaySlider.setValue(textData.delaySeconds);
      textDurationSlider.setValue(textData.durationSeconds);
      textSaveCheckbox.checked = false;

      loadedTextPresetSnapshot = buildTextSnapshot(textData);
      syncSaveButtonState();
    }
  });

  persistenceService.getLibraryPresets('text').then((presets) => {
    const validTextPresets = (Array.isArray(presets) ? presets : []).filter(
      (p) => p && ((p.content?.text && p.content.text.trim().length > 0) || p.summary)
    );
    textPresetDropdown.setPresets(validTextPresets);
  }).catch((err) => {
    console.warn('[ReactionEditor] Could not load Text presets:', err);
  });

  textFieldsContainer.appendChild(textPresetDropdown);

  // 2. Reaction Text input (starts empty with input placeholder, no reaction name input)
  const textInputField = createTextInput({
    label: 'Reaction Text',
    value: textData.text || '',
    placeholder: textFiller.placeholder,
    maxLength: 40,
    onChange: (val) => {
      textData.text = MediaService.sanitizeText(val);
      textInputField.setError(null);
      syncSaveButtonState();
    }
  });
  textFieldsContainer.appendChild(textInputField);

  // 3. Font Size and Font Color side by side
  const rowSizeColor = document.createElement('div');
  rowSizeColor.className = 'r-field-row-2';

  const sizeSelect = createSelect({
    label: 'Font Size',
    options: [
      { id: '18', label: '18px (Small)' },
      { id: '24', label: '24px (Medium)' },
      { id: '32', label: '32px (Large)' },
      { id: '44', label: '44px (Extra Large)' },
      { id: '56', label: '56px (Huge)' }
    ],
    selectedValue: String(textData.fontSize || textFiller.fontSize),
    onChange: (val) => {
      textData.fontSize = parseInt(val, 10);
      syncSaveButtonState();
    }
  });

  const colorPicker = createColorPicker({
    label: 'Font Color',
    value: textData.fontColor || textFiller.fontColor,
    onChange: (val) => {
      textData.fontColor = val;
      syncSaveButtonState();
    }
  });

  rowSizeColor.appendChild(sizeSelect);
  rowSizeColor.appendChild(colorPicker);
  textFieldsContainer.appendChild(rowSizeColor);

  // 4. Font Type and Animation Style side by side
  const rowTypeAnim = document.createElement('div');
  rowTypeAnim.className = 'r-field-row-2';

  const fontSelect = createSelect({
    label: 'Font Type',
    options: FONT_OPTIONS,
    selectedValue: textData.fontType || textFiller.fontType,
    onChange: (val) => {
      textData.fontType = val;
      syncSaveButtonState();
    }
  });

  const animSelect = createSelect({
    label: 'Animation Style',
    options: ANIMATION_OPTIONS,
    selectedValue: textData.animationStyle || textFiller.animationStyle,
    onChange: (val) => {
      textData.animationStyle = val;
      syncSaveButtonState();
    }
  });

  rowTypeAnim.appendChild(fontSelect);
  rowTypeAnim.appendChild(animSelect);
  textFieldsContainer.appendChild(rowTypeAnim);

  // 5. Reposition Text Button
  const repositionTextBtn = createButton({
    text: 'Reposition Text',
    variant: 'secondary',
    className: 'r-btn-full r-mb-sm',
    onClick: async () => {
      if (activeRepositionType === 'text') {
        await commitActiveRepositionIfNeeded();
      } else {
        const val = validateReactionContent(REACTION_CONFIG_CONSTANTS.TYPES.TEXT, gifData, textData);
        if (!val.isValid) {
          textInputField.setError(val.error);
          return;
        }
        await commitActiveRepositionIfNeeded();
        activeRepositionType = 'text';
        await OverlayEngineService.startReposition(null, 'text', textData);
        repositionTextBtn.innerHTML = '<span class="r-btn-text">Done Repositioning</span>';
        repositionTextBtn.classList.add('r-btn-primary', 'r-reposition-active-btn');
        document.body.classList.add('r-reposition-lock');
      }
    }
  });
  textFieldsContainer.appendChild(repositionTextBtn);

  // 6. Preview Button (Text) - Appears right after Reposition button, before Trigger Delay & Display Duration
  const previewTextBtn = createButton({
    text: 'Preview',
    variant: 'secondary',
    className: 'r-btn-full r-mb-md',
    onClick: async () => {
      const val = validateReactionContent(REACTION_CONFIG_CONSTANTS.TYPES.TEXT, gifData, textData);
      if (!val.isValid) {
        textInputField.setError(val.error);
        return;
      }
      await commitActiveRepositionIfNeeded();
      const immediateConfig = buildImmediatePreviewConfig(REACTION_CONFIG_CONSTANTS.TYPES.TEXT);
      await OverlayEngineService.previewReaction(null, immediateConfig);
    }
  });
  textFieldsContainer.appendChild(previewTextBtn);

  // 7. Trigger Delay Slider (not part of preview)
  const textDelaySlider = createSlider({
    label: 'Trigger Delay',
    min: VALIDATION_LIMITS.DELAY_MIN,
    max: VALIDATION_LIMITS.DELAY_MAX,
    step: VALIDATION_LIMITS.DELAY_STEP,
    value: textData.delaySeconds ?? textFiller.delaySeconds,
    unit: 's',
    helperText: 'Delay before text appears after trigger',
    onChange: (val) => {
      textData.delaySeconds = val;
      syncSaveButtonState();
    }
  });
  textFieldsContainer.appendChild(textDelaySlider);

  // 8. Display Duration Slider (not part of preview)
  const textDurationSlider = createSlider({
    label: 'Display Duration',
    min: VALIDATION_LIMITS.DURATION_MIN,
    max: VALIDATION_LIMITS.DURATION_MAX,
    step: VALIDATION_LIMITS.DURATION_STEP,
    value: textData.durationSeconds || textFiller.durationSeconds,
    unit: 's',
    helperText: 'How long the text remains on screen',
    onChange: (val) => {
      textData.durationSeconds = val;
      syncSaveButtonState();
    }
  });
  textFieldsContainer.appendChild(textDurationSlider);

  // 9. Save to Library Checkbox
  const textLibraryBox = document.createElement('div');
  textLibraryBox.className = 'r-checkbox-group';
  textLibraryBox.innerHTML = `
    <label class="r-checkbox-label">
      <input type="checkbox" class="r-text-lib-check" ${textData.saveToLibrary ? 'checked' : ''} />
      <span>Save to Reaction Library</span>
    </label>
    <p class="r-checkbox-hint r-text-lib-hint">
      Will be accessible from Reaction Library across all games.
    </p>
  `;
  textFieldsContainer.appendChild(textLibraryBox);

  const textSaveCheckbox = textLibraryBox.querySelector('.r-text-lib-check');
  const textLibHint = textLibraryBox.querySelector('.r-text-lib-hint');
  textSaveCheckbox.addEventListener('change', () => {
    textData.saveToLibrary = textSaveCheckbox.checked;
    syncSaveButtonState();
  });

  textPanel.appendChild(textFieldsContainer);

  // Append Panels
  panelsWrapper.appendChild(gifPanel);
  panelsWrapper.appendChild(textPanel);
  editorRoot.appendChild(panelsWrapper);

  // Helper to commit an active reposition session and reset button UI state
  async function commitActiveRepositionIfNeeded() {
    if (!activeRepositionType) return;
    const finishedType = activeRepositionType;
    activeRepositionType = null;

    const res = await OverlayEngineService.finishReposition(null);
    if (res?.position) {
      if (finishedType === 'gif') gifData.position = res.position;
      if (finishedType === 'text') textData.position = res.position;
    }

    document.body.classList.remove('r-reposition-lock');

    if (finishedType === 'gif') {
      repositionGifBtn.innerHTML = '<span class="r-btn-text">Reposition GIF/Image</span>';
      repositionGifBtn.classList.remove('r-btn-primary', 'r-reposition-active-btn');
    } else if (finishedType === 'text') {
      repositionTextBtn.innerHTML = '<span class="r-btn-text">Reposition Text</span>';
      repositionTextBtn.classList.remove('r-btn-primary', 'r-reposition-active-btn');
    }
    syncSaveButtonState();
  }

  // ==========================================
  // ACTION BAR (Cancel, Save)
  // Shown once a reaction type radio option is selected
  // ==========================================
  const unifiedActionBar = document.createElement('div');
  unifiedActionBar.className = 'r-editor-actions r-atomic-actions';

  const cancelBtn = createButton({
    text: 'Cancel',
    variant: 'ghost',
    onClick: async () => {
      if (activeRepositionType) {
        await OverlayEngineService.cancelReposition(null);
        activeRepositionType = null;
        document.body.classList.remove('r-reposition-lock');
        repositionGifBtn.classList.remove('r-reposition-active-btn', 'r-btn-primary');
        repositionTextBtn.classList.remove('r-reposition-active-btn', 'r-btn-primary');
      }
      if (onCancel) onCancel();
    }
  });

  async function flushAndSave() {
    await commitActiveRepositionIfNeeded();

    const contentVal = validateReactionContent(selectedType, gifData, textData);
    if (!contentVal.isValid) {
      if (selectedType === REACTION_CONFIG_CONSTANTS.TYPES.GIF) {
        fileErrorEl.textContent = contentVal.error;
        fileErrorEl.classList.add('visible');
      } else if (selectedType === REACTION_CONFIG_CONSTANTS.TYPES.TEXT) {
        textInputField.setError(contentVal.error);
      }
      return { isValid: false, error: contentVal.error };
    }

    syncTypeState(selectedType);

    const finalConfig = {
      id: workingConfig.id,
      regionId: workingConfig.regionId,
      type: selectedType,
      customTitle: '',
      gifReaction:
        selectedType === REACTION_CONFIG_CONSTANTS.TYPES.GIF
          ? { ...gifData, enabled: true, name: generatedLabel }
          : { enabled: false, name: generatedLabel },
      textReaction:
        selectedType === REACTION_CONFIG_CONSTANTS.TYPES.TEXT
          ? {
              ...textData,
              enabled: true,
              name: generatedLabel,
              text: (textData.text || '').trim()
            }
          : { enabled: false, name: generatedLabel, text: '' }
    };

    delete finalConfig._isUnsavedDraft;
    if (onSave) {
      const saveOutcome = await onSave(finalConfig);
      if (saveOutcome && saveOutcome.success === false) {
        return { isValid: false, error: saveOutcome.error || 'Failed to save configuration.' };
      }
    }
    return { isValid: true, config: finalConfig };
  }

  const saveBtn = createButton({
    text: 'Save',
    variant: 'primary',
    onClick: async () => {
      await flushAndSave();
    }
  });

  function syncSaveButtonState() {
    let shouldDisableSave = false;

    if (selectedType === REACTION_CONFIG_CONSTANTS.TYPES.GIF) {
      const unchangedPreset = isLoadedPresetUnchanged(REACTION_CONFIG_CONSTANTS.TYPES.GIF);
      if (gifData.saveToLibrary && unchangedPreset) {
        shouldDisableSave = true;
        if (gifLibHint) {
          gifLibHint.textContent = 'Modify at least one setting to save this preset as a new library reaction.';
          gifLibHint.classList.add('warning');
        }
      } else if (gifLibHint) {
        gifLibHint.textContent = 'Will be accessible from Reaction Library across all games.';
        gifLibHint.classList.remove('warning');
      }
    } else if (selectedType === REACTION_CONFIG_CONSTANTS.TYPES.TEXT) {
      const unchangedPreset = isLoadedPresetUnchanged(REACTION_CONFIG_CONSTANTS.TYPES.TEXT);
      if (textData.saveToLibrary && unchangedPreset) {
        shouldDisableSave = true;
        if (textLibHint) {
          textLibHint.textContent = 'Modify at least one setting to save this preset as a new library reaction.';
          textLibHint.classList.add('warning');
        }
      } else if (textLibHint) {
        textLibHint.textContent = 'Will be accessible from Reaction Library across all games.';
        textLibHint.classList.remove('warning');
      }
    }

    saveBtn.disabled = shouldDisableSave;
    if (shouldDisableSave) {
      saveBtn.classList.add('r-btn-disabled');
    } else {
      saveBtn.classList.remove('r-btn-disabled');
    }
  }

  unifiedActionBar.appendChild(cancelBtn);
  unifiedActionBar.appendChild(saveBtn);
  editorRoot.appendChild(unifiedActionBar);

  function updateVisiblePanel() {
    if (selectedType === REACTION_CONFIG_CONSTANTS.TYPES.GIF) {
      gifPanel.classList.add('active');
      textPanel.classList.remove('active');
      unifiedActionBar.style.display = 'flex';
    } else if (selectedType === REACTION_CONFIG_CONSTANTS.TYPES.TEXT) {
      textPanel.classList.add('active');
      gifPanel.classList.remove('active');
      unifiedActionBar.style.display = 'flex';
    } else {
      gifPanel.classList.remove('active');
      textPanel.classList.remove('active');
      unifiedActionBar.style.display = 'none';
    }
  }

  updateVisiblePanel();
  syncSaveButtonState();

  return editorRoot;
}

