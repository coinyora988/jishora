/**
 * Notification bell badge.
 * Fetches the current user's unread notification count and shows it on any
 * element with id="notifBadge" (a small red dot/number on the bell). Also
 * exposes window.refreshNotifBadge() to refresh after actions.
 *
 * Requires js/api.js (apiRequest) to be loaded first.
 */
(function () {
  function paint(count) {
    // Update every badge element: #notifBadge (legacy) and any .js-notif-badge.
    var badges = [];
    var byId = document.getElementById('notifBadge');
    if (byId) badges.push(byId);
    var byClass = document.querySelectorAll('.js-notif-badge');
    for (var i = 0; i < byClass.length; i++) {
      if (byClass[i] !== byId) badges.push(byClass[i]);
    }
    if (!badges.length) return;

    var n = Number(count) || 0;
    badges.forEach(function (badge) {
      if (n > 0) {
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.style.display = 'inline-flex';
      } else {
        badge.textContent = '';
        badge.style.display = 'none';
      }
    });
  }

  async function refresh() {
    if (typeof apiRequest !== 'function') return;
    try {
      // limit=1 keeps the payload tiny; we only need unreadCount.
      var res = await apiRequest('/user/notifications?limit=1');
      if (res && res.success && res.data) paint(res.data.unreadCount || 0);
    } catch (e) { /* ignore */ }
  }

  window.refreshNotifBadge = refresh;
  document.addEventListener('DOMContentLoaded', refresh);
})();
