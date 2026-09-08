import { bridge } from './bridge.js';
import { track, hasConsent, setConsent, subscribe } from './track.js';
import { cardDataUrl, shareText } from './share.js';
import { duelResult } from './duel.js';
import { dailySeed } from './daily.js';
import { GAMES, byId, visible } from './games.js';

const CFG = window.HUB_CONFIG || {};
const SHOW_ALL = new URLSearchParams(location.search).has('all');
const HUB_NAME = CFG.hubName || 'Игротека';
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

const state = { game: null, score: null, view: 'menu', challenge: null };
window.__hubStartParam = bridge.startParam();

function deepLink(gameId, score) {
  const bot = CFG.bot;
  if (!bot) return '';
  const p = score == null ? `g${gameId}` : `g${gameId}_s${score}`;
  return `https://max.ru/${bot}?startapp=${p}`;
}

function parseStartParam(sp) {
  const m = /^g([a-z]+)(?:_s(\d+))?$/i.exec(sp || '');
  if (!m) return null;
  const game = byId(m[1].toLowerCase());
  if (!game) return null;
  return { game, challenge: m[2] ? Number(m[2]) : null };
}

function renderMenu() {
  const list = $('#games');
  list.innerHTML = '';
  for (const g of visible(SHOW_ALL)) {
    const card = el('button', 'gcard' + (g.enabled ? '' : ' draft'));
    card.dataset.id = g.id;
    const badge = !g.enabled ? '<span class="gd">в работе</span>' : (g.cfg?.daily ? '<span class="gd">пазл дня</span>' : '');
    card.innerHTML = `
      <span class="ge">${g.emoji}</span>
      <span class="gt"><b>${g.title}</b><i>${g.tagline}</i></span>
      ${badge}
      <span class="ga">›</span>`;
    card.addEventListener('click', () => openGame(g.id));
    list.appendChild(card);
  }
  $('#count').textContent = `${visible(SHOW_ALL).length} из ${GAMES.length}`;
}

let offBack = () => {};
function openGame(id, challenge = null) {
  const g = byId(id);
  if (!g) return;
  state.game = g;
  state.score = null;
  state.challenge = challenge;
  $('#game-title').textContent = g.title;
  $('#game-score').textContent = '';

  let src = `games/${g.id}/index.html`;
  if (g.cfg?.daily) src += '?seed=' + dailySeed();
  if (challenge != null) src += (src.includes('?') ? '&' : '?') + 'challenge=' + challenge;
  $('#game-frame').src = src;
  $('#overlay').innerHTML = '';
  document.body.dataset.view = 'game';

  track('open_game', g.id);
  bridge.haptic('selection');
  offBack();
  offBack = bridge.onBack(backToMenu);
}

function backToMenu() {
  offBack();
  offBack = () => {};
  $('#game-frame').src = 'about:blank';
  $('#game-score').textContent = '';
  document.body.dataset.view = 'menu';
  state.game = null;
  state.challenge = null;
  track('back_to_menu');
}

function onMessage(e) {
  const d = e.data;
  if (!d || d.__hub !== 1) return;
  const f = document.getElementById('game-frame');
  if (!f || e.source !== f.contentWindow) return;

  if (d.type === 'ready') {
    if (!state.game || d.game !== state.game.id) return;
    f.contentWindow.postMessage({ __hub: 1, type: 'cfg', game: d.game, cfg: state.game.cfg || {} }, '*');
    return;
  }
  if (!state.game) return;
  if (d.type === 'score') {
    state.score = d.value;
    $('#game-score').textContent = d.value;
    return;
  }
  if (d.type === 'finish') {
    state.score = d.score ?? state.score;
    track('finish', state.game.id, state.score);
    showResult();
  }
}

function showResult() {
  const g = state.game;
  if (!g) return;
  const score = state.score ?? 0;
  const link = deepLink(g.id, score);
  const duel = duelResult(score, state.challenge, g.cfg?.higherIsBetter !== false);
  const box = el('div', 'result');
  const duelLine = duel
    ? `<div class="rduel ${duel.won ? 'win' : 'lose'}">${duel.won
        ? '🏆 Вы обыграли соперника!'
        : '🙈 Не хватило — нужно ' + (g.cfg?.higherIsBetter !== false ? 'больше ' : 'меньше ') + duel.challenge + (g.unit ? ' ' + g.unit : '')}</div>`
    : '';
  if (duel) track(duel.won ? 'duel_win' : 'duel_lose', g.id, score);

  box.innerHTML = `
    <div class="rcard">
      <img class="rimg" alt="карточка результата">
      <div class="rttl">${g.title} · ${score}${g.unit ? ' ' + g.unit : ''}</div>
      ${duelLine}
      <div class="rrow">
        <button class="btn primary" id="r-share">Поделиться</button>
        <button class="btn" id="r-again">Ещё раз</button>
      </div>
      <button class="btn ghost" id="r-notify">Уведомить о запуске</button>
      <div class="rhint" id="r-hint"></div>
    </div>`;

  box.querySelector('.rimg').src = cardDataUrl({ title: g.title, emoji: g.emoji, score, unit: g.unit, hubName: HUB_NAME });
  box.querySelector('#r-share').onclick = async () => {
    const ok = await bridge.share(shareText({ title: g.title, score, unit: g.unit, link }), link);
    track(ok ? 'share_ok' : 'share_fallback', g.id, score);
    if (!ok) {
      box.querySelector('#r-hint').textContent = 'Не удалось открыть шаринг — карточка ниже, сохраните её вручную.';
      box.querySelector('.rimg').style.display = 'block';
    }
  };
  box.querySelector('#r-again').onclick = () => {
    track('replay', g.id, score);
    box.remove();
    openGame(g.id, state.challenge);
  };
  box.querySelector('#r-notify').onclick = async (ev) => {
    const btn = ev.target;
    if (!hasConsent()) { showConsent(() => doSubscribe(btn, g, score)); return; }
    await doSubscribe(btn, g, score);
  };

  $('#overlay').innerHTML = '';
  $('#overlay').appendChild(box);
  bridge.haptic('notify');
}

async function doSubscribe(btn, g, score) {
  const r = await subscribe(g.id);
  track(r.ok ? 'notify_subscribe' : 'notify_failed', g.id, score);
  btn.textContent = r.ok ? 'Готово! Напишем при запуске' : 'Не получилось — попробуйте позже';
  btn.disabled = r.ok;
  if (r.ok) bridge.haptic('notify');
}

function showConsent(onAccept) {
  const box = el('div', 'result');
  box.innerHTML = `
    <div class="rcard">
      <div class="rttl">Нужно согласие</div>
      <p class="mut" style="margin:0 0 14px;font-size:13.5px">
        Чтобы написать вам о запуске, сервер проверит подписанные данные MAX и сохранит только ваш идентификатор пользователя.
        <a href="${CFG.policyUrl || '#'}" target="_blank" rel="noopener">Политика обработки данных</a>
      </p>
      <div class="rrow">
        <button class="btn primary" id="c-yes">Согласен</button>
        <button class="btn" id="c-no">Не надо</button>
      </div>
    </div>`;
  box.querySelector('#c-yes').onclick = () => { setConsent(); track('consent_yes'); box.remove(); onAccept?.(); };
  box.querySelector('#c-no').onclick = () => { track('consent_no'); box.remove(); };
  $('#overlay').appendChild(box);
}

function init() {
  bridge.ready();
  bridge.expand();
  renderMenu();
  window.addEventListener('message', onMessage);
  $('#back').addEventListener('click', backToMenu);
  $('#reload').addEventListener('click', () => state.game && openGame(state.game.id, state.challenge));
  track('open_bot');

  const parts = ['Мини-игры в MAX · без рекламы и покупок'];
  if (CFG.orgName) parts.push(CFG.orgName);
  const links = [];
  if (CFG.policyUrl) links.push(`<a href="${CFG.policyUrl}" target="_blank" rel="noopener">Политика обработки данных</a>`);
  if (CFG.offerUrl) links.push(`<a href="${CFG.offerUrl}" target="_blank" rel="noopener">Оферта</a>`);
  $('#legal').innerHTML = parts.join(' · ') + (links.length ? '<br>' + links.join(' · ') : '');

  const sp = parseStartParam(window.__hubStartParam);
  if (sp) {
    track('deep_link_open', sp.game.id, sp.challenge);
    openGame(sp.game.id, sp.challenge);
    if (sp.challenge != null) {
      const higher = sp.game.cfg?.higherIsBetter !== false;
      const txt = higher
        ? `Челлендж: набери больше ${sp.challenge}${sp.game.unit ? ' ' + sp.game.unit : ''} 🎯`
        : `Челлендж: уложись в ${sp.challenge}${sp.game.unit ? ' ' + sp.game.unit : ''} 🎯`;
      const n = el('div', 'challenge', txt);
      $('#overlay').appendChild(n);
      setTimeout(() => n.remove(), 4000);
    }
  }
  if (!CFG.bot) console.warn('[hub] HUB_CONFIG.bot не задан — deep link в шаринге работать не будет');
}

document.addEventListener('DOMContentLoaded', init);
