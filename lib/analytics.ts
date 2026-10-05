import { Unit, Event, Rule, matches } from "./types";
export function aggregate(units: Unit[]) {
  const priced = units.filter((u) => u.rent !== undefined && u.count > 0);
  const n = priced.reduce((s, u) => s + u.count, 0);
  const sorted = [...priced].sort((a, b) => a.rent! - b.rent!);
  const rank = (r: number) => {
    let c = 0;
    return sorted.find((u) => (c += u.count) > r)?.rent;
  };
  return {
    count: units.reduce((s, u) => s + u.count, 0),
    minRent: priced.length ? Math.min(...priced.map((u) => u.rent!)) : null,
    meanRent: n ? priced.reduce((s, u) => s + u.rent! * u.count, 0) / n : null,
    medianRent: n
      ? (rank(Math.floor((n - 1) / 2))! + rank(Math.floor(n / 2))!) / 2
      : null,
    dollarsPerSqft: (() => {
      const p = priced.filter((u) => u.sqft && u.sqft > 0);
      const c = p.reduce((s, u) => s + u.count, 0);
      return c
        ? p.reduce((s, u) => s + (u.rent! / u.sqft!) * u.count, 0) / c
        : null;
    })(),
    identified: units.filter((u) => u.identity === "unit").length,
  };
}
export function changes(
  previous: Unit[],
  current: Unit[],
  seen: Set<string>,
  rule: Rule = {},
): Event[] {
  const events: Event[] = [];
  const old = new Map(previous.map((u) => [u.key, u]));
  const now = new Map(current.map((u) => [u.key, u]));
  for (const u of current) {
    const p = old.get(u.key);
    if (!p && u.identity === "unit")
      events.push({
        kind: seen.has(u.key) ? "reappearance" : "new_unit",
        unitKey: u.key,
        message: `${u.unitNumber || u.key} ${seen.has(u.key) ? "returned" : "became available"}`,
      });
    if (
      p?.rent !== undefined &&
      u.rent !== undefined &&
      (u.rent !== p.rent || u.leaseMonths !== p.leaseMonths)
    ) {
      const comparable =
        u.leaseMonths === p.leaseMonths &&
        u.currency === p.currency &&
        u.rentBasis === p.rentBasis;
      events.push({
        kind: comparable
          ? u.rent < p.rent
            ? "price_drop"
            : "price_increase"
          : "quote_basis_change",
        unitKey: u.key,
        before: p.rent,
        after: u.rent,
        message: comparable
          ? `${u.unitNumber || u.floorplan || u.key}: $${p.rent} → $${u.rent}`
          : `${u.unitNumber || u.key}: quote basis changed (${p.leaseMonths ?? "unknown"} → ${u.leaseMonths ?? "unknown"} month lease); price comparison suppressed`,
      });
    }
    if (p && !matches(p, rule) && matches(u, rule))
      events.push({
        kind: "threshold_crossing",
        unitKey: u.key,
        message: `${u.unitNumber || u.key} now matches your filters`,
      });
  }
  for (const u of previous)
    if (u.identity === "unit" && !now.has(u.key))
      events.push({
        kind: "removed_unit",
        unitKey: u.key,
        message: `${u.unitNumber || u.key} is no longer listed (rental not confirmed)`,
      });
  const a = aggregate(previous.filter((u) => matches(u, rule))).count,
    b = aggregate(current.filter((u) => matches(u, rule))).count;
  if (a !== b)
    events.push({
      kind: "inventory_change",
      before: a,
      after: b,
      message: `Matching inventory changed from ${a} to ${b}`,
    });
  return events;
}
export function premiums(units: Unit[], field: "floor" | "sqft") {
  const rows = units.filter(
    (u) =>
      u.identity === "unit" &&
      u.rent !== undefined &&
      u.sqft &&
      u[field] !== undefined,
  );
  const buckets = new Map<string, number[]>();
  for (const u of rows) {
    const key = `${u.bedrooms ?? "?"}BR / ${u.bathrooms ?? "?"}BA / ${field === "floor" ? `${u.sqft} sqft / floor ${u.floor}` : `${u.sqft} sqft`}`;
    const a = buckets.get(key) || [];
    a.push(u.rent! / u.sqft!);
    buckets.set(key, a);
  }
  return {
    sampleSize: rows.length,
    buckets: [...buckets.entries()].map(([name, v]) => ({
      name,
      meanPerSqft: v.reduce((a, b) => a + b, 0) / v.length,
    })),
    note: "Descriptive asking prices only; floor, view, lease term and time can confound comparisons.",
  };
}
