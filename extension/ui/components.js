/**
 * Reactron Reusable UI Components
 * Centralized implementations for form fields, sliders, buttons, cards, and toggles.
 * Guarantees zero UI component duplication across screens.
 */

import { DESIGN_TOKENS } from '../shared/design-tokens.js';

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
 * Creates a Slider component with live readout
 * @param {Object} options
 * @param {string} options.label - Slider label
 * @param {number} options.min - Minimum value
 * @param {number} options.max - Maximum value
 * @param {number} [options.step=1] - Increment step
 * @param {number} options.value - Initial value
 * @param {string} [options.unit=''] - Unit suffix (e.g. "%" or "s")
 * @param {string} [options.helperText=''] - Concise helper note
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
  onChange
}) {
  const container = document.createElement('div');
  container.className = 'r-slider-group';

  const headerRow = document.createElement('div');
  headerRow.className = 'r-slider-header';

  const labelEl = document.createElement('span');
  labelEl.className = 'r-slider-label';
  labelEl.textContent = label;

  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'r-slider-value';
  valueDisplay.textContent = `${value}${unit}`;

  headerRow.appendChild(labelEl);
  headerRow.appendChild(valueDisplay);
  container.appendChild(headerRow);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'r-range-slider';
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.value = value;

  slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valueDisplay.textContent = `${val}${unit}`;
    if (onChange) onChange(val);
  });

  container.appendChild(slider);

  if (helperText) {
    const helperEl = document.createElement('p');
    helperEl.className = 'r-helper-text';
    helperEl.textContent = helperText;
    container.appendChild(helperEl);
  }

  container.setValue = (newVal) => {
    slider.value = newVal;
    valueDisplay.textContent = `${newVal}${unit}`;
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
 * Creates a Card container
 * @param {Object} options
 * @param {string} [options.className='']
 * @param {Array<HTMLElement>} [options.children=[]]
 * @returns {HTMLDivElement}
 */
export function createCard({ className = '', children = [] } = {}) {
  const card = document.createElement('div');
  card.className = `r-card ${className}`.trim();
  children.forEach((child) => {
    if (child) card.appendChild(child);
  });
  return card;
}
