/**
 * Адаптер MAX Bridge. Все capability-вызовы — через feature detection.
 * initDataUnsafe допустим только для UX/navigation, не для аутентификации.
 */
const get = (path) => {
  const wa = typeof WebApp !== 'undefined' ? WebApp : (typeof window !== 'undefined' ? window.WebApp : null);
  if (!wa) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), wa);
};
const has = (path) => typeof get(path) === 'function';

export const bridge = {
  available: () => typeof window !== 'undefined' && !!window.WebApp,

  /** Подписанная строка. Доверять её полям можно только после server-side HMAC validation. */
  initData: () => {
    const raw = get('initData');
    return typeof raw === 'string' ? raw : '';
  },

  /** start_param влияет только на навигацию/UX, не даёт прав на backend. */
  startParam: () => {
    const p = get('initDataUnsafe.start_param');
    if (p) return String(p);
    const q = new URLSearchParams(location.search).get('WebAppStartParam');
    return q || '';
  },

  ready: () => { if (has('ready')) get('ready')(); },
  expand: () => { if (has('expand')) get('expand')(); },
  close: () => { if (has('close')) get('close')(); },

  onBack(fn) {
    const bb = get('BackButton');
    if (!bb || typeof bb.onClick !== 'function') return () => {};
    bb.onClick(fn);
    if (typeof bb.show === 'function') bb.show();
    return () => {
      if (typeof bb.offClick === 'function') bb.offClick(fn);
      if (typeof bb.hide === 'function') bb.hide();
    };
  },

  haptic(kind = 'selection') {
    const h = get('HapticFeedback');
    if (!h) return;
    if (kind === 'impact' && typeof h.impactOccurred === 'function') h.impactOccurred('light');
    else if (kind === 'notify' && typeof h.notificationOccurred === 'function') h.notificationOccurred('success');
    else if (typeof h.selectionChanged === 'function') h.selectionChanged();
  },

  async share(text, link) {
    const payload = { text: link ? `${text}\n${link}` : text };
    if (has('shareContent')) {
      try { get('shareContent')(payload); return true; } catch { /* fallthrough */ }
    }
    if (has('openLink')) {
      try {
        get('openLink')(`https://max.ru/:share?text=${encodeURIComponent(payload.text)}`);
        return true;
      } catch { /* fallthrough */ }
    }
    if (navigator.share) {
      try { await navigator.share({ text: payload.text }); return true; } catch { /* cancelled */ }
    }
    return false;
  },

  storage: {
    async get(key) {
      if (has('DeviceStorage.getItem')) {
        try { return JSON.parse(await get('DeviceStorage.getItem')(key)); } catch { /* ignore */ }
      }
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    async set(key, value) {
      const raw = JSON.stringify(value);
      if (has('DeviceStorage.setItem')) {
        try { await get('DeviceStorage.setItem')(key, raw); } catch { /* ignore */ }
      }
      try { localStorage.setItem(key, raw); } catch { /* ignore */ }
    },
  },
};
