/**
 * Sequence-plan earnings model (multi-combo).
 *
 * A "sequence" is one run of N orders (default 25) tied to a customer's
 * deposit. The customer finishes the whole run with a TARGET total balance.
 *
 * A plan can have UP TO 8 combos. Each combo appears on a given order number
 * and requires the customer to recharge `recharge` (added to their balance) to
 * submit it; it pays `profit` commission. The LEFTOVER profit (after the combo
 * profits) is spread across ALL the NON-combo orders as different commissions
 * (Option A). Every non-combo order also shows a different ORDER AMOUNT that is
 * always within the customer's deposit (so it's affordable).
 *
 * Money model (example, $20 tier, 1 combo):
 *   outlay        = deposit + sum(recharges)          = 20 + 8  = 28
 *   totalProfit   = target - outlay                   = 40 - 28 = 12
 *   comboProfits  = sum(combo profits)                = 5
 *   normalPool    = totalProfit - comboProfits        = 12 - 5  = 7
 *   normalPool is split across the non-combo orders as distinct commissions.
 *   Final balance after all orders = target.
 *
 * Example ($50 tier, 3 combos): recharges 38+87+153=278, outlay 328,
 * totalProfit 182, comboProfits 15+29+40=84, normalPool 98.
 */

// Default tiers. `range` (optional) [min,max] matches a deposit band; else an
// exact `deposit` matches. combos: [{ order, recharge, profit }].
const DEFAULT_TIERS = [
  {
    deposit: 20,
    orders: 25,
    targetTotal: 40,
    combos: [{ order: 15, recharge: 8, profit: 5 }]
  },
  {
    deposit: 30,
    orders: 25,
    targetTotal: 66,
    combos: [{ order: 18, recharge: 17, profit: 11 }]
  },
  {
    deposit: 50,
    orders: 25,
    targetTotal: 510,
    combos: [
      { order: 10, recharge: 38, profit: 15 },
      { order: 18, recharge: 87, profit: 29 },
      { order: 23, recharge: 153, profit: 40 }
    ]
  },
  {
    // 70–100 band. Target fixed at 760 for the band (admin can override per
    // customer). The combos are the same across the band.
    range: [70, 100],
    deposit: 70,
    orders: 25,
    targetTotal: 760,
    combos: [
      { order: 11, recharge: 74, profit: 36 },
      { order: 19, recharge: 130, profit: 85 },
      { order: 23, recharge: 215, profit: 118 }
    ]
  }
];

// Round to cents.
function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Normalise a combos array: keep valid { order, recharge, profit }, sorted by
// order, de-duplicated by order, capped at 8.
function normaliseCombos(combos) {
  if (!Array.isArray(combos)) return [];
  const seen = new Set();
  const out = [];
  const MAX_COMBOS = 8;
  combos
    .map((c) => ({
      order: Math.floor(Number(c.order) || 0),
      recharge: r2(c.recharge),
      profit: r2(c.profit)
    }))
    .filter((c) => c.order >= 1 && c.recharge >= 0 && c.profit >= 0)
    .sort((a, b) => a.order - b.order)
    .forEach((c) => {
      if (out.length < MAX_COMBOS && !seen.has(c.order)) {
        seen.add(c.order);
        out.push(c);
      }
    });
  return out;
}

/**
 * Find the default tier for a deposit: exact `deposit` match first, then a
 * `range` band match, then the nearest tier by deposit.
 */
function findTier(deposit) {
  let tier = DEFAULT_TIERS.find((t) => t.range == null && r2(t.deposit) === deposit);
  if (tier) return tier;
  tier = DEFAULT_TIERS.find((t) => Array.isArray(t.range) && deposit >= t.range[0] && deposit <= t.range[1]);
  if (tier) return tier;
  // Nearest by deposit distance.
  return DEFAULT_TIERS.slice().sort(
    (a, b) => Math.abs((a.deposit || 0) - deposit) - Math.abs((b.deposit || 0) - deposit)
  )[0];
}

/**
 * Resolve plan parameters for a deposit.
 * - Admin override wins for any field it supplies (orders, targetTotal, combos).
 * - Else the matching default tier is used.
 *
 * @param {number} deposit
 * @param {object|null} override { orders, targetTotal, combos:[{order,recharge,profit}] }
 * @returns {object} { deposit, orders, targetTotal, combos:[...] }
 */
function resolvePlanParams(deposit, override = null) {
  deposit = r2(deposit);
  const tier = findTier(deposit);

  const base = {
    deposit,
    orders: tier.orders,
    targetTotal: r2(tier.targetTotal),
    combos: normaliseCombos(tier.combos)
  };

  if (!override) return base;

  return {
    deposit,
    orders: Number(override.orders) > 0 ? Math.floor(Number(override.orders)) : base.orders,
    targetTotal: override.targetTotal != null && override.targetTotal !== ''
      ? r2(override.targetTotal) : base.targetTotal,
    combos: Array.isArray(override.combos) && override.combos.length
      ? normaliseCombos(override.combos) : base.combos
  };
}

/**
 * Split a total (in cents) into `count` DISTINCT positive integers summing to
 * exactly `totalCents`. (Unchanged logic.)
 */
function splitDistinctCents(totalCents, count) {
  totalCents = Math.round(totalCents);
  count = Math.floor(count);

  if (count <= 0) return [];
  if (count === 1) return [totalCents];

  const minSum = (count * (count + 1)) / 2;
  if (totalCents < minSum) {
    const base = Math.floor(totalCents / count);
    const parts = new Array(count).fill(base);
    let rem = totalCents - base * count;
    for (let i = 0; rem > 0; i = (i + 1) % count, rem--) parts[i] += 1;
    return parts;
  }

  const gaps = new Array(count).fill(1);
  let leftover = totalCents - minSum;

  for (let i = 0; i < count - 1 && leftover > 0; i++) {
    const weight = count - i;
    const maxUnits = Math.floor(leftover / weight);
    if (maxUnits <= 0) continue;
    const units = 1 + Math.floor(Math.random() * maxUnits);
    gaps[i] += units;
    leftover -= units * weight;
  }
  if (leftover > 0) {
    gaps[count - 1] += leftover;
    leftover = 0;
  }

  const parts = [];
  let running = 0;
  for (let i = 0; i < count; i++) {
    running += gaps[i];
    parts.push(running);
  }

  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts;
}

/**
 * Build `count` random order amounts (in CENTS) for the normal orders. Every
 * amount is between a floor and the deposit cap (never above the deposit).
 */
function buildOrderAmounts(count, deposit) {
  const capCents = Math.max(1, Math.round(deposit * 100));
  const floorCents = Math.max(1, Math.round(capCents * 0.4));
  const out = [];
  for (let i = 0; i < count; i++) {
    const span = capCents - floorCents;
    const amt = floorCents + (span > 0 ? Math.floor(Math.random() * (span + 1)) : 0);
    out.push(amt);
  }
  return out;
}

/**
 * Build the full per-order schedule for resolved params with multiple combos.
 *
 * @param {object} params { deposit, orders, targetTotal, combos:[{order,recharge,profit}] }
 * @returns {object} {
 *   deposit, orders, targetTotal, combos, outlay, totalProfit, comboProfitTotal,
 *   normalPool,
 *   schedule: [ { order, isCombo, commission, orderAmount?, comboAmount? }, ... ]
 * }
 */
function buildSchedule(params) {
  const { deposit, orders, targetTotal } = params;
  const combos = normaliseCombos(params.combos);

  const rechargeTotal = r2(combos.reduce((s, c) => s + c.recharge, 0));
  const comboProfitTotal = r2(combos.reduce((s, c) => s + c.profit, 0));
  const outlay = r2(deposit + rechargeTotal);
  const totalProfit = r2(targetTotal - outlay);
  const normalPool = r2(totalProfit - comboProfitTotal); // across NON-combo orders

  const comboByOrder = {};
  combos.forEach((c) => { comboByOrder[c.order] = c; });

  const normalCount = orders - combos.length;
  const poolCents = Math.round(Math.max(0, normalPool) * 100);
  const distinct = splitDistinctCents(poolCents, normalCount);
  const orderAmounts = buildOrderAmounts(normalCount, deposit);

  const schedule = [];
  let di = 0;
  for (let order = 1; order <= orders; order++) {
    if (comboByOrder[order]) {
      const c = comboByOrder[order];
      schedule.push({
        order,
        isCombo: true,
        commission: r2(c.profit),
        comboAmount: r2(c.recharge)  // recharge required for this combo
      });
    } else {
      schedule.push({
        order,
        isCombo: false,
        orderAmount: r2((orderAmounts[di] || 0) / 100),
        commission: r2((distinct[di] || 0) / 100)
      });
      di += 1;
    }
  }

  return {
    deposit: r2(deposit),
    orders,
    targetTotal: r2(targetTotal),
    combos,
    outlay,
    totalProfit,
    comboProfitTotal,
    normalPool,
    schedule
  };
}

/**
 * Convenience: resolve params (tier/override) and build the schedule.
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
  normaliseCombos,
  findTier,
  resolvePlanParams,
  splitDistinctCents,
  buildOrderAmounts,
  buildSchedule,
  createPlan,
  sumCommissions
};
