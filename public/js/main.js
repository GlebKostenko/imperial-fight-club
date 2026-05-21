const API_URL = window.location.origin;
const state = { directions: [], trainers: [], pricing: [], gallery: [], settings: {}, trainerFilter: 'all', scheduleFilter: 'all' };
const GROUP_LABELS = { beginners:'Новички', advanced:'Продвинутые', competition:'Соревновательная группа', all:'Все уровни' };
const AUDIENCE_LABELS = { men:'Мужчины', women:'Женщины', all:'Все' };
const AGE_LABELS = { kids:'Дети', teens:'Подростки', adults:'Взрослые', all:'Все' };
const CATEGORY_LABELS = { wrestling:'Вольная борьба', boxing:'Бокс', kickboxing:'Кикбоксинг', judo:'Дзюдо', sambo:'Самбо', hero:'Главная', gym:'Зал' };
const DAY_ORDER = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];

const DAY_SHORT_LABELS = { 'Понедельник':'Пн', 'Вторник':'Вт', 'Среда':'Ср', 'Четверг':'Чт', 'Пятница':'Пт', 'Суббота':'Сб', 'Воскресенье':'Вс' };
function shortDay(day = '') { return DAY_SHORT_LABELS[day] || day; }
const DAY_ALIASES = {
  'пн':'Понедельник','понедельник':'Понедельник',
  'вт':'Вторник','вторник':'Вторник',
  'ср':'Среда','среда':'Среда',
  'чт':'Четверг','четверг':'Четверг',
  'пт':'Пятница','пятница':'Пятница',
  'сб':'Суббота','суббота':'Суббота',
  'вс':'Воскресенье','воскресенье':'Воскресенье'
};

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
let premiumSelectDocumentBound = false;

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function scrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

function markDecorativeIcons(scope = document) {
  $$('i[class*="fa-"]', scope).forEach(icon => icon.setAttribute('aria-hidden', 'true'));
}

let cardRevealObserver = null;
let cardRevealPage = '';
let cardRevealTimers = [];

function resetCardReveal(scope = document) {
  if (cardRevealObserver) cardRevealObserver.disconnect();
  cardRevealTimers.forEach(timer => clearTimeout(timer));
  cardRevealTimers = [];
  (scope || document).querySelectorAll('.stagger-item').forEach(item => {
    item.classList.remove('stagger-item', 'stagger-ready', 'is-visible');
    item.style.removeProperty('--stagger-index');
  });
}

function applyPremiumStagger(scope = document) {
  if (prefersReducedMotion()) return;
  const root = scope || document;
  const isCompactViewport = window.matchMedia?.('(max-width: 720px)').matches;
  const groups = [...new Set([
    '.grid',
    '.stats',
    '.schedule-summary',
    '.contact-grid',
    '.faq-list',
    '.budget-rules',
    '.weekly-mobile',
    '#schedule-board'
  ].flatMap(selector => $$(selector, root)))]
    .filter(group => group.offsetParent !== null);

  const revealGroups = groups
    .map(group => {
      const items = [...group.children]
        .filter(item => item.offsetParent !== null && !item.classList.contains('empty'));
      const sectionHead = group.previousElementSibling?.classList.contains('section-head')
        ? group.previousElementSibling
        : null;
      let trigger = group;
      if (sectionHead) {
        trigger = sectionHead.nextElementSibling?.classList.contains('section-reveal-trigger')
          ? sectionHead.nextElementSibling
          : null;
        if (!trigger) {
          trigger = document.createElement('span');
          trigger.className = 'section-reveal-trigger';
          trigger.setAttribute('aria-hidden', 'true');
          sectionHead.insertAdjacentElement('afterend', trigger);
        }
      }
      return { group, trigger, items };
    })
    .filter(({ items }) => items.length);

  const groupsByTrigger = new Map();
  revealGroups.forEach(revealGroup => {
    if (!groupsByTrigger.has(revealGroup.trigger)) groupsByTrigger.set(revealGroup.trigger, []);
    groupsByTrigger.get(revealGroup.trigger).push(revealGroup);
  });

  resetCardReveal(root);
  cardRevealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      (groupsByTrigger.get(entry.target) || []).forEach(({ items }) => {
        items
          .sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return rectA.top === rectB.top ? rectA.left - rectB.left : rectA.top - rectB.top;
          })
          .forEach((item, index) => {
            item.style.setProperty('--stagger-index', Math.min(index, 10));
            requestAnimationFrame(() => item.classList.add('is-visible'));
          });
        });
      cardRevealObserver.unobserve(entry.target);
    });
  }, {
    threshold: 0,
    rootMargin: isCompactViewport ? '0px 0px -4% 0px' : '0px 0px -10% 0px'
  });

  revealGroups.forEach(({ items }) => {
    items.forEach(item => item.classList.add('stagger-item'));
  });
  void root.offsetHeight;
  revealGroups.forEach(({ items }) => {
    items.forEach(item => item.classList.add('stagger-ready'));
  });
  groupsByTrigger.forEach((_, trigger) => cardRevealObserver.observe(trigger));
}

function staggerActivePage(pageName = resolvePageName()) {
  const activePage = document.getElementById(`page-${pageName}`) || $('.page.active') || document;
  if (cardRevealPage && cardRevealPage !== pageName) {
    const oldPage = document.getElementById(`page-${cardRevealPage}`);
    if (oldPage) resetCardReveal(oldPage);
  }
  cardRevealPage = pageName;
  resetCardReveal(activePage);
  requestAnimationFrame(() => {
    setTimeout(() => applyPremiumStagger(activePage), 80);
  });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}

async function apiGet(endpoint) {
  const res = await fetch(`${API_URL}${endpoint}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function apiPost(endpoint, data) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const VALID_PAGES = ['home', 'schedule', 'trainers', 'pricing', 'budget', 'gallery', 'contact', 'privacy'];
const PAGE_PATHS = { home: '/', schedule: '/schedule', trainers: '/trainers', pricing: '/pricing', budget: '/budget', gallery: '/gallery', contact: '/contact', privacy: '/privacy' };
const LEGACY_PAGE_MAP = { directions: 'schedule' };

function resolvePageName() {
  const hashPage = location.hash.replace('#', '').trim();
  if (VALID_PAGES.includes(hashPage)) return hashPage;
  if (LEGACY_PAGE_MAP[hashPage]) return LEGACY_PAGE_MAP[hashPage];

  const pathPage = location.pathname.replace(/^\/+|\/+$/g, '').trim();
  if (!pathPage) return 'home';
  if (VALID_PAGES.includes(pathPage)) return pathPage;
  return LEGACY_PAGE_MAP[pathPage] || 'home';
}

function setWindowScrollTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function resetPageScrollToTop() {
  setWindowScrollTop();
  requestAnimationFrame(() => {
    setWindowScrollTop();
    requestAnimationFrame(setWindowScrollTop);
  });
}

function openPage(name, push = true, pathOverride = '') {
  const pageName = VALID_PAGES.includes(name) ? name : 'home';
  $$('.page').forEach(page => page.classList.toggle('active', page.id === `page-${pageName}`));
  $$('[data-page]').forEach(link => link.classList.toggle('active', link.dataset.page === pageName));
  closeDrawer({ restoreScroll: false });
  staggerActivePage(pageName);

  const nextPath = pathOverride || PAGE_PATHS[pageName] || '/';
  if (push && `${location.pathname}${location.search}` !== nextPath) history.pushState({ page: pageName }, '', nextPath);
  resetPageScrollToTop();
}


function scrollToHomeContacts() {
  const target = document.getElementById('home-contacts');
  if (target) target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
}

function bindNavigation() {
  document.addEventListener('click', event => {
    const trainerBtn = event.target.closest('[data-trainer-key]');
    if (trainerBtn) {
      event.preventDefault();
      openTrainerCard(trainerBtn.dataset.trainerKey);
      return;
    }
    const contactBtn = event.target.closest('[data-home-contact]');
    if (contactBtn) {
      event.preventDefault();
      openPage('home');
      setTimeout(scrollToHomeContacts, 80);
      return;
    }
    const link = event.target.closest('[data-page]');
    if (!link) return;
    event.preventDefault();
    if (link.dataset.trainerFilter) {
      setTrainerFilter(link.dataset.trainerFilter);
      renderTrainers({ refreshReveal: false });
    }
    if (link.dataset.scheduleFilter) {
      setScheduleFilter(link.dataset.scheduleFilter);
      renderSchedulePage();
    }
    const filterPath = link.dataset.trainerFilter || link.dataset.scheduleFilter ? link.getAttribute('href') : '';
    openPage(link.dataset.page, true, filterPath && filterPath.startsWith('/') ? filterPath : '');
    applyUrlFiltersForPage(link.dataset.page);
  });

  window.addEventListener('popstate', () => {
    const pageName = resolvePageName();
    openPage(pageName, false);
    applyUrlFiltersForPage(pageName);
  });
  window.addEventListener('hashchange', () => {
    const pageName = resolvePageName();
    openPage(pageName, false);
    applyUrlFiltersForPage(pageName);
  });
}

function openDrawer() {
  const drawer = $('#drawer');
  const backdrop = $('#drawerBackdrop');
  placeBottomSheetInBody(drawer, backdrop);
  drawer?.style.removeProperty('transform');
  drawer?.classList.add('active', 'is-active');
  backdrop?.classList.add('active', 'is-active');
  drawer?.setAttribute('aria-hidden', 'false');
  $('#openDrawer')?.setAttribute('aria-expanded', 'true');
  $('#openDrawer')?.setAttribute('aria-label', 'Закрыть меню');
  lockBottomSheetScroll('drawer');
}
function toggleDrawer() {
  if ($('#drawer')?.classList.contains('active')) {
    closeDrawer();
    return;
  }
  openDrawer();
}
function closeDrawer({ restoreScroll = true } = {}) {
  const drawer = $('#drawer');
  const wasOpen = drawer?.classList.contains('active') || drawer?.classList.contains('is-active');
  drawer?.classList.remove('active', 'is-active', 'is-dragging');
  drawer?.style.removeProperty('transform');
  $('#drawerBackdrop')?.classList.remove('active', 'is-active');
  drawer?.setAttribute('aria-hidden', 'true');
  $('#openDrawer')?.setAttribute('aria-expanded', 'false');
  $('#openDrawer')?.setAttribute('aria-label', 'Меню');
  if (wasOpen) unlockBottomSheetScroll('drawer', { restoreScroll });
}

function setTrainerFilter(filter = 'all') {
  state.trainerFilter = filter || 'all';
  $$('#trainerFilters .filter-btn[data-filter]').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === state.trainerFilter));
  $$('[data-trainer-filter-option]').forEach(option => {
    const active = option.dataset.trainerFilterOption === state.trainerFilter || (state.trainerFilter === 'all' && option.dataset.trainerFilterOption === 'all');
    option.classList.toggle('active', active);
    option.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function trainerFilterLabel(filter = state.trainerFilter) {
  if (!filter || filter === 'all') return 'Еще';
  return getDirectionLabel(filter) || filter;
}

function scheduleFilterLabel(filter = state.scheduleFilter) {
  if (!filter || filter === 'all') return 'Все направления';
  return getDirectionLabel(filter) || filter;
}

function scheduleFilterPath(filter = state.scheduleFilter) {
  const value = filter || 'all';
  return value === 'all' ? '/schedule' : `/schedule?direction=${encodeURIComponent(value)}`;
}

function setScheduleFilter(filter = 'all') {
  state.scheduleFilter = filter || 'all';
  $$('#scheduleFilters .filter-btn').forEach(btn => {
    if (!btn.dataset.scheduleFilter) return;
    const active = btn.dataset.scheduleFilter === state.scheduleFilter || (state.scheduleFilter === 'all' && btn.dataset.scheduleFilter === 'all');
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  $$('[data-schedule-filter-option]').forEach(option => {
    const active = option.dataset.scheduleFilterOption === state.scheduleFilter || (state.scheduleFilter === 'all' && option.dataset.scheduleFilterOption === 'all');
    option.classList.toggle('active', active);
    option.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $$('[data-schedule-filter-label]').forEach(label => {
    label.textContent = scheduleFilterLabel(state.scheduleFilter);
  });
}

function applyScheduleFilter(filter = 'all', { push = true } = {}) {
  setScheduleFilter(filter);
  renderSchedulePage();
  if (!push) return;
  const nextPath = scheduleFilterPath(state.scheduleFilter);
  if (`${location.pathname}${location.search}` !== nextPath) {
    history.pushState({ page: 'schedule' }, '', nextPath);
  }
}

const bottomSheetLocks = new Set();
let bottomSheetScrollY = 0;
let bottomSheetBodyStyles = null;
let bottomSheetRootStyles = null;
let bottomSheetGuardsBound = false;

function preventBackgroundSheetScroll(event) {
  if (event.target?.closest?.('.bottom-sheet.active, .bottom-sheet.is-active')) return;
  event.preventDefault();
}

function bindBottomSheetScrollGuards() {
  if (bottomSheetGuardsBound) return;
  document.addEventListener('touchmove', preventBackgroundSheetScroll, { capture: true, passive: false });
  document.addEventListener('wheel', preventBackgroundSheetScroll, { capture: true, passive: false });
  bottomSheetGuardsBound = true;
}

function unbindBottomSheetScrollGuards() {
  if (!bottomSheetGuardsBound) return;
  document.removeEventListener('touchmove', preventBackgroundSheetScroll, { capture: true });
  document.removeEventListener('wheel', preventBackgroundSheetScroll, { capture: true });
  bottomSheetGuardsBound = false;
}

function lockBottomSheetScroll(key = 'sheet') {
  if (!bottomSheetLocks.size) {
    bottomSheetScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    bottomSheetRootStyles = {
      overflow: document.documentElement.style.overflow,
      overscrollBehavior: document.documentElement.style.overscrollBehavior
    };
    bottomSheetBodyStyles = {
      overflow: document.body.style.overflow,
      overscrollBehavior: document.body.style.overscrollBehavior
    };
    document.body.classList.add('sheet-open');
    document.documentElement.classList.add('sheet-open');
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    bindBottomSheetScrollGuards();
  }
  bottomSheetLocks.add(key);
}

function unlockBottomSheetScroll(key = 'sheet', { restoreScroll = true } = {}) {
  bottomSheetLocks.delete(key);
  if (bottomSheetLocks.size) return;
  const restoreY = bottomSheetScrollY;
  document.body.classList.remove('sheet-open');
  document.documentElement.classList.remove('sheet-open');
  unbindBottomSheetScrollGuards();
  if (bottomSheetRootStyles) {
    document.documentElement.style.overflow = bottomSheetRootStyles.overflow;
    document.documentElement.style.overscrollBehavior = bottomSheetRootStyles.overscrollBehavior;
  }
  if (bottomSheetBodyStyles) {
    document.body.style.overflow = bottomSheetBodyStyles.overflow;
    document.body.style.overscrollBehavior = bottomSheetBodyStyles.overscrollBehavior;
  }
  bottomSheetRootStyles = null;
  bottomSheetBodyStyles = null;
  if (restoreScroll) window.scrollTo(0, restoreY);
}

function placeBottomSheetInBody(sheet, backdrop) {
  if (backdrop && backdrop.parentElement !== document.body) document.body.appendChild(backdrop);
  if (sheet && sheet.parentElement !== document.body) document.body.appendChild(sheet);
}

function bindSwipeToClose(sheet, closeFn) {
  if (!sheet || sheet.dataset.swipeBound === 'true') return;
  sheet.dataset.swipeBound = 'true';
  let startY = 0;
  let currentY = 0;
  let pointerId = null;
  let touchActive = false;

  const canStartSwipe = target => {
    const scrollArea = target?.closest?.('.bottom-sheet');
    return !scrollArea || scrollArea.scrollTop <= 0;
  };

  const beginDrag = y => {
    startY = y;
    currentY = 0;
    sheet.classList.add('is-dragging');
  };

  const moveDrag = y => {
    currentY = Math.max(0, y - startY);
    sheet.style.setProperty('transform', `translateY(${currentY}px)`, 'important');
  };

  const endDrag = () => {
    sheet.classList.remove('is-dragging');
    const shouldClose = currentY > 70;
    if (shouldClose) {
      closeFn({ restoreFocus: false });
      return;
    }
    sheet.style.removeProperty('transform');
  };

  sheet.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!sheet.classList.contains('active') && !sheet.classList.contains('is-active')) return;
    if (!canStartSwipe(event.target)) return;
    pointerId = event.pointerId;
    beginDrag(event.clientY);
    sheet.setPointerCapture?.(pointerId);
  });

  sheet.addEventListener('pointermove', event => {
    if (pointerId !== event.pointerId) return;
    moveDrag(event.clientY);
  });

  const finish = event => {
    if (pointerId !== event.pointerId) return;
    sheet.releasePointerCapture?.(pointerId);
    pointerId = null;
    endDrag();
  };

  sheet.addEventListener('pointerup', finish);
  sheet.addEventListener('pointercancel', finish);

  sheet.addEventListener('touchstart', event => {
    if (!sheet.classList.contains('active') && !sheet.classList.contains('is-active')) return;
    if (!canStartSwipe(event.target)) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchActive = true;
    beginDrag(touch.clientY);
  }, { passive: true });

  sheet.addEventListener('touchmove', event => {
    if (!touchActive) return;
    const touch = event.touches[0];
    if (!touch) return;
    const delta = touch.clientY - startY;
    if (delta <= 0) return;
    event.preventDefault();
    moveDrag(touch.clientY);
  }, { passive: false });

  sheet.addEventListener('touchend', () => {
    if (!touchActive) return;
    touchActive = false;
    endDrag();
  });

  sheet.addEventListener('touchcancel', () => {
    if (!touchActive) return;
    touchActive = false;
    endDrag();
  });
}

function trainerFilterFromUrl() {
  try {
    return new URLSearchParams(location.search).get('direction') || '';
  } catch {
    return '';
  }
}

function scheduleFilterFromUrl() {
  try {
    return new URLSearchParams(location.search).get('direction') || '';
  } catch {
    return '';
  }
}

function applyUrlFiltersForPage(pageName = resolvePageName()) {
  if (pageName === 'trainers') {
    const requestedFilter = trainerFilterFromUrl() || 'all';
    const requestedDirection = state.directions.find(d => directionMatchesFilterValue(d, requestedFilter));
    const hasTrainerContent = requestedFilter === 'all' || state.trainers.some(trainer =>
      trainer.isActive !== false && requestedDirection && getTrainerFilterValues(trainer).some(value => {
        return String(value || '').trim().toLowerCase() === String(requestedFilter).trim().toLowerCase()
          || directionMatchesFilterValue(requestedDirection, value);
      })
    );
    setTrainerFilter(hasTrainerContent ? requestedFilter : 'all');
    renderTrainers({ refreshReveal: false });
  }
  if (pageName === 'schedule') {
    const requestedFilter = scheduleFilterFromUrl() || 'all';
    const direction = state.directions.find(d => directionMatchesFilterValue(d, requestedFilter));
    setScheduleFilter(requestedFilter === 'all' || directionHasSchedule(direction) ? requestedFilter : 'all');
    renderSchedulePage();
  }
}

function closeTrainerModal() {
  const modal = $('#trainer-modal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function ensureTrainerModal() {
  let modal = $('#trainer-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'trainer-modal';
  modal.className = 'trainer-modal-backdrop';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `<div class="trainer-modal" role="dialog" aria-modal="true" aria-labelledby="trainer-modal-title">
    <button class="trainer-modal-close" type="button" data-trainer-modal-close aria-label="Закрыть карточку тренера"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    <div class="trainer-modal-content"></div>
  </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-trainer-modal-close]')) closeTrainerModal();
  });
  return modal;
}

function openTrainerCard(key) {
  if (!key) return;
  const trainer = state.trainers.find(item => trainerKey(item) === key);
  if (!trainer) return;
  const modal = ensureTrainerModal();
  const content = $('.trainer-modal-content', modal);
  content.innerHTML = trainerCard(trainer).replace('<h3 class="trainer-card-name">', '<h3 class="trainer-card-name" id="trainer-modal-title">');
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  $('[data-trainer-modal-close]', modal)?.focus();
}

function getTrainersForDirection(direction) {
  const slug = String(direction?.slug || '').trim().toLowerCase();
  const name = String(direction?.name || '').trim().toLowerCase();
  return state.trainers
    .filter(trainer => trainer.isActive !== false && getTrainerFilterValues(trainer).some(value => {
      const normalized = String(value || '').trim().toLowerCase();
      return normalized === slug || normalized === name;
    }))
    .sort((a, b) => Number(a.homeOrder ?? a.order ?? 999) - Number(b.homeOrder ?? b.order ?? 999));
}

function trainerKey(trainer = {}) {
  return String(trainer._id || trainer.id || trainer.slug || trainer.name || '');
}

const DIRECTION_ICONS = {
  wrestling: '/assets/directions/wrestling.png',
  boxing: '/assets/directions/boxing.png',
  functional: '/assets/directions/functional.png',
  mma: '/assets/directions/mma.png',
  muaythai: '/assets/directions/muaythai.png',
  thai: '/assets/directions/muaythai.png',
  kickboxing: '/assets/directions/kickboxing.png',
  judo: '/assets/directions/judo.png',
  karate: '/assets/directions/karate.png',
  sambo: '/assets/directions/sambo.png'
};
const DEFAULT_DIRECTION_ICON_SCALES = {
  wrestling: 1.42,
  sambo: 0.9,
  mma: 0.9,
  judo: 0.96,
  functional: 0.96
};

function directionIconKey(direction = {}) {
  const image = String(direction.iconImage || direction.iconMask || direction.mask || '').trim().toLowerCase();
  const imageKey = image.match(/\/?([a-z0-9_-]+)\.(?:png|webp|svg|jpe?g)(?:[?#].*)?$/)?.[1] || '';
  if (imageKey) return imageKey;
  const slug = String(direction.slug || '').trim().toLowerCase();
  const name = String(direction.name || '').trim().toLowerCase();
  if (DIRECTION_ICONS[slug]) return slug;
  if (name.includes('mma') || name.includes('мма') || name.includes('смешан')) return 'mma';
  if (name.includes('вольн') || name.includes('борьб')) return 'wrestling';
  if (name.includes('тай')) return 'muaythai';
  if (name.includes('кик')) return 'kickboxing';
  if (name.includes('бокс')) return 'boxing';
  if (name.includes('дзюдо')) return 'judo';
  if (name.includes('карат')) return 'karate';
  if (name.includes('самбо')) return 'sambo';
  return '';
}

function directionIconSrc(direction = {}, iconKey = '') {
  const custom = String(direction.iconImage || direction.iconMask || direction.mask || '').trim();
  if (custom) return custom;
  return DIRECTION_ICONS[iconKey] || '';
}

function directionIconHtml(direction = {}) {
  const iconKey = directionIconKey(direction);
  const srcValue = directionIconSrc(direction, iconKey);
  if (!srcValue) return `<span class="direction-icon-fallback" aria-hidden="true">${escapeHtml(direction.icon || '')}</span>`;
  const src = `${srcValue}?v=20260521-normalized-icons`;
  const label = escapeHtml(direction.name || 'Направление');
  return `<img class="direction-icon-image direction-icon-image--${iconKey}" src="${escapeHtml(src)}" alt="${label}" width="42" height="42" loading="lazy" decoding="async">`;
}

function directionIconScale(direction = {}) {
  const explicitScale = direction.iconScale ?? direction.directionIconScale;
  const scale = Number(explicitScale);
  if (explicitScale !== undefined && explicitScale !== null && explicitScale !== '' && Number.isFinite(scale)) {
    return Math.min(1.8, Math.max(0.5, scale));
  }
  const fallbackScale = Number(DEFAULT_DIRECTION_ICON_SCALES[directionIconKey(direction)] || 1);
  if (!Number.isFinite(fallbackScale)) return 1;
  return Math.min(1.8, Math.max(0.5, fallbackScale));
}

function directionCard(d) {
  const trainerFilter = d.slug || d.name || '';
  const hasSchedule = directionHasSchedule(d);
  const hasTrainers = getTrainersForDirection(d).length > 0;
  const trainerHref = hasTrainers ? `/trainers?direction=${encodeURIComponent(trainerFilter)}` : '/trainers';
  const scheduleHref = hasSchedule ? `/schedule?direction=${encodeURIComponent(trainerFilter)}` : '/schedule';
  const scheduleFilterAttrs = hasSchedule ? ` data-schedule-filter="${escapeHtml(trainerFilter)}"` : '';
  const trainerFilterAttrs = hasTrainers ? ` data-trainer-filter="${escapeHtml(trainerFilter)}"` : '';
  return `<article class="card direction-card" style="--direction-color:${escapeHtml(d.color || d.accentColor || '#ffd400')};--direction-icon-scale:${directionIconScale(d)}">
    <div class="direction-card-copy">
      <h3>${escapeHtml(d.name)}</h3>
      <p>${escapeHtml(d.shortDescription || d.description || '')}</p>
    </div>
    <div class="direction-icon">${directionIconHtml(d)}</div>
    <div class="card-footer direction-actions">
      <a class="btn btn-primary direction-action direction-action--schedule" href="${escapeHtml(scheduleHref)}" data-page="schedule"${scheduleFilterAttrs}><span>Расписание</span><i class="fas fa-calendar-days" aria-hidden="true"></i></a>
      <a class="btn btn-outline direction-action direction-action--trainers" href="${escapeHtml(trainerHref)}" data-page="trainers"${trainerFilterAttrs}><span>Тренеры</span><i class="fas fa-user-group" aria-hidden="true"></i></a>
    </div>
  </article>`;
}

function getTrainerFilterValues(t) {
  const values = [];
  if (Array.isArray(t.filters)) values.push(...t.filters);
  if (Array.isArray(t.categories)) values.push(...t.categories);
  if (t.category) values.push(t.category);
  if (Array.isArray(t.specializations)) values.push(...t.specializations);
  if (t.specialization) values.push(t.specialization);
  if (Array.isArray(t.directions)) values.push(...t.directions);
  if (t.direction) values.push(t.direction);
  if (t.sport) values.push(t.sport);
  return values
    .flatMap(splitTrainerSpecialtyValue)
    .map(value => String(value || '').trim())
    .filter((value, index, arr) => value && arr.findIndex(item => normalizeFilterText(item) === normalizeFilterText(value)) === index);
}

function getTrainerFilters(t) {
  return getTrainerFilterValues(t);
}

function getDirectionLabel(value) {
  const direction = state.directions.find(d => d.slug === value || d.name === value);
  return direction?.name || CATEGORY_LABELS[value] || value;
}

function getActiveDirectionForValue(value = '') {
  return state.directions.find(direction => direction.isActive !== false && directionMatchesFilterValue(direction, value));
}

function splitTrainerSpecialtyValue(value = '') {
  return String(value || '')
    .split(/\s*[\/,;]\s*/)
    .map(item => item.trim())
    .filter(Boolean);
}

function getTrainerSpecialties(t) {
  return getTrainerSpecialtyLabels(t).join(' / ');
}

function getTrainerSpecialtyValues(t) {
  let values = [];
  if (Array.isArray(t.specializations) && t.specializations.length) {
    values = t.specializations;
  } else if (t.specialization) {
    values = splitTrainerSpecialtyValue(t.specialization);
  } else if (Array.isArray(t.directions) && t.directions.length) {
    values = t.directions;
  } else if (t.direction) {
    values = [t.direction];
  } else if (t.category) {
    values = [t.category];
  } else if (t.sport) {
    values = [t.sport];
  }
  return values
    .flatMap(splitTrainerSpecialtyValue)
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter(value => !!getActiveDirectionForValue(value))
    .filter((value, index, arr) => arr.findIndex(item => normalizeFilterText(item) === normalizeFilterText(value)) === index);
}

function getTrainerSpecialtyLabels(t) {
  const labels = getTrainerSpecialtyValues(t)
    .map(getDirectionLabel)
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.findIndex(item => normalizeFilterText(item) === normalizeFilterText(value)) === index);
  return labels;
}

function trainerSpecialtyColor(value = '', label = '') {
  const direction = state.directions.find(item => directionMatchesFilterValue(item, value) || directionMatchesFilterValue(item, label));
  const color = String(direction?.color || direction?.accentColor || '#ffd400').trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#ffd400';
}

function trainerSpecialtiesHtml(t = {}) {
  const values = getTrainerSpecialtyValues(t);
  if (!values.length) return '';
  const items = values
    .map(value => ({ value, label: getDirectionLabel(value) }))
    .filter((item, index, arr) => item.label && arr.findIndex(other => normalizeFilterText(other.label) === normalizeFilterText(item.label)) === index);
  return `<div class="trainer-specialties" aria-label="Направления тренера">${items.map(({ value, label }) => {
    const color = trainerSpecialtyColor(value, label);
    return `<span class="trainer-specialty" style="--trainer-specialty-color:${escapeHtml(color)}"><span class="trainer-specialty-dot" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
  }).join('')}</div>`;
}

function normalizeAchievements(value) {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  return String(value || '').split(/\n|;/).map(v => v.trim()).filter(Boolean);
}
function achievementsList(value) {
  const items = normalizeAchievements(value);
  return items.length ? `<ul class="trainer-achievements">${items.map(item => `<li><span>${escapeHtml(item)}</span></li>`).join('')}</ul>` : '';
}

function normalizeExternalUrl(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function trainerSocial(t = {}) {
  const social = t.social || {};
  const url = normalizeExternalUrl(t.socialUrl || social.url || t.socialLink || '');
  if (!url) return null;
  let label = String(t.socialLabel || social.label || '').trim();
  const type = detectSocialType(t.socialType || social.type || social.platform || label || url);
  if (!label) {
    try {
      label = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      label = 'Соцсеть';
    }
  }
  return { label, url, type, iconHtml: trainerSocialIconHtml(type) };
}

function detectSocialType(value = '') {
  const text = String(value || '').trim().toLowerCase();
  if (/t\.me|telegram|телеграм/.test(text)) return 'telegram';
  if (/wa\.me|whatsapp|ватсап|вотсап/.test(text)) return 'whatsapp';
  if (/instagram|instagr\.am|инстаграм/.test(text)) return 'instagram';
  if (/tiktok|tiktok\.com|тикток|тик-ток/.test(text)) return 'tiktok';
  if (/vk\.com|vkontakte|вконтакте|\bvk\b/.test(text)) return 'vk';
  if (/youtube|youtu\.be|ютуб/.test(text)) return 'youtube';
  if (/max\.ru|max|макс/.test(text)) return 'max';
  return 'default';
}

function trainerSocialIconHtml(type = 'default') {
  if (type === 'max') return `<span class="trainer-social-mark trainer-social-mark--max">${maxLogoMarkHtml('max-logo-mark')}</span>`;
  const icon = SOCIAL_ICON_CLASSES[type] || 'fas fa-link';
  return `<span class="trainer-social-mark"><i class="${escapeHtml(icon)}" aria-hidden="true"></i></span>`;
}

function getHomeAchievements(t = {}) {
  return normalizeAchievements(t.achievements);
}

function trainerCard(t, compact = false) {
  const photo = t.photo ? `<img src="${API_URL}${escapeHtml(t.photo)}" width="600" height="400" loading="lazy" decoding="async" alt="${escapeHtml(t.name)}">` : '<i class="fas fa-user" aria-hidden="true"></i>';
  const homeAchievements = getHomeAchievements(t);
  const social = trainerSocial(t);
  return `<article class="card trainer-card" data-trainer-card="${escapeHtml(trainerKey(t))}">
    <div class="trainer-photo">${photo}</div>
    <div class="trainer-card-body">
    ${trainerSpecialtiesHtml(t)}
    <h3 class="trainer-card-name">${escapeHtml(t.name)}</h3>
    ${t.experience ? `<div class="trainer-experience"><i class="fas fa-medal" aria-hidden="true"></i><span>${escapeHtml(t.experience)}</span></div>` : ''}
    ${compact ? achievementsList(homeAchievements) : achievementsList(t.achievements)}
    ${social ? `<a class="trainer-social-link trainer-social-link--${escapeHtml(social.type)}" href="${escapeHtml(social.url)}" target="_blank" rel="noopener noreferrer">${social.iconHtml}<span class="trainer-social-label">${escapeHtml(social.label)}</span><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></a>` : ''}
    </div>
  </article>`;
}

function pricingCard(p) {
  return `<article class="card price-card ${p.isPopular ? 'popular' : ''}">
    <div class="price-card-head">
      <h3>${escapeHtml(p.name)}</h3>
    </div>
    <div class="price-main">${Number(p.price || 0).toLocaleString('ru-RU')}₽ <span>${escapeHtml(p.period || '')}</span></div>
    <ul class="features-list">${(p.features || []).map(f => `<li><i class="fas fa-check" aria-hidden="true"></i>${escapeHtml(f)}</li>`).join('')}</ul>
    <div class="card-footer"><button class="btn btn-primary" style="width:100%" data-page="schedule">Посмотреть расписание</button></div>
  </article>`;
}

function galleryCard(g) {
  const img = g.image ? `<img src="${API_URL}${escapeHtml(g.image)}" width="800" height="600" loading="lazy" decoding="async" alt="${escapeHtml(g.title)}">` : '<i class="fas fa-image" aria-hidden="true"></i>';
  return `<article class="gallery-tile"><div class="gallery-img">${img}</div><h3 class="sr-only">${escapeHtml(g.title || CATEGORY_LABELS[g.category] || 'Фото зала')}</h3></article>`;
}

function normalizeDays(rawDay = '') {
  return rawDay
    .split(/[\/,&]| и /i)
    .map(item => item.trim().replace(/\./g, '').toLowerCase())
    .filter(Boolean)
    .map(item => DAY_ALIASES[item] || item.charAt(0).toUpperCase() + item.slice(1));
}

function normalizeScheduleTrainers(slot = {}) {
  const raw = Array.isArray(slot.trainers) && slot.trainers.length
    ? slot.trainers
    : String(slot.trainer || '').split(/\s*[·•]\s*|,\s*|;\s*/);
  const names = raw
    .map(name => String(name || '').trim())
    .filter(name => name && name !== 'Уточняйте у администратора' && name !== 'Тренер уточняется' && name !== 'Тренер клуба')
    .filter(name => {
      const normalized = normalizeFilterText(name);
      return state.trainers.some(trainer => trainer.isActive !== false && normalizeFilterText(trainer.name) === normalized);
    })
    .filter((name, index, arr) => arr.indexOf(name) === index);
  return names.length ? names : ['Тренер клуба'];
}

function flattenSchedule() {
  const result = [];
  state.directions.forEach(direction => {
    (direction.schedule || []).forEach(slot => {
      const days = normalizeDays(slot.day || '');
      const trainers = normalizeScheduleTrainers(slot);
      if (!days.length) days.push('По запросу');
      days.forEach(day => result.push({
        day,
        time: slot.time || '',
        trainer: trainers.join(' · '),
        trainers,
        group: slot.group === 'kids' ? 'beginners' : (slot.group || ''),
        age: slot.age || (slot.group === 'kids' ? 'kids' : 'all'),
        audience: slot.audience || 'all',
        directionName: direction.name,
        directionSlug: direction.slug,
        color: direction.color || direction.accentColor || '',
        startTime: slot.startTime || '',
        endTime: slot.endTime || '',
        icon: direction.icon || '🥊',
      }));
    });
  });
  return result.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || parseStartTime(a).localeCompare(parseStartTime(b), 'ru'));
}


function sportKind(item) {
  const text = `${item.directionSlug || ''} ${item.directionName || ''}`.toLowerCase();
  if (/(box|бокс|kick|кик|удар)/.test(text)) return 'striking';
  if (/(wrest|бор|дзю|judo|sambo|самбо|jiu|джиу)/.test(text)) return 'grappling';
  return 'other';
}


function directionColorBySlug(slug = '') {
  const direction = state.directions.find(d => d.slug === slug);
  return direction?.color || direction?.accentColor || '';
}

function parseStartTime(item = {}) {
  if (item.startTime) return item.startTime;
  const match = String(item.time || '').match(/(\d{1,2}:\d{2})/);
  return match ? match[1].padStart(5, '0') : item.time || '';
}

function parseEndTime(item = {}) {
  if (item.endTime) return item.endTime;
  const match = String(item.time || '').replace(/—/g, '-').match(/\d{1,2}:\d{2}\s*-\s*(\d{1,2}:\d{2})/);
  return match ? match[1].padStart(5, '0') : parseStartTime(item);
}

function minutesFromTime(value = '') {
  const match = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function directionOrderForValue(value) {
  const direction = state.directions.find(d => d.slug === value || d.name === value);
  const order = Number(direction?.order);
  return Number.isFinite(order) && order > 0 ? order : Number.MAX_SAFE_INTEGER;
}

function sortFilterEntries(entries = []) {
  return [...entries].sort((a, b) => directionOrderForValue(a[0]) - directionOrderForValue(b[0]) || a[1].localeCompare(b[1], 'ru'));
}

function normalizeFilterText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s_-]+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function directionMatchesFilterValue(direction = {}, value = '') {
  const targets = splitTrainerSpecialtyValue(value)
    .map(normalizeFilterText)
    .filter(Boolean);
  if (!targets.length) return false;
  const candidates = [
    direction.slug,
    direction.name,
    CATEGORY_LABELS[direction.slug],
    getDirectionLabel(direction.slug),
    getDirectionLabel(direction.name),
  ].map(normalizeFilterText).filter(Boolean);
  return targets.some(target => candidates.includes(target));
}

function directionHasSchedule(direction = {}) {
  return (direction.schedule || []).some(slot => {
    const hasDay = normalizeDays(slot.day || '').length > 0;
    const hasTime = !!(slot.time || slot.startTime);
    return hasDay && hasTime;
  });
}

function filterButtonHtml({ value, label, type, extraClass = '' }) {
  const attr = type === 'schedule' ? 'data-schedule-filter' : 'data-filter';
  const activeFilter = type === 'schedule' ? state.scheduleFilter : state.trainerFilter;
  const isActive = value === activeFilter || (activeFilter === 'all' && value === 'all');
  return `<button class="filter-btn ${extraClass}${isActive ? ' active' : ''}" type="button" ${attr}="${escapeHtml(value)}" aria-pressed="${isActive ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
}

function renderTrainerFilterButtons() {
  const wrap = $('#trainerFilters');
  if (!wrap) return;

  const options = new Map();
  state.directions
    .filter(direction => direction.isActive !== false)
    .forEach(direction => {
      const value = direction.slug || direction.name;
      const hasTrainers = state.trainers.some(trainer =>
        trainer.isActive !== false && getTrainerFilterValues(trainer).some(filterValue => directionMatchesFilterValue(direction, filterValue))
      );
      if (value && hasTrainers) options.set(value, direction.name || value);
    });

  if (state.trainerFilter !== 'all' && !options.has(state.trainerFilter)) {
    state.trainerFilter = 'all';
  }

  const entries = sortFilterEntries([...options.entries()]);
  wrap.innerHTML =
    filterButtonHtml({ value: 'all', label: 'Все', type: 'trainer' }) +
    entries.map(([value, label]) => filterButtonHtml({ value, label, type: 'trainer' })).join('');

  setTrainerFilter(state.trainerFilter);
  markDecorativeIcons(wrap);
}

function renderScheduleFilterButtons() {
  const wrap = $('#scheduleFilters');
  if (!wrap) return;

  const options = new Map();
  state.directions
    .filter(direction => direction.isActive !== false)
    .forEach(direction => {
      const value = direction.slug || direction.name;
      if (value && directionHasSchedule(direction)) options.set(value, direction.name || value);
    });

  if (state.scheduleFilter !== 'all' && !options.has(state.scheduleFilter)) {
    state.scheduleFilter = 'all';
  }

  const entries = sortFilterEntries([...options.entries()]);
  if (wrap) {
    wrap.innerHTML =
      filterButtonHtml({ value: 'all', label: 'Все', type: 'schedule' }) +
      entries.map(([value, label]) => filterButtonHtml({ value, label, type: 'schedule' })).join('');
    markDecorativeIcons(wrap);
  }

  setScheduleFilter(state.scheduleFilter);
}

function scheduleItemMatchesFilter(item, filter = state.scheduleFilter) {
  if (!filter || filter === 'all') return true;
  const normalizedFilter = String(filter).trim().toLowerCase();
  return [item.directionSlug, item.directionName, getDirectionLabel(item.directionSlug), getDirectionLabel(item.directionName)]
    .some(value => String(value || '').trim().toLowerCase() === normalizedFilter);
}

function scheduleAgeLabel(value) {
  const raw = value || 'all';
  const label = AGE_LABELS[raw] || raw || 'Все';
  return raw === 'all' || String(label).toLowerCase() === 'все' ? 'Все (Возраст)' : label;
}

function scheduleAudienceLabel(value) {
  const raw = value || 'all';
  const label = AUDIENCE_LABELS[raw] || raw || 'Все';
  return raw === 'all' || String(label).toLowerCase() === 'все' ? 'Все (Пол)' : label;
}

function renderSchedulePage() {
  const scheduleSessions = flattenSchedule().filter(item => parseStartTime(item));
  const allSessions = scheduleSessions.filter(item => scheduleItemMatchesFilter(item));
  const totalDirections = new Set(allSessions.map(item => item.directionSlug || item.directionName).filter(Boolean)).size;
  const totalSessions = allSessions.length;
  const trainers = new Set(allSessions.flatMap(s => s.trainers || [s.trainer]).filter(name => name && name !== 'Тренер клуба')).size;
  const groupCount = new Set(allSessions.map(s => s.group).filter(Boolean)).size;
  $('#schedule-summary').innerHTML = `
    <div class="summary-card"><strong>${totalDirections}</strong><span>направлений</span></div>
    <div class="summary-card"><strong>${totalSessions}</strong><span>занятий в неделю</span></div>
    <div class="summary-card"><strong>${trainers}</strong><span>тренеров в расписании</span></div>
    <div class="summary-card"><strong>${groupCount}</strong><span>уровня подготовки</span></div>`;

  if (!allSessions.length) {
    $('#schedule-board').innerHTML = `<div class="empty">${state.scheduleFilter === 'all' ? 'Пока нет занятий в расписании.' : 'По выбранному направлению пока нет занятий в расписании.'}</div>`;
    return;
  }

  const days = DAY_ORDER.filter(day => allSessions.some(item => item.day === day));
  days.forEach(day => {
    const items = allSessions.filter(item => item.day === day).sort((a, b) => minutesFromTime(parseStartTime(a)) - minutesFromTime(parseStartTime(b)));
    const lanes = [];
    items.forEach(item => {
      const start = minutesFromTime(parseStartTime(item));
      const end = Math.max(start + 30, minutesFromTime(parseEndTime(item)) || start + 60);
      let lane = lanes.findIndex(laneEnd => laneEnd <= start);
      if (lane === -1) { lane = lanes.length; lanes.push(end); } else { lanes[lane] = end; }
      item._lane = lane;
      item._lanes = Math.max(1, lanes.length);
    });
    items.forEach(item => { item._lanes = Math.max(item._lanes || 1, lanes.length); });
  });
  const visibleValue = value => String(value || '').trim();
  const cardValues = item => [
    `${item.time || `${parseStartTime(item)} — ${parseEndTime(item)}`}, ${shortDay(item.day)} · ${item.directionName}`,
    item.trainer || 'Тренер клуба',
    GROUP_LABELS[item.group] || item.group || 'Все уровни',
    scheduleAgeLabel(item.age),
    scheduleAudienceLabel(item.audience),
  ].map(visibleValue);
  const cardWidthFor = item => {
    const longest = Math.max(...cardValues(item).map(value => value.length), 10);
    return Math.min(360, Math.max(190, Math.round(longest * 7.6 + 34)));
  };
  const dayLaneCounts = {};
  const dayLaneWidths = {};
  days.forEach(day => {
    const dayItems = allSessions.filter(item => item.day === day);
    dayLaneCounts[day] = Math.max(1, ...dayItems.map(item => item._lanes || 1));
    dayLaneWidths[day] = Math.max(200, ...dayItems.map(cardWidthFor));
  });
  const dayColumnTemplate = days.map(day => `minmax(${Math.max(220, dayLaneCounts[day] * dayLaneWidths[day])}px, ${dayLaneCounts[day]}fr)`).join(' ');
  const timelineMinWidth = 78 + days.reduce((sum, day) => sum + Math.max(220, dayLaneCounts[day] * dayLaneWidths[day]), 0);
  const startMinutes = allSessions.map(item => minutesFromTime(parseStartTime(item)));
  const endMinutes = allSessions.map(item => minutesFromTime(parseEndTime(item))).filter(Boolean);
  const minHour = Math.max(6, Math.floor(Math.min(...startMinutes) / 60));
  const latestEndWithPadding = Math.max(...endMinutes, 22 * 60) + 10;
  const maxHour = Math.min(24, Math.ceil(latestEndWithPadding / 60));
  const hours = Array.from({ length: Math.max(1, maxHour - minHour) }, (_, i) => minHour + i);
  const hourHeight = 92;
  const totalHeight = Math.max(hours.length * hourHeight, ((latestEndWithPadding - minHour * 60) / 60) * hourHeight);

  const cardHtml = item => {
    const start = minutesFromTime(parseStartTime(item));
    const end = Math.max(start + 30, minutesFromTime(parseEndTime(item)) || start + 60);
    const top = ((start - minHour * 60) / 60) * hourHeight;
    const height = Math.max(84, ((end - start) / 60) * hourHeight);
    const lanes = item._lanes || 1;
    const lane = item._lane || 0;
    const width = `calc(${100 / lanes}% - 8px)`;
    const left = `calc(${(100 / lanes) * lane}% + 4px)`;
    const timeLabel = item.time || `${parseStartTime(item)} — ${parseEndTime(item)}`;
    const timeDayLabel = `${timeLabel}, ${shortDay(item.day)}`;
    const levelLabel = GROUP_LABELS[item.group] || item.group || 'Все уровни';
    const ageLabel = scheduleAgeLabel(item.age);
    const audienceLabel = scheduleAudienceLabel(item.audience);
    const metaLabel = `${levelLabel} · ${ageLabel} · ${audienceLabel}`;
    const trainerLabel = item.trainer || 'Тренер клуба';
    return `<div class="timeline-session ${sportKind(item)}" title="${escapeHtml(`${item.directionName} · ${timeDayLabel} · ${trainerLabel} · ${metaLabel}`)}" style="top:${top}px;height:${height}px;left:${left};width:${width};right:auto;--session-accent:${escapeHtml(item.color || directionColorBySlug(item.directionSlug) || '')}">
      <div class="schedule-card-row schedule-card-time"><span>Время</span><b><span class="inline-direction">${escapeHtml(item.directionName)}</span><span class="inline-time">${escapeHtml(timeDayLabel)}</span></b></div>
      <div class="schedule-card-row"><span>Тренер</span><b>${escapeHtml(trainerLabel)}</b></div>
      <div class="schedule-card-row"><span>Уровень</span><b>${escapeHtml(levelLabel)}</b></div>
      <div class="schedule-card-row"><span>Возраст</span><b>${escapeHtml(ageLabel)}</b></div>
      <div class="schedule-card-row"><span>Пол</span><b>${escapeHtml(audienceLabel)}</b></div>
    </div>`;
  };
  const mobileSessionHtml = item => {
    const timeLabel = item.time || `${parseStartTime(item)} — ${parseEndTime(item)}`;
    const timeDayLabel = `${timeLabel}, ${shortDay(item.day)}`;
    const levelLabel = GROUP_LABELS[item.group] || item.group || 'Все уровни';
    const ageLabel = scheduleAgeLabel(item.age);
    const audienceLabel = scheduleAudienceLabel(item.audience);
    const trainerLabel = item.trainer || 'Тренер клуба';
    return `<div class="mobile-session ${sportKind(item)}" style="--session-accent:${escapeHtml(item.color || directionColorBySlug(item.directionSlug) || '')}">
      <div class="schedule-card-row schedule-card-time"><span>Время</span><b><span class="inline-direction">${escapeHtml(item.directionName)}</span><span class="inline-time">${escapeHtml(timeDayLabel)}</span></b></div>
      <div class="schedule-card-row"><span>Тренер</span><b>${escapeHtml(trainerLabel)}</b></div>
      <div class="schedule-card-row"><span>Уровень</span><b>${escapeHtml(levelLabel)}</b></div>
      <div class="schedule-card-row"><span>Возраст</span><b>${escapeHtml(ageLabel)}</b></div>
      <div class="schedule-card-row"><span>Пол</span><b>${escapeHtml(audienceLabel)}</b></div>
    </div>`;
  };

  const hourLines = hours.map((hour, idx) => `<div class="timeline-line" style="top:${idx * hourHeight}px"></div>`).join('');
  const desktop = `<div class="timeline-wrap" style="--hour-height:${hourHeight}px;--timeline-height:${totalHeight}px;--timeline-grid:78px ${dayColumnTemplate};--timeline-min-width:${timelineMinWidth}px">
    <div class="timeline-head"><div></div>${days.map(day => `<div>${day}</div>`).join('')}</div>
    <div class="timeline-body">
      <div class="timeline-axis">${hours.map(hour => `<div style="height:${hourHeight}px">${formatHour(hour)}</div>`).join('')}</div>
      ${days.map(day => `<div class="timeline-day-column"><div class="timeline-column" style="height:${totalHeight}px">${hourLines}${allSessions.filter(item => item.day === day).map(cardHtml).join('')}</div></div>`).join('')}
    </div>
  </div>`;
  const mobile = `<div class="weekly-mobile">${days.map(day => {
    const sessions = allSessions.filter(item => item.day === day).sort((a,b)=>parseStartTime(a).localeCompare(parseStartTime(b),'ru'));
    return `<section class="mobile-day-card"><h3>${day}</h3>${sessions.map(mobileSessionHtml).join('')}</section>`;
  }).join('')}</div>`;
  $('#schedule-board').innerHTML = desktop + mobile;
}



function contactHref(item = {}) {
  if (item.url) return item.url;
  const value = String(item.value || '').trim();
  if (item.type === 'phone' || /^\+?[\d\s()\-]+$/.test(value)) return `tel:${value.replace(/\s/g, '')}`;
  if (item.type === 'email' || value.includes('@')) return `mailto:${value}`;
  return '';
}

function isFooterContact(item = {}) {
  return ['address', 'phone', 'hours'].includes(item.type);
}

function isSocialContact(item = {}) {
  return ['telegram', 'instagram', 'max', 'whatsapp', 'vk', 'youtube'].includes(item.type) || item.section === 'social';
}

const SOCIAL_ICON_CLASSES = {
  telegram: 'fab fa-telegram',
  instagram: 'fab fa-instagram',
  tiktok: 'fab fa-tiktok',
  whatsapp: 'fab fa-whatsapp',
  vk: 'fab fa-vk',
  youtube: 'fab fa-youtube'
};

function contactTypeClass(item = {}) {
  return String(item.type || item.section || 'default').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function maxLogoMarkHtml(className = '') {
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M50.76 0c27.53 0 49.12 22.34 49.12 49.89S77.61 99.23 51.02 99.23c-9.43 0-14.01-1.33-21.37-6.54-.5-.36-1.2-.26-1.63.19-5.66 6.04-20.17 10.28-20.83 2.03C7.19 80.53 0 71.18 0 49.61 0 21.3 23.22 0 50.76 0m.77 24.55c-13.07-.68-23.26 8.39-25.51 22.58-1.86 11.75 1.44 26.07 4.26 26.8 1.2.3 4.08-1.9 6.18-3.88.4-.37.99-.44 1.45-.15 3.27 2 6.97 3.5 11.05 3.71 13.42.7 25.3-9.8 26-23.21.71-13.42-10.01-25.14-23.43-25.85" clip-rule="evenodd"></path></svg>`;
}

function contactIconHtml(item = {}, place = 'contact') {
  if (item.type === 'max') {
    if (place === 'footer') return maxLogoMarkHtml('footer-social-logo footer-social-logo--max');
    return `<span class="contact-brand-mark contact-brand-mark--max">${maxLogoMarkHtml('max-logo-mark')}</span>`;
  }
  if (place === 'contact' && isSocialContact(item)) {
    const icon = SOCIAL_ICON_CLASSES[item.type] || item.icon || 'fas fa-link';
    return `<span class="contact-brand-mark contact-brand-mark--${contactTypeClass(item)}"><i class="${escapeHtml(icon)}" aria-hidden="true"></i></span>`;
  }
  const icon = escapeHtml(item.icon || 'fas fa-link');
  return `<i class="${icon}"></i>`;
}

function renderFooterSocialItem(item = {}) {
  const value = escapeHtml(item.value || item.label || 'Соцсеть');
  const href = contactHref(item);
  const icon = contactIconHtml(item, 'footer');
  return `<li>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${icon}${value}</a>` : value}</li>`;
}

function renderBudgetRule(rule = {}, index = 0) {
  const subs = Array.isArray(rule.subitems) ? rule.subitems : String(rule.subitems || '').split('\n').filter(Boolean);
  return `<article class="budget-rule"><div class="budget-rule-number">${index + 1}</div><div><h3>${escapeHtml(rule.title || 'Условие')}</h3><p>${escapeHtml(rule.text || '')}</p>${subs.length ? `<ul>${subs.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</div></article>`;
}

function renderFooterContactItem(item = {}) {
  const value = escapeHtml(item.value || '');
  const label = escapeHtml(item.label || 'Контакт');
  const text = value || label;
  if (!text) return '';
  const href = contactHref(item);
  if (href) return `<li><a href="${escapeHtml(href)}">${text.replace(/\n/g, '<br>')}</a></li>`;
  return `<li>${text.replace(/\n/g, '<br>')}</li>`;
}

function renderContactItem(item = {}) {
  const value = escapeHtml(item.value || '');
  const label = escapeHtml(item.label || 'Контакт');
  const href = contactHref(item);
  const typeClass = contactTypeClass(item);
  const content = value.replace(/\n/g, '<br>');
  if (href) {
    const isExternal = /^https?:\/\//i.test(href);
    const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a class="contact-item contact-item-link contact-item--${typeClass}" href="${escapeHtml(href)}"${target}>${contactIconHtml(item)}<div><strong>${label}</strong><p>${content}</p></div><span class="contact-card-arrow" aria-hidden="true"><i class="fas fa-arrow-right"></i></span></a>`;
  }
  return `<div class="contact-item">${contactIconHtml(item)}<div><strong>${label}</strong><p>${content}</p></div></div>`;
}

function formatDateRu(value = '') {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
}

function legalOperatorText(legal = {}) {
  const parts = [];
  const siteDomain = legal.siteDomain || 'imperial-fight.ru';
  const operatorName = String(legal.operatorName || '').trim();
  if (operatorName) {
    parts.push(`Оператор: ${operatorName}`);
  } else {
    parts.push(`Оператор: владелец сайта ${siteDomain} и школы единоборств «ИМПЕРИАЛ»`);
  }
  if (legal.inn) parts.push(`ИНН ${legal.inn}`);
  if (legal.ogrn) parts.push(`ОГРН/ОГРНИП ${legal.ogrn}`);
  if (legal.legalAddress) parts.push(`адрес для обращений: ${legal.legalAddress}`);
  const contacts = [legal.privacyEmail, legal.privacyPhone].filter(Boolean).join(', ');
  if (contacts) parts.push(`контакт для обращений по персональным данным: ${contacts}`);
  return `${parts.join(', ')}.`;
}

function applyLegalSettings() {
  const legal = state.settings?.legal || {};
  const operator = $('[data-privacy-operator]');
  if (operator) operator.textContent = legalOperatorText(legal);
  const updated = $('[data-privacy-updated]');
  if (updated && legal.policyUpdatedAt) updated.textContent = `Дата последнего обновления: ${formatDateRu(legal.policyUpdatedAt)}`;
  const note = $('[data-privacy-note]');
  if (note) note.style.display = legal.operatorName && legal.inn ? 'none' : '';
}

function defaultFaqItems() {
  return [
    { question: 'Что нужно взять с собой на первую тренировку?', answer: 'Достаточно взять спортивную форму, сменную обувь, а также полотенце и бутылку для воды. В зале есть дежурная экипировка — перчатки и шлемы, которую мы выдаём на каждом занятии, при желании тренер подробно проконсультирует вас и подскажет, какую именно экипировку и защиту лучше приобрести для дальнейших занятий.', order: 1, isActive: true },
    { question: 'С какого возраста вы принимаете детей?', answer: 'Мы набираем детские группы начиная с 4 лет. Для малышей (4–6 лет) тренировки проходят в игровой форме с упором на общую физическую подготовку (ОФП), координацию и дисциплину. С 7 лет начинается более глубокое изучение базовой техники единоборств.', order: 2, isActive: true },
    { question: 'Я никогда раньше не занимался. Меня сразу поставят в спарринг?', answer: 'Нет, это исключено. Все новички начинают с изучения базовой техники, стойки и перемещений. К парной отработке и спаррингам вы перейдете только тогда, когда будете технически и физически к этому готовы, и исключительно по вашему желанию.', order: 3, isActive: true },
    { question: 'Есть ли в зале душевые и раздевалки?', answer: 'Да, зал полностью оборудован для тренировок. У нас есть мужские и женские раздевалки с индивидуальными шкафчиками и современные душевыми кабинами. Вы сможете спокойно привести себя в порядок после занятия.', order: 4, isActive: true },
    { question: 'Предусмотрены ли у вас бюджетные (бесплатные) места?', answer: 'Да, мы поддерживаем развитие спорта и талантливых ребят. Бюджетные места предоставляются спортсменам, которые показывают высокие результаты, регулярно выступают на соревнованиях городского и регионального уровня, защищая честь клуба. Условия получения бюджетного места указаны на странице \\ref{Бюджетные места}{/budget}', order: 5, isActive: true },
    { question: 'Как часто нужно тренироваться, чтобы увидеть результат?', answer: 'Для поддержания формы и освоения базы новичкам оптимально посещать зал 2–3 раза в неделю. Это дает мышцам время на восстановление, а нервной системе — на усвоение новых паттернов движений.', order: 6, isActive: true },
    { question: 'Как записаться на первое занятие?', answer: 'Просто оставьте заявку в форме ниже. Наш администратор свяжется с вами, подберет удобное время, группу вашего уровня подготовки и ответит на оставшиеся вопросы.', order: 7, isActive: true },
  ];
}

function getFaqItems() {
  const source = Array.isArray(state.settings?.faq) ? state.settings.faq : defaultFaqItems();
  return [...source]
    .filter(item => item && item.isActive !== false && (item.question || item.answer))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

function getFaqLinkMeta(url = '') {
  const value = String(url).trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) {
    return { href: value, external: /^https?:\/\//i.test(value) };
  }
  if (/^\/(?!\/)/.test(value)) {
    return { href: value, external: false };
  }
  return null;
}

function renderFaqAnswer(value = '') {
  const text = String(value);
  const pattern = /\\ref\{([^{}]+)\}\{([^{}]+)\}/g;
  let result = '';
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    result += escapeHtml(text.slice(lastIndex, match.index)).replace(/\n/g, '<br>');
    const label = match[1].trim();
    const url = match[2].trim();
    const link = getFaqLinkMeta(url);
    result += link
      ? `<a href="${escapeHtml(link.href)}"${link.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a>`
      : escapeHtml(match[0]);
    lastIndex = match.index + match[0].length;
  }
  result += escapeHtml(text.slice(lastIndex)).replace(/\n/g, '<br>');
  return result;
}

function setFaqAnswerState(item, open) {
  const button = $('.faq-question', item);
  const answer = $('.faq-answer', item);
  if (!button || !answer) return;
  item.classList.toggle('is-open', open);
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  answer.setAttribute('aria-hidden', open ? 'false' : 'true');
  answer.style.maxHeight = open ? `${answer.scrollHeight}px` : '0px';
}

function setupFaqInteractions() {
  $$('.faq-item').forEach(item => {
    setFaqAnswerState(item, false);
    $('.faq-question', item)?.addEventListener('click', () => {
      setFaqAnswerState(item, !item.classList.contains('is-open'));
    });
  });
}

function renderFaq() {
  const items = getFaqItems();
  $$('[data-faq-list]').forEach(list => {
    list.innerHTML = items.length
      ? items.map((item, index) => {
          const answerId = `faq-answer-${index}`;
          return `<div class="faq-item" style="--faq-index:${index}">
            <button class="faq-question" type="button" aria-expanded="false" aria-controls="${answerId}">${escapeHtml(item.question || 'Вопрос')}</button>
            <div class="faq-answer" id="${answerId}" aria-hidden="true"><div class="faq-answer-inner">${renderFaqAnswer(item.answer || '')}</div></div>
          </div>`;
        }).join('')
      : '<div class="faq-empty">FAQ пока не заполнен.</div>';
    setupFaqInteractions();
  });
}

function applySiteSettings() {
  const settings = state.settings || {};
  const heroTitle = $('#hero-title');
  const heroText = $('#hero-text');
  if (heroTitle && settings.heroTitle) heroTitle.textContent = settings.heroTitle;
  if (heroText && settings.heroText) heroText.textContent = settings.heroText;
  $$('[data-contact-title]').forEach(el => { if (settings.contactTitle) el.textContent = settings.contactTitle; });
  $$('[data-contact-text]').forEach(el => { if (settings.contactText) el.textContent = settings.contactText; });
  const footerText = settings.footerText || settings.heroText || 'Школа единоборств для детей и взрослых: расписание, тренеры, направления и запись на занятия в одном месте.';
  $$('[data-footer-text]').forEach(el => { el.textContent = footerText; });
  applyLegalSettings();
  const contacts = (settings.contacts || []).filter(item => item && item.isActive !== false && (item.value || item.url));
  const socials = (settings.socials || []).filter(item => item && item.isActive !== false && (item.value || item.url));
  if (contacts.length || socials.length) {
    $$('[data-contact-list]').forEach(list => { list.innerHTML = [...contacts, ...socials].map(renderContactItem).join(''); });
    const footerContacts = contacts.filter(isFooterContact);
    $$('[data-footer-contact-list]').forEach(list => { list.innerHTML = (footerContacts.length ? footerContacts : contacts.slice(0, 3)).map(renderFooterContactItem).join(''); });
    $$('[data-footer-social-list]').forEach(list => { list.innerHTML = (socials.length ? socials : contacts.filter(isSocialContact)).map(renderFooterSocialItem).join('') || '<li>Соцсети скоро появятся</li>'; });
  }
  renderFaq();
  const budget = settings.budget || {};
  $$('[data-budget-title]').forEach(el => { el.textContent = budget.title || 'Бюджетные места в школе единоборств'; });
  $$('[data-budget-image]').forEach(img => { img.src = normalizeImageUrl(budget.image || '/assets/ring-hall.svg'); });
  $$('[data-budget-rules]').forEach(list => {
    const rules = Array.isArray(budget.rules) && budget.rules.length ? budget.rules : [
      { title: 'Кто может подать заявку', text: 'Заявку могут подать ученики, которые регулярно посещают занятия и готовы соблюдать правила клуба.', subitems: ['дети и подростки школьного возраста', 'спортсмены, участвующие в соревнованиях', 'семьи, которым нужна поддержка'] },
      { title: 'Какие документы нужны', text: 'Администратор клуба уточнит актуальный список документов после обращения.', subitems: ['заявление от родителя или законного представителя', 'документ, подтверждающий льготную категорию', 'медицинский допуск к занятиям'] },
      { title: 'Как принимается решение', text: 'Решение принимается после собеседования и оценки свободных мест в группе.', subitems: ['посещаемость и дисциплина', 'мотивация ученика', 'наличие мест по выбранному направлению'] },
    ];
    list.innerHTML = rules.map(renderBudgetRule).join('');
  });
}


function normalizeImageUrl(url = '') {
  return url.startsWith('/') ? `${API_URL}${url}` : url;
}

function pickLatestGalleryByCategory(category) {
  return [...state.gallery]
    .filter(item => item.category === category && item.image)
    .sort((a, b) => {
      const aDate = Date.parse(a.updatedAt || a.createdAt || '') || 0;
      const bDate = Date.parse(b.updatedAt || b.createdAt || '') || 0;
      if (aDate !== bDate) return bDate - aDate;
      return Number(b.order || 0) - Number(a.order || 0);
    })[0];
}

function setHeroImages() {
  const ring = pickLatestGalleryByCategory('hero-ring');
  const mat = pickLatestGalleryByCategory('hero-mat');
  const ringImg = $('#hero-ring-img');
  const matImg = $('#hero-mat-img');
  if (ringImg && ring?.image) {
    const src = normalizeImageUrl(ring.image);
    ringImg.src = src;
    localStorage.setItem('hero-ring-src', src);
  }
  if (matImg && mat?.image) {
    const src = normalizeImageUrl(mat.image);
    matImg.src = src;
    localStorage.setItem('hero-mat-src', src);
  }
}

function showOnHome(item = {}) {
  return !!(item.showOnHome || item.isFeaturedHome || item.showOnMain);
}
function sortByOrder(items = []) {
  return [...items].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
}
function pickHomeItems(items = [], fallbackCount = 3) {
  const featured = sortByOrder(items.filter(showOnHome));
  return (featured.length ? featured : sortByOrder(items).slice(0, fallbackCount));
}

function render({ refreshReveal = true } = {}) {
  const directionsForHome = sortByOrder(state.directions.filter(item => item.isActive !== false));
  $('#home-directions').innerHTML = directionsForHome.map(directionCard).join('') || '<div class="empty">Добавьте направления в админ-панели.</div>';
  $('#home-trainers').innerHTML = pickHomeItems(state.trainers, 3).map(t => trainerCard(t, true)).join('') || '<div class="empty">Добавьте тренеров в админ-панели.</div>';
  renderTrainerFilterButtons();
  renderTrainers({ refreshReveal });
  $('#home-pricing').innerHTML = pickHomeItems(state.pricing, 4).map(pricingCard).join('') || '<div class="empty">Добавьте тарифы в админ-панели.</div>';
  $('#pricing-grid').innerHTML = state.pricing.map(pricingCard).join('') || '<div class="empty">Пока нет тарифов.</div>';
  $('#gallery-grid').innerHTML = state.gallery.map(galleryCard).join('') || '<div class="empty">Пока нет фото.</div>';
  $('#stat-directions').textContent = state.directions.length || '—';
  $('#stat-trainers').textContent = state.trainers.length || '—';
  renderDirectionSelect();
  renderScheduleFilterButtons();
  renderSchedulePage();
  setHeroImages();
  applySiteSettings();
  markDecorativeIcons();
  if (refreshReveal) staggerActivePage();
}

function renderTrainers({ refreshReveal = true } = {}) {
  const activeDirection = state.directions.find(direction => directionMatchesFilterValue(direction, state.trainerFilter));
  const filtered = state.trainerFilter === 'all'
    ? state.trainers
    : state.trainers.filter(t => activeDirection && getTrainerFilterValues(t).some(value => directionMatchesFilterValue(activeDirection, value)));
  $('#trainers-grid').innerHTML = filtered.map(t => trainerCard(t)).join('') || '<div class="empty">Тренеры не найдены.</div>';
  if (refreshReveal && $('#page-trainers')?.classList.contains('active')) staggerActivePage('trainers');
}

function renderDirectionSelect() {
  const options = '<option value="">Выберите направление</option>' + state.directions.map(d => `<option value="${escapeHtml(d.slug || d.name)}">${escapeHtml(d.name)}</option>`).join('');
  $$('.direction-select').forEach(select => {
    const current = select.value;
    select.innerHTML = options;
    select.value = current;
  });
  enhanceDirectionSelects();
}

function closePremiumDirectionSelects(except = null) {
  $$('.premium-direction-select.is-open').forEach(root => {
    if (root === except) return;
    root.classList.remove('is-open');
    root.closest('.field--premium-select')?.classList.remove('is-open');
    $('.premium-direction-trigger', root)?.setAttribute('aria-expanded', 'false');
  });
}

function getPremiumSelect(field) {
  return field?.querySelector('.direction-select');
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 720px)').matches;
}

function syncPremiumDirectionSelect(select) {
  const root = select.closest('.field')?.querySelector('.premium-direction-select');
  if (!root) return;
  const label = $('.premium-direction-label', root);
  const menu = $('.premium-direction-menu', root);
  const selected = select.options[select.selectedIndex];
  if (label) label.textContent = selected?.textContent || select.options[0]?.textContent || '';
  if (!menu) return;
  menu.innerHTML = [...select.options].map((option, index) => {
    const isSelected = option.value === select.value;
    return `<li class="premium-direction-option${isSelected ? ' is-selected' : ''}" role="option" aria-selected="${isSelected}" data-value="${escapeHtml(option.value)}" data-option-index="${index}">${escapeHtml(option.textContent)}</li>`;
  }).join('');
}

function enhanceDirectionSelects() {
  if (!premiumSelectDocumentBound) {
    premiumSelectDocumentBound = true;
    document.addEventListener('click', event => {
      const trigger = event.target.closest('.premium-direction-trigger');
      if (trigger) {
        event.preventDefault();
        const root = trigger.closest('.premium-direction-select');
        if (!root) return;
        const field = root?.closest('.field');
        const select = getPremiumSelect(field);
        if (select) syncPremiumDirectionSelect(select);
        const isOpen = root.classList.contains('is-open');
        closePremiumDirectionSelects(root);
        root.classList.toggle('is-open', !isOpen);
        root.closest('.field--premium-select')?.classList.toggle('is-open', !isOpen);
        trigger.setAttribute('aria-expanded', String(!isOpen));
        return;
      }

      const option = event.target.closest('.premium-direction-option');
      if (option) {
        event.preventDefault();
        const field = option.closest('.field');
        const select = getPremiumSelect(field);
        if (select) {
          select.value = option.dataset.value || '';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          syncPremiumDirectionSelect(select);
        }
        closePremiumDirectionSelects();
        return;
      }

      if (!event.target.closest('.premium-direction-select')) closePremiumDirectionSelects();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closePremiumDirectionSelects();
      }
    });
  }

  $$('.direction-select').forEach(select => {
    const field = select.closest('.field');
    if (!field) return;
    field.classList.add('field--premium-select');
    select.classList.add('premium-native-select');

    let root = field.querySelector('.premium-direction-select');
    if (!root) {
      const id = select.id || `direction-select-${Math.random().toString(36).slice(2)}`;
      select.id = id;
      root = document.createElement('div');
      root.className = 'premium-direction-select';
      root.innerHTML = `<button class="premium-direction-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-menu"><span class="premium-direction-label"></span><i class="fas fa-chevron-down" aria-hidden="true"></i></button><ul class="premium-direction-menu" id="${id}-menu" role="listbox"></ul>`;
      select.insertAdjacentElement('afterend', root);
      select.addEventListener('change', () => syncPremiumDirectionSelect(select));
      select.form?.addEventListener('reset', () => requestAnimationFrame(() => syncPremiumDirectionSelect(select)));
    }
    syncPremiumDirectionSelect(select);
  });
}

function bindFilters() {
  $('#trainerFilters')?.addEventListener('click', event => {
    const btn = event.target.closest('[data-filter]');
    if (!btn) return;
    setTrainerFilter(btn.dataset.filter);
    renderTrainers();
  });

  $('#scheduleFilters')?.addEventListener('click', event => {
    const btn = event.target.closest('[data-schedule-filter]');
    if (!btn) return;
    applyScheduleFilter(btn.dataset.scheduleFilter);
  });
}

function bindForms() {
  $$('.contact-form').forEach(form => {
    if (form.querySelector('[name="privacyConsent"]')) return;
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    button.insertAdjacentHTML('beforebegin', `<label class="privacy-consent">
      <input type="checkbox" name="privacyConsent" required>
      <span>Я согласен на обработку персональных данных и принимаю <a href="/privacy" data-page="privacy">Политику конфиденциальности</a>.</span>
    </label>`);
  });

  enhanceContactForms();
  enhanceDirectionSelects();

  $$('.contact-form').forEach(form => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.elements.privacyConsent?.checked) {
        showToast('Подтвердите согласие на обработку персональных данных.');
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await apiPost('/api/contacts', {
          name: form.elements.name.value,
          phone: form.elements.phone.value,
          direction: form.elements.direction.value,
          preferredTime: form.elements.time.value,
          message: form.elements.message.value,
          privacyConsent: true,
          privacyConsentText: 'Согласие на обработку персональных данных и принятие Политики конфиденциальности'
        });
        showToast('Заявка отправлена. Мы скоро свяжемся с вами.');
        form.reset();
      } catch (error) {
        showToast('Не удалось отправить заявку. Позвоните нам или попробуйте позже.');
      } finally {
        button.disabled = false;
      }
    });
  });

  $$('input[name="phone"]').forEach(input => input.addEventListener('input', event => {
    let value = event.target.value.replace(/\D/g, '');
    if (value.startsWith('7') || value.startsWith('8')) value = value.slice(1);
    let formatted = '+7';
    if (value.length) formatted += ` (${value.slice(0,3)}`;
    if (value.length >= 3) formatted += `) ${value.slice(3,6)}`;
    if (value.length >= 6) formatted += `-${value.slice(6,8)}`;
    if (value.length >= 8) formatted += `-${value.slice(8,10)}`;
    event.target.value = formatted;
  }));
}

function enhanceContactForms() {
  $$('.contact-form').forEach((form, formIndex) => {
    $$('input, select, textarea', form).forEach((control, controlIndex) => {
      if (!control.id) control.id = `contact-${formIndex}-${control.name || controlIndex}`;
      const label = control.closest('.field')?.querySelector('label');
      if (label && !label.htmlFor) label.htmlFor = control.id;
      if (control.name === 'name') control.setAttribute('autocomplete', 'name');
      if (control.name === 'phone') {
        control.setAttribute('type', 'tel');
        control.setAttribute('inputmode', 'tel');
        control.setAttribute('autocomplete', 'tel');
      }
      if (control.name === 'message') control.setAttribute('autocomplete', 'off');
    });
  });
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4200);
}

async function loadData({ refreshReveal = true } = {}) {
  try {
    const [directions, trainers, pricing, gallery, settings] = await Promise.all([
      apiGet('/api/directions'), apiGet('/api/trainers'), apiGet('/api/pricing'), apiGet('/api/gallery'), apiGet('/api/settings')
    ]);
    state.directions = directions;
    state.trainers = trainers;
    state.pricing = pricing;
    state.gallery = gallery;
    state.settings = settings || {};
    const initialTrainerFilter = trainerFilterFromUrl();
    if (resolvePageName() === 'trainers' && initialTrainerFilter) {
      state.trainerFilter = initialTrainerFilter;
    }
    const initialScheduleFilter = scheduleFilterFromUrl();
    if (resolvePageName() === 'schedule' && initialScheduleFilter) {
      state.scheduleFilter = initialScheduleFilter;
    }
    render({ refreshReveal });
  } catch (error) {
    showToast('Ошибка загрузки данных сайта. Проверьте API.');
  }
}

function bindFocusRefresh() {
  // Keep reveal animations stable when the user switches browser tabs.
  // Data refresh happens on page load/reload; focus alone should not rebuild cards.
}

function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  markDecorativeIcons();
  bindSwipeToClose($('#drawer'), closeDrawer);
  bindNavigation();
  bindFilters();
  bindForms();
  bindFocusRefresh();
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeTrainerModal();
      closeDrawer();
    }
  });
  $('#openDrawer')?.addEventListener('click', toggleDrawer);
  $('#drawerBackdrop')?.addEventListener('click', closeDrawer);
  openPage(resolvePageName(), false);
  loadData();
}

document.addEventListener('DOMContentLoaded', boot);
