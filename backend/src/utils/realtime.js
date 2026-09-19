/**
 * Realtime (Server-Sent Events) hub for the admin panel.
 *
 * Keeps every open admin browser connected on a single long-lived HTTP stream.
 * Any part of the app can call emit(event, data) and every connected admin
 * receives it in milliseconds — so the admin panel updates INSTANTLY when a
 * customer does something (deposit, withdrawal, order grab/complete, etc.)
 * with no polling delay and no page refresh.
 *
 * One-way (server -> admin). Lightweight, no extra dependencies.
 */

// Set of connected admin response streams.
const clients = new Set();

/**
 * Register a new SSE client (an Express `res` already set up as a stream).
 */
function addClient(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

/**
 * Push an event to every connected admin.
 * @param {string} event  short event name, e.g. 'deposit', 'withdrawal', 'task'
 * @param {object} data   optional payload (kept small; the admin just refetches)
 */
function emit(event, data = {}) {
  const payload = JSON.stringify({ event, data, at: Date.now() });
  for (const res of clients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (e) {
      clients.delete(res);
    }
  }
}

/**
 * How many admins are currently connected (for diagnostics).
 */
function clientCount() {
  return clients.size;
}

// Heartbeat: send a comment line every 25s so proxies/browsers keep the
// connection alive and dead sockets get cleaned up.
setInterval(() => {
  for (const res of clients) {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      clients.delete(res);
    }
  }
}, 25000);

module.exports = { addClient, emit, clientCount };
