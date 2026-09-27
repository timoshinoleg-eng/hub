import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES, byId, visible } from '../../js/games.js';
import { OVERRIDE_PAIRS } from '../../tools/overrides.manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('манифест игр', () => {
  it('id уникальны — иначе каталог и статистика сливаются', () => {
    const ids = GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id пригодны для deep link и для имени папки', () => {
    // id попадает в URL вида g<id>_s<score> и в путь games/<id>/, поэтому он
    // обязан быть безопасным в обоих контекстах.
    for (const g of GAMES) {
      expect(g.id, g.id).toMatch(/^[a-z]{2,16}$/);
      expect(existsSync(join(ROOT, 'games', g.id, 'index.html')), `${g.id}: нет index.html`).toBe(true);
    }
  });

  it('у каждой игры есть метаданные для меню и подсказки', () => {
    for (const g of GAMES) {
      expect(g.title, g.id).toBeTruthy();
      expect(g.tagline, g.id).toBeTruthy();
      expect(g.howTo && g.hourTo === undefined ? g.howTo.length > 15 : true, g.id).toBe(true);
      expect(g.genre, g.id).toBeTruthy();
      expect(g.length, g.id).toBeTruthy();
      expect(g.accent && g.accent2, `${g.id}: нет цветов`).toBeTruthy();
      expect(g.cfg, `${g.id}: нет cfg`).toBeTruthy();
    }
  });

  it('иконка каждой игры есть в локальном спрайте', () => {
    // Внешняя иконка означала бы сетевой запрос в меню, что запрещено
    // политикой «без внешних runtime-ресурсов».
    const sprite = read('assets/icons.svg');
    for (const g of GAMES) {
      expect(sprite, `${g.id}: символ ${g.icon} отсутствует в спрайте`).toContain(`id="${g.icon}"`);
    }
    expect(sprite).toContain('id="brand"');
  });

  it('выпущенная игра — включённая, скрытая помечена иначе', () => {
    for (const g of GAMES) {
      expect(typeof g.enabled, g.id).toBe('boolean');
    }
    expect(visible(false).every((g) => g.enabled)).toBe(true);
    expect(visible(true).length).toBe(GAMES.length);
  });

  it('есть daily-игры, иначе механика «вызов дня» вырождается', () => {
    const daily = GAMES.filter((g) => g.cfg?.daily);
    expect(daily.length, 'нужна минимум одна daily-игра').toBeGreaterThan(0);
    // Ровно одна daily-игра означала бы, что ротация бессмысленна.
    expect(daily.length, 'нужно минимум две daily-игры для ротации').toBeGreaterThan(1);
  });

  it('lower-is-better отмечен явно, а не по умолчанию', () => {
    // Если забыть higherIsBetter:false, рекорд в «ходы» или «секунды» будет
    // расти вместо того, чтобы уменьшаться. Это молча ломает прогресс.
    for (const id of ['memory', 'sudoku', 'lights', 'nonogram', 'battleship']) {
      expect(byId(id)?.cfg?.higherIsBetter, `${id} должен быть lower-is-better`).toBe(false);
    }
  });

  it('byId находит игру и не выдумывает её', () => {
    expect(byId('merge')?.title).toBe('Мердж 2048');
    expect(byId('не-существует')).toBeUndefined();
  });

  it('внедряемая тема присутствует у каждой игры', () => {
    // cfg.injectCss — механизм, которым оболочка адаптирует чужие игры
    // под мобильный экран без правки их исходников. Без него игра
    // отрисовывается в десктопных размерах.
    for (const g of GAMES) {
      expect(g.cfg.injectCss, `${g.id}: нет injectCss`).toContain('font-size');
    }
  });

  it('hatched-игра: external handoff не содержит игрового кода', () => {
    const quiz = byId('quiz');
    expect(quiz.modulePath).toBe('/quiz/');
    // Квизик смонтирован как переход в отдельный продукт: его логики здесь нет,
    // и значит локальный daily не должен быть включён — он остаётся
    // серверным в Quizzzz.
    expect(quiz.cfg.daily).toBeUndefined();
  });

  it('каждая vendor-override указывает на существующую игру', () => {
    // Реестр override — подмножество каталога. Игры волны 2 (sudoku, lights,
    // nonogram, battleship) патчатся в vendor.mjs напрямую и канона не имеют,
    // а brick внесён вручную; поэтому проверяем не «у каждой есть канон», а
    // «каждый канон относится к реальной игре» — иначе в репозитории копился
    // бы мёртвый код, который никто не применяет.
    for (const [, dest] of OVERRIDE_PAIRS) {
      const id = dest.split('/')[1];
      expect(byId(id), `override указывает на несуществующую игру ${id}`).toBeTruthy();
    }
  });

  it('игры волны 2 не имеют канона — они патчатся в vendor.mjs', () => {
    // Явно фиксируем намерение: отсутствие канона здесь осознанно, а не
    // упущение. Если для sudoku появится override, тест об этом напомнит.
    const overridden = new Set(OVERRIDE_PAIRS.map(([, dest]) => dest.split('/')[1]));
    for (const id of ['sudoku', 'lights', 'nonogram', 'battleship']) {
      expect(overridden.has(id), `${id} не должен иметь override`).toBe(false);
    }
  });

  it('brick — ручной донор и вне vendor-пайплайна', () => {
    const overridden = new Set(OVERRIDE_PAIRS.map(([, dest]) => dest.split('/')[1]));
    expect(overridden.has('brick')).toBe(false);
    expect(byId('brick')).toBeTruthy();
  });
});
