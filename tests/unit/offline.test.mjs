/**
 * Логика оффлайн-кеша (js/offline.js).
 *
 * Модуль существует ради одной вещи: адреса прекэша собираются в одном
 * проверяемом месте, а не в двух копиях — в sw.js и в самом себе. Ошибка в
 * таком списке не падает, она тихо отдаёт прошлую сборку, поэтому каждое
 * свойство закреплено явно.
 */
import { describe, expect, it } from 'vitest';
import {
  SHELL_ASSETS,
  SHELL_MODULES,
  isBypassed,
  isRuntimeConfig,
  isVersioned,
  swCacheName,
  swPrecacheList,
  swRegisterUrl,
} from '../../js/offline.js';

describe('js/offline.js', () => {
  describe('swCacheName', () => {
    it('разные ревизии дают разные кеши', () => {
      // Иначе новая сборка продолжила бы писать в кеш прошлой и отдавала бы
      // файлы, которых в ней уже нет.
      expect(swCacheName('20260916-games12')).not.toBe(swCacheName('20260917-games13'));
    });

    it('одна и та же ревизия даёт одно имя', () => {
      expect(swCacheName('rev-1')).toBe(swCacheName('rev-1'));
    });

    it('имя безопасно для строки в Cache Storage', () => {
      // В имя кеша попадает ревизия, а она приходит из runtime-config.js,
      // который правит оператор. Пробелы и слэши сломали бы хранилище.
      const name = swCacheName('2026/09 16 rev+1');
      expect(name).toMatch(/^[A-Za-z0-9._-]+$/);
    });

    it('без ревизии имя не пустое', () => {
      expect(swCacheName('')).toBeTruthy();
      expect(swCacheName(undefined)).toBeTruthy();
    });
  });

  describe('swRegisterUrl', () => {
    it('ревизия едет в query, а не в сообщение', () => {
      // У воркера своя глобальная область: window.HUB_ASSET_REVISION в ней не
      // существует, и единственный способ передать ревизию — адрес скрипта.
      expect(swRegisterUrl('20260916-games12', '.')).toBe('./sw.js?v=20260916-games12');
    });

    it('спецсимволы ревизии экранируются', () => {
      expect(swRegisterUrl('a b&c=d', '.')).toBe('./sw.js?v=a%20b%26c%3Dd');
    });

    it('база по умолчанию — корень приложения', () => {
      expect(swRegisterUrl('r')).toBe('./sw.js?v=r');
    });
  });

  describe('swPrecacheList', () => {
    const list = swPrecacheList('20260916-games12');
    const v = '?v=20260916-games12';

    it('прекэшит шелл целиком', () => {
      // Без index.html оффлайн-вход не откроется, без модулей — пустое меню.
      expect(list).toContain('index.html');
      for (const name of SHELL_MODULES) expect(list, name).toContain(`js/${name}.js${v}`);
      for (const asset of SHELL_ASSETS) expect(list, asset).toContain(asset);
    });

    it('прекэшит runtime-config.js', () => {
      // Файл отдаётся no-store, но кладётся в кеш: без него оффлайн не
      // включается вообще, потому что без ревизии из конфига не грузится ни
      // один модуль шелла. Свежесть обеспечивает network-first в sw.js.
      expect(list).toContain('runtime-config.js');
    });

    it('прекэшит неверсионированную зависимость web-vitals', () => {
      // js/web-vitals.js тянет вендоренный файл статическим импортом, без ?v=.
      // Без него в кеше лежит модуль, но не его зависимость, и оффлайн
      // падает на первой загрузке метрик.
      expect(list).toContain('js/vendor/web-vitals/web-vitals.attribution.js');
    });

    it('все адреса относительные', () => {
      // В production Caddy отдаёт хаб под /hub/ и срезает префикс, поэтому
      // абсолютный путь воркеру не подошёл бы.
      for (const url of list) expect(url.startsWith('./')).toBe(false);
      for (const url of list) expect(url.startsWith('/')).toBe(false);
    });

    it('модули версионированы, статика — нет', () => {
      // Модули иммутабельны по ревизии, а css и иконки такой гарантии не имеют.
      for (const name of SHELL_MODULES) expect(isVersioned(`js/${name}.js${v}`)).toBe(true);
      for (const asset of SHELL_ASSETS) expect(isVersioned(asset)).toBe(false);
    });

    it('список дедуплицирован', () => {
      expect(new Set(list).size).toBe(list.length);
    });

    it('ревизия разных сборок даёт разные адреса модулей', () => {
      const a = swPrecacheList('rev-1');
      const b = swPrecacheList('rev-2');
      expect(a.filter((u) => u.includes('?v='))).not.toEqual(b.filter((u) => u.includes('?v=')));
    });
  });

  describe('isBypassed', () => {
    it('не обходит runtime-config.js, а распознаёт его отдельно', () => {
      // Обход означал бы «никогда не кешировать», и оффлайн был бы невозможен.
      expect(isBypassed('/hub/runtime-config.js')).toBe(false);
      expect(isRuntimeConfig('/hub/runtime-config.js')).toBe(true);
      expect(isRuntimeConfig('/hub/js/main.js?v=1')).toBe(false);
    });

    it('не трогает аналитику', () => {
      expect(isBypassed('/hub-api/ev')).toBe(true);
    });

    it('не трогает внешние адреса', () => {
      expect(isBypassed('https://st.max.ru/js/max-web-app.js')).toBe(true);
      expect(isBypassed('https://example.org/x.js')).toBe(true);
    });

    it('не считает локальный дев-сервер внешним', () => {
      // Иначе в e2e (127.0.0.1) воркер проигнорировал бы собственный оффлайн.
      expect(isBypassed('http://127.0.0.1:4173/js/main.js')).toBe(false);
      expect(isBypassed('http://localhost:4173/css/hub.css')).toBe(false);
    });

    it('пропускает свои ресурсы', () => {
      expect(isBypassed('/hub/index.html')).toBe(false);
      expect(isBypassed('/hub/js/main.js?v=1')).toBe(false);
      expect(isBypassed('/hub/games/merge/script.js')).toBe(false);
    });

    it('принимает и Request, и строку', () => {
      expect(isBypassed(new Request('https://st.max.ru/x'))).toBe(true);
    });
  });

  describe('isVersioned', () => {
    it('адрес с ?v= иммутабелен', () => {
      expect(isVersioned('/hub/js/main.js?v=rev')).toBe(true);
      expect(isVersioned('/hub/js/main.js?a=1&v=rev')).toBe(true);
    });

    it('остальное не иммутабельно', () => {
      expect(isVersioned('/hub/index.html')).toBe(false);
      expect(isVersioned('/hub/css/hub.css')).toBe(false);
      expect(isVersioned('/hub/games/merge/style.css')).toBe(false);
    });

    it('принимает и Request, и строку', () => {
      expect(isVersioned(new Request('https://127.0.0.1:4173/x.js?v=1'))).toBe(true);
    });
  });
});
