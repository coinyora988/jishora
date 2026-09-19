/**
 * Jishora Frontend Configuration
 *
 * Single source of truth for the API base URL, used by every page/script.
 * It resolves in this priority order:
 *
 *   1. window.JISHORA_API_BASE  — an explicit override. Set this in production
 *      (e.g. in an inline <script> before this file, or by editing the value
 *      below) to point at your deployed backend, e.g.
 *        window.JISHORA_API_BASE = 'https://api.jishora.com/api';
 *
 *   2. Local development — when the site is opened on localhost / 127.0.0.1 or
 *      a private-LAN IP (phone/tablet on the same network), the backend runs on
 *      port 5000, so we build  <protocol>//<hostname>:5000/api  automatically.
 *      This keeps `node serve.js` + `node src/server.js` working with no config.
 *
 *   3. Production default — on any other (real) domain, use a SAME-ORIGIN "/api"
 *      path. Use this when the frontend and backend are served behind one domain
 *      (e.g. a reverse proxy that forwards /api to the backend).
 *
 * On Railway the frontend and backend get DIFFERENT domains, so set
 * window.JISHORA_API_BASE (option 1) to your backend's URL. The easiest way is
 * to edit PROD_API_BASE below once, commit, and redeploy.
 */
(function () {
  // ── EDIT THIS in production if the backend is on a different domain ──
  // Example (Railway with a custom domain):  'https://api.jishora.com/api'
  // Example (Railway default domain):        'https://jishora-api-production.up.railway.app/api'
  // Leave as '' to use the automatic rules (local dev, or same-origin /api).
  var PROD_API_BASE = '';

  var LAN = /^(localhost|127\.0\.0\.1|(?:10|192\.168)\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

  function resolve() {
    // 1) Explicit runtime override wins.
    if (typeof window !== 'undefined' && window.JISHORA_API_BASE) {
      return String(window.JISHORA_API_BASE).replace(/\/+$/, '');
    }
    // 1b) Build-time override baked into this file.
    if (PROD_API_BASE) return PROD_API_BASE.replace(/\/+$/, '');

    var host = window.location.hostname;
    // 2) Local / LAN development -> backend on :5000.
    if (LAN.test(host)) {
      return window.location.protocol + '//' + host + ':5000/api';
    }
    // 3) Production default -> same-origin /api.
    return window.location.origin + '/api';
  }

  var base = resolve();
  // Expose for all scripts. Both names are provided because existing files use
  // either API_BASE_URL or API_URL.
  window.JISHORA_API_BASE = base;
  window.API_BASE_URL = base;
  window.API_URL = base;
})();
