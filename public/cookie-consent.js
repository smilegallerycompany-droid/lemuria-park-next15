/* Lemuria Park cookie choices. No analytics before explicit opt-in. */
(function () {
  'use strict';
  if (window.__lemuriaConsent) return;
  var key = 'lemuria-cookie-choice-v1', version = '2026-11-10';
  var lifetime = 180 * 24 * 60 * 60 * 1000, counter = 113976341;
  var panel, toggle, started = false;
  var publicHost = /^(?:www\.)?xn--80ajjjbhwgdz8k\.xn--p1ai$/.test(location.hostname);
  var privatePath = /^\/(?:admin|director|cashier|owner|observer|login|api|checkout|order|orders|payment|payments|ticket|tickets)(?:\/|$)/;
  if (privatePath.test(location.pathname)) return;
  function readChoice() {
    try {
      var value = JSON.parse(localStorage.getItem(key) || 'null');
      if (value && value.version === version && typeof value.analytics === 'boolean' && Number.isFinite(value.savedAt) && value.savedAt <= Date.now() && Date.now() - value.savedAt < lifetime) return value;
    } catch (_) {}
    return null;
  }
  function clearAnalyticsCookies() {
    document.cookie.split(';').forEach(function (part) {
      var name = part.trim().split('=')[0];
      if (!/^_ym_[A-Za-z0-9_]+$/.test(name)) return;
      ['', location.hostname, '.' + location.hostname, '.xn--80ajjjbhwgdz8k.xn--p1ai'].forEach(function (domain) {
        document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax' + (domain ? '; Domain=' + domain : '') + '; Secure';
      });
    });
  }
  function startAnalytics() {
    if (started || !publicHost || privatePath.test(location.pathname)) return;
    started = true;
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    var script = document.createElement('script');
    script.id = 'lemuria-consented-metrika'; script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js?id=' + counter;
    document.head.appendChild(script);
    // Aggregate visits only: no form recordings, order IDs, query strings or replay.
    window.ym(counter, 'init', {ssr: true, webvisor: false, clickmap: false, trackLinks: false, accurateTrackBounce: true, url: location.origin + location.pathname, referrer: '', defer: false});
  }
  function hide() { panel.hidden = true; toggle.hidden = false; }
  function choose(analytics) {
    try { localStorage.setItem(key, JSON.stringify({version: version, analytics: analytics, savedAt: Date.now()})); } catch (_) {}
    hide(); toggle.focus({preventScroll: true});
    if (analytics) startAnalytics();
    else {
      clearAnalyticsCookies();
      if (started) { try { window.ym(counter, 'destruct'); } catch (_) {} location.reload(); }
    }
  }
  function show() { panel.hidden = false; toggle.hidden = true; panel.querySelector('button').focus({preventScroll: true}); }
  function mount() {
    if (document.getElementById('lemuria-cookie-panel')) return;
    var style = document.createElement('style');
    style.textContent = '#lemuria-cookie-panel,#lemuria-cookie-toggle{box-sizing:border-box;font-family:Arial,sans-serif;color:#213726;line-height:1.5}#lemuria-cookie-panel{position:fixed;z-index:9999;left:18px;bottom:18px;width:460px;max-width:calc(100vw - 36px);max-height:calc(100dvh - 24px);overflow:auto;padding:22px;background:#fffdf8;border:1px solid #d6dfcd;border-radius:20px;box-shadow:0 8px 36px #17341d33;font-size:14px}#lemuria-cookie-panel[hidden],#lemuria-cookie-toggle[hidden]{display:none!important}#lemuria-cookie-panel h2{margin:0 40px 10px 0;font-size:20px;line-height:1.3;color:#213726}#lemuria-cookie-panel p{margin:0 0 12px}#lemuria-cookie-panel a{color:#355e31;text-decoration:underline;text-underline-offset:3px}#lemuria-cookie-panel button,#lemuria-cookie-toggle{font:inherit;cursor:pointer}#lemuria-cookie-panel .lc-close{position:absolute;right:12px;top:10px;width:40px;height:40px;border:0;background:transparent;border-radius:10px;font-size:27px;color:#52664d}#lemuria-cookie-panel .lc-actions{display:flex;gap:10px;flex-wrap:wrap}#lemuria-cookie-panel .lc-actions button{flex:1;min-width:160px;min-height:44px;padding:10px 12px;border:1px solid #3d6137;border-radius:11px;font-size:13px;font-weight:700;background:#fffdf8;color:#294722}#lemuria-cookie-panel .lc-actions .lc-accept{background:#355e31;color:#fff}#lemuria-cookie-panel .lc-detail{font-size:12px;color:#52664d}#lemuria-cookie-toggle{position:fixed;left:14px;bottom:12px;z-index:9998;padding:7px 12px;border:1px solid #c8d7bd;border-radius:20px;background:#fffdf8;box-shadow:0 2px 12px #17341d19;font-size:12px}#lemuria-cookie-panel button:focus-visible,#lemuria-cookie-toggle:focus-visible,#lemuria-cookie-panel a:focus-visible{outline:3px solid #ed8b22;outline-offset:3px}@media(max-width:520px){#lemuria-cookie-panel{left:12px;right:12px;bottom:12px;width:auto;max-width:none;padding:18px;font-size:13px}#lemuria-cookie-panel h2{font-size:18px}#lemuria-cookie-panel .lc-actions{gap:8px}#lemuria-cookie-panel .lc-actions button{min-width:135px;font-size:12px}}';
    document.head.appendChild(style);
    panel = document.createElement('section'); panel.id = 'lemuria-cookie-panel';
    panel.setAttribute('aria-label', 'Настройки cookie');
    panel.innerHTML = '<button type="button" class="lc-close" aria-label="Закрыть без аналитики" title="Закрыть без аналитики">×</button><h2>Настройки cookie</h2><p>Необходимые cookie помогают сайту работать. С вашего согласия подключим Яндекс Метрику, чтобы понимать посещаемость и улучшать сайт.</p><p class="lc-detail">Нажимая «Принять аналитику», вы даёте <a href="/cookies.html#consent" target="_blank" rel="noopener">согласие на обработку данных для аналитики</a>. <a href="/policy" target="_blank" rel="noopener">Политика обработки данных</a></p><div class="lc-actions"><button type="button" class="lc-essential">Только необходимые</button><button type="button" class="lc-accept">Принять аналитику</button></div>';
    toggle = document.createElement('button'); toggle.id = 'lemuria-cookie-toggle'; toggle.type = 'button';
    toggle.textContent = 'Настройки cookie'; toggle.hidden = true;
    document.body.appendChild(panel); document.body.appendChild(toggle);
    panel.querySelector('.lc-close').addEventListener('click', function () { choose(false); });
    panel.querySelector('.lc-essential').addEventListener('click', function () { choose(false); });
    panel.querySelector('.lc-accept').addEventListener('click', function () { choose(true); });
    toggle.addEventListener('click', show);
    panel.addEventListener('keydown', function (event) { if (event.key === 'Escape') choose(false); });
    var choice = readChoice();
    if (choice) { hide(); if (choice.analytics) startAnalytics(); else clearAnalyticsCookies(); }
    else clearAnalyticsCookies();
    window.addEventListener('storage', function (event) {
      if (event.key !== key) return;
      var changed = readChoice();
      if (!changed || !changed.analytics) {
        clearAnalyticsCookies();
        if (started) { try { window.ym(counter, 'destruct'); } catch (_) {} location.reload(); }
        else if (changed) hide(); else show();
      } else { hide(); startAnalytics(); }
    });
  }
  window.__lemuriaConsent = {version: version, open: function () { if (panel) show(); }};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
