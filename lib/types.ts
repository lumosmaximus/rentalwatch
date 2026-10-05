export type Unit = {
  key: string;
  identity: "unit" | "floorplan" | "aggregate";
  unitNumber?: string;
  floorplan?: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  floor?: number;
  rent?: number;
  count: number;
  availableDate?: string;
  leaseMonths?: number;
  features: string[];
  currency: string;
  rentBasis: "monthly";
};
export type Extraction = {
  propertyName?: string;
  address?: string;
  units: Unit[];
  complete: boolean;
  method: string;
  warnings: string[];
};
export type Rule = {
  bedrooms?: number[];
  bathrooms?: number[];
  floorplans?: string[];
  unitKeys?: string[];
  minSqft?: number;
  maxRent?: number;
  availableWithinDays?: number;
};
export type Segment = {
  id: string;
  source_id: string;
  name: string;
  rules: Rule;
  cadence_hours: number;
  enabled: boolean;
  last_evaluated_at?: string;
  next_evaluate_at?: string;
};
export type Event = {
  kind:
    | "price_drop"
    | "price_increase"
    | "quote_basis_change"
    | "new_unit"
    | "removed_unit"
    | "inventory_change"
    | "threshold_crossing"
    | "reappearance";
  unitKey?: string;
  before?: number;
  after?: number;
  message: string;
};
export function matches(u: Unit, r: Rule, now = new Date()): boolean {
  return (
    (!r.bedrooms?.length ||
      (u.bedrooms !== undefined && r.bedrooms.includes(u.bedrooms))) &&
    (!r.bathrooms?.length ||
      (u.bathrooms !== undefined && r.bathrooms.includes(u.bathrooms))) &&
    (!r.floorplans?.length ||
      (!!u.floorplan && r.floorplans.includes(u.floorplan))) &&
    (!r.unitKeys?.length || r.unitKeys.includes(u.key)) &&
    (r.minSqft === undefined ||
      (u.sqft !== undefined && u.sqft >= r.minSqft)) &&
    (r.maxRent === undefined ||
      (u.rent !== undefined && u.rent <= r.maxRent)) &&
    (r.availableWithinDays === undefined ||
      (!!u.availableDate &&
        Date.parse(u.availableDate) <=
          now.getTime() + r.availableWithinDays * 86400000))
  );
}
