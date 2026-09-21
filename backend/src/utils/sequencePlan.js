/**
 * Sequence-plan earnings model.
 *
 * A "sequence" is one run of N orders (default 25) tied to a customer's
 * deposit. The customer should finish the whole run with a TARGET total
 * balance. Example the product owner specified:
 *
 *   deposit        = $20
 *   orders         = 25
 *   target total   = $40   (what the customer ends with after all 25)
 *   combo on order 15-17 : recharge $8, combo profit $5
 *
 *   outlay          = deposit + comboAmount = 20 + 8 = 28
 *   total profit    = target - outlay       = 40 - 28 = 12
 *   combo profit    = 5
 *   remaining pool  = 12 - 5 = 7  -> split across the 24 NORMAL orders as
 *                     DIFFERENT (non-uniform) commissions summing to exactly 7.
 *
 * This module builds, per sequence, an explicit commission schedule: an array
 * with one entry per order number, each marked normal or combo, with the exact
 * commission that order pays. The sum of all commissions + the returned outlay
 * lands the customer exactly on the target.
 */

// Default tier table (option "b"). Keyed by exact deposit amount. Each row is
// the full plan for a customer who deposits that amount. Extend as needed.
const DEFAULT_TIERS = [
  {
    deposit: 20,
    orders: 25,
    targetTotal: 40,
    comboOrder: 15,     // combo appears on this order number (within 15-17)
    comboAmount: 8,     // extra the customer must recharge for the combo order
    comboProfit: 5      // commission the combo order pays
  }
];

// Round to cents.
function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Resolve the plan parameters for a deposit.
 * - If an admin override is supplied it wins (option "a").
 * - Else the matching default tier is used (option "b").
 * - Else a proportional fallback is derived from the closest tier so an
 *   arbitrary deposit still gets a sensible plan.
 *
 * @param {number} deposit         the customer's starting deposit
 * @param {object|null} override   optional admin override:
 *        { orders, targetTotal, comboOrder, comboAmount, comboProfit }
 * @returns {object} resolved plan params
 */
function resolvePlanParams(deposit, override = null) {
  deposit = r2(deposit);

  // Start from an exact-match tier, or the nearest tier as a base.
  let base = DEFAULT_TIERS.find((t) => r2(t.deposit) === deposit);
  if (!base) {
    // Nearest tier by deposit distance (fallback scaling base).
    base = DEFAULT_TIERS.slice().sort(
      (a, b) => Math.abs(a.deposit - deposit) - Math.abs(b.deposit - deposit)
    )[0];
  }

  // Default plan from the tier. If the deposit doesn't match a tier exactly,
  // scale the money figures proportionally to the deposit so the model still
  // holds its shape (profit grows with the deposit).
  const scale = base && base.deposit > 0 ? deposit / base.deposit : 1;
  const scaled = {
    deposit,
    orders: base.orders,
    targetTotal: r2(base.targetTotal * scale),
    comboOrder: base.comboOrder,
    comboAmount: r2(base.comboAmount * scale),
    comboProfit: r2(base.comboProfit * scale)
  };

  if (!override) return scaled;

  // Admin override wins for any field it supplies.
  return {
    deposit,
    orders: Number(override.orders) > 0 ? Math.floor(Number(override.orders)) : scaled.orders,
    targetTotal: override.targetTotal != null ? r2(override.targetTotal) : scaled.targetTotal,
    comboOrder: Number(override.comboOrder) > 0 ? Math.floor(Number(override.comboOrder)) : scaled.comboOrder,
    comboAmount: override.comboAmount != null ? r2(override.comboAmount) : scaled.comboAmount,
    comboProfit: override.comboProfit != null ? r2(override.comboProfit) : scaled.comboProfit
  };
}

/**
 * Split a total (in cents) into `count` DISTINCT positive integers that sum to
 * exactly `totalCents`. Distinct so no two normal orders pay the same amount.
 * Every part is >= 1 cent. Deterministic-ish with a little randomness so runs
 * look organic; always exact.
 *
 * Strategy: start from a strictly increasing base sequence (1,2,3,... = the
 * minimum distinct positive set), then distribute the leftover onto the parts
 * from the top down with small random bumps, keeping them distinct.
 */
function splitDistinctCents(totalCents, count) {
  totalCents = Math.round(totalCents);
  count = Math.floor(count);

  if (count <= 0) return [];
  if (count === 1) return [totalCents];

  // Minimum sum for `count` distinct positive integers is 1+2+...+count.
  const minSum = (count * (count + 1)) / 2;
  if (totalCents < minSum) {
    // Not enough to make them all distinct & positive. Fall back to a near-even
    // split (some may repeat), still summing exactly. This only happens when the
    // pool is tiny relative to the order count.
    const base = Math.floor(totalCents / count);
    const parts = new Array(count).fill(base);
    let rem = totalCents - base * count;
    for (let i = 0; rem > 0; i = (i + 1) % count, rem--) parts[i] += 1;
    return parts;
  }

  // Build a STRICTLY INCREASING sequence, which guarantees all values are
  // distinct. Give each step a random gap >= 1, then scale/adjust so the total
  // is exact.
  //
  // 1) Random positive gaps g[i] >= 1 (i = 0..count-1). The value at position i
  //    is the running sum of gaps, so values are strictly increasing.
  // 2) The base sum of a strictly-increasing set from these gaps is
  //    sum_i ( (count - i) * g[i] ). We start all gaps at 1 (that's the 1..count
  //    minimum, sum = minSum) and then randomly add the leftover to gaps, where
  //    adding 1 to gap[i] raises the total by (count - i). We add to the gap
  //    with the LARGEST weight that still fits, biased randomly, until the
  //    leftover is exactly consumed. This keeps every gap >= 1 (distinct) and
  //    hits the total exactly.
  const gaps = new Array(count).fill(1);
  let leftover = totalCents - minSum; // >= 0

  // Weight of gap i = (count - i). gap 0 has the biggest weight (count).
  // Greedily consume leftover using weights, from small weights up so we can
  // always finish exactly with weight-1 (the last gap, weight 1).
  // We iterate gaps by weight descending but always keep gap[count-1] (weight 1)
  // as the exact-remainder absorber.
  for (let i = 0; i < count - 1 && leftover > 0; i++) {
    const weight = count - i; // >= 2 here
    // Max whole units of this weight we can add without overshooting, leaving
    // the remainder to be absorbed by weight-1 gaps later.
    const maxUnits = Math.floor(leftover / weight);
    if (maxUnits <= 0) continue;
    // Add a random number of units (biased toward spreading it around).
    const units = 1 + Math.floor(Math.random() * maxUnits);
    gaps[i] += units;
    leftover -= units * weight;
  }
  // Absorb any exact remainder with the weight-1 gap (the last one).
  if (leftover > 0) {
    gaps[count - 1] += leftover; // weight 1 -> adds exactly `leftover`
    leftover = 0;
  }

  // Turn gaps into strictly-increasing running sums (all distinct, all >= 1).
  const parts = [];
  let running = 0;
  for (let i = 0; i < count; i++) {
    running += gaps[i];
    parts.push(running);
  }

  // Shuffle order for display variety (distinctness depends on values, not order).
  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts;
}

/**
 * Build the full per-order commission schedule for a resolved plan.
 *
 * @param {object} params resolved plan params (from resolvePlanParams)
 * @returns {object} {
 *   deposit, orders, targetTotal, comboOrder, comboAmount, comboProfit,
 *   totalProfit, normalPool,
 *   schedule: [ { order, isCombo, commission, comboAmount? }, ... ]  // length = orders
 * }
 */
function buildSchedule(params) {
  const {
    deposit, orders, targetTotal, comboOrder, comboAmount, comboProfit
  } = params;

  const outlay = r2(deposit + comboAmount);
  const totalProfit = r2(targetTotal - outlay);
  const normalPool = r2(totalProfit - comboProfit); // shared across normal orders

  const normalCount = orders - 1; // one order is the combo
  const poolCents = Math.round(normalPool * 100);
  const distinct = splitDistinctCents(poolCents, normalCount);

  const schedule = [];
  let di = 0;
  for (let order = 1; order <= orders; order++) {
    if (order === comboOrder) {
      schedule.push({
        order,
        isCombo: true,
        commission: r2(comboProfit),
        comboAmount: r2(comboAmount)
      });
    } else {
      schedule.push({
        order,
        isCombo: false,
        commission: r2((distinct[di] || 0) / 100)
      });
      di += 1;
    }
  }

  return {
    deposit: r2(deposit),
    orders,
    targetTotal: r2(targetTotal),
    comboOrder,
    comboAmount: r2(comboAmount),
    comboProfit: r2(comboProfit),
    totalProfit,
    normalPool,
    schedule
  };
}

/**
 * Convenience: resolve params (tier/override) and build the schedule in one go.
 */
function createPlan(deposit, override = null) {
  const params = resolvePlanParams(deposit, override);
  return buildSchedule(params);
}

/**
 * Sum all commissions in a schedule (for verification/tests).
 */
function sumCommissions(schedule) {
  return r2(schedule.reduce((s, e) => s + (Number(e.commission) || 0), 0));
}

module.exports = {
  DEFAULT_TIERS,
  r2,
  resolvePlanParams,
  splitDistinctCents,
  buildSchedule,
  createPlan,
  sumCommissions
};
