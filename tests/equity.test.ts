import { test } from "node:test";
import assert from "node:assert/strict";
import { extractEquity, assignedJson } from "../lib/adapters/equity";
import { premiumComparisons } from "../lib/premiums";
import { demoUnits } from "../lib/demo";
const unit = {
  LedgerId: "1",
  BuildingId: "01",
  UnitId: "101",
  BestTerm: { Length: 12, Price: 3200 },
  SqFt: 730,
  Bed: 1,
  Bath: 1,
  FloorplanName: "Cove",
  Floor: "Floor 1",
  AvailableDate: "10/10/2026",
  Amenities: [{ Name: "Balcony" }],
};
function fixture(units: unknown[], count = units.length) {
  return `<h1>Sample property</h1><script type="application/ld+json">{"@type":"Product","offers":{"priceCurrency":"USD"}}</script><div id="unit-availability-tile"><a>All (${count})</a></div><script>ea5.unitAvailability = ${JSON.stringify({ BedroomTypes: [{ AvailableUnits: units }], PremiumUnits: [] })};</script>`;
}
const url = "https://www.equityapartments.com/sample";
test("Equity normalization preserves compound identity, term, amenities and date", () => {
  const x = extractEquity(fixture([unit]), url);
  assert.equal(x.complete, true);
  assert.equal(x.units[0].key, "unit:1:01:101");
  assert.equal(x.units[0].leaseMonths, 12);
  assert.equal(x.units[0].availableDate, "2026-10-10");
  assert.equal(x.units[0].floor, 1);
});
test("Equity empty complete inventory versus changed or partial payload", () => {
  assert.equal(extractEquity(fixture([]), url).complete, true);
  assert.equal(extractEquity(fixture([unit], 2), url).complete, false);
  assert.equal(
    extractEquity(fixture([unit, { UnitId: "bad" }]), url).complete,
    false,
  );
  assert.throws(
    () => extractEquity("<h1>Access denied</h1>", url),
    /UNSUPPORTED/,
  );
});
test("assigned payload parsing handles braces and escaped quotes without executing code", () => {
  const quoted = { text: 'brace } and "quote"' };
  assert.deepEqual(
    assignedJson(`marker = ${JSON.stringify(quoted)}; ignored()`, "marker ="),
    quoted,
  );
  assert.deepEqual(
    assignedJson('marker = {"text":"brace }"}; dangerous()', "marker ="),
    { text: "brace }" },
  );
  assert.throws(() => assignedJson("marker = {oops}", "marker ="));
  assert.throws(
    () => extractEquity(fixture([unit]), "https://evil.example"),
    /hostname/,
  );
});
test("floor and size premiums require comparable strata, known floor and unit identity", () => {
  const u = demoUnits[0];
  const floor = premiumComparisons(
    [
      { ...u, floor: 1, rent: 3000 },
      { ...u, floor: 2, rent: 3300 },
    ],
    "floor",
  );
  assert.equal(floor.length, 1);
  assert.ok(Math.abs(floor[0].deltaPct - 10) < 0.001);
  assert.equal(
    premiumComparisons([{ ...u, identity: "floorplan" }, u], "floor").length,
    0,
  );
  assert.equal(
    premiumComparisons(
      [
        { ...u, observedDay: "2026-10-01" },
        { ...u, floor: 1, observedDay: "2026-10-02" },
      ],
      "floor",
    ).length,
    0,
  );
});
