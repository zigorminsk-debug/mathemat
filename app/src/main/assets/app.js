(() => {
  'use strict';

  const book = window.BOOK_DATA;
  const root = document.getElementById('app');
  const nav = document.getElementById('bottom-nav');
  if (!book || !Array.isArray(book.chapters)) {
    root.textContent = 'Не удалось открыть учебник. Переустановите приложение.';
    return;
  }

  const lessons = [];
  const chapterById = new Map();
  const lessonById = new Map();
  for (const chapter of book.chapters) {
    chapterById.set(chapter.id, chapter);
    chapter.lessons.forEach((lesson, index) => {
      const entry = { ...lesson, chapter, index, globalIndex: lessons.length };
      lessons.push(entry);
      lessonById.set(lesson.id, entry);
    });
  }
  const storageKey = 'predel.reader.v1';
  const defaults = { completed: [], bookmarks: [], lastLesson: null, fontSize: 'normal' };
  let state;
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
    state = {
      completed: Array.isArray(raw.completed) ? [...new Set(raw.completed.filter(id => lessonById.has(id)))] : [],
      bookmarks: Array.isArray(raw.bookmarks) ? [...new Set(raw.bookmarks.filter(id => lessonById.has(id)))] : [],
      lastLesson: lessonById.has(raw.lastLesson) ? raw.lastLesson : null,
      fontSize: ['normal', 'large', 'xlarge'].includes(raw.fontSize) ? raw.fontSize : 'normal'
    };
  } catch (_) { state = { ...defaults }; }
  let resetPending = false;
  let searchValue = '';
  let toastTimer;

  const icons = {
    home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>',
    catalog: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8M8 10h6"/>',
    bookmark: '<path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
    back: '<path d="M19 12H5M10 7l-5 5 5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    offline: '<path d="M3 8a14 14 0 0 1 18 0M6 11a9 9 0 0 1 12 0M9 14a4.5 4.5 0 0 1 6 0M12 18h.01"/>',
    spark: '<path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z"/>'
  };
  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const pad = n => String(n).padStart(2, '0');
  const completed = id => state.completed.includes(id);
  const bookmarked = id => state.bookmarks.includes(id);
  const chapterDone = chapter => chapter.lessons.filter(l => completed(l.id)).length;
  const percent = (n, total) => total ? Math.round(100 * n / total) : 0;
  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    return b >= 11 && b <= 14 ? many : a === 1 ? one : a >= 2 && a <= 4 ? few : many;
  };
  const lessonCount = n => `${n} ${plural(n, 'урок', 'урока', 'уроков')}`;
  const chapterCount = n => `${n} ${plural(n, 'раздел', 'раздела', 'разделов')}`;
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch (_) { showToast('Не удалось сохранить данные на устройстве'); }
  }
  function showToast(message) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
  }
  function getRoute() {
    let value;
    try { value = decodeURIComponent(location.hash.slice(1)) || 'home'; } catch (_) { value = 'home'; }
    if (['home', 'catalog', 'bookmarks', 'search', 'settings'].includes(value)) return value;
    const [type, id] = value.split('/');
    if (type === 'chapter' && chapterById.has(id)) return `chapter/${id}`;
    if (type === 'lesson' && lessonById.has(id)) return `lesson/${id}`;
    return 'home';
  }
  let depth = 0;
  history.replaceState({ predelDepth: 0 }, '', `#${getRoute()}`);
  function go(route, replace = false) {
    if (getRoute() === route && !replace) return;
    if (replace) history.replaceState({ predelDepth: depth }, '', `#${route}`);
    else history.pushState({ predelDepth: ++depth }, '', `#${route}`);
    resetPending = false;
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', event => {
    depth = Number.isInteger(event.state?.predelDepth) ? event.state.predelDepth : 0;
    resetPending = false;
    render();
    window.scrollTo(0, 0);
  });
  window.Predel = {
    back() {
      if (depth > 0) { history.back(); return true; }
      if (getRoute() !== 'home') { go('home', true); return true; }
      return false;
    }
  };

  function renderNav(route) {
    const active = route.startsWith('chapter/') || route.startsWith('lesson/') ? 'catalog' : route;
    const items = [ ['home', 'home', 'Главная'], ['catalog', 'catalog', 'Разделы'], ['bookmarks', 'bookmark', 'Закладки'], ['search', 'search', 'Поиск'] ];
    nav.innerHTML = items.map(([path, glyph, label]) => `<button class="nav-item ${active === path ? 'active' : ''}" data-go="${path}" ${active === path ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></button>`).join('');
  }
  function progressBar(done, total) {
    return `<div class="progress-track" role="progressbar" aria-label="Изучено уроков" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><span style="width:${percent(done, total)}%"></span></div>`;
  }
  function bookmarkButton(id, extra = '') {
    const on = bookmarked(id);
    return `<button class="bookmark-button ${on ? 'is-bookmarked' : ''} ${extra}" data-bookmark="${esc(id)}" aria-label="${on ? 'Убрать из закладок' : 'Добавить в закладки'}" aria-pressed="${on}">${icon('bookmark')}</button>`;
  }
  function chapterCard(chapter) {
    const done = chapterDone(chapter);
    return `<button class="chapter-card" data-go="chapter/${esc(chapter.id)}">
      <span class="chapter-number">${pad(chapter.number)}</span>
      <span class="chapter-copy"><span class="chapter-card-top"><span class="chapter-title">${esc(chapter.title)}</span>${icon('arrow')}</span><span class="chapter-subtitle">${esc(chapter.subtitle)}</span><span class="chapter-meta">${lessonCount(chapter.lessons.length)} <span>·</span> ${done ? `${done} изучено` : 'теория и практика'}</span></span>
    </button>`;
  }
  function lessonCard(lesson, mode = 'chapter') {
    const entry = lessonById.get(lesson.id) || lesson;
    return `<div class="lesson-card ${completed(entry.id) ? 'is-complete' : ''}">
      <button class="lesson-link" data-go="lesson/${esc(entry.id)}">
        <span class="lesson-index">${completed(entry.id) ? icon('check') : pad(entry.index + 1)}</span>
        <span class="lesson-card-copy">${mode !== 'chapter' ? `<span class="lesson-overline">${pad(entry.chapter.number)} / ${esc(entry.chapter.title)}</span>` : ''}<strong>${esc(entry.title)}</strong><span>${esc(entry.subtitle)}</span><small>${entry.minutes} мин ${completed(entry.id) ? ' · изучено' : ''}</small></span>
      </button>${bookmarkButton(entry.id, 'card-bookmark')}
    </div>`;
  }
  function heroArt() {
    return `<svg class="hero-art" viewBox="0 0 420 260" aria-hidden="true"><defs><pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="currentColor" stroke-width=".6"/></pattern></defs><rect width="420" height="260" fill="url(#grid)" opacity=".35"/><path d="M20 220H400M80 250V10" stroke="currentColor" opacity=".38"/><path d="M42 199 C115 197 137 194 178 162 S235 71 284 70 S339 104 392 33" fill="none" stroke="#d5b879" stroke-width="2.4"/><circle cx="178" cy="162" r="5" fill="#d5b879"/><circle cx="284" cy="70" r="5" fill="#d5b879"/><path d="M178 162V220M284 70V220" stroke="#d5b879" stroke-dasharray="3 5" opacity=".65"/><text x="185" y="151" fill="#e4d5af" font-size="14" font-family="serif">ε</text><text x="291" y="59" fill="#e4d5af" font-size="14" font-family="serif">f(x)</text></svg>`;
  }
  function renderHome() {
    const done = state.completed.length;
    const resume = lessonById.get(state.lastLesson) || lessons.find(l => !completed(l.id)) || lessons[0];
    return `<div class="page home-page">
      <div class="welcome"><div class="eyebrow"><span class="status-dot"></span> ВАША БИБЛИОТЕКА <span class="eyebrow-divider">/</span> ОФЛАЙН</div><h1>Понятнее о сложном<span class="accent-dot">.</span></h1><p>Университетский курс, который всегда под рукой.</p></div>
      <section class="hero-card" aria-label="Математический анализ">
        ${heroArt()}<div class="hero-content"><div class="hero-kicker"><span class="hero-rule"></span> ВЫСШАЯ МАТЕМАТИКА <span class="hero-index">01 — 14</span></div>
          <h2>Математический<br><em>анализ</em></h2><p>От первых пределов до меры Лебега, функционального анализа и рядов Фурье.</p>
          <button class="hero-button" data-go="lesson/${esc(resume.id)}">${state.lastLesson ? 'Продолжить изучение' : 'Начать изучение'} ${icon('arrow')}</button>
        </div><div class="hero-stamp" aria-hidden="true">∫</div>
      </section>
      <div class="course-facts"><div><strong>${pad(book.chapters.length)}</strong><span>разделов</span></div><div><strong>${pad(lessons.length)}</strong><span>урока</span></div><div><strong>∞</strong><span>без интернета</span></div></div>
      <section class="section-block"><div class="section-heading"><div><span class="section-kicker">ВАШ ПУТЬ</span><h2>Продолжить изучение</h2></div><span class="progress-count">${done} / ${lessons.length}</span></div>
        <div class="resume-card"><div class="resume-icon">${icon('catalog')}</div><div class="resume-copy"><span>РАЗДЕЛ ${pad(resume.chapter.number)} · ${resume.minutes} МИН</span><strong>${esc(resume.title)}</strong><small>${esc(resume.chapter.title)}</small></div><button class="round-arrow" data-go="lesson/${esc(resume.id)}" aria-label="Открыть урок ${esc(resume.title)}">${icon('arrow')}</button></div>
        ${progressBar(done, lessons.length)}<div class="progress-caption"><span>${done ? `Изучено ${lessonCount(done)}` : 'Ваше путешествие только начинается'}</span><strong>${percent(done, lessons.length)}%</strong></div>
      </section>
      <section class="section-block chapters-preview"><div class="section-heading"><div><span class="section-kicker">ПРОГРАММА КУРСА</span><h2>Всё начинается с основ</h2></div><button class="text-link" data-go="catalog">Все разделы ${icon('arrow')}</button></div>
        <div class="chapter-grid">${book.chapters.slice(0, 4).map(chapterCard).join('')}</div><button class="outline-button full-catalog" data-go="catalog">Открыть все ${chapterCount(book.chapters.length)} ${icon('arrow')}</button>
      </section>
      <aside class="study-note"><span class="study-note-icon">✳</span><div><strong>Не спешите к ответу.</strong><p>Разбирайте доказательства и решайте задачи — понимание складывается шаг за шагом.</p></div></aside>
      <footer class="page-footer">ПРЕДЕЛ <span>•</span> УЧИТЬСЯ МОЖНО ВЕЗДЕ</footer>
    </div>`;
  }
  function renderCatalog() {
    const done = state.completed.length;
    return `<div class="page catalog-page"><div class="page-intro"><span class="section-kicker">МАРШРУТ ОБУЧЕНИЯ</span><h1>Оглавление<span class="accent-dot">.</span></h1><p>Путь от языка доказательств к современным теориям анализа. Изучайте последовательно или выбирайте нужную тему.</p></div>
      <div class="catalog-summary"><div><span>ВАШ ПРОГРЕСС</span><strong>${done} <small>/ ${lessons.length} уроков</small></strong></div><div class="catalog-progress">${progressBar(done, lessons.length)}<span>${percent(done, lessons.length)}% пройдено</span></div></div>
      <div class="list-header"><span>ВСЕ РАЗДЕЛЫ</span><span>${pad(book.chapters.length)}</span></div><div class="chapter-grid">${book.chapters.map(chapterCard).join('')}</div>
      <div class="info-strip">${icon('offline')}<span>Весь курс доступен без подключения к интернету.</span></div>
    </div>`;
  }
  function renderChapter(id) {
    const chapter = chapterById.get(id);
    const done = chapterDone(chapter);
    return `<div class="page"><button class="back-link" data-go="catalog">${icon('back')} Все разделы</button>
      <section class="chapter-intro"><div class="chapter-intro-number">${pad(chapter.number)}</div><div><span class="section-kicker">РАЗДЕЛ ${pad(chapter.number)} / ${pad(book.chapters.length)}</span><h1>${esc(chapter.title)}<span class="accent-dot">.</span></h1><p>${esc(chapter.description)}</p></div></section>
      <div class="chapter-progress"><div><span>ПРОГРЕСС В РАЗДЕЛЕ</span><strong>${done} / ${chapter.lessons.length}</strong></div>${progressBar(done, chapter.lessons.length)}</div>
      <div class="list-header"><span>УРОКИ РАЗДЕЛА</span><span>${lessonCount(chapter.lessons.length)}</span></div>
      <div class="lesson-list">${chapter.lessons.map(l => lessonCard(l)).join('')}</div>
      <div class="info-strip">${icon('spark')}<span>В каждом уроке есть примеры и задачи с решениями.</span></div>
    </div>`;
  }
  function renderLesson(id) {
    const lesson = lessonById.get(id);
    if (state.lastLesson !== id) { state.lastLesson = id; persist(); }
    const next = lessons[lesson.globalIndex + 1];
    return `<div class="page reading-page"><button class="back-link" data-go="chapter/${esc(lesson.chapter.id)}">${icon('back')} ${esc(lesson.chapter.title)}</button>
      <div class="reading-head"><div class="reading-topline"><span class="section-kicker">РАЗДЕЛ ${pad(lesson.chapter.number)} <span> / </span> УРОК ${pad(lesson.index + 1)}</span>${bookmarkButton(id, 'reading-bookmark')}</div>
        <h1>${esc(lesson.title)}<span class="accent-dot">.</span></h1><p>${esc(lesson.subtitle)}</p><div class="reading-meta">${icon('clock')} ${lesson.minutes} МИН ЧТЕНИЯ <span>·</span> ТЕОРИЯ И ПРАКТИКА</div></div>
      <div class="reading-rule"><span></span><i>∴</i><span></span></div>
      <article class="lesson-content">${lesson.html}</article>
      <div class="lesson-end"><span class="end-flourish">✳</span><h2>Ещё один шаг к пониманию.</h2><p>Отметьте урок изученным, когда разобрались с теорией и задачами.</p>
        <button class="complete-button ${completed(id) ? 'completed' : ''}" data-complete="${esc(id)}" aria-pressed="${completed(id)}">${icon('check')} ${completed(id) ? 'Урок изучен' : 'Отметить изученным'}</button>
      </div>
      ${next ? `<div class="next-lesson"><div><span>СЛЕДУЮЩИЙ УРОК</span><strong>${esc(next.title)}</strong><small>${esc(next.chapter.title)}</small></div><button class="round-arrow" data-go="lesson/${esc(next.id)}" aria-label="Следующий урок: ${esc(next.title)}">${icon('arrow')}</button></div>` : '<div class="info-strip">Вы дошли до конца курса. К любому уроку можно вернуться через оглавление.</div>'}
    </div>`;
  }
  function renderBookmarks() {
    const entries = lessons.filter(l => bookmarked(l.id));
    return `<div class="page"><div class="page-intro"><span class="section-kicker">ЛИЧНАЯ ПОДБОРКА</span><h1>Закладки<span class="accent-dot">.</span></h1><p>Сохраняйте важные уроки, чтобы вернуться к ним в любой момент.</p></div>
      ${entries.length ? `<div class="list-header"><span>СОХРАНЕНО</span><span>${lessonCount(entries.length)}</span></div><div class="lesson-list">${entries.map(l => lessonCard(l, 'other')).join('')}</div>` : `<div class="empty-state"><span class="empty-icon">${icon('bookmark')}</span><h2>Здесь пока пусто</h2><p>Нажмите на значок закладки в любом уроке — и он появится здесь.</p><button class="outline-button" data-go="catalog">Открыть оглавление ${icon('arrow')}</button></div>`}
    </div>`;
  }
  const normalized = text => text.toLocaleLowerCase('ru').replace(/ё/g, 'е');
  function renderSearchResults() {
    const query = searchValue.trim();
    const box = document.getElementById('search-results');
    if (!box) return;
    if (!query) {
      box.innerHTML = `<div class="search-suggestions"><span class="list-label">ПОПРОБУЙТЕ НАЙТИ</span><div>${['предел', 'сходимость', 'интеграл', 'пространство'].map(word => `<button data-query="${word}">${word}</button>`).join('')}</div><p>Поиск охватывает названия и полный текст всех уроков.</p></div>`;
      return;
    }
    const terms = normalized(query).split(/\s+/).filter(Boolean);
    const entries = lessons.filter(l => {
      const haystack = normalized(`${l.title} ${l.subtitle} ${l.chapter.title} ${l.plain}`);
      return terms.every(t => haystack.includes(t));
    });
    box.innerHTML = entries.length ? `<div class="list-header"><span>РЕЗУЛЬТАТЫ ПОИСКА</span><span>${lessonCount(entries.length)}</span></div><div class="lesson-list">${entries.map(l => lessonCard(l, 'other')).join('')}</div>` : `<div class="empty-state search-empty"><span class="empty-icon">${icon('search')}</span><h2>Ничего не найдено</h2><p>Попробуйте другое слово или более короткий запрос.</p></div>`;
  }
  function renderSearch() {
    return `<div class="page"><div class="page-intro"><span class="section-kicker">ПОИСК ПО УЧЕБНИКУ</span><h1>Найдём ответ<span class="accent-dot">.</span></h1><p>Термины, теоремы и темы — всё в одном месте.</p></div><div class="search-field">${icon('search')}<label class="sr-only" for="search-input">Поиск по учебнику</label><input id="search-input" type="search" autocomplete="off" placeholder="Например, предел функции" value="${esc(searchValue)}"><button data-action="clear-search" aria-label="Очистить поиск">${icon('close')}</button></div><div id="search-results"></div></div>`;
  }
  function renderSettings() {
    return `<div class="page settings-page"><button class="back-link" data-go="home">${icon('back')} На главную</button><div class="page-intro"><span class="section-kicker">ВАШ КОМФОРТ</span><h1>Настройки<span class="accent-dot">.</span></h1><p>Настройте чтение под себя.</p></div>
      <section class="settings-card"><div class="settings-title"><span class="settings-glyph">Aa</span><div><strong>Размер текста</strong><p>Изменяет размер текста в уроках.</p></div></div><div class="size-options" role="group" aria-label="Размер текста в уроках">${[['normal','Обычный'],['large','Крупнее'],['xlarge','Большой']].map(([v,l]) => `<button data-font="${v}" class="${state.fontSize === v ? 'selected' : ''}" aria-pressed="${state.fontSize === v}">${l}</button>`).join('')}</div></section>
      <section class="settings-card"><div class="settings-title"><span class="settings-glyph">◌</span><div><strong>Данные на устройстве</strong><p>Прогресс и закладки хранятся локально. При удалении приложения или очистке его данных они могут исчезнуть.</p></div></div>${resetPending ? `<div class="reset-confirm"><p>Удалить прогресс и все закладки? Это действие нельзя отменить.</p><div><button class="danger-button" data-action="reset">Да, удалить</button><button class="subtle-button" data-action="cancel-reset">Отмена</button></div></div>` : '<button class="subtle-button" data-action="confirm-reset">Сбросить прогресс и закладки</button>'}</section>
      <section class="about-card"><span class="section-kicker">ОБ УЧЕБНИКЕ</span><h2>Предел</h2><p>Офлайн-курс математического анализа и сопутствующих теорий: определения, доказательства, примеры и задачи с решениями.</p><p>Для дальнейшего изучения: В. А. Зорич «Математический анализ»; У. Рудин «Основы математического анализа»; А. Н. Колмогоров, С. В. Фомин «Элементы теории функций и функционального анализа».</p><small>Формулы: KaTeX · Шрифты: Literata и Manrope</small></section>
    </div>`;
  }
  function render() {
    const route = getRoute();
    document.documentElement.dataset.fontSize = state.fontSize;
    renderNav(route);
    if (route === 'home') root.innerHTML = renderHome();
    else if (route === 'catalog') root.innerHTML = renderCatalog();
    else if (route === 'bookmarks') root.innerHTML = renderBookmarks();
    else if (route === 'search') { root.innerHTML = renderSearch(); renderSearchResults(); }
    else if (route === 'settings') root.innerHTML = renderSettings();
    else if (route.startsWith('chapter/')) root.innerHTML = renderChapter(route.slice(8));
    else if (route.startsWith('lesson/')) root.innerHTML = renderLesson(route.slice(7));
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.bookmark) {
      const id = button.dataset.bookmark;
      state.bookmarks = bookmarked(id) ? state.bookmarks.filter(x => x !== id) : [...state.bookmarks, id];
      persist();
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
      showToast(bookmarked(id) ? 'Урок добавлен в закладки' : 'Закладка удалена');
    } else if (button.dataset.complete) {
      const id = button.dataset.complete;
      state.completed = completed(id) ? state.completed.filter(x => x !== id) : [...state.completed, id];
      persist();
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
      showToast(completed(id) ? 'Прогресс сохранён' : 'Отметка снята');
    } else if (button.dataset.font) {
      state.fontSize = button.dataset.font;
      persist();
      render();
    } else if (button.dataset.query) {
      searchValue = button.dataset.query;
      const input = document.getElementById('search-input');
      input.value = searchValue;
      renderSearchResults();
      input.focus();
    } else if (button.dataset.action === 'clear-search') {
      searchValue = '';
      const input = document.getElementById('search-input');
      input.value = '';
      renderSearchResults();
      input.focus();
    } else if (button.dataset.action === 'confirm-reset') {
      resetPending = true; render();
    } else if (button.dataset.action === 'cancel-reset') {
      resetPending = false; render();
    } else if (button.dataset.action === 'reset') {
      state = { completed: [], bookmarks: [], lastLesson: null, fontSize: state.fontSize };
      resetPending = false; persist(); render(); showToast('Прогресс и закладки удалены');
    } else if (button.dataset.go) {
      go(button.dataset.go);
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'search-input') { searchValue = event.target.value; renderSearchResults(); }
  });
  render();
})();
