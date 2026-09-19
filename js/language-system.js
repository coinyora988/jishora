/**
 * language-system.js — retired.
 *
 * Previously a separate translation system used ONLY by login/register with a
 * different storage key ('jishora_language'), which broke persistence with the
 * rest of the site. Replaced by the unified js/auto-translate.js engine (key:
 * 'jishora_lang'). This is now a thin loader so login/register share the exact
 * same language and engine as every other page.
 */
(function () {
  // Migrate any old key value so a language chosen before this change persists.
  try {
    var old = localStorage.getItem('jishora_language');
    if (old && !localStorage.getItem('jishora_lang')) {
      localStorage.setItem('jishora_lang', old);
    }
  } catch (e) {}

  if (window.JishoraI18n) return;
  if (document.querySelector('script[data-jishora-i18n]')) return;
  var s = document.createElement('script');
  s.src = 'js/auto-translate.js';
  s.setAttribute('data-jishora-i18n', '1');
  document.head.appendChild(s);
})();
