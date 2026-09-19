/**
 * ProxyCombo Model
 *
 * GLOBAL combo templates that apply to ALL proxy accounts. A template row is
 * (market_id, trigger_order, amount): "on market X, at the customer's Nth
 * order, show a combo order of this amount." Set once by the admin, it works
 * for every proxy account automatically. Regular (non-proxy) accounts ignore
 * these templates entirely.
 */

const { query } = require('../config/database');

class ProxyCombo {
  /**
   * All templates for a market, ordered by trigger order.
   */
  static async listByMarket(marketId) {
    return await query(
      `SELECT id, market_id, trigger_order, amount
       FROM proxy_combo_templates
       WHERE market_id = ?
       ORDER BY trigger_order ASC`,
      [marketId]
    );
  }

  /**
   * All templates grouped, with market name — for the admin editor.
   */
  static async listAll() {
    return await query(
      `SELECT t.id, t.market_id, t.trigger_order, t.amount, m.name AS market_name, m.slug AS market_slug
       FROM proxy_combo_templates t
       LEFT JOIN markets m ON m.id = t.market_id
       ORDER BY m.id ASC, t.trigger_order ASC`
    );
  }

  /**
   * Replace ALL templates for a market with the given rows (transaction-free
   * simple replace: delete then insert). rows = [{ triggerOrder, amount }].
   */
  static async replaceForMarket(marketId, rows, createdBy = null) {
    await query('DELETE FROM proxy_combo_templates WHERE market_id = ?', [marketId]);
    for (const r of rows) {
      await query(
        `INSERT INTO proxy_combo_templates (market_id, trigger_order, amount, created_by)
         VALUES (?, ?, ?, ?)`,
        [marketId, r.triggerOrder, r.amount, createdBy]
      );
    }
    return rows.length;
  }

  /**
   * Find the global combo amount for a given market + upcoming order number.
   * Runs on a passed connection inside the grab transaction. Returns the
   * amount (number) or null if there is no template at that order for that
   * market.
   */
  static async amountForOrderInTransaction(conn, marketId, upcomingOrderNumber) {
    const [rows] = await conn.execute(
      `SELECT amount FROM proxy_combo_templates
       WHERE market_id = ? AND trigger_order = ?
       LIMIT 1`,
      [marketId, upcomingOrderNumber]
    );
    return rows[0] ? parseFloat(rows[0].amount) : null;
  }
}

module.exports = ProxyCombo;
