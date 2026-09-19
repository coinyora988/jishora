/**
 * InviteCode Model
 *
 * Admin-generated single-use invite codes. A code is consumed on the
 * registration that uses it (status -> 'used'). Admins create/list/disable
 * these from the Invitations page.
 */

const { query } = require('../config/database');

// Readable alphabet (no ambiguous I/O/0/1), 8 chars, prefixed so admin codes
// are visually distinguishable from user referral codes if desired.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(len = 8) {
  let s = '';
  for (let i = 0; i < len; i += 1) s += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  return s;
}

class InviteCode {
  /**
   * Generate N unique single-use codes. Returns the created rows.
   */
  static async generate(count = 1, createdBy = null, note = null) {
    const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 100);
    const created = [];
    for (let i = 0; i < n; i += 1) {
      // Retry on the rare collision against existing invite/user codes.
      let code = null;
      for (let attempt = 0; attempt < 12 && !code; attempt += 1) {
        const candidate = randomCode();
        const clash = await query(
          `SELECT 1 FROM invite_codes WHERE code = ?
           UNION SELECT 1 FROM users WHERE referral_code = ? LIMIT 1`,
          [candidate, candidate]
        );
        if (!clash.length) code = candidate;
      }
      if (!code) continue;
      const res = await query(
        'INSERT INTO invite_codes (code, status, created_by, note) VALUES (?, "active", ?, ?)',
        [code, createdBy, note]
      );
      created.push({ id: res.insertId, code, status: 'active', note });
    }
    return created;
  }

  /**
   * Paginated list of invite codes with the username that consumed each.
   */
  static async list(page = 1, limit = 20, status = '') {
    const offset = (page - 1) * limit;
    const params = [];
    let where = '';
    if (status && ['active', 'used', 'disabled'].includes(status)) {
      where = 'WHERE ic.status = ?';
      params.push(status);
    }
    const rows = await query(
      `SELECT ic.*, u.username AS used_by_username
       FROM invite_codes ic
       LEFT JOIN users u ON ic.used_by = u.id
       ${where}
       ORDER BY ic.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [{ total }] = await query(
      `SELECT COUNT(*) AS total FROM invite_codes ic ${where}`,
      params
    );
    const [counts] = await query(
      `SELECT
         SUM(status='active') AS active,
         SUM(status='used') AS used,
         SUM(status='disabled') AS disabled
       FROM invite_codes`
    );
    return {
      codes: rows,
      counts: {
        active: Number(counts.active) || 0,
        used: Number(counts.used) || 0,
        disabled: Number(counts.disabled) || 0
      },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    };
  }

  /**
   * Disable an active (unused) code so it can no longer be used.
   */
  static async disable(id) {
    const res = await query(
      "UPDATE invite_codes SET status = 'disabled' WHERE id = ? AND status = 'active'",
      [id]
    );
    return res.affectedRows || 0;
  }

  /**
   * Delete a code (only if not yet used, to preserve history of used ones).
   */
  static async remove(id) {
    const res = await query(
      "DELETE FROM invite_codes WHERE id = ? AND status <> 'used'",
      [id]
    );
    return res.affectedRows || 0;
  }
}

module.exports = InviteCode;
