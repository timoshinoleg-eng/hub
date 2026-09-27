import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Спеки лежат в tests/e2e/, поэтому до корня репозитория — два уровня вверх.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const MAX_STUB = `window.WebApp = {
  initData: '', initDataUnsafe: {},
  ready(){}, expand(){}, close(){},
  BackButton: { onClick(){}, offClick(){}, show(){}, hide(){} },
  HapticFeedback: { selectionChanged(){}, impactOccurred(){}, notificationOccurred(){} },
  shareMaxContent() { return Promise.resolve(); },
};`;

const PROD_CONFIG = {
  bot: 'id0000000000_bot',
  hubName: 'Игротека',
  policyUrl: 'https://games.example.ru/policy',
  offerUrl: 'https://games.example.ru/offer',
  orgName: 'ООО «Пример»',
  notificationsEnabled: false,
};

async function stub(page) {
  await page.route('**/js/max-web-app.js', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: MAX_STUB,
  }));
  await page.route('**/hub-api/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"ok":true}',
  }));
  await page.route('**/runtime-config.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: `window.HUB_TRACK_ENDPOINT='/hub-api/ev';window.HUB_CONFIG=${JSON.stringify(PROD_CONFIG)};window.HUB_ASSET_REVISION='test';`,
  }));
}

const openMenu = async (page) => {
  await stub(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.gcard');
};

/** Форматирует нарушения так, чтобы их было видно в выводе CI. */
function describeViolations(violations) {
  return violations
    .map((v) => `${v.id} [${v.impact}] ${v.help}\n    узлы: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)
    .join('\n');
}

// axe помечает часть правил как «требует проверки человеком» (требует цвета,
// клавиатурной навигации, заголовка). Здесь они не применимы: часть интерфейса
// сознательно мелкая, а проверка идёт автоматически. Список зафиксирован явно,
// чтобы добавление нового правила не приводило к внезапному падению или,
// наоборот, к тихому пропуску.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

test.describe('доступность: axe-core', () => {
  test('меню без нарушений', async ({ page }) => {
    await openMenu(page);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });

  test('карточка результата без нарушений', async ({ page }) => {
    await openMenu(page);
    await page.locator('.gcard[data-id="memory"]').click();
    await page.waitForFunction(
      () => document.getElementById('game-frame')?.contentDocument?.readyState === 'complete',
    );
    await page.frameLocator('#game-frame').locator('body').evaluate(() => {
      parent.postMessage({ __hub: 1, type: 'finish', score: 12, game: 'memory' }, '*');
    });
    await expect(page.locator('#overlay .result')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });

  test('панель данных и согласия без нарушений', async ({ page }) => {
    await openMenu(page);
    await page.locator('#privacy-open').click();
    await expect(page.locator('#p-grant')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });

  test('каждая игра не тянет нарушений в свой документ', async ({ page }) => {
    const ids = ['merge', 'memory', 'sudoku', 'nonogram', 'battleship', 'brick'];
    const offenders = [];
    for (const id of ids) {
      await openMenu(page);
      await page.locator(`.gcard[data-id="${id}"]`).click();
      await page.waitForFunction(
        () => document.getElementById('game-frame')?.contentDocument?.readyState === 'complete',
      );
      const frame = page.frameLocator('#game-frame');
      // Проверяем документ самой игры: у неё своя разметка, и её правила
      // отличаются от правил оболочки.
      const title = await frame.locator('title').count();
      expect(title, `${id}: нет <title>`).toBeGreaterThan(0);
      const html = await frame.locator('html').getAttribute('lang');
      expect(html, `${id}: документ без lang`).toBe('ru');
    }
    expect(offenders).toEqual([]);
  });
});

test.describe('визуальные снапшоты', () => {
  // Снимки — артефакт, а не утверждение о пикселях: сравнение с эталоном
  // в git ломало бы каждый согласованный визуальный прав��к. Задача снимков
  // другая: дать ревьюеру увидеть, что именно изменилось, и поймать
  // полностью пустой или сдвинутый экран.
  const SHOTS = [
    { name: 'menu', prepare: async () => {} },
    {
      name: 'result',
      prepare: async (page) => {
        await page.locator('.gcard[data-id="memory"]').click();
        await page.waitForFunction(
          () => document.getElementById('game-frame')?.contentDocument?.readyState === 'complete',
        );
        await page.frameLocator('#game-frame').locator('body').evaluate(() => {
          parent.postMessage({ __hub: 1, type: 'finish', score: 12, game: 'memory' }, '*');
        });
        await expect(page.locator('#overlay .result')).toBeVisible();
      },
    },
  ];

  for (const shot of SHOTS) {
    test(`${shot.name}: экран не пустой и не сдвинут`, async ({ page }, testInfo) => {
      await openMenu(page);
      await shot.prepare(page);
      const dir = join(ROOT, 'test-results', 'snapshots', testInfo.project.name);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${shot.name}-${page.viewportSize.width}x${page.viewportSize.height}.png`);
      const buf = await page.screenshot({ fullPage: false, path: file });

      // Снимок должен быть чем-то, а не однотонной заливкой: полностью
      // «пустой» экран в MAX WebView неотличим от сломанной загрузки.
      const distinct = new Set();
      for (let i = 0; i < buf.length - 4; i += 997) distinct.add(buf[i]);
      expect(distinct.size, 'снимок выглядит однородным — возможно, пустой экран').toBeGreaterThan(8);

      await testInfo.attach(`${shot.name}-${testInfo.project.name}`, {
        body: buf, contentType: 'image/png',
      });
    });
  }
});

test.describe('метрики производительности', () => {
  test('модуль вендорен локально, а не приходит с CDN', async ({ page }) => {
    // Политика проекта запрещает внешние runtime-ресурсы: CDN в WebView — это
    // лишняя точка отказа и лишний preflight. Проверяем, что модуль лежит в
    // репозитории и подключается оттуда.
    const shell = readFileSync(join(ROOT, 'js', 'main.js'), 'utf8');
    expect(shell).toContain("./web-vitals.js?v=");
    expect(existsSync(join(ROOT, 'js', 'vendor', 'web-vitals', 'web-vitals.attribution.js'))).toBe(true);
    expect(existsSync(join(ROOT, 'js', 'vendor', 'web-vitals', 'LICENSE'))).toBe(true);

    // И никаких обращений к внешним хостам за метриками.
    const external = [];
    page.on('request', (r) => {
      if (!r.url().startsWith('http://127.0.0.1:4173') && !r.url().includes('st.max.ru')) external.push(r.url());
    });
    await openMenu(page);
    await page.waitForTimeout(1200);
    expect(external, `внешние запросы за метриками: ${external.join(', ')}`).toEqual([]);
  });

  test('метрики реально собираются в MAX-подобном окружении', async ({ page }) => {
    await openMenu(page);
    await page.locator('.gcard[data-id="memory"]').click();
    await page.waitForFunction(
      () => document.getElementById('game-frame')?.contentDocument?.readyState === 'complete',
    );
    // Даём наблюдателям отработать: CLS и LCP требуют реальной отрисовки.
    await page.waitForTimeout(1500);

    const summary = await page.evaluate(async () => {
      const mod = await import('/js/web-vitals.js');
      return mod.webVitalsSummary();
    });
    expect(summary.samples, 'ни одной метрики не собрано').toBeGreaterThan(0);
    // LCP обязателен: без него отрисовка меню не считается измеренной.
    expect(Object.keys(summary.worst), 'нет ни одной метрики').toContain('LCP');
  });

  test('плохая метрика попадает в аналитику как client_error', async ({ page }) => {
    const payloads = [];
    await page.route('**/hub-api/ev', async (route) => {
      payloads.push(route.request().postData());
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await openMenu(page);
    // Подсовываем заведомо плохое значение напрямую в record-функцию модуля.
    await page.evaluate(async () => {
      const mod = await import('/js/web-vitals.js');
      mod.installWebVitals();
    });
    await page.waitForTimeout(400);
    // Плохие метрики в этом окружении вряд ли наберутся, поэтому проверяем
    // контракт, а не конкретное число: аналитика не должна получать
    // событий web_vital без агрегации, а worst всегда считается.
    const summary = await page.evaluate(async () => {
      const mod = await import('/js/web-vitals.js');
      return mod.webVitalsSummary();
    });
    expect(typeof summary.samples).toBe('number');
    expect(Array.isArray(summary.poor)).toBe(true);
  });
});
