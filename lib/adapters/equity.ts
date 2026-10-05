import { load } from "cheerio";
import { z } from "zod";
import { Extraction, Unit } from "../types";
const term = z.object({
  Length: z.number().int().positive(),
  Price: z.number().positive(),
});
const row = z.object({
  LedgerId: z.string().min(1),
  UnitId: z.string().min(1),
  BuildingId: z.string().min(1),
  BestTerm: term,
  SqFt: z.number().positive().optional(),
  Bed: z.number().min(0),
  Bath: z.number().min(0),
  FloorplanName: z.string().optional(),
  Floor: z.string().optional(),
  AvailableDate: z.string().optional(),
  Amenities: z.array(z.object({ Name: z.string() })).optional(),
});
const inventory = z.object({
  BedroomTypes: z.array(z.object({ AvailableUnits: z.array(z.unknown()) })),
  PremiumUnits: z.array(z.unknown()).optional(),
});
// Read JSON only. Never execute scripts from a rental website.
export function assignedJson(script: string, marker: string): unknown {
  const start = script.indexOf(marker);
  if (start < 0) throw new Error("Payload marker missing");
  let i = script.indexOf("{", start + marker.length);
  const first = i;
  if (first < 0) throw new Error("Payload object missing");
  let depth = 0,
    quoted = false,
    escaped = false;
  for (; i < script.length; i++) {
    const ch = script[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0)
      return JSON.parse(script.slice(first, i + 1));
  }
  throw new Error("Incomplete inventory payload");
}
export function extractEquity(html: string, url: string): Extraction {
  const host = new URL(url).hostname;
  if (host !== "www.equityapartments.com" && host !== "equityapartments.com")
    throw new Error(
      "UNSUPPORTED: Equity adapter requires the verified public hostname",
    );
  const $ = load(html);
  let payload: unknown;
  const script = $("script")
    .toArray()
    .map((el) => $(el).text())
    .find((s) => s.includes("ea5.unitAvailability ="));
  if (!script)
    throw new Error(
      "UNSUPPORTED: Equity inventory payload changed or is missing",
    );
  try {
    payload = assignedJson(script, "ea5.unitAvailability =");
  } catch {
    throw new Error("UNSUPPORTED: Equity inventory JSON cannot be parsed");
  }
  const result = inventory.safeParse(payload);
  if (!result.success)
    throw new Error("UNSUPPORTED: Equity inventory schema changed");
  const currency = $('script[type="application/ld+json"]')
    .toArray()
    .some((el) => {
      try {
        return JSON.parse($(el).text()).offers?.priceCurrency === "USD";
      } catch {
        return false;
      }
    });
  if (!currency)
    throw new Error(
      "UNSUPPORTED: Equity monthly quote currency is not confirmed",
    );
  const warnings: string[] = [];
  const units: Unit[] = [];
  const candidates = [
    ...result.data.BedroomTypes.flatMap((b) => b.AvailableUnits),
    ...(result.data.PremiumUnits || []),
  ];
  for (const candidate of candidates) {
    const parsed = row.safeParse(candidate);
    if (!parsed.success) {
      warnings.push("A unit row could not be normalized; inventory is partial");
      continue;
    }
    const u = parsed.data;
    const m = u.AvailableDate?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const availableDate = m
      ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
      : undefined;
    units.push({
      key: `unit:${u.LedgerId.trim()}:${u.BuildingId.trim()}:${u.UnitId.trim()}`,
      identity: "unit",
      unitNumber: u.UnitId.trim(),
      floorplan: u.FloorplanName,
      bedrooms: u.Bed,
      bathrooms: u.Bath,
      sqft: u.SqFt,
      floor: u.Floor?.match(/Floor\s+(\d+)/i)
        ? Number(u.Floor.match(/Floor\s+(\d+)/i)![1])
        : undefined,
      rent: u.BestTerm.Price,
      leaseMonths: u.BestTerm.Length,
      count: 1,
      availableDate,
      features: [...new Set((u.Amenities || []).map((a) => a.Name))],
      currency: "USD",
      rentBasis: "monthly",
    });
  }
  const unique = [...new Map(units.map((u) => [u.key, u])).values()];
  const counts = $("#unit-availability-tile a")
    .toArray()
    .map((el) => $(el).text().trim())
    .map((text) => text.match(/^All\s*\((\d+)\)$/))
    .filter(Boolean);
  const expected = counts[0] ? Number(counts[0]![1]) : undefined;
  const complete =
    warnings.length === 0 &&
    expected !== undefined &&
    expected === unique.length;
  if (!complete)
    warnings.push(
      "Inventory completeness not confirmed against the visible total; removals are suppressed",
    );
  warnings.push(
    "Base monthly asking rent at the best displayed lease term; additional fees and concessions are excluded",
  );
  if (!unique.length && !complete)
    throw new Error(
      "UNSUPPORTED: Equity returned no verifiable full inventory",
    );
  const property = $("h1").first().text().trim();
  let address: string | undefined;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const n = JSON.parse($(el).text());
      if (n["@type"] === "Product") address = n.description;
    } catch {}
  });
  return {
    propertyName: property,
    address,
    units: unique,
    complete,
    method: "equity-ea5-v1",
    warnings: [...new Set(warnings)],
  };
}
