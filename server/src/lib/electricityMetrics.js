function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyElectricity(snapshot, config) {
  if (!snapshot) return 'unknown';
  const purchased = finiteNumber(snapshot.purchasedRemaining);
  const total = finiteNumber(snapshot.totalRemaining);
  if (total !== null && total < Number(config.lowTotalThreshold)) return 'critical';
  if (purchased !== null && purchased < Number(config.lowPurchaseThreshold)) return 'low';
  return purchased === null && total === null ? 'unknown' : 'normal';
}

function calculateUsageStats(snapshots = [], current = null) {
  const ordered = [...snapshots].sort((a, b) => String(a.snapshotDate).localeCompare(String(b.snapshotDate)));
  const validUsage = ordered
    .map((item) => finiteNumber(item.todayUse))
    .filter((value) => value !== null && value > 0)
    .slice(-7);
  const averageDailyUse = validUsage.length ? validUsage.reduce((sum, value) => sum + value, 0) / validUsage.length : null;
  const totalRemaining = finiteNumber(current?.totalRemaining);
  const estimatedDaysRemaining = validUsage.length >= 3 && averageDailyUse > 0 && totalRemaining !== null
    ? Math.max(0, totalRemaining / averageDailyUse)
    : null;
  const previous = ordered.length > 1 ? ordered.at(-2) : null;
  const previousTotal = finiteNumber(previous?.totalRemaining);
  const todayTotal = finiteNumber(current?.totalRemaining);
  const balanceChange = previousTotal !== null && todayTotal !== null ? todayTotal - previousTotal : null;
  return { averageDailyUse, estimatedDaysRemaining, balanceChange, usageSampleDays: validUsage.length };
}

function evaluateLowAlertTransition(previousActive, status) {
  const isLow = status === 'low' || status === 'critical';
  return {
    isLow,
    entered: !previousActive && isLow,
    recovered: Boolean(previousActive) && !isLow,
  };
}

module.exports = { finiteNumber, classifyElectricity, calculateUsageStats, evaluateLowAlertTransition };
