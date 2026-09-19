/**
 * Jishora Auto-Translation Engine
 * ================================
 * One unified language system for the whole customer site. Instead of requiring
 * every element to be pre-tagged with data-i18n and every phrase pre-written in
 * each language, this walks the page and translates ALL visible text on the fly
 * using a free translation API, then caches the results so it is instant next
 * time. Works on every page, persists across pages, and handles RTL for Arabic.
 *
 * Source language is assumed to be English (the site's authored language).
 * Supported targets: ar, fr, es, de, tr (en = original, no translation).
 *
 * Storage:
 *   - localStorage['jishora_lang']            -> chosen language code
 *   - localStorage['jishora_tcache_<lang>']   -> { "English text": "translated" }
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'jishora_lang';
  var CACHE_PREFIX = 'jishora_tcache_';
  var SUPPORTED = ['en', 'ar', 'fr', 'es', 'de', 'tr'];
  var RTL = ['ar'];

  // Elements whose text must never be translated (code, inputs values, etc.).
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, TEXTAREA: 1, svg: 1, SVG: 1 };
  // Class/attr markers to leave untouched (dynamic values, addresses, amounts).
  function shouldSkipEl(el) {
    if (!el) return true;
    if (el.getAttribute && el.getAttribute('data-no-translate') != null) return true;
    if (el.getAttribute && el.getAttribute('translate') === 'no') return true;
    return false;
  }

  function currentLang() {
    var l = localStorage.getItem(STORAGE_KEY) || 'en';
    return SUPPORTED.indexOf(l) === -1 ? 'en' : l;
  }

  // ── Translation cache (per language) ──
  var memCache = {};
  function loadCache(lang) {
    if (memCache[lang]) return memCache[lang];
    try {
      memCache[lang] = JSON.parse(localStorage.getItem(CACHE_PREFIX + lang) || '{}');
    } catch (e) { memCache[lang] = {}; }
    return memCache[lang];
  }
  var saveTimer = null;
  function saveCache(lang) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(memCache[lang] || {})); } catch (e) {}
    }, 400);
  }

  // ── Free translation API (Google translate public endpoint) ──
  // Returns a Promise resolving to the translated string. Falls back to the
  // original text on any failure so the page never breaks.
  function apiTranslate(text, lang) {
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl='
      + encodeURIComponent(lang) + '&dt=t&q=' + encodeURIComponent(text);
    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data[0]) return text;
        // data[0] is an array of [translatedChunk, originalChunk, ...]
        var out = '';
        for (var i = 0; i < data[0].length; i++) {
          if (data[0][i] && data[0][i][0]) out += data[0][i][0];
        }
        return out || text;
      })
      .catch(function () { return text; });
  }

  // Translate an array of unique strings, using cache first, API for the rest.
  // Returns a Promise resolving to a map { original: translated }.
  function translateBatch(texts, lang) {
    var cache = loadCache(lang);
    var need = [];
    texts.forEach(function (t) {
      if (cache[t] == null) need.push(t);
    });
    if (need.length === 0) return Promise.resolve(cache);

    // Translate each needed string (in parallel, capped). The public endpoint
    // handles one q per call reliably; we limit concurrency to be gentle.
    var CONCURRENCY = 6;
    var idx = 0;
    function worker() {
      if (idx >= need.length) return Promise.resolve();
      var mine = need[idx++];
      return apiTranslate(mine, lang).then(function (res) {
        cache[mine] = res;
        return worker();
      });
    }
    var workers = [];
    for (var i = 0; i < CONCURRENCY; i++) workers.push(worker());
    return Promise.all(workers).then(function () {
      saveCache(lang);
      return cache;
    });
  }

  // ── DOM collection ──
  // Gather translatable text nodes + placeholder attributes.
  function collectTargets() {
    var textNodes = [];
    var placeholders = [];

    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var raw = node.nodeValue;
        if (!raw) return NodeFilter.FILTER_REJECT;
        var txt = raw.trim();
        if (!txt) return NodeFilter.FILTER_REJECT;
        // Ignore pure numbers / symbols / currency / codes.
        if (!/[A-Za-z]/.test(txt)) return NodeFilter.FILTER_REJECT;
        var p = node.parentNode;
        while (p && p !== document.body) {
          if (SKIP_TAGS[p.tagName] || shouldSkipEl(p)) return NodeFilter.FILTER_REJECT;
          // Skip the language selector itself and elements we mark dynamic.
          if (p.id === 'langSelector') return NodeFilter.FILTER_REJECT;
          if (p.classList && (p.classList.contains('no-translate') ||
              p.classList.contains('amount') || p.classList.contains('user-id'))) return NodeFilter.FILTER_REJECT;
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = walker.nextNode())) textNodes.push(n);

    // Placeholders on inputs.
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(function (el) {
      if (shouldSkipEl(el)) return;
      var ph = el.getAttribute('placeholder');
      if (ph && ph.trim() && /[A-Za-z]/.test(ph)) placeholders.push(el);
    });

    return { textNodes: textNodes, placeholders: placeholders };
  }

  // Remember each node's ORIGINAL English text so switching languages (or back
  // to English) always translates from the true source, never a translation.
  function originalText(node) {
    if (node.__jishoraOrig == null) node.__jishoraOrig = node.nodeValue;
    return node.__jishoraOrig;
  }
  function originalPlaceholder(el) {
    if (el.__jishoraOrigPh == null) el.__jishoraOrigPh = el.getAttribute('placeholder');
    return el.__jishoraOrigPh;
  }

  var translating = false;

  // Main entry: translate the whole page to the given language.
  function translatePage(lang) {
    lang = lang || currentLang();
    // RTL / lang attributes regardless of language.
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', RTL.indexOf(lang) !== -1 ? 'rtl' : 'ltr');

    var targets = collectTargets();

    // English = restore originals, no API.
    if (lang === 'en') {
      targets.textNodes.forEach(function (node) {
        if (node.__jishoraOrig != null) node.nodeValue = node.__jishoraOrig;
      });
      targets.placeholders.forEach(function (el) {
        if (el.__jishoraOrigPh != null) el.setAttribute('placeholder', el.__jishoraOrigPh);
      });
      return;
    }

    if (translating) return;
    translating = true;

    // Build the unique set of original English strings to translate.
    var uniques = {};
    targets.textNodes.forEach(function (node) {
      var orig = originalText(node);
      var key = orig.trim();
      if (key) uniques[key] = true;
    });
    targets.placeholders.forEach(function (el) {
      var orig = originalPlaceholder(el);
      if (orig && orig.trim()) uniques[orig.trim()] = true;
    });

    var list = Object.keys(uniques);
    if (!list.length) { translating = false; return; }

    translateBatch(list, lang).then(function (map) {
      // Apply, preserving each node's original leading/trailing whitespace.
      targets.textNodes.forEach(function (node) {
        var orig = originalText(node);
        var key = orig.trim();
        var tr = map[key];
        if (tr != null) {
          node.nodeValue = orig.replace(key, tr);
        }
      });
      targets.placeholders.forEach(function (el) {
        var orig = originalPlaceholder(el);
        var tr = map[(orig || '').trim()];
        if (tr != null) el.setAttribute('placeholder', tr);
      });
      translating = false;
    }).catch(function () { translating = false; });
  }

  // ── Language selector wiring ──
  function setLanguage(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = 'en';
    localStorage.setItem(STORAGE_KEY, lang);
    updateSelectorUI(lang);
    translatePage(lang);
  }

  function updateSelectorUI(lang) {
    var dropdown = document.getElementById('langDropdown');
    var flagEl = document.getElementById('langFlag');
    var labelEl = document.getElementById('langLabel');
    if (!dropdown) return;
    var opt = dropdown.querySelector('[data-lang="' + lang + '"]');
    dropdown.querySelectorAll('.lang-option').forEach(function (o) { o.classList.remove('active'); });
    if (opt) {
      opt.classList.add('active');
      if (flagEl && opt.dataset.flag) { flagEl.src = opt.dataset.flag; flagEl.alt = opt.dataset.flagAlt || ''; }
      if (labelEl && opt.dataset.label) labelEl.textContent = opt.dataset.label;
    }
  }

  function wireSelector() {
    var selector = document.getElementById('langSelector');
    var btn = document.getElementById('langBtn');
    var dropdown = document.getElementById('langDropdown');
    if (!btn || !dropdown) return;

    // Other pages have their OWN inline click handlers on the button/options
    // (they double-toggle the dropdown and cancel each other out). Strip ALL
    // pre-existing listeners by cloning each node, then bind only ours — so the
    // engine is the single owner of the selector on every page.
    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    btn = newBtn;

    updateSelectorUI(currentLang());

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = selector.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    dropdown.querySelectorAll('.lang-option').forEach(function (opt) {
      var newOpt = opt.cloneNode(true);
      opt.parentNode.replaceChild(newOpt, opt);
      newOpt.addEventListener('click', function (e) {
        e.stopPropagation();
        setLanguage(newOpt.dataset.lang);
        selector.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', function () {
      selector.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') selector.classList.remove('open');
    });
  }

  // Re-translate when new content is added dynamically (live-data, lists, etc.)
  // Debounced so rapid DOM changes don't spam the translator.
  var reTimer = null;
  function watchDynamicContent() {
    var obs = new MutationObserver(function () {
      var lang = currentLang();
      if (lang === 'en') return;
      clearTimeout(reTimer);
      reTimer = setTimeout(function () { translatePage(lang); }, 500);
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function init() {
    wireSelector();
    var lang = currentLang();
    if (lang !== 'en') {
      // Small delay so page scripts finish injecting their initial content.
      setTimeout(function () { translatePage(lang); }, 150);
    }
    watchDynamicContent();
  }

  // Expose for other scripts.
  window.JishoraI18n = {
    setLanguage: setLanguage,
    translatePage: translatePage,
    currentLang: currentLang
  };
  // Back-compat shims for old code that called these.
  window.translatePage = function () { translatePage(currentLang()); };
  window.applyLang = function (opt) { if (opt && opt.dataset) setLanguage(opt.dataset.lang); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
