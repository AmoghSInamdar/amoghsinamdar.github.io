const DEFAULT_TAB = 'about';
const PHOTOS_PER_PAGE = 15;

/** Author name to bold in publication author lists. */
const SELF_AUTHOR = 'A Inamdar';

const stylesheetLink = document.getElementById('siteStylesheet');
const cssToggleButton = document.getElementById('cssToggle');
const darkToggleButton = document.getElementById('darkToggle');
// A tab is switched off by putting `hidden` on its nav link in index.html. Its link and
// panel are taken out of the document, so the tab is not a route and leaves nothing behind.
document.querySelectorAll('.navbar-links a[data-tab][hidden]').forEach((link) => {
  document.getElementById(`tab-${link.dataset.tab}`)?.remove();
  link.remove();
});

const tabLinks = Array.from(document.querySelectorAll('.navbar-links a[data-tab]'));
const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
const TABS = tabLinks.map((link) => link.dataset.tab);

let activeTab = DEFAULT_TAB;
let plainTextMode = false;

/* ------------------------------------------------------------------ *
 * DOM helper
 * ------------------------------------------------------------------ */

/**
 * Build an element. Text always goes through textContent / append(string),
 * so data-driven content is never parsed as HTML.
 */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }

  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }

  return node;
}

function notice(message) {
  return el('p', { class: 'notice', text: message });
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} responded ${response.status}`);
  return response.json();
}

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

function applyTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  if (darkToggleButton) {
    darkToggleButton.textContent = isDark ? '☀️' : '🌙';
    darkToggleButton.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

function readStoredTheme() {
  try {
    return localStorage.getItem('darkMode');
  } catch (error) {
    return null;
  }
}

function initializeDarkMode() {
  const saved = readStoredTheme();
  const isDark =
    saved === null ? window.matchMedia('(prefers-color-scheme: dark)').matches : saved === 'true';
  applyTheme(isDark);
}

function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'dark';
  try {
    localStorage.setItem('darkMode', String(isDark));
  } catch (error) {
    /* Storage unavailable: the toggle still works for this page view. */
  }
  applyTheme(isDark);
}

/* ------------------------------------------------------------------ *
 * CSS toggle / plain-text mode
 * ------------------------------------------------------------------ */

function updateCssToggleLabel() {
  if (!stylesheetLink || !cssToggleButton) return;

  const cssEnabled = !stylesheetLink.disabled;
  const cancelIcon = document.getElementById('cssCancel');

  // Inline style, not a class: with the stylesheet off, CSS rules cannot hide it.
  if (cancelIcon) {
    cancelIcon.style.display = cssEnabled ? 'block' : 'none';
  }

  cssToggleButton.setAttribute('aria-label', cssEnabled ? 'Disable CSS' : 'Enable CSS');
  cssToggleButton.setAttribute('aria-pressed', String(!cssEnabled));
}

/**
 * Photography is hidden without CSS: a hundred full-resolution images stacked
 * at natural size is not a usable plain-text view.
 */
function setPlainTextMode(enable) {
  plainTextMode = enable;

  const photoNavLink = document.querySelector('a[data-tab="photography"]');
  const photoPanel = document.getElementById('tab-photography');
  const pagination = document.getElementById('photoPagination');

  if (photoNavLink) photoNavLink.style.display = enable ? 'none' : '';
  if (photoPanel) photoPanel.style.display = enable ? 'none' : '';

  if (enable) {
    if (pagination) pagination.hidden = true;
    document.getElementById('photoGrid')?.replaceChildren();
    // The panel we just hid may be the one on screen.
    if (activeTab === 'photography') setActiveTab(DEFAULT_TAB, { history: 'replace' });
  } else if (activeTab === 'photography') {
    showPhotography();
  }
}

function toggleStylesheet() {
  if (!stylesheetLink) return;
  stylesheetLink.disabled = !stylesheetLink.disabled;
  updateCssToggleLabel();
  setPlainTextMode(stylesheetLink.disabled);
}

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */

function setActiveTab(tabId, { history: historyMode = 'push' } = {}) {
  let target = TABS.includes(tabId) ? tabId : DEFAULT_TAB;
  if (plainTextMode && target === 'photography') target = DEFAULT_TAB;
  activeTab = target;

  tabPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${target}`);
  });

  tabLinks.forEach((link) => {
    const isActive = link.dataset.tab === target;
    link.setAttribute('aria-selected', String(isActive));
    link.tabIndex = isActive ? 0 : -1;
  });

  if (target === 'cv') {
    const iframe = document.querySelector('#tab-cv iframe');
    if (iframe && !iframe.getAttribute('src')) {
      iframe.src = iframe.dataset.src;
    }
  }

  if (target === 'photography') {
    showPhotography();
  }

  if (historyMode !== 'none' && window.location.hash !== `#${target}`) {
    const method = historyMode === 'replace' ? 'replaceState' : 'pushState';
    window.history[method](null, '', `#${target}`);
  }
}

function syncTabFromHash() {
  const hash = window.location.hash.replace('#', '');
  // Only a tab's own hash is a route. Anything else (an in-page anchor, the skip
  // link, a switched-off tab) leaves the current tab where it is.
  if (hash && !TABS.includes(hash)) return;

  const target = hash || DEFAULT_TAB;
  if (target !== activeTab) {
    setActiveTab(target, { history: 'none' });
  }
}

function initializeTabs() {
  tabLinks.forEach((link, index) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setActiveTab(link.dataset.tab);
    });

    // Arrow-key navigation, per the ARIA tabs pattern.
    link.addEventListener('keydown', (event) => {
      const offsets = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabLinks.length - 1 - index };
      const offset = offsets[event.key];
      if (offset === undefined) return;

      event.preventDefault();
      const next = tabLinks[(index + offset + tabLinks.length) % tabLinks.length];
      next.focus();
      // Replace rather than push: arrowing through tabs shouldn't flood history.
      setActiveTab(next.dataset.tab, { history: 'replace' });
    });
  });

  // The address bar is left as it arrived: a hash that names no tab shows the
  // default tab without being rewritten to it.
  setActiveTab(window.location.hash.replace('#', ''), { history: 'none' });

  window.addEventListener('popstate', syncTabFromHash);
  window.addEventListener('hashchange', syncTabFromHash);
}

/* ------------------------------------------------------------------ *
 * Publications, experience, service
 * ------------------------------------------------------------------ */

function renderAuthors(authors) {
  // Spans, not divs: <summary> only accepts phrasing content.
  const line = el('span', { class: 'pub-line pub-line--authors' });

  authors.forEach((author, index) => {
    if (index > 0) line.append(', ');

    const name = author.replace(/\*+$/, '');
    const marks = author.slice(name.length);

    if (name === SELF_AUTHOR) {
      line.append(el('strong', { text: name }));
      if (marks) line.append(marks);
    } else {
      line.append(author);
    }
  });

  return line;
}

function renderLinks(links) {
  const paragraph = el('p', { class: 'publication-links' }, [el('strong', { text: 'Links: ' })]);

  links.forEach((link, index) => {
    if (index > 0) paragraph.append(' | ');
    paragraph.append(
      el('a', { href: link.href, target: '_blank', rel: 'noopener', text: link.label })
    );
  });

  return paragraph;
}

function renderBullets(bullets) {
  return el(
    'ul',
    { class: 'role-list' },
    bullets.map((bullet) => el('li', { text: bullet }))
  );
}

/** Shared shell for the collapsible publication/experience/service cards. */
function renderCard(className, summaryLines, detailNodes) {
  return el('article', { class: className }, [
    el('details', {}, [
      el('summary', { class: `${className}-summary` }, summaryLines),
      el('div', { class: `${className}-details` }, detailNodes),
    ]),
  ]);
}

function renderPublication(pub) {
  const summary = [
    el('span', { class: 'pub-line pub-line--title' }, [
      el('span', { class: 'pub-title', text: pub.title }),
      el('span', { class: 'pub-year', text: String(pub.year ?? '') }),
    ]),
    pub.authors?.length ? renderAuthors(pub.authors) : null,
    pub.venue ? el('span', { class: 'pub-line pub-line--venue', text: pub.venue }) : null,
  ];

  const details = [
    pub.abstract
      ? el('p', { class: 'abstract' }, [el('strong', { text: 'Abstract: ' }), pub.abstract])
      : null,
    pub.links?.length ? renderLinks(pub.links) : null,
  ];

  return renderCard('publication', summary, details);
}

function renderExperience(role) {
  const summary = [
    el('span', { class: 'exp-line exp-line--title' }, [
      el('span', { class: 'exp-title', text: role.title }),
      el('span', { class: 'exp-date', text: role.date ?? '' }),
    ]),
    role.employer ? el('span', { class: 'exp-line exp-line--employer', text: role.employer }) : null,
    role.location ? el('span', { class: 'exp-line exp-line--venue', text: role.location }) : null,
  ];

  const details = [
    role.description ? el('p', { text: role.description }) : null,
    role.bullets?.length ? renderBullets(role.bullets) : null,
  ];

  return renderCard('experience', summary, details);
}

function renderServiceGroup(group) {
  const entries = group.entries ?? [];
  const noun = group.noun ?? 'entry';
  const count = `${entries.length} ${entries.length === 1 ? noun : `${noun}s`}`;

  const summary = [
    el('span', { class: 'pub-line pub-line--title' }, [
      el('span', { class: 'pub-title', text: group.title }),
      el('span', { class: 'pub-year', text: count }),
    ]),
  ];

  const list = el(
    'ul',
    { class: 'role-list' },
    entries.map((entry) =>
      el('li', {}, [
        el('div', { class: 'role-line' }, [
          el('span', { class: 'role-info', text: entry.info }),
          el('span', { class: 'role-date', text: entry.date ?? '' }),
        ]),
        entry.description ? el('div', { class: 'role-desc', text: entry.description }) : null,
      ])
    )
  );

  return renderCard('publication', summary, [list]);
}

async function fillList(containerId, path, renderItem, label) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const items = await loadJson(path);
    const visible = items.filter((item) => !item.hidden);
    container.replaceChildren(...visible.map(renderItem));
  } catch (error) {
    console.error(`Failed to load ${path}:`, error);
    container.replaceChildren(notice(`${label} could not be loaded. Please try reloading the page.`));
  }
}

/* ------------------------------------------------------------------ *
 * Photography
 * ------------------------------------------------------------------ */

let photoData = [];
let photoLoadPromise = null;
let currentPhotoPage = 1;

/**
 * data/photos.json is generated by tools/build_photos.py, so the shape is
 * predictable; this only fills the gaps a hand-edited entry might leave.
 */
function normalizePhotos(config) {
  const source = Array.isArray(config?.photos) ? config.photos.filter(Boolean) : [];
  if (source.length === 0) throw new Error('photos.json contains no entries');

  return source.map((photo, index) => ({
    ...photo,
    caption: photo.caption || `Photo ${index + 1}`,
    alt: photo.alt || photo.caption || `Photo ${index + 1}`,
  }));
}

/** Memoized so concurrent tab activations share one fetch and one render path. */
function ensurePhotos() {
  if (!photoLoadPromise) {
    photoLoadPromise = loadJson('data/photos.json').then((config) => {
      photoData = normalizePhotos(config);
    });
  }
  return photoLoadPromise;
}

function collapsePhotoCards(except) {
  document.querySelectorAll('.photo-card.expanded').forEach((card) => {
    if (card === except) return;
    card.classList.remove('expanded');
    card.setAttribute('aria-pressed', 'false');
  });
}

/** "Canon EOS 6D · EF50mm f/1.8 STM" and "50mm · f/1.8 · 1/250s · ISO 100". */
function renderExifLines(photo) {
  const gear = [photo.camera, photo.lens].filter(Boolean);
  const settings = [photo.focalLength, photo.aperture, photo.shutter, photo.iso].filter(Boolean);
  if (gear.length === 0 && settings.length === 0) return null;

  return el('span', { class: 'photo-exif' }, [
    gear.length ? el('span', { class: 'exif-gear', text: gear.join(' · ') }) : null,
    settings.length ? el('span', { class: 'exif-settings', text: settings.join(' · ') }) : null,
    photo.location ? el('span', { class: 'exif-location', text: photo.location }) : null,
  ]);
}

function renderPhotoCard(photo) {
  // width/height give the intrinsic ratio: the grid overrides it with a uniform
  // crop, and the expanded card lets it through so the photo keeps its shape.
  const image = el('img', {
    loading: 'lazy',
    src: photo.thumb || photo.src,
    alt: photo.alt,
    width: photo.width,
    height: photo.height,
  });

  // Spans, not divs: <button> only accepts phrasing content.
  const card = el('button', { type: 'button', class: 'photo-card', 'aria-pressed': 'false' }, [
    image,
    el('span', { class: 'photo-meta' }, [
      el('span', { class: 'caption', text: photo.caption }),
      photo.year ? el('span', { class: 'year', text: String(photo.year) }) : null,
    ]),
    renderExifLines(photo),
  ]);

  card.addEventListener('click', () => {
    const wasExpanded = card.classList.contains('expanded');
    collapsePhotoCards(card);

    // Upgrade to the full-size file on first expand, and keep it thereafter.
    if (!wasExpanded && photo.src && image.getAttribute('src') !== photo.src) {
      image.src = photo.src;
    }

    card.classList.toggle('expanded', !wasExpanded);
    card.setAttribute('aria-pressed', String(!wasExpanded));
  });

  return card;
}

function renderPageLinks(totalPages) {
  const pageLinks = document.getElementById('pageLinks');
  if (!pageLinks) return;

  const makeButton = (page) => {
    const button = el('button', { type: 'button', text: String(page) });
    button.setAttribute('aria-label', `Page ${page}`);
    if (page === currentPhotoPage) {
      button.classList.add('active');
      button.setAttribute('aria-current', 'page');
    }
    button.addEventListener('click', () => {
      if (page !== currentPhotoPage) renderPhotographyPage(page);
    });
    return button;
  };

  const separator = () => el('span', { class: 'separator', 'aria-hidden': 'true', text: '…' });

  /** Page numbers to show, with `null` marking an elision. */
  const slots = [];
  if (totalPages <= 6) {
    for (let page = 1; page <= totalPages; page += 1) slots.push(page);
  } else if (currentPhotoPage <= 2) {
    slots.push(1, 2, 3, null, totalPages);
  } else if (currentPhotoPage >= totalPages - 1) {
    slots.push(1, null, totalPages - 2, totalPages - 1, totalPages);
  } else {
    slots.push(1);
    if (currentPhotoPage > 3) slots.push(null);
    slots.push(currentPhotoPage - 1, currentPhotoPage, currentPhotoPage + 1);
    if (currentPhotoPage < totalPages - 2) slots.push(null);
    slots.push(totalPages);
  }

  pageLinks.replaceChildren(...slots.map((slot) => (slot === null ? separator() : makeButton(slot))));
}

function renderPhotographyPage(pageIndex) {
  const gallery = document.getElementById('photoGrid');
  const pagination = document.getElementById('photoPagination');
  const status = document.getElementById('photoStatus');
  const prevButton = document.getElementById('prevPage');
  const nextButton = document.getElementById('nextPage');
  if (!gallery) return;

  if (photoData.length === 0) {
    gallery.replaceChildren();
    if (pagination) pagination.hidden = true;
    return;
  }

  const totalPages = Math.ceil(photoData.length / PHOTOS_PER_PAGE);
  currentPhotoPage = Math.max(1, Math.min(pageIndex, totalPages));

  const start = (currentPhotoPage - 1) * PHOTOS_PER_PAGE;
  const pagePhotos = photoData.slice(start, start + PHOTOS_PER_PAGE);

  gallery.replaceChildren(...pagePhotos.map(renderPhotoCard));

  prevButton.disabled = currentPhotoPage === 1;
  nextButton.disabled = currentPhotoPage === totalPages;
  pagination.hidden = false;
  renderPageLinks(totalPages);

  if (status) {
    status.textContent = `Page ${currentPhotoPage} of ${totalPages}, showing photos ${start + 1} to ${
      start + pagePhotos.length
    } of ${photoData.length}.`;
  }
}

async function showPhotography() {
  const gallery = document.getElementById('photoGrid');
  try {
    await ensurePhotos();
  } catch (error) {
    console.error('Failed to load photos:', error);
    photoLoadPromise = null; // Allow a retry on the next visit.
    gallery?.replaceChildren(notice('The photo gallery could not be loaded. Please try reloading the page.'));
    return;
  }
  renderPhotographyPage(currentPhotoPage);
}

function initializePhotoPagination() {
  document.getElementById('prevPage')?.addEventListener('click', () => {
    renderPhotographyPage(currentPhotoPage - 1);
  });
  document.getElementById('nextPage')?.addEventListener('click', () => {
    renderPhotographyPage(currentPhotoPage + 1);
  });
}

/* ------------------------------------------------------------------ *
 * Bootstrap
 * ------------------------------------------------------------------ */

darkToggleButton?.addEventListener('click', toggleDarkMode);
cssToggleButton?.addEventListener('click', toggleStylesheet);

initializeDarkMode();
updateCssToggleLabel();
initializePhotoPagination();
initializeTabs();

fillList('publicationList', 'data/publications.json', renderPublication, 'Publications');
fillList('experienceList', 'data/experience.json', renderExperience, 'Professional experience');
fillList('serviceList', 'data/service.json', renderServiceGroup, 'Teaching, service, and awards');
