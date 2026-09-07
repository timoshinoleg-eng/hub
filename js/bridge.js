/**
 * Адаптер MAX Bridge.
 *
 * Правило: ни один вызов не должен сломать страницу, если API нет или оно
 * изменилось. Поэтому всё через has() — в обычном браузере хаб просто
 * работает без нативных функций, что избавляет от отдельной dev-сборки.
 *
 * Подтверждённые факты платформы (dev.max.ru, 07.09.2026):
 *  - мини-приложение существует только внутри чат-бота
 *  - стартовые параметры приходят в initDataUnsafe.start_param (или GET WebAppStartParam)
 *  - в Bridge НЕТ платежей, рекламы, лидербордов и мультиплеера
 */

const get = (path) => {
  const wa = typeof WebApp !== 'undefined' ? WebApp : (typeof window !== 'undefined' ? window.WebApp : null);
  if (!wa) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), wa);
};

const has = (path) => typeof get(path) === 'function';

export const bridge = {
  available: () => typeof window !== 'undefined' && !!window.WebApp,

  /** Стартовый параметр из deep link https://max.ru/<bot>?startapp=<payload> */
  startParam: () => {
    const p = get('initDataUnsafe.start_param');
    if (p) return String(p);
    const q = new URLSearchParams(location.search).get('WebAppStartParam');
    return q || '';
  },

  ready: () => { if (has('ready')) get('ready')(); },
  expand: () => { if (has('expand')) get('expand')(); },
  close: () => { if (has('close')) get('close')(); },

  /** Системная кнопка «назад». Возвращает обработчик для снятия. */
  onBack(fn) {
    const bb = get('BackButton');
    if (!bb || typeof bb.onClick !== 'function') return () => {};
    bb.onClick(fn);
    if (typeof bb.show === 'function') bb.show();
    return () => { if (typeof bb.offClick === 'function') bb.offClick(fn); if (typeof bb.hide === 'function') bb.hide(); };
  },

  haptic(kind = 'selection') {
    const h = get('HapticFeedback');
    if (!h) return;
    if (kind === 'impact' && typeof h.impactOccurred === 'function') h.impactOccurred('light');
    else if (kind === 'notify' && typeof h.notificationOccurred === 'function') h.notificationOccurred('success');
    else if (typeof h.selectionChanged === 'function') h.selectionChanged();
  },

  /**
   * Поделиться. Единственный канал роста, потому что каталога мини-приложений
   * в MAX нет, а ник бота вида idИНН_bot запомнить невозможно.
   * Возвращает true, если нативный шаринг реально вызван.
   */
  async share(text, link) {
    const payload = { text: link ? `${text}\n${link}` : text };

    if (has('shareContent')) {
      try { get('shareContent')(payload); return true; } catch (e) { /* fallthrough */ }
    }
    if (has('openLink')) {
      try {
        const url = `https://max.ru/:share?text=${encodeURIComponent(payload.text)}`;
        get('openLink')(url);
        return true;
      } catch (e) { /* fallthrough */ }
    }
    if (navigator.share) {
      try { await navigator.share({ text: payload.text }); return true; } catch (e) { /* cancelled */ }
    }
    return false;
  },

  /** Локальное хранилище устройства. Не заменяет бэкенд — только кэш. */
  storage: {
    async get(key) {
      if (has('DeviceStorage.getItem')) {
        try { return JSON.parse(await get('DeviceStorage.getItem')(key)); } catch (e) { /* ignore */ }
      }
      try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
    },
    async set(key, value) {
      const raw = JSON.stringify(value);
      if (has('DeviceStorage.setItem')) {
        try { await get('DeviceStorage.setItem')(key, raw); } catch (e) { /* ignore */ }
      }
      try { localStorage.setItem(key, raw); } catch (e) { /* ignore */ }
    },
  },

  /** Анонимный id устройства. Полноценной авторизации в Bridge нет. */
  userId() {
    const u = get('initDataUnsafe.user');
    if (u && (u.id || u.user_id)) return String(u.id || u.user_id);
    return 'anon-' + (Math.random().toString(36).slice(2) + Date.now().toString(36));
  },
};
