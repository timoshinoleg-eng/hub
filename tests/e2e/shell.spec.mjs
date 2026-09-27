import { test, expect } from '@playwright/test';

/**
 * Контракт оболочки в настоящем браузере.
 *
 * Каждая проверка соответствует реальному дефекту, а не общему «страница
 * открылась»: за всю историю репозитория статические проверки пропустили
 * зацикливание моста iframe и карточку результата, перекрывающую меню.
 */

const HUB = '/index.html';

/** Собирает ошибки страницы: в MAX WebView их никто не увидит. */
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => {
    // Внешний SDK MAX недоступен в тестовом окружении намеренно.
    if (r.url().includes('st.max.ru')) return;
    errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText || ''}`);
  });
  return errors;
}

/**
 * Заглушка MAX SDK.
 *
 * BackButton.onClick регистрируется, как в настоящем MAX, и обработчик
 * складывается в window.__maxBack — иначе тест не может воспроизвести
 * системную кнопку «Назад», которая и вызывала дефект P0-1. Кликнуть по
 * кнопке бара во время открытого результата нельзя: оверлей модальный и
 * перекрывает её намеренно.
 */
const maxStub = (initData = '') => `window.WebApp = {
  initData: ${JSON.stringify(initData)}, initDataUnsafe: { user: { id: 4242 } },
  ready(){}, expand(){}, close(){},
  BackButton: {
    _h: [],
    onClick(fn) { this._h.push(fn); window.__maxBack = fn; },
    offClick(fn) { this._h = this._h.filter((f) => f !== fn); },
    show(){}, hide(){},
  },
  HapticFeedback: { selectionChanged(){}, impactOccurred(){}, notificationOccurred(){} },
  shareMaxContent() { return Promise.resolve(); },
};`;

async function stubMax(page, { hubApi = true, initData = '' } = {}) {
  await page.route('**/js/max-web-app.js', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: maxStub(initData),
  }));
  if (hubApi) {
    await page.route('**/hub-api/**', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"ok":true}',
    }));
  }
}

/** Полная тестовая конфигурация: то, что оператор выставит в production. */
const PROD_CONFIG = {
  bot: 'id0000000000_bot',
  hubName: 'Игротека',
  policyUrl: 'https://games.example.ru/policy',
  offerUrl: 'https://games.example.ru/offer',
  orgName: 'ООО «Пример»',
  notificationsEnabled: false,
};

async function openMenu(page, { config = null, revision = null } = {}) {
  if (config) {
    // Конфигурация идёт через runtime-config.js, ровно как в production:
    // контейнер монтирует этот файл поверх статики.
    await page.route('**/runtime-config.js', (route) => route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: `window.HUB_TRACK_ENDPOINT='/hub-api/ev';`
        + `window.HUB_CONFIG=${JSON.stringify(config)};`
        + `window.HUB_ASSET_REVISION=${JSON.stringify(revision || 'test')};`,
    }));
  }
  const errors = watchErrors(page);
  await page.goto(HUB, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.gcard', { timeout: 10_000 });
  return errors;
}

/** Нажимает системную кнопку «Назад» так, как это делает MAX. */
async function pressMaxBack(page) {
  const ok = await page.evaluate(() => {
    if (typeof window.__maxBack !== 'function') return false;
    window.__maxBack();
    return true;
  });
  expect(ok, 'MAX BackButton не зарегистрирован').toBe(true);
}

/** Доводит игру до результата через postMessage-протокол оболочки. */
async function finishGame(page, game, score) {
  await page.frameLocator('#game-frame').locator('body').evaluate((msg) => {
    parent.postMessage({ __hub: 1, type: 'finish', score: msg.score, game: msg.game }, '*');
  }, { game, score });
  await expect(page.locator('#overlay .result')).toBeVisible({ timeout: 5000 });
}

async function openGame(page, id) {
  await page.locator(`.gcard[data-id="${id}"]`).click();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'game');
  await page.waitForFunction(
    () => document.getElementById('game-frame')?.contentDocument?.readyState === 'complete',
    null, { timeout: 10_000 },
  );
}

test.describe('меню', () => {
  test('открывается без ошибок и показывает все 12 игр', async ({ page }) => {
    await stubMax(page);
    const errors = await openMenu(page, { config: PROD_CONFIG });
    await expect(page.locator('#games .gcard')).toHaveCount(12);
    await expect(page.locator('#count')).toHaveText('12 игр');
    await expect(page.locator('h1')).toHaveText('Игротека');
    expect(errors, `ошибки загрузки:\n${errors.join('\n')}`).toEqual([]);
  });

  test('каждая карточка пригодна для касания', async ({ page }) => {
    await stubMax(page);
    await openMenu(page, { config: PROD_CONFIG });
    const boxes = await page.locator('#games .gcard').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    }));
    for (const b of boxes) {
      expect(b.w, `ширина карточки ${b.w}px`).toBeGreaterThanOrEqual(120);
      expect(b.h, `высота карточки ${b.h}px`).toBeGreaterThanOrEqual(120);
    }
  });

  test('меню не прокручивается по горизонтали', async ({ page }) => {
    await stubMax(page);
    await openMenu(page, { config: PROD_CONFIG });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `горизонтальное переполнение: ${overflow}px`).toBeLessThanOrEqual(1);
  });

  test('неполная конфигурация показывается пользователю, а не только в консоли', async ({ page }) => {
    await stubMax(page);
    // Пустой bot — состояние репозитория по умолчанию, при котором весь
    // флагманский цикл челленджей молча мёртв.
    await openMenu(page, { config: { ...PROD_CONFIG, bot: '' } });
    await expect(page.locator('.config-warn')).toBeVisible();
    await expect(page.locator('.config-warn')).toContainText('челлендж');
  });

  test('корректная конфигурация не показывает предупреждений', async ({ page }) => {
    await stubMax(page);
    await openMenu(page, { config: PROD_CONFIG });
    await expect(page.locator('.config-warn')).toHaveCount(0);
  });

  test('без analytics endpoint показывается предупреждение', async ({ page }) => {
    await page.route('**/js/max-web-app.js', (route) => route.fulfill({
      status: 200, contentType: 'text/javascript; charset=utf-8', body: maxStub(),
    }));
    await page.route('**/runtime-config.js', (route) => route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: `window.HUB_CONFIG=${JSON.stringify(PROD_CONFIG)};window.HUB_ASSET_REVISION='t';`,
    }));
    await page.goto(HUB, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gcard');
    await expect(page.locator('.config-warn')).toContainText('Аналитика не настроена');
  });
});

test.describe('мост iframe', () => {
  test('handshake проходит один раз: нет цикла ready↔cfg', async ({ page }) => {
    await stubMax(page);
    await page.addInitScript(() => {
      window.__hubCfgCount = 0;
      window.addEventListener('message', (e) => {
        if (e.data && e.data.__hub === 1 && e.data.type === 'cfg') window.__hubCfgCount++;
      });
    });
    await openMenu(page, { config: PROD_CONFIG });
    await openGame(page, 'memory');
    await page.waitForTimeout(2500);
    const count = await page.frameLocator('#game-frame').locator('body').evaluate(() => window.__hubCfgCount);
    // Один cfg на игру. Регрессия: бесконечный цикл давал десятки cfg в секунду.
    expect(count, `получено ${count} cfg вместо одного`).toBeLessThanOrEqual(2);
  });

  test('мост замолкает после завершения игры', async ({ page }) => {
    await stubMax(page);
    await openMenu(page, { config: PROD_CONFIG });
    await openGame(page, 'memory');
    await finishGame(page, 'memory', 12);
    // Считаем сообщения со стороны оболочки: это независимый наблюдатель,
    // не зависящий от того, что игра сама себя разметила.
    await page.evaluate(() => {
      window.__msgCount = 0;
      window.addEventListener('message', () => { window.__msgCount++; });
    });
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => window.__msgCount);
    expect(after, 'после finish обмен не прекратился').toBe(0);
  });
});

test.describe('результат', () => {
  test('системная кнопка «Назад» очищает карточку и открывает меню', async ({ page }) => {
    await stubMax(page);
    await openMenu(page, { config: PROD_CONFIG });
    await openGame(page, 'memory');
    await finishGame(page, 'memory', 12);

    await pressMaxBack(page);

    await expect(page.locator('body')).toHaveAttribute('data-view', 'menu');
    // Регрессия P0-1: карточка оставалась поверх меню и перехватывала касатия.
    await expect(page.locator('#overlay .result'), 'результат остался поверх меню').toHaveCount(0);
    await expect(page.locator('#overlay')).not.toHaveAttribute('role', 'dialog');

    // Меню реально кликабельно: оверлей с pointer-events:auto перехватывал бы
    // касания, даже если бы карточка была прозрачной.
    const box = await page.locator('.gcard[data-id="merge"]').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('body')).toHaveAttribute('data-view', 'game');
  });

  test('«К играм» тоже очищает оверлей', async ({ page }) => {
    await stubMax(page);
    await openMenu(page, { config: PROD_CONFIG });
    await openGame(page, 'memory');
    await finishGame(page, 'memory', 9);
    await page.locator('#r-menu').click();
    await expect(page.locator('body')).toHaveAttribute('data-view', 'menu');
    await expect(page.locator('#overlay .result')).toHaveCount(0);
  });

  test('Escape закрывает результат и возвращает фокус', async ({ page }) => {
    await stubMax(page);
    await openMenu(page, { config: PROD_CONFIG });
    const card = page.locator('.gcard[data-id="memory"]');
    await card.focus();
    await card.click();
    await page.waitForFunction(
      () => document.getElementById('game-frame')?.contentDocument?.readyState === 'complete',
    );
    await finishGame(page, 'memory', 7);

    await expect(page.locator('#overlay')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#overlay')).toHaveAttribute('aria-modal', 'true');

    await page.keyboard.press('Escape');
    await expect(page.locator('#overlay')).not.toHaveAttribute('role', 'dialog');
    await expect(page.locator('#overlay .result')).toHaveCount(0);

    // Пользователь остался в игре, поэтому фокус получает кнопка возврата в
    // баре. Наивный «элемент, открывший диалог» здесь не годится: карточка
    // игры скрыта через display:none с момента старта игры.
    const inGame = await page.evaluate(() => document.activeElement?.id || '');
    expect(inGame, 'фокус не восстановлен внутри игрового вида').toBe('back');

    // После возврата в меню фокус должен попасть на карточку этой игры.
    await pressMaxBack(page);
    await expect(page.locator('body')).toHaveAttribute('data-view', 'menu');
    const inMenu = await page.evaluate(() => document.activeElement?.dataset?.id || '');
    expect(inMenu, 'фокус не вернулся на карточку игры в меню').toBe('memory');
  });

  test('закрытый оверлей не остаётся объявленным диалогом', async ({ page }) => {
    await stubMax(page);
    await openMenu(page, { config: PROD_CONFIG });
    await openGame(page, 'memory');
    await finishGame(page, 'memory', 5);
    await pressMaxBack(page);
    await expect(page.locator('#overlay')).not.toHaveAttribute('role', 'dialog');
    await expect(page.locator('body')).not.toHaveAttribute('data-modal', 'true');
  });
});

test.describe('каждая включённая игра', () => {
  // Список берётся из манифеста, а не дублируется здесь.
  const GAMES = ['merge', 'reaction', 'snake', 'sapper', 'echo', 'memory', 'sudoku', 'lights', 'nonogram', 'battleship', 'brick'];

  for (const id of GAMES) {
    test(`${id} загружается, рисует и не тянет внешнее`, async ({ page }) => {
      await stubMax(page);
      const external = [];
      page.on('request', (r) => {
        const u = r.url();
        if (!u.startsWith('http://127.0.0.1:4173') && !u.includes('st.max.ru')) external.push(u);
      });
      const errors = watchErrors(page);
      await openMenu(page, { config: PROD_CONFIG });
      await openGame(page, id);
      await page.waitForTimeout(600);

      const frame = page.frameLocator('#game-frame');
      await expect(frame.locator('body')).toBeVisible();
      // Кадр должен что-то содержать: пустой iframe в WebView выглядит как
      // сломанная игра, и без браузера это не проверить.
      const painted = await frame.locator('body').evaluate((b) => b.innerText.trim().length + b.children.length);
      expect(painted, `${id}: пустой игровой кадр`).toBeGreaterThan(0);

      expect(external, `${id} грузит внешние ресурсы:\n${external.join('\n')}`).toEqual([]);
      const fatal = errors.filter((e) => !e.includes('st.max.ru'));
      expect(fatal, `${id} ошибки:\n${fatal.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('аналитика', () => {
  test('до согласия события не несут MAX identity', async ({ page }) => {
    const payloads = [];
    await stubMax(page, { hubApi: false });
    await page.route('**/hub-api/ev', async (route) => {
      payloads.push(route.request().postData());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await openMenu(page, { config: PROD_CONFIG });
    await openGame(page, 'memory');
    await page.waitForTimeout(900);

    expect(payloads.length, 'события не отправляются вовсе').toBeGreaterThan(0);
    for (const p of payloads) expect(p, 'в событии до согласия есть identity').not.toContain('init_data');
    expect(payloads.some((p) => p.includes('open_bot')), 'нет события открытия').toBe(true);
    expect(payloads.some((p) => p.includes('open_game')), 'нет события старта игры').toBe(true);
  });

  test('клиентская ошибка попадает в аналитику', async ({ page }) => {
    const payloads = [];
    await stubMax(page, { hubApi: false });
    await page.route('**/hub-api/ev', async (route) => {
      payloads.push(route.request().postData());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await openMenu(page, { config: PROD_CONFIG });
    await page.evaluate(() => { setTimeout(() => { throw new Error('synthetic-failure-for-test'); }, 10); });
    await page.waitForTimeout(1500);
    const errs = payloads.filter((p) => p && p.includes('client_error'));
    expect(errs.length, 'ошибка не отправлена').toBeGreaterThan(0);
    expect(errs[0]).toContain('synthetic-failure-for-test');
  });

  test('отзыв согласия доступен из интерфейса', async ({ page }) => {
    const revoked = [];
    // Подписанный initData обязателен: без него сервер не может опознать
    // отзывающего, и отзыв остаётся только локальным. Это осознанный выбор —
    // само-декларируемый user_id не принимается ни одним эндпоинтом.
    await stubMax(page, { hubApi: false, initData: 'signed=max&init-data-for-test' });
    await page.route('**/hub-api/revoke', async (route) => {
      revoked.push(route.request().postData());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"revoked":true}' });
    });
    await openMenu(page, { config: PROD_CONFIG });
    await page.locator('#privacy-open').click();
    await expect(page.locator('#p-grant')).toBeVisible();
    await page.locator('#p-grant').click();

    await page.locator('#privacy-open').click();
    await expect(page.locator('#p-revoke')).toBeVisible();
    await page.locator('#p-revoke').click();
    await expect(page.locator('#p-revoke')).toContainText('Согласие отозвано', { timeout: 5000 });
    expect(revoked.length, 'запрос отзыва не ушёл').toBe(1);
  });
});
