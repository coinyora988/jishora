/**
 * ProxyPlan model.
 *
 * A SINGLE global sequence plan that applies to EVERY proxy account
 * (users.is_proxy = 1). Set once from the admin Proxy Accounts page; every
 * proxy account then follows the same run (deposit/orders/target + up to 3
 * combos). Regular customers are NOT affected — they use their own
 * per-user SequencePlan.
 *
 * Stored as a JSON blob in the settings table under a single key, so there is
 * exactly one global config (no per-account rows to manage).
 */

const Settings = require('./Settings');
const seq = require('../utils/sequencePlan');

const KEY = 'proxy_sequence_plan';

class ProxyPlan {
  /**
   * Read the raw saved global proxy plan config, or null if none set.
   * Shape: { deposit, orders, targetTotal, combos:[{order,recharge,profit}] }
   */
  static async getConfig() {
    const raw = await Settings.get(KEY);
    if (!raw) return null;
    try {
      const cfg = JSON.parse(raw);
      if (!cfg || !(Number(cfg.deposit) > 0)) return null;
      return cfg;
    } catch (_) {
      return null;
    }
  }

  /**
   * Save the global proxy plan config (validated by the caller/controller).
   * @param {object} cfg { deposit, orders, targetTotal, combos:[...] }
   */
  static async saveConfig(cfg) {
    await Settings.setMany({ [KEY]: JSON.stringify(cfg) });
  }

  /**
   * Remove the global proxy plan (disables it for all proxy accounts).
   */
  static async clear() {
    await Settings.setMany({ [KEY]: '' });
  }

  /**
   * Build a fresh schedule for the global plan (used both for preview and to
   * drive a proxy account's grab). Returns the full plan object from
   * sequencePlan.createPlan, or null if no config is set.
   *
   * NOTE: the schedule uses RANDOM order amounts/commissions, so build it once
   * per run and reuse; here we build on demand per grab, which is fine because
   * only the ENTRY for the current order number is used and every order's
   * commission still comes from a valid split that sums to the target across a
   * full run (the amounts vary per grab but the plan's totals are fixed).
   */
  static buildPlan(cfg) {
    if (!cfg) return null;
    return seq.createPlan(Number(cfg.deposit), {
      orders: cfg.orders,
      targetTotal: cfg.targetTotal,
      combos: cfg.combos
    });
  }
}

module.exports = { ProxyPlan, PROXY_PLAN_KEY: KEY };
