/**
 * Upload Routes
 *
 * Handles profile picture uploads. Before this existed the "Change Photo"
 * button only stored the image in the browser's localStorage, so it never
 * persisted anywhere and vanished on another device.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const { protect } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/rateLimiter');
const User = require('../models/User');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB, matches the hint shown in the UI

// Ensure the destination exists before multer tries to write to it.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Only raster image types the browser can display are accepted.
const ALLOWED_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Never reuse the client-supplied name: it can contain path traversal
    // sequences or collide with another user's file. Derive a random one and
    // take the extension from the validated MIME type instead.
    const ext = ALLOWED_MIME[file.mimetype] || '.bin';
    const random = crypto.randomBytes(16).toString('hex');
    cb(null, `u${req.user.id}-${random}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      // Rejecting by MIME type keeps executable content out of the upload dir.
      return cb(new Error('Only JPG, PNG, GIF and WEBP images are allowed'));
    }
    cb(null, true);
  }
});

/**
 * @desc    Upload or replace the current user's avatar
 * @route   POST /api/upload/avatar
 * @access  Private
 */
router.post('/avatar', protect, uploadLimiter, (req, res, next) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err) {
      // Surface multer's own errors as 400s rather than generic 500s.
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Image must be smaller than 5MB'
          : err.message || 'Upload failed';
      return res.status(400).json({ success: false, message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image was uploaded' });
    }

    try {
      const previous = await User.findById(req.user.id);
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;

      await User.update(req.user.id, { avatar_url: avatarUrl });

      // Remove the old file so the uploads directory does not grow without bound.
      if (previous && previous.avatar_url && previous.avatar_url !== avatarUrl) {
        const oldPath = path.join(UPLOAD_DIR, path.basename(previous.avatar_url));
        // Only unlink inside the avatars directory, and ignore failures: a
        // missing old file must not fail an otherwise successful upload.
        if (oldPath.startsWith(UPLOAD_DIR)) {
          fs.promises.unlink(oldPath).catch(() => {});
        }
      }

      res.json({
        success: true,
        message: 'Profile picture updated',
        data: { avatarUrl }
      });
    } catch (error) {
      next(error);
    }
  });
});

// ── Deposit proof uploads ───────────────────────────────────────────
// Deposit screenshots are stored as real files (previously only the filename
// was sent, so the admin could never actually see the proof). Same rules as
// avatars: random name, validated MIME, size cap.
const PROOF_DIR = path.join(__dirname, '..', '..', 'uploads', 'proofs');
fs.mkdirSync(PROOF_DIR, { recursive: true });

const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROOF_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME[file.mimetype] || '.bin';
    const random = crypto.randomBytes(16).toString('hex');
    cb(null, `p${req.user.id}-${random}${ext}`);
  }
});

const uploadProof = multer({
  storage: proofStorage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      return cb(new Error('Only JPG, PNG, GIF and WEBP images are allowed'));
    }
    cb(null, true);
  }
});

/**
 * @desc    Upload a deposit payment proof screenshot
 * @route   POST /api/upload/deposit-proof
 * @access  Private
 * @returns { proofUrl } — store this on the deposit as proof_image.
 */
router.post('/deposit-proof', protect, uploadLimiter, (req, res, next) => {
  uploadProof.single('proof')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Image must be smaller than 5MB'
          : err.message || 'Upload failed';
      return res.status(400).json({ success: false, message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image was uploaded' });
    }
    res.json({
      success: true,
      message: 'Proof uploaded',
      data: { proofUrl: `/uploads/proofs/${req.file.filename}` }
    });
  });
});

module.exports = router;
