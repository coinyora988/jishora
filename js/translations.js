/**
 * translations.js — retired.
 *
 * The hand-maintained per-key translation tables were replaced by the unified
 * auto-translation engine in js/auto-translate.js, which translates all page
 * text automatically (no per-key upkeep) and works on every page.
 *
 * This file is intentionally a no-op so existing <script src="js/translations.js">
 * includes keep working without conflicting with the new engine. It ensures the
 * engine is present, then defers everything to it.
 */
(function () {
  if (window.JishoraI18n) return;
  if (document.querySelector('script[data-jishora-i18n]')) return;
  var s = document.createElement('script');
  s.src = 'js/auto-translate.js';
  s.setAttribute('data-jishora-i18n', '1');
  document.head.appendChild(s);
})();
