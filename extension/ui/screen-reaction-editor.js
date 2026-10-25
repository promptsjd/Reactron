/**
 * Reactron Screen C: Reaction Configuration Editor (Stage 3)
 * 
 * Capabilities:
 * - GIF/Image Reaction Editor with file validation (MIME, size, image decoding).
 * - Text Reaction Editor with font options, animation options, and strict sanitization.
 * - Reposition Mode toggle ("Reposition" <-> "Done Reposition") with normalized ratios.
 * - Atomic Save & Cancel preserving omitted sections without inventing content.
 * - Preview Overlay on active game tab without modifying saved configuration.
 */

import {
  createButton,
  createTextInput,
  createSlider,
  createSelect
} from './components.js';
import { FONT_OPTIONS, ANIMATION_OPTIONS } from '../shared/types.js';
import { VALIDATION_LIMITS, validateReactionName } from '../shared/validation.js';
import { RegionManagementService } from '../services/region-management-service.js';
import { MediaService } from '../services/media-service.js';
import { OverlayEngineService } from '../services/overlay-engine.js';
import { mediaStorage } from '../services/media-storage.js';
import { persistenceService } from '../services/persistence-service.js';

export function createReactionEditor({
  config,
  onSave,
  onCancel,
  onPreview
}) {
  const editorRoot = document.createElement('div');
  editorRoot.className = 'r-reaction-editor';

  // State: deep clone to ensure atomic cancel leaves original intact
  const workingConfig = RegionManagementService.cloneConfiguration(config);

  // Active reposition tracking
  let activeRepositionType = null; // 'gif' | 'text' | null

  // Architectural Notice
  const noticeBox = document.createElement('div');
  noticeBox.className = 'r-notice-box';
  noticeBox.innerHTML = `
    <span class="r-notice-icon">ℹ️</span>
    <p class="r-notice-text">
      <strong>Independent Reactions:</strong> A single configuration may contain a GIF/Image Reaction, a Text Reaction, or both. Native GIF loops run smoothly while Reactron controls display timing and placement.
    </p>
  `;
  editorRoot.appendChild(noticeBox);

  // Sub-tabs for switching between GIF and Text sections
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'r-editor-tabs';

  const gifTabBtn = document.createElement('button');
  gifTabBtn.className = 'r-editor-tab active';
  gifTabBtn.innerHTML = '<span>🖼️</span> GIF / Image';

  const textTabBtn = document.createElement('button');
  textTabBtn.className = 'r-editor-tab';
  textTabBtn.innerHTML = '<span>🔤</span> Text Reaction';

  tabsContainer.appendChild(gifTabBtn);
  tabsContainer.appendChild(textTabBtn);
  editorRoot.appendChild(tabsContainer);

  const panelsWrapper = document.createElement('div');
  panelsWrapper.className = 'r-editor-panels';

  // ==========================================
  // PANEL 1: GIF / Image Reaction
  // ==========================================
  const gifData = workingConfig.gifReaction || {
    enabled: false,
    name: 'Victory Burst',
    fileUrl: '',
    fileName: 'burst_effect.gif',
    size: 180,
    delaySeconds: 0,
    durationSeconds: 3,
    saveToLibrary: false,
    position: { xRatio: 0.5, yRatio: 0.35 }
  };
  gifData.enabled = Boolean(workingConfig.gifReaction?.enabled);
  workingConfig.gifReaction = gifData;

  const gifPanel = document.createElement('div');
  gifPanel.className = 'r-editor-panel active';

  // Enable Toggle
  const gifEnableBox = document.createElement('div');
  gifEnableBox.className = 'r-checkbox-group r-enable-box';
  gifEnableBox.innerHTML = `
    <label class="r-checkbox-label font-bold">
      <input type="checkbox" id="gif-enable-check" ${gifData.enabled ? 'checked' : ''} />
      <span>Enable GIF / Image in this reaction</span>
    </label>
  `;
  gifPanel.appendChild(gifEnableBox);

  const gifFieldsContainer = document.createElement('div');
  gifFieldsContainer.className = `r-subfields ${!gifData.enabled ? 'r-opacity-disabled' : ''}`;

  // Load from Library Selector (GIF)
  const gifPresetGroup = document.createElement('div');
  gifPresetGroup.className = 'r-field-group';
  gifPresetGroup.innerHTML = `
    <label class="r-field-label">Load from Library</label>
    <select class="r-select-input" id="gif-preset-select">
      <option value="">-- Select saved GIF preset --</option>
    </select>
  `;
  const gifPresetSelect = gifPresetGroup.querySelector('#gif-preset-select');
  let loadedGifPresets = [];

  persistenceService.getLibraryPresets('gif').then((presets) => {
    loadedGifPresets = Array.isArray(presets) ? presets : [];
    loadedGifPresets.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.summary ? `${p.name} (${p.summary})` : p.name;
      gifPresetSelect.appendChild(opt);
    });
  }).catch((err) => {
    console.warn('[ReactionEditor] Could not load GIF presets:', err);
  });

  gifFieldsContainer.appendChild(gifPresetGroup);

  // Reaction Name (15 chars)
  let gifNameField;
  let gifSaveCheckbox;

  gifNameField = createTextInput({
    label: 'GIF Reaction Name',
    value: gifData.name || '',
    placeholder: 'e.g. KO Burst',
    maxLength: VALIDATION_LIMITS.REACTION_NAME_MAX_LENGTH,
    onChange: (val) => {
      gifData.name = val;
      const validation = validateReactionName(val);
      gifNameField.setError(validation.error);
      updateGifCheckboxState();
    }
  });
  gifFieldsContainer.appendChild(gifNameField);

  // File Selection Area with Genuine Validation
  const fileArea = document.createElement('div');
  fileArea.className = 'r-file-selection-area';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/gif,image/png,image/jpeg,image/webp';
  fileInput.style.display = 'none';

  const filePreviewBox = document.createElement('div');
  filePreviewBox.className = 'r-file-preview-box';

  function updateFileDisplay() {
    const hasCustomImg = !!gifData.fileUrl;
    filePreviewBox.innerHTML = `
      <div class="r-file-thumb-wrapper">
        ${hasCustomImg ? `<img src="${gifData.fileUrl}" class="r-file-thumb" alt="Thumbnail" />` : '<span class="r-file-icon">🖼️</span>'}
      </div>
      <div class="r-file-info">
        <span class="r-file-name">${gifData.fileName || 'burst_effect.gif'}</span>
        <span class="r-file-meta">${hasCustomImg ? 'Custom image loaded' : 'Default sample GIF (480x480)'}</span>
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
    updateFileDisplay();
  });

  fileArea.appendChild(filePreviewBox);
  fileArea.appendChild(fileSelectBtn);
  fileArea.appendChild(fileInput);
  gifFieldsContainer.appendChild(fileArea);
  gifFieldsContainer.appendChild(fileErrorEl);

  // Size Slider
  const sizeSlider = createSlider({
    label: 'Overlay Size',
    min: 80,
    max: 400,
    step: 10,
    value: gifData.size || 180,
    unit: 'px',
    helperText: 'Controls displayed image width on the game screen',
    onChange: (val) => {
      gifData.size = val;
    }
  });
  gifFieldsContainer.appendChild(sizeSlider);

  // Reposition Button
  const repositionGifBtn = createButton({
    text: 'Reposition GIF/Image',
    variant: 'secondary',
    icon: '🎯',
    className: 'r-btn-full',
    onClick: async () => {
      if (activeRepositionType === 'gif') {
        // Finishing reposition
        const res = await OverlayEngineService.finishReposition(null);
        if (res && res.position) {
          gifData.position = res.position;
        }
        activeRepositionType = null;
        repositionGifBtn.innerHTML = '<span class="r-btn-icon">🎯</span><span class="r-btn-text">Reposition GIF/Image</span>';
        repositionGifBtn.classList.remove('r-btn-primary');
      } else {
        // Starting reposition
        activeRepositionType = 'gif';
        await OverlayEngineService.startReposition(null, 'gif', gifData);
        repositionGifBtn.innerHTML = '<span class="r-btn-icon">✓</span><span class="r-btn-text">Done Repositioning</span>';
        repositionGifBtn.classList.add('r-btn-primary');
      }
    }
  });
  gifFieldsContainer.appendChild(repositionGifBtn);

  // Delay Slider (0 to 3s in 0.5s increments)
  const gifDelaySlider = createSlider({
    label: 'Trigger Delay',
    min: VALIDATION_LIMITS.DELAY_MIN,
    max: VALIDATION_LIMITS.DELAY_MAX,
    step: VALIDATION_LIMITS.DELAY_STEP,
    value: gifData.delaySeconds || 0,
    unit: 's',
    helperText: 'Delay before overlay appears after trigger',
    onChange: (val) => {
      gifData.delaySeconds = val;
    }
  });
  gifFieldsContainer.appendChild(gifDelaySlider);

  // Display Duration Slider (1 to 10s)
  const gifDurationSlider = createSlider({
    label: 'Display Duration',
    min: VALIDATION_LIMITS.DURATION_MIN,
    max: VALIDATION_LIMITS.DURATION_MAX,
    step: VALIDATION_LIMITS.DURATION_STEP,
    value: gifData.durationSeconds || 3,
    unit: 's',
    helperText: 'How long the GIF remains on screen',
    onChange: (val) => {
      gifData.durationSeconds = val;
    }
  });
  gifFieldsContainer.appendChild(gifDurationSlider);

  // Save to Library Checkbox
  const gifLibraryBox = document.createElement('div');
  gifLibraryBox.className = 'r-checkbox-group';
  gifLibraryBox.innerHTML = `
    <label class="r-checkbox-label">
      <input type="checkbox" id="gif-lib-check" ${gifData.saveToLibrary ? 'checked' : ''} />
      <span>Save to Reaction Library</span>
    </label>
    <p class="r-checkbox-hint" id="gif-lib-hint">
      Requires a valid Reaction Name to save into library.
    </p>
  `;
  gifFieldsContainer.appendChild(gifLibraryBox);

  gifSaveCheckbox = gifLibraryBox.querySelector('#gif-lib-check');
  const gifLibHint = gifLibraryBox.querySelector('#gif-lib-hint');

  function updateGifCheckboxState() {
    const hasName = (gifData.name || '').trim().length > 0;
    gifSaveCheckbox.disabled = !hasName;
    if (!hasName) {
      gifSaveCheckbox.checked = false;
      gifLibHint.textContent = 'Reaction Name is required to save to Reaction Library.';
      gifLibHint.classList.add('warning');
    } else {
      gifLibHint.textContent = 'Will be accessible from Reaction Library across all games.';
      gifLibHint.classList.remove('warning');
    }
  }
  updateGifCheckboxState();

  gifSaveCheckbox.addEventListener('change', () => {
    gifData.saveToLibrary = gifSaveCheckbox.checked;
  });

  const gifEnableCheck = gifEnableBox.querySelector('#gif-enable-check');
  gifEnableCheck.addEventListener('change', () => {
    gifData.enabled = gifEnableCheck.checked;
    if (gifData.enabled) {
      gifFieldsContainer.classList.remove('r-opacity-disabled');
    } else {
      gifFieldsContainer.classList.add('r-opacity-disabled');
    }
  });

  gifPresetSelect.addEventListener('change', (e) => {
    const presetId = e.target.value;
    if (!presetId) return;
    const preset = loadedGifPresets.find((p) => p.id === presetId);
    if (!preset) return;

    const cloned = preset.content
      ? JSON.parse(JSON.stringify(preset.content))
      : {
          name: preset.name,
          size: 180,
          delaySeconds: 0,
          durationSeconds: 3,
          position: { xRatio: 0.5, yRatio: 0.35 }
        };

    gifData.enabled = true;
    gifData.name = (cloned.name || preset.name || '').slice(0, VALIDATION_LIMITS.REACTION_NAME_MAX_LENGTH);
    gifData.mediaAssetId = cloned.mediaAssetId || preset.mediaAssetId || null;
    gifData.fileUrl = cloned.fileUrl || '';
    gifData.fileName = cloned.fileName || `${gifData.name || 'preset'}.gif`;
    gifData.size = cloned.size || 180;
    gifData.delaySeconds = cloned.delaySeconds ?? 0;
    gifData.durationSeconds = cloned.durationSeconds || 3;
    gifData.saveToLibrary = false;
    gifData.position = cloned.position ? { ...cloned.position } : { xRatio: 0.5, yRatio: 0.35 };
    workingConfig.gifReaction = gifData;

    gifEnableCheck.checked = true;
    gifFieldsContainer.classList.remove('r-opacity-disabled');
    gifNameField.setValue(gifData.name);
    gifNameField.setError(null);
    sizeSlider.setValue(gifData.size);
    gifDelaySlider.setValue(gifData.delaySeconds);
    gifDurationSlider.setValue(gifData.durationSeconds);
    gifSaveCheckbox.checked = false;
    updateGifCheckboxState();
    updateFileDisplay();

    if (gifData.mediaAssetId && !gifData.fileUrl) {
      mediaStorage.getMedia(gifData.mediaAssetId).then((media) => {
        if (media && media.dataUrl) {
          gifData.fileUrl = media.dataUrl;
          if (media.fileName) gifData.fileName = media.fileName;
          updateFileDisplay();
        }
      }).catch((err) => {
        console.warn('[ReactionEditor] Failed to hydrate preset media:', err);
      });
    }
  });

  gifPanel.appendChild(gifFieldsContainer);

  // ==========================================
  // PANEL 2: Text Reaction
  // ==========================================
  const textData = workingConfig.textReaction || {
    enabled: false,
    name: 'Critical Strike',
    text: '💥 CRITICAL HIT!',
    fontSize: 32,
    fontColor: '#F4F6FA',
    fontType: 'impact',
    animationStyle: 'pop-in',
    delaySeconds: 0,
    durationSeconds: 3,
    saveToLibrary: false,
    position: { xRatio: 0.5, yRatio: 0.6 }
  };
  textData.enabled = Boolean(workingConfig.textReaction?.enabled);
  workingConfig.textReaction = textData;

  const textPanel = document.createElement('div');
  textPanel.className = 'r-editor-panel';

  // Enable Toggle
  const textEnableBox = document.createElement('div');
  textEnableBox.className = 'r-checkbox-group r-enable-box';
  textEnableBox.innerHTML = `
    <label class="r-checkbox-label font-bold">
      <input type="checkbox" id="text-enable-check" ${textData.enabled ? 'checked' : ''} />
      <span>Enable Text in this reaction</span>
    </label>
  `;
  textPanel.appendChild(textEnableBox);

  const textFieldsContainer = document.createElement('div');
  textFieldsContainer.className = `r-subfields ${!textData.enabled ? 'r-opacity-disabled' : ''}`;

  // Load from Library Selector (Text)
  const textPresetGroup = document.createElement('div');
  textPresetGroup.className = 'r-field-group';
  textPresetGroup.innerHTML = `
    <label class="r-field-label">Load from Library</label>
    <select class="r-select-input" id="text-preset-select">
      <option value="">-- Select saved Text preset --</option>
    </select>
  `;
  const textPresetSelect = textPresetGroup.querySelector('#text-preset-select');
  let loadedTextPresets = [];

  persistenceService.getLibraryPresets('text').then((presets) => {
    loadedTextPresets = Array.isArray(presets) ? presets : [];
    loadedTextPresets.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.summary ? `${p.name} (${p.summary})` : p.name;
      textPresetSelect.appendChild(opt);
    });
  }).catch((err) => {
    console.warn('[ReactionEditor] Could not load Text presets:', err);
  });

  textFieldsContainer.appendChild(textPresetGroup);

  // Reaction Name (15 chars)
  let textNameField;
  let textSaveCheckbox;

  textNameField = createTextInput({
    label: 'Text Reaction Name',
    value: textData.name || '',
    placeholder: 'e.g. Critical Strike',
    maxLength: VALIDATION_LIMITS.REACTION_NAME_MAX_LENGTH,
    onChange: (val) => {
      textData.name = val;
      const validation = validateReactionName(val);
      textNameField.setError(validation.error);
      updateTextCheckboxState();
    }
  });
  textFieldsContainer.appendChild(textNameField);

  // Reaction Text input (with strict plain text sanitization)
  const textInputField = createTextInput({
    label: 'Reaction Text',
    value: textData.text || '',
    placeholder: 'e.g. 💥 CRITICAL HIT!',
    maxLength: 40,
    onChange: (val) => {
      textData.text = MediaService.sanitizeText(val);
    }
  });
  textFieldsContainer.appendChild(textInputField);

  // Font Size and Font Color side by side
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
    selectedValue: String(textData.fontSize || 32),
    onChange: (val) => {
      textData.fontSize = parseInt(val, 10);
    }
  });

  const colorSelect = createSelect({
    label: 'Font Color',
    options: [
      { id: '#F4F6FA', label: 'White (#F4F6FA)' },
      { id: '#607DFA', label: 'Blue (#607DFA)' },
      { id: '#55C5A0', label: 'Green (#55C5A0)' },
      { id: '#E9B765', label: 'Gold (#E9B765)' },
      { id: '#E05D5D', label: 'Red (#E05D5D)' }
    ],
    selectedValue: textData.fontColor || '#F4F6FA',
    onChange: (val) => {
      textData.fontColor = val;
    }
  });

  rowSizeColor.appendChild(sizeSelect);
  rowSizeColor.appendChild(colorSelect);
  textFieldsContainer.appendChild(rowSizeColor);

  // Font Type and Animation Style side by side
  const rowTypeAnim = document.createElement('div');
  rowTypeAnim.className = 'r-field-row-2';

  const fontSelect = createSelect({
    label: 'Font Type',
    options: FONT_OPTIONS,
    selectedValue: textData.fontType || 'impact',
    onChange: (val) => {
      textData.fontType = val;
    }
  });

  const animSelect = createSelect({
    label: 'Animation Style',
    options: ANIMATION_OPTIONS,
    selectedValue: textData.animationStyle || 'pop-in',
    onChange: (val) => {
      textData.animationStyle = val;
    }
  });

  rowTypeAnim.appendChild(fontSelect);
  rowTypeAnim.appendChild(animSelect);
  textFieldsContainer.appendChild(rowTypeAnim);

  // Reposition Text Button
  const repositionTextBtn = createButton({
    text: 'Reposition Text',
    variant: 'secondary',
    icon: '🎯',
    className: 'r-btn-full',
    onClick: async () => {
      if (activeRepositionType === 'text') {
        // Finishing reposition
        const res = await OverlayEngineService.finishReposition(null);
        if (res && res.position) {
          textData.position = res.position;
        }
        activeRepositionType = null;
        repositionTextBtn.innerHTML = '<span class="r-btn-icon">🎯</span><span class="r-btn-text">Reposition Text</span>';
        repositionTextBtn.classList.remove('r-btn-primary');
      } else {
        // Starting reposition
        activeRepositionType = 'text';
        await OverlayEngineService.startReposition(null, 'text', textData);
        repositionTextBtn.innerHTML = '<span class="r-btn-icon">✓</span><span class="r-btn-text">Done Repositioning</span>';
        repositionTextBtn.classList.add('r-btn-primary');
      }
    }
  });
  textFieldsContainer.appendChild(repositionTextBtn);

  // Delay Slider
  const textDelaySlider = createSlider({
    label: 'Trigger Delay',
    min: VALIDATION_LIMITS.DELAY_MIN,
    max: VALIDATION_LIMITS.DELAY_MAX,
    step: VALIDATION_LIMITS.DELAY_STEP,
    value: textData.delaySeconds || 0,
    unit: 's',
    helperText: 'Delay before text appears after trigger',
    onChange: (val) => {
      textData.delaySeconds = val;
    }
  });
  textFieldsContainer.appendChild(textDelaySlider);

  // Duration Slider
  const textDurationSlider = createSlider({
    label: 'Display Duration',
    min: VALIDATION_LIMITS.DURATION_MIN,
    max: VALIDATION_LIMITS.DURATION_MAX,
    step: VALIDATION_LIMITS.DURATION_STEP,
    value: textData.durationSeconds || 3,
    unit: 's',
    helperText: 'How long the text remains on screen',
    onChange: (val) => {
      textData.durationSeconds = val;
    }
  });
  textFieldsContainer.appendChild(textDurationSlider);

  // Save to Library Checkbox
  const textLibraryBox = document.createElement('div');
  textLibraryBox.className = 'r-checkbox-group';
  textLibraryBox.innerHTML = `
    <label class="r-checkbox-label">
      <input type="checkbox" id="text-lib-check" ${textData.saveToLibrary ? 'checked' : ''} />
      <span>Save to Reaction Library</span>
    </label>
    <p class="r-checkbox-hint" id="text-lib-hint">
      Requires a valid Reaction Name to save into library.
    </p>
  `;
  textFieldsContainer.appendChild(textLibraryBox);

  textSaveCheckbox = textLibraryBox.querySelector('#text-lib-check');
  const textLibHint = textLibraryBox.querySelector('#text-lib-hint');

  function updateTextCheckboxState() {
    const hasName = (textData.name || '').trim().length > 0;
    textSaveCheckbox.disabled = !hasName;
    if (!hasName) {
      textSaveCheckbox.checked = false;
      textLibHint.textContent = 'Reaction Name is required to save to Reaction Library.';
      textLibHint.classList.add('warning');
    } else {
      textLibHint.textContent = 'Will be accessible from Reaction Library across all games.';
      textLibHint.classList.remove('warning');
    }
  }
  updateTextCheckboxState();

  textSaveCheckbox.addEventListener('change', () => {
    textData.saveToLibrary = textSaveCheckbox.checked;
  });

  const textEnableCheck = textEnableBox.querySelector('#text-enable-check');
  textEnableCheck.addEventListener('change', () => {
    textData.enabled = textEnableCheck.checked;
    if (textData.enabled) {
      textFieldsContainer.classList.remove('r-opacity-disabled');
    } else {
      textFieldsContainer.classList.add('r-opacity-disabled');
    }
  });

  textPresetSelect.addEventListener('change', (e) => {
    const presetId = e.target.value;
    if (!presetId) return;
    const preset = loadedTextPresets.find((p) => p.id === presetId);
    if (!preset) return;

    const fallbackText = preset.summary
      ? preset.summary.split('•')[0].replace(/"/g, '').trim()
      : preset.name;

    const cloned = preset.content
      ? JSON.parse(JSON.stringify(preset.content))
      : {
          name: preset.name,
          text: fallbackText,
          fontSize: 32,
          fontColor: '#F4F6FA',
          fontType: 'impact',
          animationStyle: 'pop-in',
          delaySeconds: 0,
          durationSeconds: 3,
          position: { xRatio: 0.5, yRatio: 0.6 }
        };

    textData.enabled = true;
    textData.name = (cloned.name || preset.name || '').slice(0, VALIDATION_LIMITS.REACTION_NAME_MAX_LENGTH);
    textData.text = MediaService.sanitizeText(cloned.text || fallbackText || '');
    textData.fontSize = cloned.fontSize || 32;
    textData.fontColor = cloned.fontColor || '#F4F6FA';
    textData.fontType = cloned.fontType || 'impact';
    textData.animationStyle = cloned.animationStyle || 'pop-in';
    textData.delaySeconds = cloned.delaySeconds ?? 0;
    textData.durationSeconds = cloned.durationSeconds || 3;
    textData.saveToLibrary = false;
    textData.position = cloned.position ? { ...cloned.position } : { xRatio: 0.5, yRatio: 0.6 };
    workingConfig.textReaction = textData;

    textEnableCheck.checked = true;
    textFieldsContainer.classList.remove('r-opacity-disabled');
    textNameField.setValue(textData.name);
    textNameField.setError(null);
    textInputField.setValue(textData.text);

    const sizeSelectEl = sizeSelect.querySelector('select');
    if (sizeSelectEl) sizeSelectEl.value = String(textData.fontSize);
    const colorSelectEl = colorSelect.querySelector('select');
    if (colorSelectEl) colorSelectEl.value = textData.fontColor;
    const fontSelectEl = fontSelect.querySelector('select');
    if (fontSelectEl) fontSelectEl.value = textData.fontType;
    const animSelectEl = animSelect.querySelector('select');
    if (animSelectEl) animSelectEl.value = textData.animationStyle;

    textDelaySlider.setValue(textData.delaySeconds);
    textDurationSlider.setValue(textData.durationSeconds);
    textSaveCheckbox.checked = false;
    updateTextCheckboxState();
  });

  textPanel.appendChild(textFieldsContainer);

  // Append Panels
  panelsWrapper.appendChild(gifPanel);
  panelsWrapper.appendChild(textPanel);
  editorRoot.appendChild(panelsWrapper);

  // Tab switching logic
  gifTabBtn.addEventListener('click', () => {
    gifTabBtn.classList.add('active');
    textTabBtn.classList.remove('active');
    gifPanel.classList.add('active');
    textPanel.classList.remove('active');
  });

  textTabBtn.addEventListener('click', () => {
    textTabBtn.classList.add('active');
    gifTabBtn.classList.remove('active');
    textPanel.classList.add('active');
    gifPanel.classList.remove('active');
  });

  // ==========================================
  // UNIFIED ACTION BAR (Preview, Cancel, Save)
  // "Save and Cancel controls operate on the complete configuration
  // atomically. A preview must not permanently modify the configuration."
  // ==========================================
  const unifiedActionBar = document.createElement('div');
  unifiedActionBar.className = 'r-editor-actions r-atomic-actions';

  const previewBtn = createButton({
    text: 'Preview Overlay',
    variant: 'secondary',
    icon: '👁️',
    onClick: async () => {
      // Preview on active tab without touching database
      await OverlayEngineService.previewReaction(null, workingConfig);
      if (onPreview) onPreview('complete', workingConfig);
    }
  });

  const cancelBtn = createButton({
    text: 'Cancel',
    variant: 'ghost',
    onClick: async () => {
      if (activeRepositionType) {
        await OverlayEngineService.cancelReposition(null);
        activeRepositionType = null;
      }
      if (onCancel) onCancel();
    }
  });

  async function flushAndSave() {
    if (activeRepositionType) {
      const res = await OverlayEngineService.finishReposition(null);
      if (res?.position) {
        if (activeRepositionType === 'gif') gifData.position = res.position;
        if (activeRepositionType === 'text') textData.position = res.position;
      }
      activeRepositionType = null;
    }

    // Validate names if enabled
    if (workingConfig.gifReaction?.enabled && workingConfig.gifReaction?.name) {
      const v = validateReactionName(workingConfig.gifReaction.name);
      if (!v.isValid) {
        gifNameField.setError(v.error);
        return { isValid: false, error: v.error };
      }
    }
    if (workingConfig.textReaction?.enabled && workingConfig.textReaction?.name) {
      const v = validateReactionName(workingConfig.textReaction.name);
      if (!v.isValid) {
        textNameField.setError(v.error);
        return { isValid: false, error: v.error };
      }
    }

    delete workingConfig._isUnsavedDraft;
    if (onSave) onSave(workingConfig);
    return { isValid: true, config: workingConfig };
  }

  editorRoot.flushAndSave = flushAndSave;

  const saveBtn = createButton({
    text: 'Save Configuration',
    variant: 'primary',
    onClick: async () => {
      await flushAndSave();
    }
  });

  unifiedActionBar.appendChild(previewBtn);
  unifiedActionBar.appendChild(cancelBtn);
  unifiedActionBar.appendChild(saveBtn);
  editorRoot.appendChild(unifiedActionBar);

  return editorRoot;
}
