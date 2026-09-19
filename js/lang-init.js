/**
 * lang-init.js — now a thin loader for the unified auto-translation engine.
 *
 * The old per-key / data-i18n system was replaced by js/auto-translate.js,
 * which translates ALL page text automatically and works across every page.
 * This file simply ensures the engine is loaded (so existing pages that only
 * include lang-init.js still get full translation), then does nothing else.
 */
(function () {
  if (window.JishoraI18n) return; // already loaded
  if (document.querySelector('script[data-jishora-i18n]')) return;
  var s = document.createElement('script');
  s.src = 'js/auto-translate.js';
  s.setAttribute('data-jishora-i18n', '1');
  document.head.appendChild(s);
})();
