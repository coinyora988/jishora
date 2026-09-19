/**
 * Market Model
 * Handles marketplace and product operations
 */

const { query } = require('../config/database');

class Market {
  /**
   * Get all markets
   */
  static async getAll(filters = {}) {
    let whereConditions = ['status = "active"'];
    let params = [];

    // The markets table has no `category` column; `slug` is its identifier.
    if (filters.slug) {
      whereConditions.push('slug = ?');
      params.push(filters.slug);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // The column is sort_order; ordering by display_order raised
    // ER_BAD_FIELD_ERROR and made GET /api/markets fail with a 500.
    const markets = await query(
      `SELECT * FROM markets ${whereClause} ORDER BY sort_order ASC`,
      params
    );

    return markets;
  }

  /**
   * Get market by ID
   */
  static async getById(id) {
    const results = await query(
      'SELECT * FROM markets WHERE id = ?',
      [id]
    );
    return results[0] || null;
  }

  /**
   * Get market by name
   */
  static async getByName(name) {
    const results = await query(
      'SELECT * FROM markets WHERE name = ?',
      [name]
    );
    return results[0] || null;
  }

  /**
   * Get products by market
   */
  static async getProducts(marketId) {
    // The products table has no min_balance column; balance eligibility is
    // enforced by the market's band at grab time, not per product.
    const products = await query(
      `SELECT * FROM products 
       WHERE market_id = ? AND status = 'active'
       ORDER BY price ASC`,
      [marketId]
    );
    return products;
  }

  /**
   * Get product by ID
   */
  static async getProductById(productId) {
    const results = await query(
      'SELECT * FROM products WHERE id = ?',
      [productId]
    );
    return results[0] || null;
  }

  /**
   * Create market (admin)
   */
  static async create(marketData) {
    const {
      name, description, slug, logo, minBalance, maxBalance,
      commissionRate, status, sortOrder, vipLevelRequired
    } = marketData;

    // Column list matches the markets table: slug (not category),
    // sort_order (not display_order), plus vip_level_required.
    const result = await query(
      `INSERT INTO markets
         (name, slug, description, logo_url, min_balance, max_balance,
          commission_rate, vip_level_required, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        slug,
        description,
        logo,
        minBalance,
        maxBalance,
        commissionRate,
        vipLevelRequired || 0,
        status || 'active',
        sortOrder || 0
      ]
    );

    return result.insertId;
  }

  /**
   * Update market (admin)
   */
  static async update(id, updates) {
    const allowedFields = [
      'name', 'slug', 'description', 'logo_url', 'min_balance', 'max_balance',
      'commission_rate', 'vip_level_required', 'status', 'sort_order'
    ];
    const fields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });

    if (fields.length === 0) {
      return false;
    }

    values.push(id);
    await query(
      `UPDATE markets SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return true;
  }

  /**
   * Delete market (admin)
   */
  static async delete(id) {
    await query('DELETE FROM markets WHERE id = ?', [id]);
    return true;
  }

  /**
   * Create product (admin)
   */
  static async createProduct(productData) {
    const { marketId, name, description, image, price, commission, minBalance, maxBalance, status } = productData;

    const result = await query(
      `INSERT INTO products (market_id, name, description, image_url, price, commission, min_balance, max_balance, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [marketId, name, description, image, price, commission, minBalance, maxBalance, status || 'active']
    );

    return result.insertId;
  }

  /**
   * Update product (admin)
   */
  static async updateProduct(id, updates) {
    const allowedFields = ['name', 'description', 'image_url', 'price', 'commission', 'min_balance', 'max_balance', 'status'];
    const fields = [];
    const values = [];

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });

    if (fields.length === 0) {
      return false;
    }

    values.push(id);
    await query(
      `UPDATE products SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return true;
  }

  /**
   * Delete product (admin)
   */
  static async deleteProduct(id) {
    await query('DELETE FROM products WHERE id = ?', [id]);
    return true;
  }

  /**
   * Get market statistics (admin)
   */
  static async getStats(marketId) {
    const [stats] = await query(`
      SELECT 
        (SELECT COUNT(*) FROM tasks WHERE market_id = ? AND status = 'completed') as completed_tasks,
        (SELECT COUNT(*) FROM tasks WHERE market_id = ? AND status = 'in_progress') as active_tasks,
        (SELECT SUM(commission) FROM tasks WHERE market_id = ? AND status = 'completed') as total_commission,
        (SELECT COUNT(DISTINCT user_id) FROM tasks WHERE market_id = ?) as unique_users
    `, [marketId, marketId, marketId, marketId]);

    return stats;
  }
}

module.exports = Market;
