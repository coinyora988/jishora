/**
 * Minimal static file server for the Jishora frontend.
 *
 * Serves the plain HTML/CSS/JS in this folder on http://localhost:3000 with no
 * external dependencies (uses only Node's built-in http/fs modules). This
 * avoids npm/npx, which PowerShell's execution policy blocks on this machine.
 *
 * Run with:  node serve.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
// Railway (and most PaaS hosts) inject the port to listen on via process.env.PORT.
// Locally there is no PORT set, so we default to 3000 for `node serve.js`.
const PORT = process.env.PORT || 3000;
// Bind all interfaces so the host's router can reach the server (required on
// Railway; also lets phones/tablets reach it on the LAN during local dev).
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

const server = http.createServer((req, res) => {
  try {
    // Strip query string and decode.
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    // Resolve inside ROOT and block path traversal.
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        // Disable caching so edits show up on reload during development.
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Jishora frontend running on ${HOST}:${PORT} (open http://localhost:${PORT}/index.html locally)`);
  console.log(`(serving files from ${ROOT})`);
});
