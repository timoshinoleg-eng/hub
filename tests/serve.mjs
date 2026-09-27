#!/usr/bin/env node
/**
 * Статический сервер для браузерных тестов.
 *
 * Намеренно повторяет production-правила из deploy/nginx.conf: отдельная
 * политика кеширования для .html/.js против остального и 404 вместо
 * index.html для отсутствующих модулей. Если раздавать через обычный
 * http-сервер, тесты проверяли бы не тот докумен��, который увидит MAX.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

async function resolveFile(urlPath) {
  // normalize + префиксная проверка: без неё `/../package.json` ушёл бы наружу.
  const safe = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let target = join(ROOT, safe);
  if (!target.startsWith(ROOT + sep) && target !== ROOT) return null;
  try {
    const s = await stat(target);
    if (s.isDirectory()) target = join(target, 'index.html');
  } catch {
    return null;
  }
  return target;
}

createServer(async (req, res) => {
  const target = await resolveFile(req.url || '/');
  if (!target) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    // 404, а не index.html: иначе битый импорт модуля падал бы с MIME-ошибкой
    // вместо внятного «файл не найден», и в логах не было бы 404.
    res.end('not found');
    return;
  }
  try {
    const body = await readFile(target);
    const ext = extname(target);
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
    headers['Cache-Control'] = ext === '.html' || ext === '.js' ? 'no-cache, must-revalidate' : 'public, max-age=60';
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`test static server on http://127.0.0.1:${PORT}`);
});
