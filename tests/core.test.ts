import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "../lib/extraction";
import { aggregate, changes } from "../lib/analytics";
import { matches, Unit } from "../lib/types";
import { demoUnits } from "../lib/demo";
import { publicTarget } from "../worker/safe-fetch";
const unit: Unit = demoUnits[0];
test("tracking supports multiple bedrooms, boundaries, missing data", () => {
  assert.equal(
    matches(unit, { bedrooms: [1, 2], minSqft: 730, maxRent: 3175 }),
    true,
  );
  assert.equal(matches({ ...unit, sqft: undefined }, { minSqft: 700 }), false);
  assert.equal(matches(unit, { floorplans: ["The Bay"] }), false);
});
test("aggregated counts weight mean and median without fake identities", () => {
  const a = aggregate([
    { ...unit, identity: "floorplan", count: 3, rent: 3000 },
    { ...unit, key: "b", count: 1, rent: 4000 },
  ]);
  assert.equal(a.count, 4);
  assert.equal(a.meanRent, 3250);
  assert.equal(a.medianRent, 3000);
  assert.equal(a.identified, 1);
});
test("zero inventory differs from zero-dollar rent", () => {
  const a = aggregate([]);
  assert.equal(a.count, 0);
  assert.equal(a.minRent, null);
  assert.equal(a.dollarsPerSqft, null);
});
test("unit returns, price drops and inventory changes are preserved", () => {
  const e = changes(
    [{ ...unit, rent: 3300 }],
    [unit, { ...unit, key: "unit:204", unitNumber: "204" }],
    new Set(["unit:204"]),
  );
  assert.ok(e.some((x) => x.kind === "price_drop" && x.before === 3300));
  assert.ok(e.some((x) => x.kind === "reappearance"));
  assert.ok(e.some((x) => x.kind === "inventory_change" && x.after === 2));
});
test("threshold crossings are derived from stable unit identity", () => {
  const e = changes([{ ...unit, rent: 3500 }], [unit], new Set([unit.key]), {
    maxRent: 3200,
  });
  assert.ok(e.some((x) => x.kind === "threshold_crossing"));
});
test("count-only floorplans never create unit arrival or removal events", () => {
  const e = changes(
    [{ ...unit, identity: "floorplan", count: 3 }],
    [{ ...unit, identity: "floorplan", count: 1 }],
    new Set(),
  );
  assert.deepEqual(
    e.map((x) => x.kind),
    ["inventory_change"],
  );
});
test("semantic adapter reads monthly rental units and confirmed empty inventory", () => {
  const html =
    '<main data-rental-inventory-complete="true"><div data-rental-unit data-unit-number="101" data-rent="3200" data-currency="USD" data-rent-period="monthly" data-bedrooms="1" data-bathrooms="1" data-sqft="700"></div></main>';
  const x = extract(html, "https://example.com");
  assert.equal(x.complete, true);
  assert.equal(x.units[0].key, "unit:101");
  assert.equal(x.units[0].rent, 3200);
  assert.equal(
    extract(
      '<main data-rental-inventory-complete="true"></main>',
      "https://example.com",
    ).units.length,
    0,
  );
});
test("JSON-LD refuses sale/nightly/unqualified offers and partial pages stay partial", () => {
  assert.throws(
    () =>
      extract(
        '<script type="application/ld+json">{"@type":"Apartment","offers":{"price":3200,"priceCurrency":"USD"}}</script>',
        "https://example.com",
      ),
    /UNSUPPORTED/,
  );
  const x = extract(
    '<script type="application/ld+json">{"@type":"Apartment","unitNumber":"2","numberOfBedrooms":1,"floorSize":{"value":70,"unitCode":"MTK"},"offers":{"price":3200,"priceCurrency":"USD","priceSpecification":{"unitText":"month"}}}</script>',
    "https://example.com",
  );
  assert.equal(x.complete, false);
  assert.ok(x.units[0].sqft! > 750);
});
test("unapproved hosts, credentials and insecure protocols are rejected before fetching", async () => {
  process.env.INGESTION_ALLOWED_HOSTS = "example.com";
  await assert.rejects(publicTarget("https://127.0.0.1"), /approval/);
  await assert.rejects(publicTarget("http://example.com"), /HTTPS/);
  await assert.rejects(publicTarget("https://user:pass@example.com"), /HTTPS/);
});
test("parser omissions never turn a complete-looking page into empty inventory", () => {
  assert.throws(
    () =>
      extract(
        '<main data-rental-inventory-complete="true"><div data-rental-floorplan="Cove" data-rent="3200" data-currency="USD" data-rent-period="monthly"></div></main>',
        "https://example.com",
      ),
    /UNSUPPORTED/,
  );
});
test("a cheaper quote with a different lease is not a price-drop alert", () => {
  const e = changes(
    [{ ...unit, leaseMonths: 12, rent: 3300 }],
    [{ ...unit, leaseMonths: 15 }],
    new Set(),
  );
  assert.ok(e.some((e) => e.kind === "quote_basis_change"));
  assert.ok(!e.some((e) => e.kind === "price_drop"));
});
