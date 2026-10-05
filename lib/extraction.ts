import { load } from "cheerio";
import { Extraction, Unit } from "./types";
import { extractEquity } from "./adapters/equity";
const number = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
type Obj = Record<string, any>; // External JSON-LD is validated field by field below.
function flatten(v: unknown): Obj[] {
  if (Array.isArray(v)) return v.flatMap(flatten);
  if (v && typeof v === "object") {
    const o = v as Obj;
    return [
      o,
      ...Object.values(o)
        .filter((x) => x && typeof x === "object")
        .flatMap(flatten),
    ];
  }
  return [];
}
export function extract(html: string, url: string): Extraction {
  const $ = load(html);
  const warnings: string[] = [];
  const nodes: Obj[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      nodes.push(...flatten(JSON.parse($(el).text())));
    } catch {
      warnings.push("Invalid JSON-LD skipped");
    }
  });
  const units: Unit[] = [];
  let propertyName: string | undefined, address: string | undefined;
  for (const n of nodes) {
    const types = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
    if (
      types.some((t: string) =>
        ["ApartmentComplex", "Residence", "Apartment"].includes(t),
      )
    ) {
      propertyName ||= n.name;
      const a = n.address;
      address ||=
        typeof a === "string"
          ? a
          : a
            ? [
                a.streetAddress,
                a.addressLocality,
                a.addressRegion,
                a.postalCode,
              ]
                .filter(Boolean)
                .join(", ")
            : undefined;
    }
    if (
      !types.some((t: string) =>
        ["Apartment", "Accommodation", "Product"].includes(t),
      )
    )
      continue;
    const o = Array.isArray(n.offers) ? n.offers[0] : n.offers;
    if (!o) continue;
    const availability = String(o.availability || "");
    if (/OutOfStock|SoldOut|Discontinued/.test(availability)) continue;
    const currency = o.priceCurrency || o.priceSpecification?.priceCurrency;
    const spec = o.priceSpecification || {};
    // Only explicit monthly USD rental pricing is normalized; sale/nightly/range offers are not guessed.
    const monthly = /MON|month/i.test(
      String(
        spec.unitCode || spec.unitText || o.pricePeriod || n.rentPeriod || "",
      ),
    );
    if (!monthly || currency !== "USD") {
      warnings.push("Offer omitted: monthly USD rent was not explicit");
      continue;
    }
    const rent = number(o.price ?? spec.price);
    if (!rent) {
      warnings.push("Offer omitted: no exact positive rent");
      continue;
    }
    const sqftNode = n.floorSize;
    let sqft = number(sqftNode?.value);
    if (
      sqft &&
      /MTK|m2|sqm/i.test(String(sqftNode.unitCode || sqftNode.unitText))
    )
      sqft *= 10.7639;
    else if (
      sqft &&
      !/FTK|sqft|square f|ft2/i.test(
        String(sqftNode.unitCode || sqftNode.unitText),
      )
    )
      sqft = undefined;
    const unitNumber = n.unitNumber ? String(n.unitNumber) : undefined;
    const floorplan = n.floorplan ? String(n.floorplan) : undefined;
    const key = unitNumber
      ? `unit:${unitNumber}`
      : floorplan
        ? `plan:${floorplan}`
        : `offer:${String(n["@id"] || n.url || n.name || units.length).slice(0, 120)}`;
    const count = unitNumber ? 1 : number(o.inventoryLevel?.value);
    if (count === undefined || !Number.isInteger(count)) {
      warnings.push(
        "Offer omitted: unit identity or explicit inventory count required",
      );
      continue;
    }
    const amenities = Array.isArray(n.amenityFeature) ? n.amenityFeature : [];
    units.push({
      key,
      identity: unitNumber ? "unit" : floorplan ? "floorplan" : "aggregate",
      unitNumber,
      floorplan,
      bedrooms: number(n.numberOfBedrooms),
      bathrooms: number(n.numberOfBathroomsTotal),
      sqft,
      floor: number(n.floorLevel),
      rent,
      count,
      availableDate: n.availableDate,
      leaseMonths: number(n.leaseLength?.value),
      features: amenities
        .filter((a: Obj) => a.value === true)
        .map((a: Obj) => String(a.name)),
      currency: "USD",
      rentBasis: "monthly",
    });
  }
  // Generic fallback accepts explicit semantic attributes, never free-text dollar guessing.
  $("[data-rental-unit], [data-rental-floorplan]").each((_, el) => {
    const a = $(el);
    const unit = a.attr("data-unit-number");
    const plan = a.attr("data-floorplan") || a.attr("data-rental-floorplan");
    const rent = number(a.attr("data-rent"));
    const count = number(a.attr("data-count"));
    if (
      !rent ||
      a.attr("data-currency") !== "USD" ||
      a.attr("data-rent-period") !== "monthly" ||
      (!unit && (!plan || count === undefined || !Number.isInteger(count)))
    ) {
      warnings.push(
        "Rental row omitted: exact monthly USD rent, stable unit identity or explicit floorplan count required",
      );
      return;
    }
    units.push({
      key: unit ? `unit:${unit}` : `plan:${plan}`,
      identity: unit ? "unit" : "floorplan",
      unitNumber: unit,
      floorplan: plan,
      bedrooms: number(a.attr("data-bedrooms")),
      bathrooms: number(a.attr("data-bathrooms")),
      sqft: number(a.attr("data-sqft")),
      floor: number(a.attr("data-floor")),
      rent,
      count: unit ? 1 : count!,
      availableDate: a.attr("data-available-date"),
      leaseMonths: number(a.attr("data-lease-months")),
      features: [],
      currency: "USD",
      rentBasis: "monthly",
    });
  });
  const unique = [...new Map(units.map((u) => [u.key, u])).values()];
  // Completion must be explicit. Without it we never infer disappeared units or a real zero.
  const complete =
    $('[data-rental-inventory-complete="true"]').length > 0 &&
    warnings.length === 0;
  if (!complete)
    warnings.push(
      "Partial inventory: removals and inventory-change alerts are suppressed",
    );
  if (!unique.length && !complete)
    throw new Error(
      "UNSUPPORTED: No trustworthy monthly rental inventory found. A tested site adapter is required.",
    );
  return {
    propertyName:
      propertyName || $('meta[property="og:title"]').attr("content"),
    address,
    units: unique,
    complete,
    method: nodes.length
      ? "json-ld + semantic attributes"
      : "semantic attributes",
    warnings: [...new Set(warnings)],
  };
}
export const adapterRegistry = {
  equity: { name: "Equity Apartments", verified: true },
  zillow: { name: "Zillow", verified: false },
  apartments: { name: "Apartments.com", verified: false },
  generic: { name: "Structured data / generic", verified: true },
};
export function extractWithAdapter(
  html: string,
  url: string,
  adapter: string,
): Extraction {
  if (adapter === "equity") return extractEquity(html, url);
  const result = extract(html, url);
  if (adapter !== "generic")
    result.warnings.push(
      `${adapter} uses structured-data fallback; proprietary inventory coverage is not verified`,
    );
  return result;
}
