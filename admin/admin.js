const API_URL = window.location.origin;
let authToken = localStorage.getItem('admin_token') || '';

const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const adminName = document.getElementById('admin-name');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const toastContainer = document.getElementById('toast-container');

const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

let trainersData = [], directionsData = [], pricingData = [], galleryData = [], contactsData = [], directionIconsData = [], siteSettingsData = {};
const SPORT_LABELS = { wrestling:'Вольная борьба', boxing:'Бокс', kickboxing:'Кикбоксинг', judo:'Дзюдо', sambo:'Самбо' };
const AUDIENCE_LABELS = { men:'Мужчины', women:'Женщины', all:'Все' };
const AGE_LABELS = { kids:'Дети', teens:'Подростки', adults:'Взрослые', all:'Все' };
const GROUP_LABELS = { beginners:'Новички', advanced:'Продвинутые', competition:'Соревнования', all:'Все уровни' };
const DIRECTION_ICON_IMAGE_OPTIONS = [
    { value: '/assets/directions/boxing.png', label: 'boxing.png' },
    { value: '/assets/directions/functional.png', label: 'functional.png' },
    { value: '/assets/directions/judo.png', label: 'judo.png' },
    { value: '/assets/directions/karate.png', label: 'karate.png' },
    { value: '/assets/directions/kickboxing.png', label: 'kickboxing.png' },
    { value: '/assets/directions/mma.png', label: 'mma.png' },
    { value: '/assets/directions/muaythai.png', label: 'muaythai.png' },
    { value: '/assets/directions/sambo.png', label: 'sambo.png' },
    { value: '/assets/directions/wrestling.png', label: 'wrestling.png' }
];
const TRAINER_SOCIAL_OPTIONS = ['Telegram', 'Instagram', 'VK', 'YouTube', 'WhatsApp', 'Max', 'TikTok'];

const WEEK_DAYS = [
    ['Пн', 'Понедельник'], ['Вт', 'Вторник'], ['Ср', 'Среда'], ['Чт', 'Четверг'], ['Пт', 'Пятница'], ['Сб', 'Суббота'], ['Вс', 'Воскресенье']
];
const DAY_ALIASES = {
    'пн':'Пн','понедельник':'Пн','вт':'Вт','вторник':'Вт','ср':'Ср','среда':'Ср','чт':'Чт','четверг':'Чт','пт':'Пт','пятница':'Пт','сб':'Сб','суббота':'Сб','вс':'Вс','воскресенье':'Вс'
};

function normalizeScheduleDays(dayValue = '') {
    return String(dayValue)
        .split(/[,&/]| и /i)
        .map(item => item.trim().replace(/\./g, '').toLowerCase())
        .filter(Boolean)
        .map(item => DAY_ALIASES[item] || item)
        .filter((item, index, arr) => arr.indexOf(item) === index);
}

function buildTimeOptions(selected = '') {
    let html = '<option value="">Выберите</option>';
    for (let hour = 6; hour <= 23; hour++) {
        for (const minute of [0, 30]) {
            const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            html += `<option value="${value}" ${selected === value ? 'selected' : ''}>${value}</option>`;
        }
    }
    return html;
}

function parseTimeRange(slot = {}) {
    if (slot.startTime || slot.endTime) return { start: slot.startTime || '', end: slot.endTime || '' };
    const text = String(slot.time || '').replace(/—/g, '-');
    const match = text.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    return { start: match ? match[1].padStart(5, '0') : '', end: match ? match[2].padStart(5, '0') : '' };
}

function updateMultiSelectSummary(details) {
    const summary = details.querySelector('[data-multi-summary]');
    if (!summary) return;
    const checked = [...details.querySelectorAll('input[type="checkbox"]:checked')];
    const values = checked.map(cb => cb.dataset.summary || cb.value).filter(Boolean);
    summary.textContent = values.length ? values.join(' · ') : (summary.dataset.placeholder || 'Выберите');
}

function setupDaysDropdowns(scope = document) {
    const dropdowns = scope.matches?.('.multi-select') ? [scope] : [...scope.querySelectorAll('.multi-select')];
    dropdowns.forEach(details => {
        updateMultiSelectSummary(details);
        details.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => updateMultiSelectSummary(details));
            cb.addEventListener('click', event => event.stopPropagation());
        });
    });
}


function escapeAttr(value = '') {
    return String(value).replace(/[&<>\"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[ch]));
}

function markDecorativeIcons(scope = document) {
    scope.querySelectorAll('i[class*="fa-"]').forEach(icon => icon.setAttribute('aria-hidden', 'true'));
}

function enhanceFormControls(scope = document) {
    scope.querySelectorAll('.form-group').forEach((group, index) => {
        const control = group.querySelector('input:not([type="hidden"]), select, textarea');
        const label = group.querySelector('label');
        if (!control || !label) return;
        if (!control.id) {
            const base = control.name || control.className || control.type || 'field';
            control.id = `${base}`.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() + `-${index}`;
        }
        if (!label.htmlFor && !label.contains(control)) label.htmlFor = control.id;
        const fieldKey = `${control.name || ''} ${control.className || ''}`.toLowerCase();
        if (fieldKey.includes('url') || control.type === 'url') {
            control.type = 'url';
            control.inputMode = 'url';
            control.spellcheck = false;
        }
        if (fieldKey.includes('phone')) {
            control.type = 'tel';
            control.inputMode = 'tel';
            control.autocomplete = control.autocomplete || 'tel';
        }
        if (fieldKey.includes('slug')) control.spellcheck = false;
    });
    markDecorativeIcons(scope);
}

function splitSpecialties(value = '') {
    return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function trainerFilters(trainer = {}) {
    trainer = trainer || {};
    if (Array.isArray(trainer.filters) && trainer.filters.length) return trainer.filters;
    if (Array.isArray(trainer.categories) && trainer.categories.length) return trainer.categories;
    if (trainer.category) return [trainer.category];
    if (Array.isArray(trainer.specializations) && trainer.specializations.length) return trainer.specializations;
    return trainer.specialization ? [trainer.specialization] : [];
}

function getSportLabels() {
    const labels = {};
    directionsData.forEach(d => { if (d.slug && d.name) labels[d.slug] = d.name; });
    if (!Object.keys(labels).length) Object.assign(labels, SPORT_LABELS);
    return labels;
}

function findDirectionBySlug(slug = '') {
    return directionsData.find(d => d.slug === slug);
}

function directionColor(direction = {}) {
    return direction.color || direction.accentColor || '#FFD700';
}

function directionIconImageValue(direction = {}) {
    const raw = String(direction.iconImage || direction.iconMask || direction.mask || '').trim();
    if (raw) return raw.replace(/\.svg(\?.*)?$/i, '.png');
    const slug = String(direction.slug || '').trim().toLowerCase();
    const options = directionIconImageChoices();
    return options.find(item => item.value.toLowerCase().includes(`/${slug}.`))?.value || options[0]?.value || '';
}

function directionIconImageChoices() {
    const fromFiles = directionIconsData
        .map(item => ({ value: item.url || item.value || '', label: item.label || item.name || item.url || item.value || '' }))
        .filter(item => item.value);
    return fromFiles.length ? fromFiles : DIRECTION_ICON_IMAGE_OPTIONS;
}

function directionIconImageOptions(selected = '') {
    const choices = directionIconImageChoices();
    const current = selected || choices[0]?.value || '';
    const hasCurrent = choices.some(item => item.value === current);
    const options = hasCurrent || !current ? choices : [{ value: current, label: 'Текущая иконка' }, ...choices];
    return options.map(item => `<option value="${escapeAttr(item.value)}" ${current === item.value ? 'selected' : ''}>${escapeAttr(item.label)}</option>`).join('');
}

function directionIconImagePreview(src = '', className = 'direction-icon-image-preview') {
    const value = src || directionIconImageChoices()[0]?.value || '';
    return `<img class="${className}" src="${escapeAttr(value)}" alt="" width="42" height="42" loading="lazy" decoding="async">`;
}

function directionOptions(selected = '') {
    let html = '<option value="">Выберите направление</option>';
    html += directionsData.map(d => `<option value="${escapeAttr(d.slug || '')}" ${selected === d.slug ? 'selected' : ''}>${escapeAttr(d.name || d.slug)}</option>`).join('');
    return html;
}

function trainerSpecialtiesText(trainer = {}) {
    const labels = getSportLabels();
    return trainerFilters(trainer).map(item => labels[item] || item).join(' / ');
}


function isShownOnHome(item = {}) {
    return !!(item.showOnHome || item.isFeaturedHome || item.showOnMain);
}

function getEntityConfig(type) {
    const map = {
        trainers: { data: trainersData, endpoint: '/api/trainers', reload: loadTrainers, name: 'тренера' },
        directions: { data: directionsData, endpoint: '/api/directions', reload: loadDirections, name: 'направления' },
        pricing: { data: pricingData, endpoint: '/api/pricing', reload: loadPricing, name: 'тарифа' },
    };
    return map[type];
}

async function updateEntity(type, item, patch = {}) {
    const config = getEntityConfig(type);
    if (!config || !item?._id) return;
    await apiPut(`${config.endpoint}/${item._id}`, { ...item, ...patch });
}

window.toggleHomeEntity = async (type, id, checked) => {
    const config = getEntityConfig(type);
    const item = config?.data.find(x => x._id === id);
    if (!item) return;
    try {
        await updateEntity(type, item, { showOnHome: checked, isFeaturedHome: checked, showOnMain: checked });
        showToast(checked ? `Показ на главной включён` : `Показ на главной выключен`, 'success');
        await config.reload();
    } catch (e) {
        showToast('Не удалось изменить отображение на главной', 'error');
    }
};

window.moveEntityOrder = async (type, id, direction) => {
    const config = getEntityConfig(type);
    if (!config) return;
    const sortEntities = items => [...items].sort((a, b) => {
        const aOrder = Number(a.order);
        const bOrder = Number(b.order);
        const orderDiff = (Number.isFinite(aOrder) && aOrder > 0 ? aOrder : Number.MAX_SAFE_INTEGER)
            - (Number.isFinite(bOrder) && bOrder > 0 ? bOrder : Number.MAX_SAFE_INTEGER);
        return orderDiff || String(a.name || '').localeCompare(String(b.name || ''), 'ru') || String(a._id || '').localeCompare(String(b._id || ''));
    });
    const fullList = sortEntities(config.data);
    let visibleList = fullList;
    if (type === 'trainers') {
        const filter = document.getElementById('trainer-filter')?.value || '';
        const labels = getSportLabels();
        visibleList = filter
            ? fullList.filter(t => trainerFilters(t).some(value => value === filter || (labels[value] || value) === (labels[filter] || filter)))
            : fullList;
    }
    const index = visibleList.findIndex(item => item._id === id);
    const targetIndex = index + Number(direction || 0);
    if (index < 0 || targetIndex < 0 || targetIndex >= visibleList.length) return;
    const current = visibleList[index];
    const target = visibleList[targetIndex];
    const reordered = fullList.filter(item => item._id !== current._id);
    const targetFullIndex = reordered.findIndex(item => item._id === target._id);
    if (targetFullIndex < 0) return;
    reordered.splice(direction < 0 ? targetFullIndex : targetFullIndex + 1, 0, current);
    try {
        await Promise.all(reordered.map((item, idx) => updateEntity(type, item, { order: idx + 1 })));
        await config.reload();
    } catch (e) {
        showToast('Не удалось изменить порядок', 'error');
    }
};

function orderControlHtml(type, item = {}) {
    return `<div class="order-control">
        <button class="btn btn-sm btn-secondary" title="Выше" aria-label="Поднять выше" onclick="moveEntityOrder('${type}','${item._id}',-1)"><i class="fas fa-arrow-up" aria-hidden="true"></i></button>
        <button class="btn btn-sm btn-secondary" title="Ниже" aria-label="Опустить ниже" onclick="moveEntityOrder('${type}','${item._id}',1)"><i class="fas fa-arrow-down" aria-hidden="true"></i></button>
    </div>`;
}

function homeControlHtml(type, item = {}) {
    return `<div class="home-control">
        <label><input type="checkbox" ${isShownOnHome(item) ? 'checked' : ''} onchange="toggleHomeEntity('${type}','${item._id}',this.checked)"> На главной</label>
        ${orderControlHtml(type, item)}
    </div>`;
}


function normalizeAchievements(value) {
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
    return String(value || '').split(/\n|;/).map(v => v.trim()).filter(Boolean);
}
function renderAchievements(value) {
    const items = normalizeAchievements(value);
    if (!items.length) return '';
    return `<ul class="achievement-list">${items.map(item => `<li>${escapeAttr(item)}</li>`).join('')}</ul>`;
}

function renderTrainerFilterOptions() {
    const select = document.getElementById('trainer-filter');
    if (!select) return;
    const current = select.value;
    const labels = getSportLabels();
    trainersData.forEach(trainer => {
        trainerFilters(trainer).forEach(value => {
            if (!value) return;
            labels[value] = labels[value] || SPORT_LABELS[value] || value;
        });
    });
    select.innerHTML = '<option value="">Все направления</option>' + Object.entries(labels)
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'ru'))
        .map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeAttr(label)}</option>`).join('');
    select.value = labels[current] ? current : '';
}

function imageUrl(url = '') {
    return url ? (url.startsWith('/') ? `${API_URL}${url}` : url) : '';
}

function normalizeExternalUrl(value = '') {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function trainerSocial(trainer = {}) {
    const social = trainer.social || {};
    const url = normalizeExternalUrl(trainer.socialUrl || social.url || trainer.socialLink || '');
    if (!url) return null;
    let label = String(trainer.socialLabel || social.label || '').trim();
    if (!label) {
        try {
            label = new URL(url).hostname.replace(/^www\./, '');
        } catch {
            label = 'Соцсеть';
        }
    }
    return { label, url };
}

function trainerSocialOptions(selected = '') {
    const current = String(selected || '').trim();
    const options = current && !TRAINER_SOCIAL_OPTIONS.includes(current)
        ? [current, ...TRAINER_SOCIAL_OPTIONS]
        : TRAINER_SOCIAL_OPTIONS;
    return '<option value="">Не выбрано</option>' + options
        .map(label => `<option value="${escapeAttr(label)}" ${current === label ? 'selected' : ''}>${escapeAttr(label)}</option>`)
        .join('');
}

function normalizeSlotTrainers(slot = {}) {
    const raw = Array.isArray(slot.trainers) && slot.trainers.length
        ? slot.trainers
        : String(slot.trainer || '').split(/\s*[·•]\s*|,\s*|;\s*/);
    return raw
        .map(name => String(name || '').trim())
        .filter(name => name && name !== 'Тренер клуба' && name !== 'Уточняйте у администратора' && name !== 'Тренер уточняется')
        .filter((name, index, arr) => arr.indexOf(name) === index);
}

function trainerCheckboxes(selectedNames = []) {
    const selected = new Set(selectedNames.map(name => String(name || '').trim()).filter(Boolean));
    const names = trainersData.map(t => t.name).filter(Boolean);
    selected.forEach(name => { if (!names.includes(name)) names.unshift(name); });
    return names.map(name => `<label><input type="checkbox" class="sch-trainer-check" value="${escapeAttr(name)}" data-summary="${escapeAttr(name)}" ${selected.has(name) ? 'checked' : ''}> ${escapeAttr(name)}</label>`).join('');
}

function slugify(value = '') {
    return String(value).trim().toLowerCase()
        .replace(/ё/g, 'e').replace(/й/g, 'y').replace(/ц/g, 'ts').replace(/у/g, 'u').replace(/к/g, 'k').replace(/е/g, 'e').replace(/н/g, 'n').replace(/г/g, 'g').replace(/ш/g, 'sh').replace(/щ/g, 'sch').replace(/з/g, 'z').replace(/х/g, 'h').replace(/ъ/g, '')
        .replace(/ф/g, 'f').replace(/ы/g, 'y').replace(/в/g, 'v').replace(/а/g, 'a').replace(/п/g, 'p').replace(/р/g, 'r').replace(/о/g, 'o').replace(/л/g, 'l').replace(/д/g, 'd').replace(/ж/g, 'zh').replace(/э/g, 'e')
        .replace(/я/g, 'ya').replace(/ч/g, 'ch').replace(/с/g, 's').replace(/м/g, 'm').replace(/и/g, 'i').replace(/т/g, 't').replace(/ь/g, '').replace(/б/g, 'b').replace(/ю/g, 'yu')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'direction';
}

// ========== AUTH ==========
async function checkAuth() {
    if (!authToken) return showLogin();
    try {
        const res = await fetch(`${API_URL}/api/auth/verify`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            adminName.textContent = data.admin.username;
            showDashboard();
            loadAllData();
        } else {
            showLogin();
        }
    } catch {
        showLogin();
    }
}

function showLogin() {
    loginScreen.style.display = 'flex';
    dashboard.classList.remove('active');
    authToken = '';
    localStorage.removeItem('admin_token');
    enhanceFormControls(loginScreen);
    markDecorativeIcons(document);
}

function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.classList.add('active');
    enhanceFormControls(dashboard);
    markDecorativeIcons(document);
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.remove('show');
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    console.log('Login attempt:', username);

    try {
        const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        console.log('Response status:', res.status);
        const data = await res.json();
        console.log('Response:', data);

        if (res.ok) {
            authToken = data.token;
            localStorage.setItem('admin_token', authToken);
            adminName.textContent = data.username;
            showDashboard();
            loadAllData();
            showToast('Вход выполнен успешно', 'success');
        } else {
            loginError.textContent = data.message || 'Ошибка входа';
            loginError.classList.add('show');
        }
    } catch (err) {
        console.error('Login error:', err);
        loginError.textContent = 'Ошибка соединения: ' + err.message;
        loginError.classList.add('show');
    }
});

logoutBtn.addEventListener('click', () => {
    authToken = '';
    localStorage.removeItem('admin_token');
    window.location.href = '/';
});

// ========== NAVIGATION ==========
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        if (!tab) return;
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        tabContents.forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${tab}`)?.classList.add('active');
        if (tab === 'contacts') refreshContactsInBackground();
        if (tab === 'budget') renderBudgetSettingsForm();
    });
});

function getActiveTabName() {
    return document.querySelector('.nav-item.active')?.dataset.tab || '';
}

async function refreshContactsInBackground() {
    if (!authToken || getActiveTabName() !== 'contacts') return;
    try {
        const latest = await apiGet('/api/contacts');
        const oldSignature = JSON.stringify(contactsData.map(c => [c._id, c.status, c.createdAt]));
        const newSignature = JSON.stringify(latest.map(c => [c._id, c.status, c.createdAt]));
        contactsData = latest;
        if (oldSignature !== newSignature) renderContacts();
    } catch (e) {
        console.warn('Не удалось обновить заявки в фоне', e);
    }
}

// ========== API ==========
async function apiGet(endpoint) {
    const res = await fetch(`${API_URL}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function apiPost(endpoint, data) {
    const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function apiPut(endpoint, data) {
    const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function apiDelete(endpoint) {
    const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}


// ========== IMAGE CROP / PREVIEW BEFORE UPLOAD ==========
function ensureCropModal() {
    let modal = document.getElementById('image-crop-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'image-crop-modal';
    modal.className = 'crop-modal';
    modal.innerHTML = `
        <div class="crop-backdrop"></div>
        <div class="crop-panel">
            <div class="crop-head">
                <h3>Выберите фрагмент фотографии</h3>
                <button type="button" class="modal-close" data-crop-cancel aria-label="Закрыть выбор фрагмента">&times;</button>
            </div>
            <div class="crop-workarea">
                <div class="crop-toolbar"><span id="crop-aspect-label">Кадр для сайта</span><span>Рамка соответствует месту показа на сайте</span></div>
                <div class="crop-frame" id="crop-frame">
                    <img id="crop-image" width="1" height="1" alt="Предпросмотр">
                    <div class="crop-viewport-guide"><span>Безопасная область</span></div>
                </div>
                <div class="crop-help">Перемещайте изображение так, чтобы важная часть попала в жёлтую рамку. Эта рамка уже подобрана под минимальную область, в которой фото будет показано на сайте.</div>
                <div class="crop-controls"><label>Масштаб</label><input type="range" id="crop-zoom" min="1" max="3" step="0.01" value="1"></div>
            </div>
            <div class="crop-actions">
                <button type="button" class="btn btn-secondary" data-crop-cancel>Отмена</button>
                <button type="button" class="btn btn-primary" id="crop-apply-btn">Использовать фрагмент</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    return modal;
}

function parseAspectRatio(value = '') {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 1;
    const parts = String(value).split('/').map(part => parseFloat(part.trim()));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && parts[1] > 0) {
        return parts[0] / parts[1];
    }
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getCropSafeFractions(options = {}) {
    const cropAspect = parseAspectRatio(options.aspect || '16 / 10');
    const targetAspects = (options.safeAspects || [cropAspect])
        .map(parseAspectRatio)
        .filter(aspect => Number.isFinite(aspect) && aspect > 0);
    let safeW = 1;
    let safeH = 1;

    targetAspects.forEach(targetAspect => {
        if (targetAspect > cropAspect) {
            safeH = Math.min(safeH, cropAspect / targetAspect);
        } else if (targetAspect < cropAspect) {
            safeW = Math.min(safeW, targetAspect / cropAspect);
        }
    });

    return {
        width: Math.max(0.25, Math.min(1, safeW)),
        height: Math.max(0.25, Math.min(1, safeH))
    };
}

function applyCropSafeGuide(frame, options = {}) {
    const guide = frame?.querySelector('.crop-viewport-guide');
    if (!guide) return;
    if (!Array.isArray(options.safeAspects) || !options.safeAspects.length) {
        guide.style.display = 'none';
        return;
    }
    guide.style.display = '';
    const { width, height } = getCropSafeFractions(options);
    guide.style.width = `${width * 100}%`;
    guide.style.height = `${height * 100}%`;
}

function cropImageFile(file, options = {}) {
    return new Promise((resolve, reject) => {
        const modal = ensureCropModal();
        const frame = modal.querySelector('#crop-frame');
        const img = modal.querySelector('#crop-image');
        const zoomInput = modal.querySelector('#crop-zoom');
        const aspectLabel = modal.querySelector('#crop-aspect-label');
        frame.style.aspectRatio = options.aspect || '16 / 10';
        applyCropSafeGuide(frame, options);
        if (aspectLabel) aspectLabel.textContent = options.label || 'Кадр для сайта';
        const applyBtn = modal.querySelector('#crop-apply-btn');
        const url = URL.createObjectURL(file);
        let imgNaturalW = 1, imgNaturalH = 1, baseScale = 1, zoom = 1, x = 0, y = 0, dragging = false, startX = 0, startY = 0, startPosX = 0, startPosY = 0;

        function update() {
            const scale = baseScale * zoom;
            img.style.width = `${imgNaturalW * scale}px`;
            img.style.height = `${imgNaturalH * scale}px`;
            img.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        }
        function clampPosition() {
            const rect = frame.getBoundingClientRect();
            const scaledW = imgNaturalW * baseScale * zoom;
            const scaledH = imgNaturalH * baseScale * zoom;
            const maxX = Math.max(0, (scaledW - rect.width) / 2);
            const maxY = Math.max(0, (scaledH - rect.height) / 2);
            x = Math.min(maxX, Math.max(-maxX, x));
            y = Math.min(maxY, Math.max(-maxY, y));
        }
        function cleanup() {
            modal.classList.remove('active');
            URL.revokeObjectURL(url);
            applyBtn.onclick = null;
            modal.querySelectorAll('[data-crop-cancel]').forEach(btn => btn.onclick = null);
            frame.onpointerdown = frame.onpointermove = frame.onpointerup = frame.onpointercancel = null;
            zoomInput.oninput = null;
        }
        img.onload = () => {
            imgNaturalW = img.naturalWidth;
            imgNaturalH = img.naturalHeight;
            const rect = frame.getBoundingClientRect();
            baseScale = Math.max(rect.width / imgNaturalW, rect.height / imgNaturalH);
            zoom = 1; x = 0; y = 0; zoomInput.value = '1';
            update();
        };
        img.src = url;
        modal.classList.add('active');
        zoomInput.oninput = () => { zoom = parseFloat(zoomInput.value || '1'); clampPosition(); update(); };
        frame.onpointerdown = (e) => { dragging = true; startX = e.clientX; startY = e.clientY; startPosX = x; startPosY = y; frame.setPointerCapture?.(e.pointerId); };
        frame.onpointermove = (e) => { if (!dragging) return; x = startPosX + e.clientX - startX; y = startPosY + e.clientY - startY; clampPosition(); update(); };
        frame.onpointerup = frame.onpointercancel = () => { dragging = false; };
        modal.querySelectorAll('[data-crop-cancel]').forEach(btn => btn.onclick = () => { cleanup(); reject(new Error('Загрузка отменена')); });
        applyBtn.onclick = () => {
            const rect = frame.getBoundingClientRect();
            const scale = baseScale * zoom;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(rect.width * 2);
            canvas.height = Math.round(rect.height * 2);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const drawW = imgNaturalW * scale * 2;
            const drawH = imgNaturalH * scale * 2;
            const drawX = (rect.width / 2 + x) * 2 - drawW / 2;
            const drawY = (rect.height / 2 + y) * 2 - drawH / 2;
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            canvas.toBlob(blob => {
                cleanup();
                if (!blob) return reject(new Error('Не удалось подготовить изображение'));
                const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '-crop.png';
                resolve(new File([blob], name, { type: 'image/png' }));
            }, 'image/png', 0.92);
        };
    });
}

async function uploadFile(file, type, cropOptions = {}) {
    // Проверка типа файла
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Неверный формат файла. Разрешены: JPEG, PNG, WebP, GIF. Ваш: ' + file.type);
    }

    // Окно предпросмотра и выбора фрагмента перед загрузкой
    file = await cropImageFile(file, cropOptions);

    // Проверка размера после подготовки изображения (20MB = 20*1024*1024)
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        throw new Error('Файл слишком большой (макс. 20MB). Ваш файл: ' + (file.size / 1024 / 1024).toFixed(2) + 'MB');
    }

    const formData = new FormData();
    formData.append('image', file);
    console.log('📤 Uploading:', file.name, 'type:', type, 'size:', (file.size/1024/1024).toFixed(2) + 'MB', 'mime:', file.type);

    const res = await fetch(`${API_URL}/api/upload/${type}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
    });

    console.log('Upload response status:', res.status);

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Неизвестная ошибка (статус ' + res.status + ')' }));
        console.error('❌ Upload error:', res.status, errorData);
        throw new Error(errorData.message || 'Ошибка загрузки файла (HTTP ' + res.status + ')');
    }

    const data = await res.json();
    console.log('Upload success:', data.url);
    return data.url;
}

// ========== LOAD DATA ==========
async function loadAllData() {
    await Promise.all([loadDirectionIcons(), loadTrainers(), loadDirections(), loadPricing(), loadGallery(), loadContacts(), loadSiteSettings()]);
    enhanceFormControls(document);
}

async function loadDirectionIcons() {
    try {
        directionIconsData = await apiGet('/api/direction-icons');
    } catch (e) {
        console.warn('Не удалось загрузить список иконок направлений', e);
        directionIconsData = DIRECTION_ICON_IMAGE_OPTIONS.map(item => ({
            name: item.value.split('/').pop(),
            label: item.label,
            url: item.value
        }));
    }
}

async function loadTrainers() {
    try {
        trainersData = await apiGet('/api/trainers?includeInactive=true');
        renderTrainerFilterOptions();
        renderTrainers();
    } catch (e) {
        console.error(e); showToast('Ошибка загрузки тренеров', 'error');
    }
}

async function loadDirections() {
    try {
        directionsData = await apiGet('/api/directions?includeInactive=true');
        renderDirections();
        renderSports();
        renderTrainerFilterOptions();
        renderTrainers();
    } catch (e) {
        console.error(e); showToast('Ошибка загрузки расписания', 'error');
    }
}

async function loadPricing() {
    try {
        pricingData = await apiGet('/api/pricing?includeInactive=true');
        renderPricing();
    } catch (e) {
        console.error(e); showToast('Ошибка загрузки тарифов', 'error');
    }
}

async function loadGallery() {
    try {
        galleryData = await apiGet('/api/gallery');
        renderGallery();
    } catch (e) {
        console.error(e); showToast('Ошибка загрузки галереи', 'error');
    }
}

async function loadContacts() {
    try {
        contactsData = await apiGet('/api/contacts');
        renderContacts();
    } catch (e) {
        showToast('Ошибка загрузки заявок', 'error');
    }
}

async function loadSiteSettings() {
    try {
        siteSettingsData = await apiGet('/api/settings');
        renderSiteSettingsForm();
        renderFaqSettingsForm();
        renderLegalSettingsForm();
    } catch (e) {
        console.error(e);
        showToast('Ошибка загрузки настроек сайта', 'error');
    }
}

// ========== RENDERERS ==========
function renderTrainers() {
    const grid = document.getElementById('trainers-grid');
    const filter = document.getElementById('trainer-filter').value;
    const labels = getSportLabels();
    const filtered = filter ? trainersData.filter(t => trainerFilters(t).some(value => value === filter || (labels[value] || value) === (labels[filter] || filter))) : trainersData;

    if (!filtered.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-user-tie"></i><p>Нет тренеров</p></div>';
        return;
    }

    grid.innerHTML = filtered.map(t => `
        <div class="card">
            ${t.photo ? `<img src="${imageUrl(t.photo)}" class="card-image" width="600" height="400" loading="lazy" decoding="async" alt="${escapeAttr(t.name)}">` : '<div class="card-image"><i class="fas fa-user" aria-hidden="true"></i></div>'}
            <div class="card-title">${t.name}</div>
            <div class="card-subtitle">${trainerSpecialtiesText(t)}${t.experience ? ' · ' + t.experience : ''}</div>
            ${trainerSocial(t) ? `<a class="trainer-social-link" href="${escapeAttr(trainerSocial(t).url)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i> ${escapeAttr(trainerSocial(t).label)}</a>` : ''}
            <div class="card-text">${renderAchievements(t.achievements)}</div>
            <div class="card-text" style="font-style:italic;color:var(--gray-500);font-size:13px;">${t.quote ? '&laquo;' + t.quote + '&raquo;' : ''}</div>
            ${homeControlHtml('trainers', t)}
            <div class="card-actions">
                <button class="btn btn-sm btn-secondary" aria-label="Редактировать тренера ${escapeAttr(t.name)}" onclick="editTrainer('${t._id}')"><i class="fas fa-edit" aria-hidden="true"></i></button>
                <button class="btn btn-sm btn-danger" aria-label="Удалить тренера ${escapeAttr(t.name)}" onclick="deleteTrainer('${t._id}')"><i class="fas fa-trash" aria-hidden="true"></i></button>
            </div>
        </div>
    `).join('');
}

function renderSports() {
    const tbody = document.querySelector('#sports-table tbody');
    if (!tbody) return;
    if (!directionsData.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Нет направлений</td></tr>';
        return;
    }
    tbody.innerHTML = directionsData.map(d => `
        <tr>
            <td><div class="direction-name-cell"><span class="direction-table-icon">${directionIconImagePreview(directionIconImageValue(d), 'direction-icon-image-preview direction-icon-image-preview-table')}</span><div><strong>${escapeAttr(d.name || '')}</strong><br><small style="color:var(--gray-400)">${escapeAttr(d.shortDescription || '')}</small></div></div></td>
            <td><code>${escapeAttr(d.slug || '')}</code></td>
            <td><span class="color-pill"><span class="color-dot" style="background:${escapeAttr(directionColor(d))}"></span>${escapeAttr(directionColor(d))}</span></td>
            <td>${orderControlHtml('directions', d)}</td>
            <td>${escapeAttr(d.description || '')}</td>
            <td>
                <button class="btn btn-sm btn-secondary" aria-label="Редактировать направление ${escapeAttr(d.name || '')}" onclick="editSport('${d._id}')"><i class="fas fa-edit" aria-hidden="true"></i></button>
                <button class="btn btn-sm btn-danger" aria-label="Удалить направление ${escapeAttr(d.name || '')}" onclick="deleteSport('${d._id}')"><i class="fas fa-trash" aria-hidden="true"></i></button>
            </td>
        </tr>`).join('');
}

function renderDirections() {
    const tbody = document.querySelector('#directions-table tbody');
    if (!tbody) return;
    const rows = directionsData.filter(d => (d.schedule || []).length);
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Нет занятий</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(d => {
        const audiences = [...new Set((d.schedule || []).map(s => s.audience || 'all'))]
            .map(a => AUDIENCE_LABELS[a] || a).join(', ') || 'Все';
        const ages = [...new Set((d.schedule || []).map(s => s.age || (s.group === 'kids' ? 'kids' : 'all')))]
            .map(a => AGE_LABELS[a] || a).join(', ') || 'Все';
        return `
        <tr>
            <td><strong>${escapeAttr(d.name || '')}</strong><br><small style="color:var(--gray-400)">${escapeAttr(d.slug || '')}</small></td>
            <td>${(d.schedule || []).map(s => {
                const trainerLabel = normalizeSlotTrainers(s).join(' · ') || 'Тренер клуба';
                return `${escapeAttr(s.day || '')}: ${escapeAttr(s.time || '')} · ${escapeAttr(trainerLabel)}${s.group ? ' · ' + escapeAttr(GROUP_LABELS[s.group === 'kids' ? 'beginners' : s.group] || s.group) : ''}${(s.age || s.group === 'kids') ? ' · ' + escapeAttr(AGE_LABELS[s.age || 'kids'] || s.age) : ''}`;
            }).join('<br>')}</td>
            <td>${audiences}<br><small style="color:var(--gray-400)">Возраст: ${ages}</small></td>
            <td>
                <button class="btn btn-sm btn-secondary" aria-label="Редактировать расписание ${escapeAttr(d.name || '')}" onclick="editDirection('${d._id}')"><i class="fas fa-edit" aria-hidden="true"></i></button>
                <button class="btn btn-sm btn-danger" aria-label="Очистить расписание ${escapeAttr(d.name || '')}" onclick="clearDirectionSchedule('${d._id}')"><i class="fas fa-calendar-xmark" aria-hidden="true"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function renderPricing() {
    const grid = document.getElementById('pricing-grid');
    if (!pricingData.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-tag"></i><p>Нет тарифов</p></div>';
        return;
    }

    grid.innerHTML = pricingData.map(p => `
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <div class="card-title">${p.name}</div>
                ${p.isPopular ? '<span class="badge badge-popular">Популярный</span>' : ''}
            </div>
            <div style="font-size:32px;font-weight:800;color:var(--black);margin-bottom:4px">${p.price.toLocaleString()} ₽</div>
            <div style="color:var(--gray-500);margin-bottom:16px">${p.period}</div>
            <div class="card-text">${p.description}</div>
            ${homeControlHtml('pricing', p)}
            <ul style="list-style:none;padding:0;margin-bottom:16px">
                ${p.features.map(f => `<li style="padding:4px 0;font-size:14px;color:var(--gray-600)"><i class="fas fa-check" aria-hidden="true" style="color:var(--yellow);margin-right:8px;"></i>${escapeAttr(f)}</li>`).join('')}
            </ul>
            <div class="card-actions">
                <button class="btn btn-sm btn-secondary" aria-label="Редактировать тариф ${escapeAttr(p.name || '')}" onclick="editPricing('${p._id}')"><i class="fas fa-edit" aria-hidden="true"></i></button>
                <button class="btn btn-sm btn-danger" aria-label="Удалить тариф ${escapeAttr(p.name || '')}" onclick="deletePricing('${p._id}')"><i class="fas fa-trash" aria-hidden="true"></i></button>
            </div>
        </div>
    `).join('');
}

function renderGallery() {
    const grid = document.getElementById('gallery-grid');
    if (!galleryData.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-images"></i><p>Нет фотографий</p></div>';
        return;
    }

    const categoryLabels = {
        'hero-ring': 'Главная · левая фотография',
        'hero-mat': 'Главная · правая фотография',
        interior: 'Интерьер', amenities: 'Удобства', training: 'Тренировки', events: 'Мероприятия', gym: 'Зал'
    };

    grid.innerHTML = galleryData.map(g => `
        <div class="gallery-item">
            ${g.image ? `<img src="${imageUrl(g.image)}" width="800" height="600" loading="lazy" decoding="async" alt="${escapeAttr(g.title)}">` : '<div class="placeholder"><i class="fas fa-image" aria-hidden="true"></i></div>'}
            <div class="gallery-item-actions">
                <button aria-label="Редактировать фото ${escapeAttr(g.title || '')}" onclick="editGallery('${g._id}')"><i class="fas fa-edit" aria-hidden="true"></i></button>
                <button aria-label="Удалить фото ${escapeAttr(g.title || '')}" onclick="deleteGallery('${g._id}')" style="color:var(--red)"><i class="fas fa-trash" aria-hidden="true"></i></button>
            </div>
            <div class="gallery-item-info">
                <div style="font-size:16px;font-weight:700">${g.title}</div>
                <div style="font-size:12px;font-weight:800;color:var(--yellow-dark);margin:4px 0">${categoryLabels[g.category] || g.category || 'Галерея'}</div>
                <div style="font-size:13px;color:var(--gray-500)">${g.description || ''}</div>
            </div>
        </div>
    `).join('');
}

function renderContacts() {
    const tbody = document.querySelector('#contacts-table tbody');
    const filter = document.getElementById('contact-filter').value;
    const filtered = filter ? contactsData.filter(c => c.status === filter) : contactsData;

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Нет заявок</td></tr>';
        return;
    }

    const statusLabels = { new: 'Новая', processed: 'В обработке', completed: 'Завершена' };
    const statusClasses = { new: 'badge-new', processed: 'badge-processed', completed: 'badge-completed' };

    tbody.innerHTML = filtered.map(c => `
        <tr>
            <td><strong>${c.name}</strong></td>
            <td>${c.phone}</td>
            <td>${c.direction || '-'}</td>
            <td>${c.preferredTime || '-'}</td>
            <td><span class="badge ${statusClasses[c.status]}">${statusLabels[c.status]}</span></td>
            <td>${new Date(c.createdAt).toLocaleDateString('ru-RU')}</td>
            <td>
                <select aria-label="Статус заявки ${escapeAttr(c.name || '')}" onchange="updateContactStatus('${c._id}', this.value)" style="padding:4px 8px;border-radius:4px;border:1px solid var(--gray-300);font-family:inherit;">
                    <option value="new" ${c.status === 'new' ? 'selected' : ''}>Новая</option>
                    <option value="processed" ${c.status === 'processed' ? 'selected' : ''}>В обработке</option>
                    <option value="completed" ${c.status === 'completed' ? 'selected' : ''}>Завершена</option>
                </select>
                <button class="btn btn-sm btn-danger" aria-label="Удалить заявку ${escapeAttr(c.name || '')}" onclick="deleteContact('${c._id}')" style="margin-left:8px"><i class="fas fa-trash" aria-hidden="true"></i></button>
            </td>
        </tr>
    `).join('');
}

// ========== MODAL ==========
function openModal(title, content) {
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modal.classList.add('active');
    enhanceFormControls(modal);
}

function closeModal() {
    modal.classList.remove('active');
}

// ========== TRAINERS CRUD ==========
function getGalleryCropOptions(category = '') {
    if (category === 'hero-ring') return { aspect: '1 / 2', label: 'Кадр левой фотографии на главной' };
    if (category === 'hero-mat') return { aspect: '1 / 2', label: 'Кадр правой фотографии на главной' };
    return { aspect: '4 / 3', label: 'Кадр фотографии зала' };
}

window.openTrainerModal = (event) => {
    event?.preventDefault?.();
    openModal('Добавить тренера', getTrainerForm());
    setupTrainerForm();
};

document.getElementById('trainer-filter')?.addEventListener('change', renderTrainers);

function getTrainerForm(trainer = null) {
    const isEdit = !!trainer;
    const selectedFilters = trainerFilters(trainer);
    const sportCheckboxes = Object.entries(getSportLabels()).map(([value, label]) => `
        <label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:14px;">
            <input type="checkbox" name="filters" value="${value}" ${selectedFilters.includes(value) ? 'checked' : ''}> ${label}
        </label>`).join('');
    return `
        <form id="trainer-form" data-id="${trainer?._id || ''}">
            <div class="form-group">
                <label>Имя</label>
                <input type="text" name="name" value="${escapeAttr(trainer?.name || '')}" required>
            </div>
            <div class="form-group">
                <label>Направления / фильтры тренера</label>
                <div style="display:flex;gap:12px;flex-wrap:wrap;">${sportCheckboxes}</div>
                <div class="hint">Выберите одно или несколько направлений. Они используются и как фильтры, и как специализации на карточке тренера.</div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Стаж</label>
                    <input type="text" name="experience" value="${escapeAttr(trainer?.experience || '')}" required placeholder="Например: 10 лет">
                </div>
            </div>
            <div class="form-group checkbox-line">
                <label><input type="checkbox" name="showOnHome" ${isShownOnHome(trainer || {}) ? 'checked' : ''}> Показывать тренера на главной</label>
                <div class="hint">Если не выбран ни один тренер, на главной будут показаны первые три активных тренера.</div>
            </div>
            <div class="form-group">
                <label>Достижения</label>
                <textarea name="achievements" placeholder="Одно достижение на строку">${normalizeAchievements(trainer?.achievements).join('\n')}</textarea>
                <div class="hint">Каждое достижение отображается отдельной строкой на странице тренеров и на карточке тренера на главной.</div>
            </div>
            <div class="form-group">
                <label>Цитата</label>
                <textarea name="quote">${trainer?.quote || ''}</textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Название соцсети</label>
                    <select name="socialLabel">
                        ${trainerSocialOptions(trainer?.socialLabel || trainer?.social?.label || '')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Ссылка на соцсеть</label>
                    <input type="url" name="socialUrl" inputmode="url" spellcheck="false" value="${escapeAttr(trainer?.socialUrl || trainer?.social?.url || trainer?.socialLink || '')}" placeholder="https://t.me/username">
                </div>
            </div>
            <div class="form-group">
                <label>Фотография</label>
                <label class="file-upload" for="trainer-photo">
                    <input type="file" id="trainer-photo" accept="image/*">
                    <div class="file-upload-label"><i class="fas fa-cloud-upload-alt" aria-hidden="true" style="font-size:24px;display:block;margin-bottom:8px;"></i>Нажмите или перетащите фото сюда</div>
                    ${trainer?.photo ? `<img src="${imageUrl(trainer.photo)}" width="600" height="400" loading="lazy" decoding="async" class="file-preview" id="photo-preview" alt="Фото тренера">` : '<img class="file-preview" id="photo-preview" width="600" height="400" alt="" style="display:none">'}
                </label>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Отмена</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Сохранить' : 'Добавить'}</button>
            </div>
        </form>
    `;
}

function setupTrainerForm() {
    const form = document.getElementById('trainer-form');
    if (!form) return;
    const fileInput = document.getElementById('trainer-photo');
    const preview = document.getElementById('photo-preview');
    let photoUrl = '';
    fileInput?.addEventListener('change', async (e) => {
        if (e.target.files[0]) {
            try {
                photoUrl = await uploadFile(e.target.files[0], 'trainers', { aspect: '3 / 2', label: 'Кадр карточки тренера' });
                preview.src = API_URL + photoUrl;
                preview.style.display = 'block';
                showToast('Фото загружено', 'success');
            } catch (err) {
                showToast(err.message || 'Ошибка загрузки фото', 'error');
            }
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const filters = [...form.querySelectorAll('input[name="filters"]:checked')].map(cb => cb.value);
        if (!filters.length) {
            showToast('Выберите хотя бы одно направление тренера', 'error');
            return;
        }
        const labels = getSportLabels();
        const specialization = filters.map(value => labels[value] || SPORT_LABELS[value] || value).join(' / ');
        const socialUrl = normalizeExternalUrl(form.socialUrl?.value || '');
        const socialLabel = (form.socialLabel?.value || '').trim();

        const formData = {
            name: form.name.value,
            specialization,
            specializations: filters.map(value => labels[value] || SPORT_LABELS[value] || value),
            filters,
            category: filters[0],
            experience: form.experience.value,
            achievements: form.achievements.value.split('\n').map(v => v.trim()).filter(Boolean),
            homeAchievements: form.achievements.value.split('\n').map(v => v.trim()).filter(Boolean),
            featuredAchievements: form.achievements.value.split('\n').map(v => v.trim()).filter(Boolean),
            mainAchievements: form.achievements.value.split('\n').map(v => v.trim()).filter(Boolean),
            quote: form.quote.value,
            order: form.dataset.id ? (trainersData.find(t => t._id === form.dataset.id)?.order || 0) : trainersData.length + 1,
            photo: photoUrl || (form.dataset.id ? trainersData.find(t => t._id === form.dataset.id)?.photo : ''),
            socialLabel,
            socialUrl,
            social: socialUrl ? { label: socialLabel || 'Соцсеть', url: socialUrl } : {},
            showOnHome: !!form.showOnHome?.checked,
            isFeaturedHome: !!form.showOnHome?.checked,
            showOnMain: !!form.showOnHome?.checked,
            isActive: true
        };

        try {
            if (form.dataset.id) {
                await apiPut(`/api/trainers/${form.dataset.id}`, formData);
                showToast('Тренер обновлён', 'success');
            } else {
                await apiPost('/api/trainers', formData);
                showToast('Тренер добавлен', 'success');
            }
            closeModal();
            loadTrainers();
        } catch {
            showToast('Ошибка сохранения', 'error');
        }
    });
}

window.editTrainer = (id) => {
    const trainer = trainersData.find(t => t._id === id);
    if (trainer) {
        openModal('Редактировать тренера', getTrainerForm(trainer));
        setupTrainerForm();
    }
};

window.deleteTrainer = async (id) => {
    if (!confirm('Удалить тренера?')) return;
    try {
        await apiDelete(`/api/trainers/${id}`);
        showToast('Тренер удалён', 'success');
        loadTrainers();
    } catch {
        showToast('Ошибка удаления', 'error');
    }
};

// ========== DIRECTIONS / SCHEDULE CRUD ==========
document.getElementById('add-sport-btn')?.addEventListener('click', () => {
    openModal('Добавить направление', getSportForm());
    setupSportForm();
});

document.getElementById('add-direction-btn')?.addEventListener('click', () => {
    openModal('Добавить занятие', getScheduleForm());
    setupScheduleForm();
});

function getSportForm(direction = null) {
    const isEdit = !!direction;
    const selectedIconImage = directionIconImageValue(direction || {});
    return `
        <form id="sport-form" data-id="${direction?._id || ''}">
            <div class="form-row">
                <div class="form-group">
                    <label>Название направления</label>
                    <input type="text" name="name" value="${escapeAttr(direction?.name || '')}" required placeholder="Например: Бокс">
                </div>
                <div class="form-group">
                    <label>Slug (URL)</label>
                    <input type="text" name="slug" value="${escapeAttr(direction?.slug || '')}" required placeholder="boxing">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Цвет направления</label>
                    <select name="color">
                        <option value="#FFD700" ${directionColor(direction || {}) === '#FFD700' || directionColor(direction || {}).toLowerCase() === '#ffd400' ? 'selected' : ''}>Жёлтый</option>
                        <option value="#70B7FF" ${directionColor(direction || {}) === '#70B7FF' ? 'selected' : ''}>Голубой</option>
                    </select>
                    <div class="hint">Доступны только два цвета: жёлтый и голубой.</div>
                </div>
                <div class="form-group">
                    <label>PNG-иконка направления</label>
                    <div class="direction-icon-image-field">
                        ${directionIconImagePreview(selectedIconImage, 'direction-icon-image-preview direction-icon-image-preview-form')}
                        <select name="iconImage" class="direction-icon-image-select">
                            ${directionIconImageOptions(selectedIconImage)}
                        </select>
                    </div>
                    <div class="hint">Список показывает имена файлов из папки public/assets/directions.</div>
                </div>
            </div>
            <div class="form-group">
                <label>Порядок</label>
                <input type="number" name="order" value="${direction?.order || directionsData.length + 1}">
            </div>
            <div class="form-group">
                <label>Тренеров на карточке главной</label>
                <input type="number" name="homeTrainerLimit" min="0" max="20" value="${Number(direction?.homeTrainerLimit ?? direction?.trainerLimit ?? 4)}">
                <div class="hint">Сколько тренеров показывать в карточке этого направления на главной. Например, 2 из 10.</div>
            </div>
            <div class="form-group">
                <label>Краткое описание</label>
                <input type="text" name="shortDescription" value="${escapeAttr(direction?.shortDescription || '')}" required>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Отмена</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Сохранить' : 'Добавить'}</button>
            </div>
        </form>`;
}

function setupSportForm() {
    const form = document.getElementById('sport-form');
    form.name?.addEventListener('input', () => { if (!form.slug.value || !form.dataset.id) form.slug.value = slugify(form.name.value); });
    form.iconImage?.addEventListener('change', () => {
        const preview = form.querySelector('.direction-icon-image-preview-form');
        if (preview) preview.src = form.iconImage.value;
    });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const existing = form.dataset.id ? directionsData.find(d => d._id === form.dataset.id) : null;
        const iconImage = form.iconImage.value || directionIconImageValue(existing || {});
        const formData = {
            name: form.name.value,
            slug: form.slug.value,
            color: form.color.value,
            showOnHome: true,
            isFeaturedHome: true,
            shortDescription: form.shortDescription.value,
            description: form.shortDescription.value,
            homeTrainerLimit: Math.max(0, parseInt(form.homeTrainerLimit.value, 10) || 0),
            schedule: existing?.schedule || [],
            isActive: true,
            icon: '',
            iconImage,
            iconMask: '',
            order: parseInt(form.order.value) || 0
        };
        try {
            if (form.dataset.id) {
                await apiPut(`/api/directions/${form.dataset.id}`, formData);
                showToast('Направление обновлено', 'success');
            } else {
                await apiPost('/api/directions', formData);
                showToast('Направление добавлено', 'success');
            }
            closeModal();
            await loadDirections();
        } catch (err) {
            showToast('Ошибка сохранения направления', 'error');
        }
    });
}

window.editSport = (id) => {
    const direction = directionsData.find(d => d._id === id);
    if (direction) {
        openModal('Редактировать направление', getSportForm(direction));
        setupSportForm();
    }
};

window.deleteSport = async (id) => {
    const direction = directionsData.find(d => d._id === id);
    if (!confirm(`Удалить направление "${direction?.name || ''}"? Его занятия тоже исчезнут из расписания.`)) return;
    try {
        await apiDelete(`/api/directions/${id}`);
        showToast('Направление удалено', 'success');
        await loadDirections();
    } catch {
        showToast('Ошибка удаления направления', 'error');
    }
};

function scheduleRowHtml(s = {}, i = 0) {
    const selectedDays = normalizeScheduleDays(s.day || '');
    const { start, end } = parseTimeRange(s);
    const selectedTrainers = normalizeSlotTrainers(s);
    const dayCheckboxes = WEEK_DAYS.map(([shortName, fullName]) => `
        <label><input type="checkbox" class="sch-day-check" value="${shortName}" data-summary="${shortName}" ${selectedDays.includes(shortName) ? 'checked' : ''}> ${fullName}</label>`).join('');
    return `
        <div class="schedule-row" data-index="${i}">
            <div class="schedule-row-top">
                <div class="schedule-row-field">
                    <label>Дни недели</label>
                    <details class="multi-select sch-days">
                        <summary><span class="days-summary" data-multi-summary data-placeholder="Выберите дни">Выберите дни</span></summary>
                        <div class="multi-options">${dayCheckboxes}</div>
                    </details>
                </div>
                <div class="schedule-row-field">
                    <label>Время</label>
                    <div class="time-range">
                        <select class="sch-time-start" aria-label="Начало занятия">${buildTimeOptions(start)}</select>
                        <select class="sch-time-end" aria-label="Конец занятия">${buildTimeOptions(end)}</select>
                    </div>
                    <div class="schedule-note">Шаг времени — 30 минут</div>
                </div>
            </div>
            <div class="schedule-row-fields">
                <div class="schedule-row-field">
                    <label>Тренер</label>
                    <details class="multi-select sch-trainers">
                        <summary><span class="trainers-summary" data-multi-summary data-placeholder="Тренер клуба">Тренер клуба</span></summary>
                        <div class="multi-options">${trainerCheckboxes(selectedTrainers)}</div>
                    </details>
                </div>
                <div class="schedule-row-field">
                    <label>Уровень</label>
                    <select class="sch-group level-select">
                        <option value="beginners" ${(s.group || 'beginners') === 'beginners' || s.group === 'kids' ? 'selected' : ''}>Новички</option>
                        <option value="advanced" ${s.group === 'advanced' ? 'selected' : ''}>Продвинутые</option>
                        <option value="competition" ${s.group === 'competition' ? 'selected' : ''}>Соревнования</option>
                        <option value="all" ${s.group === 'all' ? 'selected' : ''}>Все уровни</option>
                    </select>
                </div>
                <div class="schedule-row-field">
                    <label>Возраст</label>
                    <select class="sch-age age-select">
                        <option value="kids" ${(s.age || (s.group === 'kids' ? 'kids' : '')) === 'kids' ? 'selected' : ''}>Дети</option>
                        <option value="teens" ${s.age === 'teens' ? 'selected' : ''}>Подростки</option>
                        <option value="adults" ${s.age === 'adults' ? 'selected' : ''}>Взрослые</option>
                        <option value="all" ${(s.age || 'all') === 'all' && s.group !== 'kids' ? 'selected' : ''}>Все</option>
                    </select>
                </div>
                <div class="schedule-row-field">
                    <label>Пол</label>
                    <select class="sch-audience gender-select">
                        <option value="all" ${(s.audience || 'all') === 'all' ? 'selected' : ''}>Все</option>
                        <option value="men" ${s.audience === 'men' ? 'selected' : ''}>Мужчины</option>
                        <option value="women" ${s.audience === 'women' ? 'selected' : ''}>Женщины</option>
                    </select>
                </div>
                <button class="remove-slot" type="button" aria-label="Удалить слот расписания" onclick="this.closest('.schedule-row').remove()"><i class="fas fa-times" aria-hidden="true"></i></button>
            </div>
        </div>`;
}

function getScheduleForm(direction = null) {
    const selectedSlug = direction?.slug || '';
    const rows = direction?.schedule?.length ? direction.schedule.map((s, i) => scheduleRowHtml(s, i)).join('') : scheduleRowHtml({}, 0);
    return `
        <form id="schedule-form" data-id="${direction?._id || ''}">
            <div class="direction-select-row">
                <div class="form-group">
                    <label>Slug (URL) направления</label>
                    <select name="slug" required ${direction ? 'disabled' : ''}>${directionOptions(selectedSlug)}</select>
                    <div class="hint">Выберите направление. Название занятия подтянется автоматически.</div>
                </div>
                <div class="form-group">
                    <label>Название занятия</label>
                    <input type="text" name="name" value="${escapeAttr(direction?.name || '')}" readonly placeholder="Подтянется из slug">
                </div>
            </div>
            <div class="form-group">
                <label>Слоты расписания</label>
                <div class="hint">Добавьте один или несколько слотов для выбранного направления.</div>
                <div class="schedule-editor" id="schedule-editor">${rows}</div>
                <button type="button" class="btn btn-sm btn-secondary" onclick="addScheduleRow()" style="margin-top:8px"><i class="fas fa-plus" aria-hidden="true"></i> Добавить слот</button>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Отмена</button>
                <button type="submit" class="btn btn-primary">Сохранить</button>
            </div>
        </form>`;
}

window.addScheduleRow = () => {
    const editor = document.getElementById('schedule-editor');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = scheduleRowHtml({}, Date.now()).trim();
    const row = wrapper.firstElementChild;
    editor.appendChild(row);
    setupDaysDropdowns(row);
};

function collectScheduleRows(form) {
    const schedule = [];
    let hasInvalidTime = false;
    form.querySelectorAll('.schedule-row').forEach(row => {
        const days = [...row.querySelectorAll('.sch-day-check:checked')].map(cb => cb.value);
        const startTime = row.querySelector('.sch-time-start')?.value || '';
        const endTime = row.querySelector('.sch-time-end')?.value || '';
        const trainers = [...row.querySelectorAll('.sch-trainer-check:checked')].map(cb => cb.value).filter(Boolean);
        const trainer = trainers.join(' · ');
        const group = row.querySelector('.sch-group')?.value || 'beginners';
        const audience = row.querySelector('.sch-audience')?.value || 'all';
        const age = row.querySelector('.sch-age')?.value || 'all';
        if (days.length && startTime && endTime) {
            if (endTime <= startTime) hasInvalidTime = true;
            schedule.push({ day: days.join(', '), startTime, endTime, time: `${startTime} — ${endTime}`, trainer, trainers, group, age, audience });
        }
    });
    return { schedule, hasInvalidTime };
}

function setupScheduleForm() {
    const form = document.getElementById('schedule-form');
    const slugSelect = form.elements.slug;
    const nameInput = form.elements.name;
    const updateName = () => {
        const direction = findDirectionBySlug(slugSelect.value);
        nameInput.value = direction?.name || '';
        if (!form.dataset.id && direction) {
            const editor = document.getElementById('schedule-editor');
            const rows = direction.schedule?.length ? direction.schedule.map((slot, index) => scheduleRowHtml(slot, index)).join('') : scheduleRowHtml({}, 0);
            editor.innerHTML = rows;
            setupDaysDropdowns(editor);
        }
    };
    slugSelect?.addEventListener('change', updateName);
    updateName();
    setupDaysDropdowns(form);
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const slug = slugSelect.value;
        const direction = findDirectionBySlug(slug) || directionsData.find(d => d._id === form.dataset.id);
        if (!direction) {
            showToast('Выберите существующее направление', 'error');
            return;
        }
        const { schedule, hasInvalidTime } = collectScheduleRows(form);
        if (hasInvalidTime) {
            showToast('В каждом слоте время окончания должно быть позже времени начала', 'error');
            return;
        }
        if (!schedule.length) {
            showToast('Добавьте хотя бы один слот расписания', 'error');
            return;
        }
        try {
            await apiPut(`/api/directions/${direction._id}`, { ...direction, schedule, isActive: true });
            showToast('Расписание сохранено', 'success');
            closeModal();
            await loadDirections();
        } catch {
            showToast('Ошибка сохранения расписания', 'error');
        }
    });
}

window.editDirection = (id) => {
    const direction = directionsData.find(d => d._id === id);
    if (direction) {
        openModal('Редактировать занятие', getScheduleForm(direction));
        setupScheduleForm();
    }
};

window.clearDirectionSchedule = async (id) => {
    const direction = directionsData.find(d => d._id === id);
    if (!direction || !confirm(`Очистить расписание для "${direction.name}"?`)) return;
    try {
        await apiPut(`/api/directions/${id}`, { ...direction, schedule: [] });
        showToast('Расписание очищено', 'success');
        await loadDirections();
    } catch {
        showToast('Ошибка очистки расписания', 'error');
    }
};

// ========== PRICING CRUD ==========
document.getElementById('add-pricing-btn').addEventListener('click', () => {
    openModal('Добавить тариф', getPricingForm());
    setupPricingForm();
});

function getPricingForm(pricing = null) {
    const isEdit = !!pricing;
    const features = pricing?.features?.join('\n') || '';
    return `
        <form id="pricing-form" data-id="${pricing?._id || ''}">
            <div class="form-row">
                <div class="form-group">
                    <label>Название</label>
                    <input type="text" name="name" value="${pricing?.name || ''}" required>
                </div>
                <div class="form-group">
                    <label>Slug</label>
                    <input type="text" name="slug" value="${pricing?.slug || ''}" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Цена (₽)</label>
                    <input type="number" name="price" value="${pricing?.price || ''}" required>
                </div>
                <div class="form-group">
                    <label>Период</label>
                    <input type="text" name="period" value="${pricing?.period || ''}" required placeholder="8 занятий / мес">
                </div>
            </div>
            <div class="form-group">
                <label>Описание</label>
                <textarea name="description" required>${pricing?.description || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Включённые услуги (одна на строку)</label>
                <textarea name="features" rows="4" placeholder="8 занятий в месяц&#10;Заморозка 7 дней">${features}</textarea>
            </div>
            <div class="form-group">
                <label><input type="checkbox" name="isPopular" ${pricing?.isPopular ? 'checked' : ''}> Популярный тариф</label>
            </div>
            <div class="form-group checkbox-line">
                <label><input type="checkbox" name="showOnHome" ${isShownOnHome(pricing || {}) ? 'checked' : ''}> Показывать тариф на главной</label>
                <div class="hint">Если не выбран ни один тариф, на главной будут показаны первые четыре активных тарифа.</div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Отмена</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Сохранить' : 'Добавить'}</button>
            </div>
        </form>
    `;
}

function setupPricingForm() {
    const form = document.getElementById('pricing-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            name: form.name.value,
            slug: form.slug.value,
            price: parseInt(form.price.value),
            period: form.period.value,
            description: form.description.value,
            features: form.features.value.split('\n').filter(f => f.trim()),
            isPopular: form.isPopular.checked,
            isActive: true,
            order: form.dataset.id ? (pricingData.find(p => p._id === form.dataset.id)?.order || 0) : pricingData.length + 1
        };

        try {
            if (form.dataset.id) {
                await apiPut(`/api/pricing/${form.dataset.id}`, formData);
                showToast('Тариф обновлён', 'success');
            } else {
                await apiPost('/api/pricing', formData);
                showToast('Тариф добавлен', 'success');
            }
            closeModal();
            loadPricing();
        } catch {
            showToast('Ошибка сохранения', 'error');
        }
    });
}

window.editPricing = (id) => {
    const pricing = pricingData.find(p => p._id === id);
    if (pricing) {
        openModal('Редактировать тариф', getPricingForm(pricing));
        setupPricingForm();
    }
};

window.deletePricing = async (id) => {
    if (!confirm('Удалить тариф?')) return;
    try {
        await apiDelete(`/api/pricing/${id}`);
        showToast('Тариф удалён', 'success');
        loadPricing();
    } catch {
        showToast('Ошибка удаления', 'error');
    }
};

// ========== GALLERY CRUD ==========
document.getElementById('add-gallery-btn').addEventListener('click', () => {
    openModal('Добавить фото', getGalleryForm());
    setupGalleryForm();
});

function getGalleryForm(item = null) {
    const isEdit = !!item;
    return `
        <form id="gallery-form" data-id="${item?._id || ''}">
            <div class="form-group">
                <label>Категория фото</label>
                <select name="category" id="gallery-category" required>
                    <option value="hero-ring" ${item?.category === 'hero-ring' ? 'selected' : ''}>Главная: левая фотография ринга</option>
                    <option value="hero-mat" ${item?.category === 'hero-mat' ? 'selected' : ''}>Главная: правая фотография борцовского зала</option>
                    <option value="interior" ${item?.category === 'interior' ? 'selected' : ''}>Интерьер</option>
                    <option value="amenities" ${item?.category === 'amenities' ? 'selected' : ''}>Удобства</option>
                    <option value="training" ${item?.category === 'training' ? 'selected' : ''}>Тренировки</option>
                    <option value="events" ${item?.category === 'events' ? 'selected' : ''}>Мероприятия</option>
                </select>
                <div class="hint">Для замены фото в первом блоке главной выберите одну из двух категорий «Главная». Новое фото автоматически заменит старое для этой позиции.</div>
            </div>
            <div class="form-group">
                <label>Название</label>
                <input type="text" name="title" value="${escapeAttr(item?.title || '')}" placeholder="Например: Ринг на главной">
            </div>
            <div class="form-group">
                <label>Описание</label>
                <textarea name="description">${item?.description || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Фотография</label>
                <label class="file-upload" for="gallery-photo">
                    <input type="file" id="gallery-photo" accept="image/*">
                    <div class="file-upload-label"><i class="fas fa-cloud-upload-alt" aria-hidden="true" style="font-size:24px;display:block;margin-bottom:8px;"></i>Нажмите или перетащите фото сюда</div>
                    ${item?.image ? `<img src="${imageUrl(item.image)}" width="800" height="600" loading="lazy" decoding="async" class="file-preview" id="gallery-preview" alt="Фото галереи">` : '<img class="file-preview" id="gallery-preview" width="800" height="600" alt="" style="display:none">'}
                </label>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Отмена</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Сохранить' : 'Добавить'}</button>
            </div>
        </form>
    `;
}

function setupGalleryForm() {
    const form = document.getElementById('gallery-form');
    const fileInput = document.getElementById('gallery-photo');
    const preview = document.getElementById('gallery-preview');
    let imageUrlValue = '';

    function defaultTitle(category) {
        if (category === 'hero-ring') return 'Фото ринга на главной';
        if (category === 'hero-mat') return 'Фото борцовского зала на главной';
        return 'Фото зала';
    }

    const categorySelect = document.getElementById('gallery-category');
    categorySelect?.addEventListener('change', () => {
        if (!form.title.value.trim()) form.title.value = defaultTitle(categorySelect.value);
    });
    if (!form.title.value.trim()) form.title.value = defaultTitle(categorySelect.value);

    fileInput.addEventListener('change', async (e) => {
        if (e.target.files[0]) {
            try {
                imageUrlValue = await uploadFile(e.target.files[0], 'gallery', getGalleryCropOptions(categorySelect?.value));
                preview.src = imageUrl(imageUrlValue);
                preview.style.display = 'block';
                showToast('Фото загружено. Теперь нажмите «Сохранить».', 'success');
            } catch (err) {
                showToast(err.message || 'Ошибка загрузки фото', 'error');
            }
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const category = form.category.value;
        const existingSameHero = ['hero-ring', 'hero-mat'].includes(category)
            ? galleryData.find(g => g.category === category)
            : null;
        const targetId = form.dataset.id || existingSameHero?._id || '';
        const previous = targetId ? galleryData.find(g => g._id === targetId) : null;
        const formData = {
            title: form.title.value.trim() || defaultTitle(category),
            category,
            description: form.description.value,
            image: imageUrlValue || previous?.image || '',
            isActive: true,
            order: previous?.order ?? (category === 'hero-ring' || category === 'hero-mat' ? 0 : galleryData.length + 1)
        };

        if (!formData.image) {
            showToast('Сначала загрузите фотографию', 'error');
            return;
        }

        try {
            if (targetId) {
                await apiPut(`/api/gallery/${targetId}`, formData);
                showToast(['hero-ring', 'hero-mat'].includes(category) ? 'Фото на главной обновлено' : 'Фото обновлено', 'success');
            } else {
                await apiPost('/api/gallery', formData);
                showToast('Фото добавлено', 'success');
            }
            closeModal();
            loadGallery();
        } catch (err) {
            showToast(err.message || 'Ошибка сохранения', 'error');
        }
    });
}

window.editGallery = (id) => {
    const item = galleryData.find(g => g._id === id);
    if (item) {
        openModal('Редактировать фото', getGalleryForm(item));
        setupGalleryForm();
    }
};

window.deleteGallery = async (id) => {
    if (!confirm('Удалить фото?')) return;
    try {
        await apiDelete(`/api/gallery/${id}`);
        showToast('Фото удалено', 'success');
        loadGallery();
    } catch {
        showToast('Ошибка удаления', 'error');
    }
};

// ========== CONTACTS ==========
document.getElementById('contact-filter').addEventListener('change', renderContacts);

window.updateContactStatus = async (id, status) => {
    try {
        await apiPut(`/api/contacts/${id}`, { status });
        showToast('Статус обновлён', 'success');
        loadContacts();
    } catch {
        showToast('Ошибка обновления', 'error');
    }
};

window.deleteContact = async (id) => {
    if (!confirm('Удалить заявку?')) return;
    try {
        await apiDelete(`/api/contacts/${id}`);
        contactsData = contactsData.filter(contact => contact._id !== id);
        renderContacts();
        showToast('Заявка удалена', 'success');
    } catch {
        showToast('Ошибка удаления', 'error');
    }
};


// ========== BUDGET SETTINGS ==========
function budgetRuleRow(rule = {}) {
    const subitems = Array.isArray(rule.subitems) ? rule.subitems.join('\n') : (rule.subitems || '');
    return `<div class="settings-contact-row budget-rule-row" data-budget-rule-row>
        <div class="form-group"><label>Заголовок условия</label><input class="budget-rule-title" value="${escapeAttr(rule.title || '')}" placeholder="Например: Кто может подать заявку"></div>
        <div class="form-group"><label>Описание</label><textarea class="budget-rule-text" placeholder="Краткое описание условия">${escapeAttr(rule.text || '')}</textarea></div>
        <div class="form-group"><label>Подкатегории</label><textarea class="budget-rule-subitems" placeholder="Каждая подкатегория с новой строки">${escapeAttr(subitems)}</textarea></div>
        <button type="button" class="remove-contact-setting" aria-label="Удалить условие" onclick="this.closest('[data-budget-rule-row]').remove()"><i class="fas fa-trash" aria-hidden="true"></i></button>
    </div>`;
}

function defaultBudgetRules() {
    return [
        { title: 'Кто может подать заявку', text: 'Заявку могут подать ученики, которые регулярно посещают занятия и готовы соблюдать правила клуба.', subitems: ['дети и подростки школьного возраста', 'спортсмены, участвующие в соревнованиях', 'семьи, которым нужна поддержка'] },
        { title: 'Какие документы нужны', text: 'Администратор клуба уточнит актуальный список документов после обращения.', subitems: ['заявление от родителя или законного представителя', 'документ, подтверждающий льготную категорию', 'медицинский допуск к занятиям'] },
        { title: 'Как принимается решение', text: 'Решение принимается после собеседования и оценки свободных мест в группе.', subitems: ['посещаемость и дисциплина', 'мотивация ученика', 'наличие мест по выбранному направлению'] },
    ];
}

function renderBudgetSettingsForm() {
    const form = document.getElementById('budget-settings-form');
    if (!form) return;
    const budget = siteSettingsData.budget || {};
    form.elements.budgetTitle.value = budget.title || 'Бюджетные места в школе единоборств';
    form.elements.budgetIntro.value = budget.intro || 'Информация о бесплатных и льготных местах для учеников клуба.';
    form.elements.budgetImage.value = budget.image || '';
    const preview = document.getElementById('budget-image-preview');
    if (preview && budget.image) { preview.src = budget.image; preview.style.display = 'block'; }
    const list = document.getElementById('budget-rules-list');
    const rules = Array.isArray(budget.rules) && budget.rules.length ? budget.rules : defaultBudgetRules();
    list.innerHTML = rules.map(budgetRuleRow).join('');
}

function collectBudgetSettings() {
    const form = document.getElementById('budget-settings-form');
    const rules = [...document.querySelectorAll('[data-budget-rule-row]')].map(row => ({
        title: row.querySelector('.budget-rule-title')?.value.trim() || 'Условие',
        text: row.querySelector('.budget-rule-text')?.value.trim() || '',
        subitems: (row.querySelector('.budget-rule-subitems')?.value || '').split('\n').map(item => item.trim()).filter(Boolean),
    })).filter(rule => rule.title || rule.text || rule.subitems.length);
    return {
        ...(siteSettingsData || {}),
        budget: {
            title: form.elements.budgetTitle.value.trim(),
            intro: form.elements.budgetIntro.value.trim(),
            image: form.elements.budgetImage.value.trim(),
            rules,
        }
    };
}

document.getElementById('add-budget-rule-btn')?.addEventListener('click', () => {
    const list = document.getElementById('budget-rules-list');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = budgetRuleRow({ title: 'Новое условие', text: '', subitems: [] }).trim();
    list.appendChild(wrapper.firstElementChild);
});

document.getElementById('budget-image-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        const url = await uploadFile(file, 'budget', { aspect: '10 / 3', label: 'Кадр страницы «Бюджетные места»' });
        const form = document.getElementById('budget-settings-form');
        form.elements.budgetImage.value = url;
        const preview = document.getElementById('budget-image-preview');
        preview.src = url; preview.style.display = 'block';
        showToast('Фото страницы загружено', 'success');
    } catch (err) {
        showToast(err.message || 'Ошибка загрузки фото', 'error');
    }
});

document.getElementById('budget-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('budget-settings-message');
    try {
        siteSettingsData = await apiPut('/api/settings', collectBudgetSettings()).then(r => r.settings || r);
        msg.textContent = 'Страница «Бюджетные места» сохранена';
        msg.style.color = 'var(--green)';
    } catch (err) {
        msg.textContent = 'Ошибка сохранения страницы';
        msg.style.color = 'var(--red)';
    }
});

// ========== SITE SETTINGS ==========
const CONTACT_TYPE_PRESETS = {
    phone: { label: 'Телефон', icon: 'fas fa-phone', placeholder: 'tel:+79990000000' },
    telegram: { label: 'Telegram', icon: 'fab fa-telegram', placeholder: 'https://t.me/username' },
    instagram: { label: 'Instagram', icon: 'fab fa-instagram', placeholder: 'https://instagram.com/username' },
    max: { label: 'Max', icon: 'fas fa-comment-dots', placeholder: 'https://max.ru/username' },
    whatsapp: { label: 'WhatsApp', icon: 'fab fa-whatsapp', placeholder: 'https://wa.me/79990000000' },
    youtube: { label: 'YouTube', icon: 'fab fa-youtube', placeholder: 'https://youtube.com/@username' },
    address: { label: 'Адрес', icon: 'fas fa-map-marker-alt', placeholder: '' },
    hours: { label: 'Режим работы', icon: 'fas fa-clock', placeholder: '' },
    email: { label: 'Email', icon: 'fas fa-envelope', placeholder: 'mailto:info@example.ru' },
    custom: { label: 'Другое', icon: 'fas fa-link', placeholder: 'https://…' },
};

window.moveSettingRow = (button, direction) => {
    const row = button.closest('[data-contact-row], [data-faq-row]');
    if (!row) return;
    if (direction < 0 && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
    if (direction > 0 && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
};

function contactTypeOptions(selected = 'custom') {
    return Object.entries(CONTACT_TYPE_PRESETS).map(([value, preset]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${preset.label}</option>`).join('');
}

function contactSettingRow(contact = {}, index = Date.now()) {
    const type = contact.type || 'custom';
    const preset = CONTACT_TYPE_PRESETS[type] || CONTACT_TYPE_PRESETS.custom;
    return `<div class="settings-contact-row" data-contact-row>
        <div class="form-group"><label>Тип</label><select class="contact-setting-type">${contactTypeOptions(type)}</select></div>
        <div class="form-group"><label>Название</label><input class="contact-setting-label" value="${escapeAttr(contact.label || preset.label)}" placeholder="Telegram"></div>
        <div class="form-group"><label>Значение</label><input class="contact-setting-value" value="${escapeAttr(contact.value || '')}" placeholder="@club или +7…"></div>
        <div class="form-group"><label>Ссылка</label><input class="contact-setting-url" value="${escapeAttr(contact.url || '')}" placeholder="${escapeAttr(preset.placeholder || 'https://…')}"></div>
        <div class="setting-row-actions">
            <button type="button" class="setting-row-action" title="Выше" aria-label="Поднять контакт выше" onclick="moveSettingRow(this,-1)"><i class="fas fa-arrow-up" aria-hidden="true"></i></button>
            <button type="button" class="setting-row-action" title="Ниже" aria-label="Опустить контакт ниже" onclick="moveSettingRow(this,1)"><i class="fas fa-arrow-down" aria-hidden="true"></i></button>
            <button type="button" class="remove-contact-setting" title="Удалить" aria-label="Удалить контакт" onclick="this.closest('[data-contact-row]').remove()"><i class="fas fa-trash" aria-hidden="true"></i></button>
        </div>
    </div>`;
}

function defaultFaqSettings() {
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

function faqSettingRow(item = {}) {
    return `<div class="settings-contact-row faq-setting-row" data-faq-row>
        <div class="form-group"><label>Вопрос</label><input class="faq-setting-question" value="${escapeAttr(item.question || '')}" placeholder="Например: Можно ли прийти на пробную тренировку?"></div>
        <div class="form-group"><label>Ответ</label><textarea class="faq-setting-answer" placeholder="Короткий ответ для главной страницы">${escapeAttr(item.answer || '')}</textarea><div class="hint">Ссылка в ответе: \\ref{Мой текст}{https://comdity.ru} или \\ref{Бюджетные места}{/budget}</div></div>
        <label class="faq-active-control"><input class="faq-setting-active" type="checkbox" ${item.isActive === false ? '' : 'checked'}> Показывать</label>
        <div class="setting-row-actions">
            <button type="button" class="setting-row-action" title="Выше" aria-label="Поднять вопрос выше" onclick="moveSettingRow(this,-1)"><i class="fas fa-arrow-up" aria-hidden="true"></i></button>
            <button type="button" class="setting-row-action" title="Ниже" aria-label="Опустить вопрос ниже" onclick="moveSettingRow(this,1)"><i class="fas fa-arrow-down" aria-hidden="true"></i></button>
            <button type="button" class="remove-contact-setting" title="Удалить" aria-label="Удалить вопрос" onclick="this.closest('[data-faq-row]').remove()"><i class="fas fa-trash" aria-hidden="true"></i></button>
        </div>
    </div>`;
}

function renderFaqSettingsForm() {
    const list = document.getElementById('faq-settings-list');
    if (!list) return;
    const source = Array.isArray(siteSettingsData.faq) ? siteSettingsData.faq : defaultFaqSettings();
    const items = [...source].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    list.innerHTML = items.map(faqSettingRow).join('') || faqSettingRow({});
}

function collectFaqSettings() {
    const items = [...document.querySelectorAll('#faq-settings-list [data-faq-row]')].map((row, index) => ({
        question: row.querySelector('.faq-setting-question')?.value.trim() || '',
        answer: row.querySelector('.faq-setting-answer')?.value.trim() || '',
        order: index + 1,
        isActive: !!row.querySelector('.faq-setting-active')?.checked,
    })).filter(item => item.question || item.answer);
    return {
        ...(siteSettingsData || {}),
        faq: items,
    };
}

function setupContactTypeAutofill(row) {
    const typeSelect = row.querySelector('.contact-setting-type');
    typeSelect?.addEventListener('change', () => {
        const preset = CONTACT_TYPE_PRESETS[typeSelect.value] || CONTACT_TYPE_PRESETS.custom;
        const labelInput = row.querySelector('.contact-setting-label');
        const urlInput = row.querySelector('.contact-setting-url');
        if (!labelInput.value.trim()) labelInput.value = preset.label;
        urlInput.placeholder = preset.placeholder || '';
    });
}

function renderSiteSettingsForm() {
    const form = document.getElementById('site-settings-form');
    if (!form) return;
    form.elements.heroTitle.value = siteSettingsData.heroTitle || '';
    form.elements.heroText.value = siteSettingsData.heroText || '';
    form.elements.footerText.value = siteSettingsData.footerText || 'Школа единоборств для детей и взрослых: расписание, тренеры, направления и запись на занятия в одном месте.';
    form.elements.contactTitle.value = siteSettingsData.contactTitle || '';
    form.elements.contactText.value = siteSettingsData.contactText || '';
    const list = document.getElementById('settings-contacts-list');
    const socialList = document.getElementById('settings-socials-list');
    const contacts = Array.isArray(siteSettingsData.contacts) ? siteSettingsData.contacts : [];
    const socials = Array.isArray(siteSettingsData.socials) ? siteSettingsData.socials : contacts.filter(c => ['telegram','instagram','max','whatsapp','vk','youtube'].includes(c.type));
    const baseContacts = contacts.filter(c => !['telegram','instagram','max','whatsapp','vk','youtube'].includes(c.type));
    list.innerHTML = baseContacts.map((contact, index) => contactSettingRow(contact, index)).join('') || contactSettingRow({ type: 'phone', label: 'Телефон' }, 0) + contactSettingRow({ type: 'address', label: 'Адрес' }, 1) + contactSettingRow({ type: 'hours', label: 'Режим работы' }, 2);
    socialList.innerHTML = socials.map((contact, index) => contactSettingRow(contact, index)).join('') || contactSettingRow({ type: 'telegram', label: 'Telegram' }, 0);
    [...list.querySelectorAll('[data-contact-row]'), ...socialList.querySelectorAll('[data-contact-row]')].forEach(setupContactTypeAutofill);
    renderBudgetSettingsForm();
    renderLegalSettingsForm();
}

function collectSiteSettings() {
    const form = document.getElementById('site-settings-form');
    const readRows = selector => [...document.querySelectorAll(selector)].map(row => {
        const type = row.querySelector('.contact-setting-type')?.value || 'custom';
        const preset = CONTACT_TYPE_PRESETS[type] || CONTACT_TYPE_PRESETS.custom;
        return {
            type,
            label: row.querySelector('.contact-setting-label')?.value.trim() || preset.label,
            value: row.querySelector('.contact-setting-value')?.value.trim() || '',
            url: row.querySelector('.contact-setting-url')?.value.trim() || '',
            icon: preset.icon,
            isActive: true,
        };
    }).filter(item => item.value || item.url);
    const contacts = readRows('#settings-contacts-list [data-contact-row]');
    const socials = readRows('#settings-socials-list [data-contact-row]').map(item => ({ ...item, section: 'social' }));
    return {
        heroTitle: form.elements.heroTitle.value.trim(),
        heroText: form.elements.heroText.value.trim(),
        footerText: form.elements.footerText.value.trim(),
        contactTitle: form.elements.contactTitle.value.trim(),
        contactText: form.elements.contactText.value.trim(),
        contacts,
        socials,
        faq: siteSettingsData.faq || [],
        budget: siteSettingsData.budget || {},
        legal: siteSettingsData.legal || {},
    };
}

document.getElementById('add-contact-setting-btn')?.addEventListener('click', () => {
    const list = document.getElementById('settings-contacts-list');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = contactSettingRow({ type: 'phone', label: 'Телефон' }).trim();
    const row = wrapper.firstElementChild;
    list.appendChild(row);
    setupContactTypeAutofill(row);
});

document.getElementById('add-social-setting-btn')?.addEventListener('click', () => {
    const list = document.getElementById('settings-socials-list');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = contactSettingRow({ type: 'telegram', label: 'Telegram' }).trim();
    const row = wrapper.firstElementChild;
    list.appendChild(row);
    setupContactTypeAutofill(row);
});

document.getElementById('add-faq-row-btn')?.addEventListener('click', () => {
    const list = document.getElementById('faq-settings-list');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = faqSettingRow({ isActive: true }).trim();
    list.appendChild(wrapper.firstElementChild);
    list.lastElementChild?.querySelector('.faq-setting-question')?.focus();
});

document.getElementById('site-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('site-settings-message');
    try {
        siteSettingsData = await apiPut('/api/settings', collectSiteSettings()).then(r => r.settings || r);
        msg.textContent = 'Настройки сайта сохранены';
        msg.style.color = 'var(--green)';
    } catch (err) {
        msg.textContent = 'Ошибка сохранения настроек';
        msg.style.color = 'var(--red)';
    }
});

document.getElementById('faq-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('faq-settings-message');
    try {
        siteSettingsData = await apiPut('/api/settings', collectFaqSettings()).then(r => r.settings || r);
        renderFaqSettingsForm();
        msg.textContent = 'FAQ сохранён';
        msg.style.color = 'var(--green)';
    } catch (err) {
        msg.textContent = 'Ошибка сохранения FAQ';
        msg.style.color = 'var(--red)';
    }
});

function defaultLegalSettings() {
    return {
        operatorType: 'ip',
        operatorName: '',
        inn: '',
        ogrn: '',
        legalAddress: 'г. Краснодар, Бородинская 152/1',
        privacyEmail: '',
        privacyPhone: '',
        siteDomain: 'imperial-fight.ru',
        policyUpdatedAt: new Date().toISOString().slice(0, 10),
    };
}

function renderLegalSettingsForm() {
    const form = document.getElementById('legal-settings-form');
    if (!form) return;
    const legal = { ...defaultLegalSettings(), ...(siteSettingsData.legal || {}) };
    form.elements.operatorType.value = legal.operatorType || 'ip';
    form.elements.operatorName.value = legal.operatorName || '';
    form.elements.inn.value = legal.inn || '';
    form.elements.ogrn.value = legal.ogrn || '';
    form.elements.legalAddress.value = legal.legalAddress || '';
    form.elements.privacyEmail.value = legal.privacyEmail || '';
    form.elements.privacyPhone.value = legal.privacyPhone || '';
    form.elements.siteDomain.value = legal.siteDomain || 'imperial-fight.ru';
    form.elements.policyUpdatedAt.value = legal.policyUpdatedAt || new Date().toISOString().slice(0, 10);
}

function collectLegalSettings() {
    const form = document.getElementById('legal-settings-form');
    return {
        ...(siteSettingsData || {}),
        legal: {
            operatorType: form.elements.operatorType.value,
            operatorName: form.elements.operatorName.value.trim(),
            inn: form.elements.inn.value.trim(),
            ogrn: form.elements.ogrn.value.trim(),
            legalAddress: form.elements.legalAddress.value.trim(),
            privacyEmail: form.elements.privacyEmail.value.trim(),
            privacyPhone: form.elements.privacyPhone.value.trim(),
            siteDomain: form.elements.siteDomain.value.trim() || 'imperial-fight.ru',
            policyUpdatedAt: form.elements.policyUpdatedAt.value,
        },
    };
}

document.getElementById('legal-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('legal-settings-message');
    try {
        siteSettingsData = await apiPut('/api/settings', collectLegalSettings()).then(r => r.settings || r);
        renderLegalSettingsForm();
        msg.textContent = 'Юридические данные сохранены';
        msg.style.color = 'var(--green)';
    } catch (err) {
        msg.textContent = 'Ошибка сохранения юридических данных';
        msg.style.color = 'var(--red)';
    }
});

// ========== SETTINGS ==========
document.getElementById('password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const current = document.getElementById('current-password').value;
    const newPass = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;
    const msg = document.getElementById('password-message');

    if (newPass !== confirm) {
        msg.textContent = 'Пароли не совпадают';
        msg.style.color = 'var(--red)';
        return;
    }

    try {
        await apiPut('/api/auth/password', { currentPassword: current, newPassword: newPass });
        msg.textContent = 'Пароль успешно изменён!';
        msg.style.color = 'var(--green)';
        document.getElementById('password-form').reset();
    } catch {
        msg.textContent = 'Ошибка: текущий пароль неверный';
        msg.style.color = 'var(--red)';
    }
});

// ========== TOAST ==========
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

setInterval(refreshContactsInBackground, 5000);

// ========== INIT ==========
checkAuth();
