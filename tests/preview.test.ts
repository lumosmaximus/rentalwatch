import { test } from "node:test";
import assert from "node:assert/strict";
import { previewSources, capturedAt } from "../lib/preview";
import { matches } from "../lib/types";
test("observed preview includes all captured 726 sqft one-bedroom units", () => {
  const source = previewSources[0];
  assert.equal(source.extraction.method, "equity-ea5-v1");
  assert.ok(Number.isFinite(Date.parse(capturedAt)));
  const units = source.extraction.units.filter(
    (u) =>
      matches(u, { bedrooms: [1] }) &&
      `${u.unitNumber || ""} ${u.floorplan || ""} ${u.sqft || ""}`.includes(
        "726",
      ),
  );
  assert.equal(units.length, 5);
  assert.deepEqual(
    units.map((u) => u.unitNumber),
    ["7209", "2310", "3109", "7307", "8107"],
  );
  assert.ok(units.every((u) => u.identity === "unit" && u.leaseMonths === 12));
});
