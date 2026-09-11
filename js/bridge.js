/**
 * Адаптер MAX Bridge. Все capability-вызовы — через feature detection.
 * initDataUnsafe допустим только для UX/navigation, не для аутентификации.
 */
const root = () => typeof WebApp !== 'undefined' ? WebApp : (typeof window !== 'undefined' ? window.WebApp : null);
const get = (path) => {
  const wa = root();
  if (!wa) return undefined;
  try { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), wa); } catch { return undefined; }
};
const has = (path) => typeof get(path) === 'function';
const call = (path, ...args) => {
  const wa = root();
  if (!wa) return { ok: false, value: undefined };
  const parts = path.split('.');
  let owner = wa;
  try {
    for (const part of parts.slice(0, -1)) {
      owner = owner?.[part];
      if (owner == null) return { ok: false, value: undefined };
    }
    const fn = owner?.[parts[parts.length - 1]];
    if (typeof fn !== 'function') return { ok: false, value: undefined };
    return { ok: true, value: fn.apply(owner, args) };
  } catch {
    return { ok: false, value: undefined };
  }
};

function readStartFromParams(raw) {
  if (!raw) return '';
  const params = new URLSearchParams(String(raw).replace(/^#/, ''));
  return params.get('WebAppStartParam') || params.get('tgWebAppStartParam') || params.get('startapp') || params.get('start_param') || '';
}

export const bridge = {
  available: () => !!root(),

  /** Подписанная строка. Доверять её полям можно только после server-side HMAC validation. */
  initData: () => {
    const raw = get('initData');
    return typeof raw === 'string' ? raw : '';
  },

  /** start_param влияет только на навигацию/UX, не даёт прав на backend. */
  startParam: () => {
    const unsafe = get('initDataUnsafe');
    const direct = unsafe?.start_param || unsafe?.startParam || unsafe?.startapp;
    if (direct) return String(direct);

    const signed = readStartFromParams(get('initData'));
    if (signed) return signed;

    const query = readStartFromParams(typeof location !== 'undefined' ? location.search : '');
    if (query) return query;
    return readStartFromParams(typeof location !== 'undefined' ? location.hash : '');
  },

  ready: () => { call('ready'); },
  expand: () => { call('expand'); },
  close: () => { call('close'); },

  onBack(fn) {
    if (!call('BackButton.onClick', fn).ok) return () => {};
    call('BackButton.show');
    return () => {
      call('BackButton.offClick', fn);
      call('BackButton.hide');
    };
  },

  haptic(kind = 'selection') {
    if (kind === 'impact') call('HapticFeedback.impactOccurred', 'light');
    else if (kind === 'notify') call('HapticFeedback.notificationOccurred', 'success');
    else call('HapticFeedback.selectionChanged');
  },

  async share(text, link) {
    const payload = link ? { text, link } : { text };
    if (has('shareMaxContent')) {
      try {
        const r = call('shareMaxContent', payload);
        if (r.ok) { await r.value; return true; }
      } catch { /* fallthrough */ }
    }
    if (has('shareContent')) {
      try {
        const r = call('shareContent', payload);
        if (r.ok) { await r.value; return true; }
      } catch { /* fallthrough */ }
    }
    const combined = link ? `${text}\n${link}` : text;
    const maxShareUrl = `https://max.ru/:share?text=${encodeURIComponent(combined)}`;
    if (has('openMaxLink')) {
      try {
        const r = call('openMaxLink', maxShareUrl);
        if (r.ok) { await r.value; return true; }
      } catch { /* fallthrough */ }
    }
    if (navigator.share) {
      try { await navigator.share(link ? { text, url: link } : { text }); return true; } catch { /* cancelled */ }
    }
    if (has('openLink')) {
      try {
        const r = call('openLink', maxShareUrl);
        if (r.ok) { await r.value; return true; }
      } catch { /* fallthrough */ }
    }
    return false;
  },

  storage: {
    async get(key) {
      if (has('DeviceStorage.getItem')) {
        try {
          const r = call('DeviceStorage.getItem', key);
          if (r.ok) return JSON.parse(await r.value);
        } catch { /* ignore */ }
      }
      try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    },
    async set(key, value) {
      const raw = JSON.stringify(value);
      if (has('DeviceStorage.setItem')) {
        try {
          const r = call('DeviceStorage.setItem', key, raw);
          if (r.ok) await r.value;
        } catch { /* ignore */ }
      }
      try { localStorage.setItem(key, raw); } catch { /* ignore */ }
    },
  },
};
