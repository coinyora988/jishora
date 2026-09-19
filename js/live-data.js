/**
 * Jishora Live Data Binder
 *
 * Replaces the hardcoded placeholder values that used to be baked into the
 * HTML (balance "307.68", invitation code "SJK742", username "susanna10")
 * with real values from the API.
 *
 * Usage: mark any element with a data-live attribute and this module fills it.
 *
 *   <span data-live="balance">--</span>
 *   <span data-live="username">--</span>
 *   <div  data-live="referralCode">--</div>
 *   <input data-live="referralLink">
 *
 * Everything comes from a single GET /api/auth/me call, which returns the user,
 * their wallet and their stats together.
 *
 * Requires js/api.js to be loaded first.
 */

(function () {
  'use strict';

  // Placeholder shown while the request is in flight. Never a fake number,
  // so a loading state can't be mistaken for a real balance.
  const LOADING = '--';

  let cache = null;

  /**
   * Resolve each supported data-live key against the API payload.
   * Values are returned already formatted for display.
   */
  function buildBindings(payload) {
    const user = payload.user || {};
    const wallet = payload.wallet || {};
    const stats = payload.stats || {};

    // A user with no wallet row is a broken account, but the UI should still
    // render zeros rather than "undefined".
    const balance = Number(wallet.balance) || 0;
    const frozen = Number(wallet.frozenBalance) || 0;

    // Avatars are served by the API host, not the static frontend host, so the
    // stored relative path needs the API origin prefixed.
    const apiOrigin = API_BASE_URL.replace(/\/api\/?$/, '');
    const avatarUrl = user.avatarUrl ? `${apiOrigin}${user.avatarUrl}` : '';

    const referralCode = user.referralCode || '';
    // Built from the current origin so the link works on localhost and in
    // production without a hardcoded domain.
    const referralLink = referralCode
      ? `${window.location.origin}/register.html?ref=${encodeURIComponent(referralCode)}`
      : '';

    return {
      // Identity
      username: user.username || '',
      email: user.email || '',
      phone: user.phone || '',
      country: user.country || '',
      avatarUrl: avatarUrl,
      vipLevel: `VIP${Number(user.vipLevel) || 0}`,
      vipLevelNumber: String(Number(user.vipLevel) || 0),

      // Referral
      referralCode: referralCode,
      referralLink: referralLink,
      totalReferrals: String(Number(stats.total_referrals) || 0),

      // Wallet, formatted for display
      balance: formatUSDT(balance),
      availableBalance: formatUSDT(balance),
      frozenBalance: formatUSDT(frozen),
      totalDeposited: formatUSDT(wallet.totalDeposited),
      totalWithdrawn: formatUSDT(wallet.totalWithdrawn),
      totalEarned: formatUSDT(wallet.totalEarned),

      // Wallet, raw numbers for scripts that need to do math
      balanceRaw: String(balance),
      frozenBalanceRaw: String(frozen),

      // Task stats
      completedTasks: String(Number(stats.completed_tasks) || 0),
      todayTasks: String(Number(stats.today_tasks) || 0),
      totalCommission: formatUSDT(stats.total_commission)
    };
  }

  /**
   * Write a resolved value into an element, respecting input vs text nodes.
   */
  function applyValue(el, value) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.value = value;
    } else {
      el.textContent = value;
    }
  }

  /**
   * Populate every [data-live] element on the page.
   */
  function render(payload) {
    const bindings = buildBindings(payload);

    document.querySelectorAll('[data-live]').forEach(function (el) {
      const key = el.getAttribute('data-live');
      if (Object.prototype.hasOwnProperty.call(bindings, key)) {
        applyValue(el, bindings[key]);
      } else {
        console.warn(`[live-data] unknown data-live key: "${key}"`);
      }
    });

    // Let page-specific scripts react once real numbers are available.
    document.dispatchEvent(
      new CustomEvent('jishora:data-loaded', { detail: payload })
    );
  }

  /**
   * Show the loading placeholder so no stale or fake value is ever visible.
   */
  function showLoading() {
    document.querySelectorAll('[data-live]').forEach(function (el) {
      // Leave the referral link input blank rather than showing "--" in a field
      // the user might copy.
      const key = el.getAttribute('data-live');
      applyValue(el, key === 'referralLink' ? '' : LOADING);
    });
  }

  /**
   * Fetch the current user's data and bind it to the page.
   * Safe to call again to refresh after a deposit or withdrawal.
   */
  async function load(options) {
    const opts = options || {};

    if (!opts.silent) {
      showLoading();
    }

    const response = await API.getProfile();

    // apiRequest returns null on network failure or after redirecting to login.
    if (!response) {
      return null;
    }

    if (!response.success) {
      showNotification(response.message || 'Could not load your account data', 'error');
      return null;
    }

    cache = response.data;
    render(cache);
    return cache;
  }

  /**
   * Most recently loaded payload, or null if load() has not resolved yet.
   */
  function get() {
    return cache;
  }

  /**
   * Wire up any element marked with data-logout.
   *
   * The markup keeps href="login.html" so it still degrades without JS, but the
   * click must clear the stored token first. Without that, js/auth.js sees a
   * valid token on login.html and redirects to index.html, which looked like
   * "logout goes to the home page".
   */
  function bindLogout() {
    document.querySelectorAll('[data-logout]').forEach(function (el) {
      el.addEventListener('click', function (event) {
        event.preventDefault();
        logoutUser();
      });
    });
  }

  window.LiveData = { load: load, get: get, render: render };

  // Auto-run on protected pages. This file is only included on pages that
  // require a session, so an unauthenticated visitor is sent to login rather
  // than left staring at "--" placeholders forever.
  document.addEventListener('DOMContentLoaded', function () {
    // Logout must work even if the session has already expired.
    bindLogout();

    if (!isAuthenticated()) {
      redirectToLogin();
      return;
    }
    load();
  });
})();
