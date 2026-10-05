import { writeFile } from "node:fs/promises";
import { safeFetch } from "../worker/safe-fetch";
import { extractEquity } from "../lib/adapters/equity";
const sourceUrl =
  "https://www.equityapartments.com/san-francisco-bay/redwood-city/riva-terra-apartments-at-redwood-shores";
async function main() {
  const extraction = extractEquity(await safeFetch(sourceUrl), sourceUrl);
  const capturedAt = new Date().toISOString();
  await writeFile(
    "lib/riva-terra-snapshot.json",
    JSON.stringify({ capturedAt, sourceUrl, extraction }, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        capturedAt,
        complete: extraction.complete,
        units: extraction.units.length,
        oneBedroom726: extraction.units
          .filter((u) => u.bedrooms === 1 && u.sqft === 726)
          .map((u) => ({ unit: u.unitNumber, rent: u.rent, floor: u.floor })),
      },
      null,
      2,
    ),
  );
}
void main();
