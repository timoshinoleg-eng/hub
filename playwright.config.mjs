import { defineConfig, devices } from '@playwright/test';

/**
 * Браузерные тесты хаба.
 *
 * Зачем это нужно. Проект no-build, и до сих пор все проверки оболочки были
 * либо regex-матчами по исходнику, либо исполнением чистых модулей в vm.
 * Ничего не запускало настоящий DOM, поэтому такие вещи не ловились:
 *
 *  - бесконечный цикл ready↔cfg в мосте iframe (породил 7 из 17 коммитов);
 *  - карточка результата, остающаяся поверх меню после системной кнопки
 *    «Назад» (найдено в этом же ревью, P0-1);
 *  - layout на 360×640 — целевой размер для MAX WebView, который нельзя
 *    проверить без браузера;
 *  - ошибки загрузки модулей, которые в WebView выглядят как пустой экран;
 *  - языковые атрибуты документов игр: пять игр объявляли lang="en".
 *
 * Порядок прогонки: сначала контракты без браузера (npm run smoke), потом
 * браузерные. Браузерные — самые медленные, поэтому они не входят в smoke.
 */
export default defineConfig({
  // Каталог обязательно выделен: рядом лежат tests/serve.mjs (не тест) и
  // tests/unit/*.test.mjs, где `test` — это vitest. Если Playwright их
  // подхватит, он выполнит test.describe() не из того пакета и упадёт с
  // невнятным "did not expect test.describe() to be called here".
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Сервис-воркер выключен по умолчанию. Он регистрируется в каждой сессии
    // (это и нужно пользователю), а остальные тесты писались в мире без него:
    // воркер кладёт в кеш документы навигации и начинает отдавать их вместо
    // сети, из-за чего часть проверок становится гонкой. Включается он точечно
    // в describe 'оффлайн' через test.use.
    serviceWorkers: 'block',
  },

  projects: [
    {
      // Основной мобильный профиль. Именно Chromium, а не WebKit из
      // devices['iPhone']: MAX WebView на Android — это Chromium, и именно он
      // кеширует модули между запусками, из-за чего в проекте было семь
      // коммитов про cache-recovery. iOS WebKit здесь не воспроизводится и
      // остаётся ручной проверкой по PRODUCTION_RUNBOOK §6.
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      // Узкий экран: iPhone SE и Android低端, самый тесный целевой размер.
      name: 'mobile-small',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],

  // Статика раздаётся теми же правилами, что и в production: из-за разных
  // политик кеширования (.js против .html) тесты проверяли бы не тот документ,
  // который увидит MAX.
  webServer: {
    command: 'node tests/serve.mjs',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});


