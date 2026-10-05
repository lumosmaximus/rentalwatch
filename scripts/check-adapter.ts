import { readFile } from "node:fs/promises";
import { extractEquity } from "../lib/adapters/equity";
import { aggregate } from "../lib/analytics";
async function main() {
  const html = await readFile(".local/source.html", "utf8");
  const extraction = extractEquity(
    html,
    "https://www.equityapartments.com/san-francisco-bay/redwood-city/riva-terra-apartments-at-redwood-shores",
  );
  console.log(
    JSON.stringify(
      {
        method: extraction.method,
        complete: extraction.complete,
        options: extraction.units.length,
        stats: aggregate(extraction.units),
        metadata: extraction.units[0],
        warnings: extraction.warnings,
      },
      null,
      2,
    ),
  );
}
void main();
