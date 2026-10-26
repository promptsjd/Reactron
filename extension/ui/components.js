/**
 * Reactron Reusable UI Components
 * Centralized implementations for form fields, sliders, buttons, cards, and toggles.
 * Guarantees zero UI component duplication across screens.
 */

/**
 * Creates a Button component
 * @param {Object} options
 * @param {string} options.text - Button text
 * @param {'primary'|'secondary'|'outline'|'ghost'|'danger'} [options.variant='primary']
 * @param {string} [options.icon] - Leading icon/emoji
 * @param {boolean} [options.disabled=false]
 * @param {string} [options.className='']
 * @param {Function} [options.onClick]
 * @returns {HTMLButtonElement}
 */
export function createButton({
  text,
  variant = 'primary',
  icon = '',
  disabled = false,
  className = '',
  onClick
}) {
  const btn = document.createElement('button');
  btn.className = `r-btn r-btn-${variant} ${className}`.trim();
  btn.disabled = disabled;
  btn.type = 'button';

  let content = '';
  if (icon) {
    content += `<span class="r-btn-icon">${icon}</span>`;
  }
  content += `<span class="r-btn-text">${text}</span>`;
  btn.innerHTML = content;

  if (onClick) {
    btn.addEventListener('click', onClick);
  }

  return btn;
}

/**
 * Creates a TextInput component with character limit and live counter
 * @param {Object} options
 * @param {string} options.label - Input label
 * @param {string} [options.value=''] - Current value
 * @param {string} [options.placeholder=''] - Placeholder
 * @param {number} [options.maxLength=15] - Maximum allowed characters
 * @param {string|null} [options.error=null] - Validation error message
 * @param {Function} [options.onChange] - Value change listener
 * @returns {HTMLElement}
 */
export function createTextInput({
  label,
  value = '',
  placeholder = '',
  maxLength = 15,
  error = null,
  onChange
}) {
  const container = document.createElement('div');
  container.className = 'r-field-group';

  const labelRow = document.createElement('div');
  labelRow.className = 'r-field-label-row';

  const labelEl = document.createElement('label');
  labelEl.className = 'r-field-label';
  labelEl.textContent = label;

  const counterEl = document.createElement('span');
  counterEl.className = 'r-char-counter';
  counterEl.textContent = `${value.length}/${maxLength}`;

  labelRow.appendChild(labelEl);
  labelRow.appendChild(counterEl);
  container.appendChild(labelRow);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = `r-text-input ${error ? 'r-input-error' : ''}`;
  input.value = value;
  input.placeholder = placeholder;
  input.maxLength = maxLength;

  input.addEventListener('input', (e) => {
    const val = e.target.value;
    counterEl.textContent = `${val.length}/${maxLength}`;
    if (val.length >= maxLength) {
      counterEl.classList.add('r-counter-limit');
    } else {
      counterEl.classList.remove('r-counter-limit');
    }
    if (onChange) onChange(val, input);
  });

  container.appendChild(input);

  const errorEl = document.createElement('div');
  errorEl.className = `r-field-error ${error ? 'visible' : ''}`;
  errorEl.textContent = error || '';
  container.appendChild(errorEl);

  // Helper method attached to element for reactive updates
  container.setError = (errMsg) => {
    if (errMsg) {
      errorEl.textContent = errMsg;
      errorEl.classList.add('visible');
      input.classList.add('r-input-error');
    } else {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
      input.classList.remove('r-input-error');
    }
  };

  container.setValue = (newVal) => {
    input.value = newVal;
    counterEl.textContent = `${newVal.length}/${maxLength}`;
  };

  return container;
}

/**
 * Creates a Slider component with live readout (supports standard numeric range or discrete smart steps)
 * @param {Object} options
 * @param {string} options.label - Slider label
 * @param {number} [options.min] - Minimum value
 * @param {number} [options.max] - Maximum value
 * @param {number} [options.step=1] - Increment step
 * @param {number} options.value - Initial value
 * @param {string} [options.unit=''] - Unit suffix (e.g. "%" or "s")
 * @param {string} [options.helperText=''] - Concise helper note
 * @param {Array<{index: number, value: number, shortLabel: string, helperText?: string}>} [options.steps] - Optional discrete smart steps
 * @param {Function} [options.onChange]
 * @returns {HTMLElement}
 */
export function createSlider({
  label,
  min,
  max,
  step = 1,
  value,
  unit = '',
  helperText = '',
  steps = null,
  disabled = false,
  onChange
}) {
  const container = document.createElement('div');
  container.className = `r-slider-group ${disabled ? 'r-slider-group-disabled' : ''}`.trim();

  const hasSteps = Array.isArray(steps) && steps.length > 0;

  function findClosestStep(numericVal) {
    let best = steps[0];
    let minDiff = Infinity;
    for (const s of steps) {
      const diff = Math.abs(Number(numericVal) - s.value);
      if (diff < minDiff) {
        minDiff = diff;
        best = s;
      }
    }
    return best;
  }

  const initialStep = hasSteps ? findClosestStep(value) : null;

  const headerRow = document.createElement('div');
  headerRow.className = 'r-slider-header';

  const labelEl = document.createElement('span');
  labelEl.className = 'r-slider-label';
  labelEl.textContent = label;
  headerRow.appendChild(labelEl);

  let valueDisplay = null;
  if (!hasSteps) {
    valueDisplay = document.createElement('span');
    valueDisplay.className = 'r-slider-value';
    valueDisplay.textContent = `${value}${unit}`;
    headerRow.appendChild(valueDisplay);
  }

  container.appendChild(headerRow);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'r-range-slider';
  slider.min = hasSteps ? 0 : min;
  slider.max = hasSteps ? steps.length - 1 : max;
  slider.step = hasSteps ? 1 : step;
  slider.value = hasSteps ? initialStep.index : value;
  slider.disabled = Boolean(disabled);

  container.appendChild(slider);

  const stepLabelEls = [];
  if (hasSteps) {
    const stepsRow = document.createElement('div');
    stepsRow.className = 'r-slider-steps-row';

    steps.forEach((stepItem, idx) => {
      const stepBtn = document.createElement('button');
      stepBtn.type = 'button';
      stepBtn.disabled = Boolean(disabled);
      stepBtn.className = `r-slider-step-label ${idx === initialStep.index ? 'active' : ''}`.trim();
      stepBtn.textContent = stepItem.shortLabel;
      stepBtn.addEventListener('click', () => {
        if (slider.disabled) return;
        slider.value = idx;
        applyStepIndex(idx, true);
      });
      stepLabelEls.push(stepBtn);
      stepsRow.appendChild(stepBtn);
    });

    container.appendChild(stepsRow);
  }

  let helperEl = null;
  const initialHelperText = hasSteps ? (initialStep.helperText || helperText) : helperText;
  if (initialHelperText) {
    helperEl = document.createElement('p');
    helperEl.className = 'r-helper-text';
    helperEl.textContent = initialHelperText;
    container.appendChild(helperEl);
  }

  function applyStepIndex(idx, triggerCallback) {
    const chosen = steps[Math.max(0, Math.min(steps.length - 1, idx))];
    if (!chosen) return;
    stepLabelEls.forEach((el, i) => {
      if (i === chosen.index) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
    if (helperEl && chosen.helperText) {
      helperEl.textContent = chosen.helperText;
    }
    if (triggerCallback && onChange) {
      onChange(chosen.value);
    }
  }

  slider.addEventListener('input', (e) => {
    if (slider.disabled) return;
    if (hasSteps) {
      const idx = parseInt(e.target.value, 10);
      applyStepIndex(idx, true);
    } else {
      const val = parseFloat(e.target.value);
      if (valueDisplay) valueDisplay.textContent = `${val}${unit}`;
      if (onChange) onChange(val);
    }
  });

  container.setValue = (newVal) => {
    if (hasSteps) {
      const matched = findClosestStep(newVal);
      slider.value = matched.index;
      applyStepIndex(matched.index, false);
    } else {
      slider.value = newVal;
      if (valueDisplay) valueDisplay.textContent = `${newVal}${unit}`;
    }
  };

  container.setDisabled = (isDisabled) => {
    const dis = Boolean(isDisabled);
    slider.disabled = dis;
    stepLabelEls.forEach((btn) => {
      btn.disabled = dis;
    });
    if (dis) {
      container.classList.add('r-slider-group-disabled');
    } else {
      container.classList.remove('r-slider-group-disabled');
    }
  };

  return container;
}

/**
 * Creates an accessible Enable/Disable Toggle Switch
 * @param {Object} options
 * @param {boolean} options.checked - Toggle state
 * @param {string} [options.ariaLabel='Toggle']
 * @param {Function} [options.onChange]
 * @returns {HTMLElement}
 */
export function createToggle({ checked, ariaLabel = 'Toggle state', onChange }) {
  const label = document.createElement('label');
  label.className = 'r-toggle-switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.setAttribute('aria-label', ariaLabel);

  const slider = document.createElement('span');
  slider.className = 'r-toggle-track';

  label.appendChild(input);
  label.appendChild(slider);

  input.addEventListener('change', (e) => {
    e.stopPropagation();
    if (onChange) onChange(input.checked);
  });

  return label;
}

/**
 * Creates a Select Dropdown component
 * @param {Object} options
 * @param {string} options.label - Field label
 * @param {Array<{id: string, label: string}>} options.options - Selection choices
 * @param {string} options.selectedValue - Selected option ID
 * @param {Function} [options.onChange]
 * @returns {HTMLElement}
 */
export function createSelect({ label, options, selectedValue, onChange }) {
  const container = document.createElement('div');
  container.className = 'r-field-group';

  if (label) {
    const labelEl = document.createElement('label');
    labelEl.className = 'r-field-label';
    labelEl.textContent = label;
    container.appendChild(labelEl);
  }

  const select = document.createElement('select');
  select.className = 'r-select-input';

  options.forEach((opt) => {
    const optionEl = document.createElement('option');
    optionEl.value = opt.id;
    optionEl.textContent = opt.label;
    if (opt.id === selectedValue) {
      optionEl.selected = true;
    }
    select.appendChild(optionEl);
  });

  select.addEventListener('change', (e) => {
    if (onChange) onChange(e.target.value);
  });

  container.appendChild(select);
  return container;
}

/**
 * Parses a Hex (#RGB, #RRGGBB) or RGB ("255, 90, 90" / "rgb(255, 90, 90)") string into a normalized #RRGGBB hex string.
 * Returns null if the input is not yet a valid complete color.
 * @param {string} raw
 * @returns {string|null}
 */
function parseColorToHex(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // 1. Standard 6-digit hex (#RRGGBB or RRGGBB)
  const hex6 = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
  if (hex6) {
    return `#${hex6[1].toUpperCase()}`;
  }

  // 2. Shorthand 3-digit hex (#RGB)
  const hex3 = trimmed.match(/^#([0-9a-fA-F]{3})$/);
  if (hex3) {
    const [r, g, b] = hex3[1].toUpperCase().split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  // 3. RGB format: "rgb(240, 90, 90)" or "240, 90, 90" or "240 90 90"
  const rgbMatch = trimmed.match(/^(?:rgb\s*\(\s*)?(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)?$/i);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, parseInt(rgbMatch[1], 10)));
    const g = Math.min(255, Math.max(0, parseInt(rgbMatch[2], 10)));
    const b = Math.min(255, Math.max(0, parseInt(rgbMatch[3], 10)));
    const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  return null;
}

/**
 * Creates an interactive Color Picker component with a clickable color window swatch + editable Hex/RGB input
 * @param {Object} options
 * @param {string} options.label - Field label
 * @param {string} [options.value='#F4F6FA'] - Initial color value
 * @param {Function} [options.onChange] - Callback invoked with normalized #RRGGBB color string
 * @returns {HTMLElement}
 */
export function createColorPicker({ label, value = '#F4F6FA', onChange }) {
  const container = document.createElement('div');
  container.className = 'r-field-group';

  if (label) {
    const labelEl = document.createElement('label');
    labelEl.className = 'r-field-label';
    labelEl.textContent = label;
    container.appendChild(labelEl);
  }

  const initialHex = parseColorToHex(value) || '#F4F6FA';

  const controlWrapper = document.createElement('div');
  controlWrapper.className = 'r-color-picker-control';

  const swatchLabel = document.createElement('label');
  swatchLabel.className = 'r-color-swatch-wrapper';
  swatchLabel.title = 'Click to open interactive color picker';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'r-color-native-input';
  colorInput.value = initialHex;

  const swatchPreview = document.createElement('span');
  swatchPreview.className = 'r-color-swatch-preview';
  swatchPreview.style.backgroundColor = initialHex;

  swatchLabel.appendChild(colorInput);
  swatchLabel.appendChild(swatchPreview);

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'r-color-text-input';
  textInput.value = initialHex;
  textInput.placeholder = '#HEX or R,G,B';
  textInput.maxLength = 18;
  textInput.title = 'Type a Hex (#F05A5A) or RGB (240, 90, 90) color value';

  // When user picks a color from the interactive color picker window
  colorInput.addEventListener('input', (e) => {
    const hex = (e.target.value || '#F4F6FA').toUpperCase();
    swatchPreview.style.backgroundColor = hex;
    textInput.value = hex;
    controlWrapper.classList.remove('r-input-error');
    if (onChange) onChange(hex);
  });

  // When user types Hex or RGB in the text box
  textInput.addEventListener('input', (e) => {
    const parsed = parseColorToHex(e.target.value);
    if (parsed) {
      colorInput.value = parsed;
      swatchPreview.style.backgroundColor = parsed;
      controlWrapper.classList.remove('r-input-error');
      if (onChange) onChange(parsed);
    }
  });

  // Normalize text display on blur
  textInput.addEventListener('blur', () => {
    const parsed = parseColorToHex(textInput.value);
    if (parsed) {
      textInput.value = parsed;
      controlWrapper.classList.remove('r-input-error');
    } else {
      textInput.value = colorInput.value.toUpperCase();
      controlWrapper.classList.remove('r-input-error');
    }
  });

  controlWrapper.appendChild(swatchLabel);
  controlWrapper.appendChild(textInput);
  container.appendChild(controlWrapper);

  container.setValue = (newVal) => {
    const hex = parseColorToHex(newVal) || '#F4F6FA';
    colorInput.value = hex;
    swatchPreview.style.backgroundColor = hex;
    textInput.value = hex;
  };

  return container;
}

/**
 * Creates an Empty State component
 * @param {Object} options
 * @param {string} options.icon - Emoji or icon
 * @param {string} options.title - Header
 * @param {string} options.description - Detailed explanation
 * @param {HTMLElement} [options.action] - Optional CTA button
 * @returns {HTMLElement}
 */
export function createEmptyState({ icon, title, description, action = null }) {
  const container = document.createElement('div');
  container.className = 'r-empty-state';

  let html = '';
  if (icon) {
    html += `<div class="r-empty-icon">${icon}</div>`;
  }
  html += `
    <h3 class="r-empty-title">${title}</h3>
    <p class="r-empty-desc">${description}</p>
  `;
  container.innerHTML = html;

  if (action) {
    const actionContainer = document.createElement('div');
    actionContainer.className = 'r-empty-action';
    actionContainer.appendChild(action);
    container.appendChild(actionContainer);
  }

  return container;
}

/**
 * Creates a Radio Group component
 * @param {Object} options
 * @param {string} options.name - Radio group name attribute
 * @param {Array<{id: string, label: string}>} options.options - Radio choices
 * @param {string|null} [options.selectedValue=null] - Currently selected option ID
 * @param {boolean} [options.disabled=false] - Whether radio inputs are disabled
 * @param {Function} [options.onChange] - Selection change callback
 * @returns {HTMLElement}
 */
export function createRadioGroup({
  name,
  options = [],
  selectedValue = null,
  disabled = false,
  onChange
}) {
  const container = document.createElement('div');
  container.className = `r-radio-group ${disabled ? 'r-radio-group-disabled' : ''}`.trim();

  const inputs = [];

  options.forEach((opt) => {
    const labelEl = document.createElement('label');
    labelEl.className = `r-radio-option ${selectedValue === opt.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}`.trim();

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = opt.id;
    input.checked = selectedValue === opt.id;
    input.disabled = disabled;
    input.className = 'r-radio-input';

    const textSpan = document.createElement('span');
    textSpan.className = 'r-radio-label-text';
    textSpan.textContent = opt.label;

    input.addEventListener('change', () => {
      if (input.disabled) return;
      inputs.forEach(({ label, radio }) => {
        if (radio.checked) {
          label.classList.add('selected');
        } else {
          label.classList.remove('selected');
        }
      });
      if (onChange) onChange(opt.id);
    });

    inputs.push({ label: labelEl, radio: input });
    labelEl.appendChild(input);
    labelEl.appendChild(textSpan);
    container.appendChild(labelEl);
  });

  container.setDisabled = (isDisabled) => {
    if (isDisabled) {
      container.classList.add('r-radio-group-disabled');
    } else {
      container.classList.remove('r-radio-group-disabled');
    }
    inputs.forEach(({ label, radio }) => {
      radio.disabled = isDisabled;
      if (isDisabled) {
        label.classList.add('disabled');
      } else {
        label.classList.remove('disabled');
      }
    });
  };

  return container;
}

const PRESET_FONT_FAMILIES = {
  impact: "'Impact', 'Arial Black', sans-serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  comic: "'Comic Sans MS', 'Chalkboard SE', cursive, sans-serif",
  mono: "'Courier New', Courier, ui-monospace, monospace",
  serif: "'Georgia', 'Times New Roman', serif"
};

/**
 * Creates a shared visual thumbnail element for a Library Preset (GIF/Image or Text)
 * Used across both the Reaction Library screen and the Load from Library dropdown.
 * 
 * @param {Object} preset - Preset object ({ id, type, name, summary, mediaAssetId, content })
 * @param {Object} [options]
 * @param {boolean} [options.compact=false] - Compact mode for dropdown menu items
 * @param {(mediaAssetId: string) => Promise<{dataUrl?: string}|null>} [options.resolveMedia] - Async resolver for IndexedDB media
 * @param {Function} [options.onDelete] - Optional top-right cross button callback (used in Library tab)
 * @param {Function} [options.onClick] - Optional click handler (used in Dropdown items)
 * @returns {HTMLElement}
 */
export function createPresetThumbnail(preset, options = {}) {
  const { compact = false, resolveMedia = null, onDelete = null, onClick = null } = options;

  const card = document.createElement('div');
  card.className = `r-preset-thumb-card ${compact ? 'r-preset-thumb-compact' : ''}`.trim();

  const previewStage = document.createElement('div');
  previewStage.className = 'r-preset-thumb-stage';

  if (preset?.type === 'gif') {
    const imgEl = document.createElement('img');
    imgEl.className = 'r-preset-thumb-img';
    imgEl.alt = preset.content?.fileName || preset.name || 'GIF Preset';

    const directUrl = (preset.content?.fileUrl || '').trim();
    const assetId = preset.mediaAssetId || preset.content?.mediaAssetId || null;

    if (directUrl) {
      imgEl.src = directUrl;
      previewStage.appendChild(imgEl);
    } else if (assetId && typeof resolveMedia === 'function') {
      const loadingPlaceholder = document.createElement('span');
      loadingPlaceholder.className = 'r-preset-thumb-loading';
      loadingPlaceholder.textContent = '🖼️';
      previewStage.appendChild(loadingPlaceholder);

      resolveMedia(assetId)
        .then((media) => {
          if (media && media.dataUrl) {
            imgEl.src = media.dataUrl;
            previewStage.innerHTML = '';
            previewStage.appendChild(imgEl);
          }
        })
        .catch(() => {
          // Keep fallback icon if hydration fails
        });
    } else {
      const fallbackIcon = document.createElement('span');
      fallbackIcon.className = 'r-preset-thumb-loading';
      fallbackIcon.textContent = '🖼️';
      previewStage.appendChild(fallbackIcon);
    }
  } else {
    const textSpan = document.createElement('span');
    textSpan.className = 'r-preset-thumb-text';
    const rawText =
      (preset?.content?.text || '').trim() ||
      (preset?.summary ? preset.summary.split('•')[0].replace(/"/g, '').trim() : '');
    textSpan.textContent = rawText;

    const fontColor = preset?.content?.fontColor || '#F4F6FA';
    const fontType = preset?.content?.fontType || 'impact';
    textSpan.style.color = fontColor;
    textSpan.style.fontFamily = PRESET_FONT_FAMILIES[fontType] || PRESET_FONT_FAMILIES.impact;

    previewStage.appendChild(textSpan);
  }

  card.appendChild(previewStage);

  if (typeof onDelete === 'function') {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'r-preset-thumb-delete';
    deleteBtn.title = 'Delete from Reaction Library';
    deleteBtn.innerHTML = '✕';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete(preset);
    });
    card.appendChild(deleteBtn);
  }

  if (typeof onClick === 'function') {
    card.addEventListener('click', () => onClick(preset));
  }

  return card;
}

/**
 * Creates a visual Preset Dropdown component that renders preset thumbnails using createPresetThumbnail
 * 
 * @param {Object} options
 * @param {string} options.label - Field label (e.g. "Load from Library")
 * @param {string} [options.placeholder='-- Select saved preset --'] - Placeholder text
 * @param {Array<Object>} [options.presets=[]] - Initial list of presets
 * @param {(mediaAssetId: string) => Promise<{dataUrl?: string}|null>} [options.resolveMedia] - Media resolver
 * @param {Function} [options.onSelect] - Callback when a preset is chosen
 * @returns {HTMLElement}
 */
export function createPresetDropdown({
  label,
  placeholder = '-- Select saved preset --',
  presets = [],
  resolveMedia = null,
  onSelect
}) {
  const container = document.createElement('div');
  container.className = 'r-field-group r-preset-dropdown';

  if (label) {
    const labelEl = document.createElement('label');
    labelEl.className = 'r-field-label';
    labelEl.textContent = label;
    container.appendChild(labelEl);
  }

  const dropdownWrapper = document.createElement('div');
  dropdownWrapper.className = 'r-preset-dropdown-wrapper';

  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = 'r-preset-dropdown-trigger';

  const triggerContent = document.createElement('div');
  triggerContent.className = 'r-preset-dropdown-trigger-content';

  const placeholderSpan = document.createElement('span');
  placeholderSpan.className = 'r-preset-dropdown-placeholder';
  placeholderSpan.textContent = placeholder;
  triggerContent.appendChild(placeholderSpan);

  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'r-preset-dropdown-arrow';
  arrowSpan.textContent = '▾';

  triggerBtn.appendChild(triggerContent);
  triggerBtn.appendChild(arrowSpan);

  const menuEl = document.createElement('div');
  menuEl.className = 'r-preset-dropdown-menu';
  menuEl.style.display = 'none';

  let currentPresets = Array.isArray(presets) ? [...presets] : [];
  let isOpen = false;

  function closeMenu() {
    isOpen = false;
    menuEl.style.display = 'none';
    dropdownWrapper.classList.remove('open');
  }

  function renderMenuItems() {
    menuEl.innerHTML = '';

    if (currentPresets.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'r-preset-dropdown-empty';
      emptyEl.textContent = 'No saved presets in library';
      menuEl.appendChild(emptyEl);
      return;
    }

    const gridEl = document.createElement('div');
    gridEl.className = 'r-preset-dropdown-grid';

    currentPresets.forEach((preset) => {
      const thumbItem = createPresetThumbnail(preset, {
        compact: true,
        resolveMedia,
        onClick: (selectedPreset) => {
          triggerContent.innerHTML = '';
          const selectedThumb = createPresetThumbnail(selectedPreset, {
            compact: true,
            resolveMedia
          });
          selectedThumb.classList.add('r-preset-thumb-selected-inline');
          triggerContent.appendChild(selectedThumb);
          closeMenu();
          if (onSelect) onSelect(selectedPreset);
        }
      });
      gridEl.appendChild(thumbItem);
    });

    menuEl.appendChild(gridEl);
  }

  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen = !isOpen;
    if (isOpen) {
      renderMenuItems();
      menuEl.style.display = 'block';
      dropdownWrapper.classList.add('open');
    } else {
      closeMenu();
    }
  });

  document.addEventListener('click', (e) => {
    if (isOpen && !dropdownWrapper.contains(e.target)) {
      closeMenu();
    }
  });

  dropdownWrapper.appendChild(triggerBtn);
  dropdownWrapper.appendChild(menuEl);
  container.appendChild(dropdownWrapper);

  container.setPresets = (newPresets) => {
    currentPresets = Array.isArray(newPresets) ? [...newPresets] : [];
    if (isOpen) {
      renderMenuItems();
    }
  };

  return container;
}

