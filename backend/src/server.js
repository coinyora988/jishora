/**
 * Jishora Backend API Server
 * Main entry point for the application
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const walletRoutes = require('./routes/walletRoutes');
const marketRoutes = require('./routes/marketRoutes');
const taskRoutes = require('./routes/taskRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const statsRoutes = require('./routes/statsRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const adminRoutes = require('./routes/adminRoutes');
const setupRoutes = require('./routes/setupRoutes');
const supportRoutes = require('./routes/supportRoutes');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
// helmet() by default sets Cross-Origin-Resource-Policy: same-origin, which
// BLOCKS the frontend (e.g. localhost:3000) from loading images served by this
// API (localhost:5000) — that made uploaded avatars fail to display. Allow
// cross-origin resource loading so static uploads (avatars) can be shown.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS configuration
// Allow the frontend to call the API from any device on the local network
// (the PC via localhost AND phones/tablets via the PC's LAN IP, e.g.
// http://192.168.x.x:3000). We reflect the request origin when it is a
// localhost or private-LAN address on the frontend port; anything else is
// rejected. Set FRONTEND_URL to lock this down to a single origin in prod.
const LAN_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|(?:10|192\.168)\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d+$/;
// Build the set of allowed production origins from FRONTEND_URL. We accept the
// configured origin AND its www/non-www counterpart, so the site works whether
// visitors land on https://jishora.com or https://www.jishora.com. You can also
// list several origins in FRONTEND_URL separated by commas.
function buildAllowedOrigins() {
  const raw = process.env.FRONTEND_URL;
  if (!raw) return null;
  const set = new Set();
  raw.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean).forEach((url) => {
    set.add(url);
    // Add the www <-> non-www counterpart automatically.
    try {
      const u = new URL(url);
      if (u.hostname.startsWith('www.')) {
        set.add(`${u.protocol}//${u.hostname.slice(4)}`);
      } else {
        set.add(`${u.protocol}//www.${u.hostname}`);
      }
    } catch (_) { /* ignore malformed entries */ }
  });
  return set;
}
const ALLOWED_ORIGINS = buildAllowedOrigins();
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser clients (curl, mobile apps) that send no Origin header.
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS) return callback(null, ALLOWED_ORIGINS.has(origin));
    if (LAN_ORIGIN.test(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware. Skip the SSE stream (/api/admin/events): compression
// buffers output and would delay real-time events reaching the admin panel.
app.use(compression({
  filter: (req, res) => {
    if (req.path === '/api/admin/events') return false;
    return compression.filter(req, res);
  }
}));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Jishora API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/setup', setupRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/markets', marketRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);

// Serve uploaded avatars. These are user-supplied files, so they are served
// with a nosniff header and never executed.
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
      // Allow the image to be loaded cross-origin (frontend origin != API).
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  })
);

// 404 handler
app.use(notFound);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Jishora API Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  // Close server & exit process
  process.exit(1);
});

module.exports = app;
