import { Unit } from "./types";
type Observation = Unit & { observedDay?: string };
export function premiumComparisons(
  units: Observation[],
  dimension: "floor" | "size",
) {
  const strata = new Map<string, Map<number, number[]>>();
  for (const u of units) {
    if (
      u.identity !== "unit" ||
      !u.rent ||
      !u.sqft ||
      u.floor === undefined ||
      u.bedrooms === undefined ||
      u.bathrooms === undefined
    )
      continue;
    const context = `${u.bedrooms}bd / ${u.bathrooms}ba · ${dimension === "floor" ? `${u.sqft} sqft` : `Floor ${u.floor}`} · ${u.leaseMonths ? `${u.leaseMonths} mo lease` : "lease unknown"}${u.observedDay ? ` · ${u.observedDay}` : ""}`;
    const groups = strata.get(context) || new Map<number, number[]>();
    const key = dimension === "floor" ? u.floor : u.sqft;
    groups.set(key, [...(groups.get(key) || []), u.rent / u.sqft]);
    strata.set(context, groups);
  }
  return [...strata].flatMap(([context, groups]) => {
    const keys = [...groups.keys()].sort((a, b) => a - b);
    if (keys.length < 2) return [];
    const base = keys[0],
      values = groups.get(base)!;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return keys.slice(1).map((key) => {
      const values = groups.get(key)!;
      const current = values.reduce((a, b) => a + b, 0) / values.length;
      return {
        context,
        base,
        key,
        deltaPct: (current / mean - 1) * 100,
        meanPerSqft: current,
        observations: values.length,
        baselineObservations: groups.get(base)!.length,
      };
    });
  });
}
