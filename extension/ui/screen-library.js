/**
 * Reactron Screen D: Reaction Library
 * 
 * Requirements:
 * - Visually consistent Library page with approved design system tokens.
 * - GIF/Image and Text tabs.
 * - No search bar.
 * - Recent reactions shown on top.
 * - Only show reactions that user can see and use.
 */

import {
  createButton,
  createEmptyState,
  createPresetThumbnail
} from './components.js';
import { mediaStorage } from '../services/media-storage.js';

function isUsableLibraryItem(item, type) {
  if (!item || typeof item !== 'object') return false;
  if (type === 'gif') {
    const hasMedia = Boolean(
      item.mediaAssetId ||
      item.content?.mediaAssetId ||
      item.content?.fileUrl ||
      item.summary
    );
    return item.type === 'gif' && hasMedia;
  }
  if (type === 'text') {
    const hasText = Boolean(
      (item.content?.text && item.content.text.trim().length > 0) ||
      item.summary
    );
    return item.type === 'text' && hasText;
  }
  return false;
}

export function renderLibrary({
  libraryGifs = [],
  libraryTexts = [],
  onBackToDashboard,
  onDeletePreset
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

  // Tabs for GIF/Image and Text
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'r-library-tabs';

  let currentTab = 'gif'; // 'gif' | 'text'
  let currentGifs = (Array.isArray(libraryGifs) ? [...libraryGifs] : [])
    .filter((item) => isUsableLibraryItem(item, 'gif'))
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  let currentTexts = (Array.isArray(libraryTexts) ? [...libraryTexts] : [])
    .filter((item) => isUsableLibraryItem(item, 'text'))
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  const gifTab = document.createElement('button');
  gifTab.className = 'r-lib-tab active';
  gifTab.textContent = 'GIF / Image Reactions';

  const textTab = document.createElement('button');
  textTab.className = 'r-lib-tab';
  textTab.textContent = 'Text Reactions';

  tabsContainer.appendChild(gifTab);
  tabsContainer.appendChild(textTab);
  container.appendChild(tabsContainer);

  // Items List & Empty State Container
  const listContainer = document.createElement('div');
  listContainer.className = 'r-library-list';
  container.appendChild(listContainer);

  const resolveMedia = (assetId) => mediaStorage.getMedia(assetId);

  function renderLibraryItems() {
    listContainer.innerHTML = '';

    const items = currentTab === 'gif' ? currentGifs : currentTexts;

    if (items.length === 0) {
      const emptyState = createEmptyState({
        title: currentTab === 'gif' ? 'No Saved GIF Reactions' : 'No Saved Text Reactions',
        description: 'Save reactions to your Library from the Reaction Editor to reuse them across multiple games.'
      });
      listContainer.appendChild(emptyState);
      return;
    }

    const thumbGrid = document.createElement('div');
    thumbGrid.className = 'r-library-thumb-grid';

    items.forEach((item) => {
      const thumbCard = createPresetThumbnail(item, {
        compact: false,
        resolveMedia,
        onDelete: async () => {
          if (currentTab === 'gif') {
            currentGifs = currentGifs.filter((p) => p.id !== item.id);
          } else {
            currentTexts = currentTexts.filter((p) => p.id !== item.id);
          }
          renderLibraryItems();
          if (onDeletePreset) {
            await onDeletePreset(item.id);
          }
        }
      });

      thumbGrid.appendChild(thumbCard);
    });

    listContainer.appendChild(thumbGrid);
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

  renderLibraryItems();

  // Footer Note
  const footerNote = document.createElement('div');
  footerNote.className = 'r-library-footer-note';
  footerNote.textContent = 'Saved presets can be applied in any game via "Load from Library" in the Reaction Editor.';
  container.appendChild(footerNote);

  return container;
}

