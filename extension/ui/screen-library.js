/**
 * Reactron Screen D: Reaction Library Placeholder
 * 
 * Requirements:
 * - Visually consistent Library page with approved design system tokens.
 * - GIF/Image and Text tabs.
 * - Search field.
 * - Empty states for both categories.
 * - Visual placeholder only.
 */

import {
  createButton,
  createEmptyState
} from './components.js';

export function renderLibrary({
  libraryGifs = [],
  libraryTexts = [],
  onBackToDashboard,
  onDeletePreset,
  onUsePreset
}) {
  const container = document.createElement('div');
  container.className = 'r-screen r-screen-library';

  // Navigation Header
  const navHeader = document.createElement('div');
  navHeader.className = 'r-nav-header';

  const backBtn = createButton({
    text: 'Back',
    variant: 'ghost',
    icon: '←',
    onClick: onBackToDashboard
  });

  const headerTitle = document.createElement('span');
  headerTitle.className = 'r-nav-title';
  headerTitle.textContent = 'Reaction Library';

  navHeader.appendChild(backBtn);
  navHeader.appendChild(headerTitle);
  container.appendChild(navHeader);

  // Search Field
  const searchContainer = document.createElement('div');
  searchContainer.className = 'r-search-container';
  searchContainer.innerHTML = `
    <div class="r-search-input-wrapper">
      <span class="r-search-icon">🔍</span>
      <input type="text" id="lib-search" class="r-search-input" placeholder="Search saved reactions..." />
    </div>
  `;
  container.appendChild(searchContainer);

  const searchInput = searchContainer.querySelector('#lib-search');

  // Tabs for GIF/Image and Text
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'r-library-tabs';

  let currentTab = 'gif'; // 'gif' | 'text'
  let searchQuery = '';
  let currentGifs = Array.isArray(libraryGifs) ? [...libraryGifs] : [];
  let currentTexts = Array.isArray(libraryTexts) ? [...libraryTexts] : [];

  const gifTab = document.createElement('button');
  gifTab.className = 'r-lib-tab active';
  gifTab.innerHTML = '<span>🖼️</span> GIF / Image Reactions';

  const textTab = document.createElement('button');
  textTab.className = 'r-lib-tab';
  textTab.innerHTML = '<span>🔤</span> Text Reactions';

  tabsContainer.appendChild(gifTab);
  tabsContainer.appendChild(textTab);
  container.appendChild(tabsContainer);

  // Items List & Empty State Container
  const listContainer = document.createElement('div');
  listContainer.className = 'r-library-list';
  container.appendChild(listContainer);

  function renderLibraryItems() {
    listContainer.innerHTML = '';

    const items = currentTab === 'gif' ? currentGifs : currentTexts;
    const filtered = items.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.summary && item.summary.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (filtered.length === 0) {
      const emptyState = createEmptyState({
        icon: currentTab === 'gif' ? '🖼️' : '🔤',
        title: searchQuery ? 'No Matching Reactions' : (currentTab === 'gif' ? 'No Saved GIF Reactions' : 'No Saved Text Reactions'),
        description: searchQuery
          ? `No reactions match "${searchQuery}". Try a different search query.`
          : 'Save reactions to your Library from the Reaction Editor to reuse them across multiple games.'
      });
      listContainer.appendChild(emptyState);
      return;
    }

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'r-lib-item';

      const iconBox = document.createElement('div');
      iconBox.className = 'r-lib-icon-box';
      iconBox.textContent = currentTab === 'gif' ? '🖼️' : '🔤';

      const infoBox = document.createElement('div');
      infoBox.className = 'r-lib-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'r-lib-name';
      nameEl.textContent = item.name;

      const summaryEl = document.createElement('span');
      summaryEl.className = 'r-lib-summary';
      summaryEl.textContent = item.summary || 'Custom configured reaction';

      infoBox.appendChild(nameEl);
      infoBox.appendChild(summaryEl);

      const actionsGroup = document.createElement('div');
      actionsGroup.style.display = 'flex';
      actionsGroup.style.alignItems = 'center';
      actionsGroup.style.gap = '6px';

      if (onUsePreset) {
        const useBtn = createButton({
          text: 'Use',
          variant: 'secondary',
          className: 'r-btn-sm',
          onClick: () => {
            onUsePreset(item);
          }
        });
        actionsGroup.appendChild(useBtn);
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'r-btn-icon-remove';
      deleteBtn.title = `Delete ${item.name}`;
      deleteBtn.innerHTML = '✕';
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        if (currentTab === 'gif') {
          currentGifs = currentGifs.filter((p) => p.id !== item.id);
        } else {
          currentTexts = currentTexts.filter((p) => p.id !== item.id);
        }
        renderLibraryItems();
        if (onDeletePreset) {
          await onDeletePreset(item.id);
        }
      };

      actionsGroup.appendChild(deleteBtn);

      card.appendChild(iconBox);
      card.appendChild(infoBox);
      card.appendChild(actionsGroup);
      listContainer.appendChild(card);
    });
  }

  gifTab.addEventListener('click', () => {
    currentTab = 'gif';
    gifTab.classList.add('active');
    textTab.classList.remove('active');
    renderLibraryItems();
  });

  textTab.addEventListener('click', () => {
    currentTab = 'text';
    textTab.classList.add('active');
    gifTab.classList.remove('active');
    renderLibraryItems();
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderLibraryItems();
  });

  renderLibraryItems();

  // Footer Note
  const footerNote = document.createElement('div');
  footerNote.className = 'r-library-footer-note';
  footerNote.textContent = '💡 Saved presets can be applied in any game via "Load from Library" in the Reaction Editor.';
  container.appendChild(footerNote);

  return container;
}
