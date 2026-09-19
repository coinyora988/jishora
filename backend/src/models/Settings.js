/**
 * Settings Model
 *
 * Thin wrapper over the key/value `settings` table. Admins edit these through
 * the Settings page; some are also read publicly (is_public = 1) to configure
 * the user-facing site (platform name, support links, etc.).
 */

const { query, transaction } = require('../config/database');

class Settings {
  /**
   * Fetch a set of keys as a { key: value } object.
   * @param {string[]} keys
   */
  static async getMany(keys) {
    if (!keys || keys.length === 0) return {};
    const placeholders = keys.map(() => '?').join(', ');
    const rows = await query(
      `SELECT key_name, value FROM settings WHERE key_name IN (${placeholders})`,
      keys
    );
    const out = {};
    rows.forEach((r) => {
      out[r.key_name] = r.value;
    });
    return out;
  }

  /**
   * Fetch a single value, or null if the key is absent.
   */
  static async get(key) {
    const rows = await query('SELECT value FROM settings WHERE key_name = ?', [key]);
    return rows.length ? rows[0].value : null;
  }

  /**
   * All settings that are safe to expose to the public site.
   */
  static async getPublic() {
    const rows = await query('SELECT key_name, value FROM settings WHERE is_public = 1');
    const out = {};
    rows.forEach((r) => {
      out[r.key_name] = r.value;
    });
    return out;
  }

  /**
   * Upsert many key/value pairs atomically.
   *
   * Uses INSERT ... ON DUPLICATE KEY UPDATE so a brand-new key is created and an
   * existing one is overwritten, all within one transaction so a partial save
   * cannot leave settings half-applied.
   *
   * @param {Record<string, string|number|boolean>} pairs
   */
  static async setMany(pairs) {
    const entries = Object.entries(pairs);
    if (entries.length === 0) return;

    await transaction(async (conn) => {
      for (const [key, rawValue] of entries) {
        // Store everything as text; booleans become 'true'/'false' so reads are
        // predictable regardless of the input type.
        const value =
          typeof rawValue === 'boolean' ? String(rawValue) : rawValue == null ? '' : String(rawValue);

        await conn.execute(
          `INSERT INTO settings (key_name, value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value)`,
          [key, value]
        );
      }
    });
  }
}

module.exports = Settings;
