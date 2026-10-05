import { createClient } from "@supabase/supabase-js";
import { demoUnits, demoTrend } from "../lib/demo";
import { aggregate } from "../lib/analytics";
const userId = process.argv[2];
if (!userId) throw new Error("Usage: pnpm seed <existing-auth-user-uuid>");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
async function insert(table: string, row: object) {
  const { data, error } = await db.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}
async function seed() {
  const g = await insert("groups", {
    owner_id: userId,
    name: "Sample · Redwood City",
  });
  const p = await insert("properties", {
    owner_id: userId,
    name: "Riva Terra · DEMO",
    address: "Redwood City, CA — fictional units and asking prices",
  });
  const s = await insert("sources", {
    owner_id: userId,
    group_id: g.id,
    property_id: p.id,
    url: "https://example.com/riva-terra-demo",
    adapter: "generic",
    status: "paused",
    error: "Demo fixture; never fetched",
    extraction: {
      units: demoUnits,
      complete: true,
      method: "demo fixture",
      warnings: ["Synthetic data"],
    },
  });
  const segment = await insert("segments", {
    owner_id: userId,
    source_id: s.id,
    name: "1 bedroom",
    rules: { bedrooms: [1] },
    cadence_hours: 24,
  });
  await insert("alert_rules", { owner_id: userId, segment_id: segment.id });
  for (const point of demoTrend) {
    const units = Array.from({ length: point.count }, (_, i) => ({
      ...demoUnits[i % 3],
      key: `unit:demo-${i}`,
      unitNumber: `demo-${i}`,
      rent: point.minRent === null ? undefined : point.minRent + i * 130,
    }));
    await insert("snapshots", {
      owner_id: userId,
      source_id: s.id,
      checked_at: `${point.date}T15:00:00Z`,
      units,
      aggregates: aggregate(units),
      method: "demo fixture",
      complete: true,
      warnings: ["Synthetic data"],
    });
  }
  console.log(
    "Created sample group. Synthetic data is paused and labeled DEMO.",
  );
}
void seed();
