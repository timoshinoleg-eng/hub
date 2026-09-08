/**
 * _boot.js — мост между игрой (iframe) и хабом.
 * Протокол: игра -> ready/score/finish; хаб -> cfg.
 */
(function () {
  var el = document.currentScript || document.querySelector('script[data-game]');
  var game = el && el.getAttribute('data-game');
  if (!game) return;

  // Standalone game pages remain self-contained; only the iframe presentation
  // gets the compact branded viewport used by the hub shell.
  if (window.parent !== window) {
    document.documentElement.classList.add('hub-embedded');
    document.documentElement.setAttribute('data-hub-game', game);
  }

  var cfg = null;
  var last = null;
  var finished = false;
  var started = false;

  function send(msg) {
    msg.__hub = 1;
    msg.game = game;
    try { parent.postMessage(msg, '*'); } catch (e) { /* ignore */ }
  }

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
    if (cfg.preventContextMenu) document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    if (cfg.preventScroll) {
      document.body.style.overscrollBehavior = 'none';
      document.body.style.touchAction = 'manipulation';
    }
    var scoreEl = cfg.scoreSelector ? document.querySelector(cfg.scoreSelector) : null;
    var finishEl = cfg.finishSelector ? document.querySelector(cfg.finishSelector) : null;
    setInterval(function () {
      if (finished) return;
      if (scoreEl) {
        var v = num(scoreEl.textContent);
        if (v !== null && v !== last) { last = v; send({ type: 'score', value: v }); }
      }
      if (finishEl) {
        var t = (finishEl.textContent || '').trim();
        if (t && (!cfg.finishEquals || t === cfg.finishEquals)) { finished = true; send({ type: 'finish', score: last, text: t }); }
      }
      if (scoreEl && cfg.finishWhenScoreEquals !== undefined && last === cfg.finishWhenScoreEquals) { finished = true; send({ type: 'finish', score: last }); }
    }, 400);
  }

  send({ type: 'ready' });
})();
