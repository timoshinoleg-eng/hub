/**
 * _boot.js — мост между игрой (iframe) и хабом.
 *
 * Встраивается в каждую игру скриптом tools/vendor.mjs. Ничего не знает про
 * конкретную игру: всё поведение приходит от родителя в сообщении `cfg`.
 * Так семь чужих скриптов становятся одним продуктом без переписывания.
 *
 * Протокол (все сообщения помечены __hub: 1):
 *   игра  -> хаб : { type: 'ready' }
 *   хаб   -> игра: { type: 'cfg', cfg }
 *   игра  -> хаб : { type: 'score',  value }
 *   игра  -> хаб : { type: 'finish', score }
 */
(function () {
  var el = document.currentScript || document.querySelector('script[data-game]');
  var game = el && el.getAttribute('data-game');
  if (!game) return;

  var cfg = null;
  var last = null;
  var finished = false;
  var started = false;

  function send(msg) {
    msg.__hub = 1;
    msg.game = game;
    try { parent.postMessage(msg, '*'); } catch (e) { /* ignore */ }
  }

  // alert/confirm в iframe мессенджера выглядят как поломка. Перехватываем
  // то, что не вычищено патчами.
  window.alert = function (t) { send({ type: 'finish', score: last, reason: 'alert:' + t }); };
  window.confirm = function () { return false; };

  window.addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || d.__hub !== 1 || d.type !== 'cfg' || d.game !== game) return;
    cfg = d.cfg || {};
    start();
  });

  function num(t) {
    if (!t) return null;
    var m = String(t).replace(/\s| /g, ' ').match(/-?\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  function start() {
    if (started) return;
    started = true;

    if (cfg.injectCss) {
      var s = document.createElement('style');
      s.textContent = cfg.injectCss;
      document.head.appendChild(s);
    }
    if (cfg.preventContextMenu) {
      document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    if (cfg.preventScroll) {
      document.body.style.overscrollBehavior = 'none';
      document.body.style.touchAction = 'manipulation';
    }

    var scoreEl = cfg.scoreSelector ? document.querySelector(cfg.scoreSelector) : null;
    var finishEl = cfg.finishSelector ? document.querySelector(cfg.finishSelector) : null;

    // Опрос, а не MutationObserver: игры перерисовывают innerHTML целиком,
    // подписки на узлы при этом живут недолго. 400 мс незаметны и дешевы.
    setInterval(function () {
      if (finished) return;

      if (scoreEl) {
        var v = num(scoreEl.textContent);
        if (v !== null && v !== last) {
          last = v;
          send({ type: 'score', value: v });
        }
      }

      if (finishEl) {
        var t = (finishEl.textContent || '').trim();
        if (t && (!cfg.finishEquals || t === cfg.finishEquals)) {
          finished = true;
          send({ type: 'finish', score: last, text: t });
        }
      }
      if (scoreEl && cfg.finishWhenScoreEquals !== undefined && last === cfg.finishWhenScoreEquals) {
        finished = true;
        send({ type: 'finish', score: last });
      }
    }, 400);
  }

  // Handshake одноразовый: родитель отвечает cfg, повторный cfg идемпотентен.
  send({ type: 'ready' });
})();
