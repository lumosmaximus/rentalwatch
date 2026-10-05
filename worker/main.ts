import { createClient } from "@supabase/supabase-js";
import { extractWithAdapter } from "../lib/extraction";
import { aggregate, changes } from "../lib/analytics";
import { matches, Unit, Segment } from "../lib/types";
import { safeFetch } from "./safe-fetch";
import { rulesSchema } from "../lib/validation";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error("Worker requires Supabase URL and service role key");
const db = createClient(url, key, { auth: { persistSession: false } });
async function check(s: any) {
  try {
    let html = await safeFetch(s.url);
    let extraction;
    try {
      extraction = extractWithAdapter(html, s.url, s.adapter);
    } catch (error) {
      if (process.env.ENABLE_BROWSER !== "true") throw error;
      const { render } = await import("./browser");
      html = await render(s.url);
      extraction = extractWithAdapter(html, s.url, s.adapter);
    }
    const [
      { data: segments, error: segError },
      { data: history, error: historyError },
      { data: prior, error: priorError },
    ] = await Promise.all([
      db.from("segments").select("*").eq("source_id", s.id).eq("enabled", true),
      db
        .from("unit_history")
        .select("unit_key,disappeared_at,first_seen,appearances")
        .eq("source_id", s.id),
      db
        .from("snapshots")
        .select("units,complete,checked_at")
        .eq("source_id", s.id)
        .order("checked_at", { ascending: false })
        .limit(100),
    ]);
    if (segError || historyError || priorError)
      throw segError || historyError || priorError;
    // Partial results are observations, not inventory replacement. Never invent removal or reappearance.
    const events = (segments || [])
      .filter(
        (segment: Segment) =>
          !segment.next_evaluate_at ||
          Date.parse(segment.next_evaluate_at) <= Date.now(),
      )
      .flatMap((segment: Segment) => {
        segment.rules = rulesSchema.parse(segment.rules);
        const baseline = segment.last_evaluated_at
          ? prior?.find(
              (p) =>
                Date.parse(p.checked_at) <=
                Date.parse(segment.last_evaluated_at!),
            )
          : prior?.[0];
        if (!baseline) return [];
        // A unit first seen after a slower segment's baseline is new to that segment,
        // even if a faster segment already observed it yesterday.
        const seen = new Set<string>((history || []).filter(h=>Date.parse(h.first_seen)<=Date.parse(baseline.checked_at)).map(h=>h.unit_key));
        const old: Unit[] = baseline.units;
        return changes(old, extraction.units, seen, segment.rules)
          .filter((e) => {
            if (!extraction.complete || !baseline.complete) {
              if (["removed_unit", "inventory_change"].includes(e.kind))
                return false;
              if (
                e.kind === "reappearance" &&
                !history?.find((h) => h.unit_key === e.unitKey)?.disappeared_at
              )
                return false;
            }
            const relevant =
              extraction.units.find((u) => u.key === e.unitKey) ||
              old.find((u) => u.key === e.unitKey);
            return (
              !relevant ||
              matches(relevant, segment.rules) ||
              e.kind === "threshold_crossing"
            );
          })
          .map((e) => ({ ...e, segment_id: segment.id }));
      });
    const cadence = Math.min(
      ...(segments || []).map((x: Segment) => x.cadence_hours),
      48,
    );
    const { error } = await db.rpc("finish_source", {
      p_source: s.id,
      p_token: s.lease_token,
      p_extraction: extraction,
      p_aggregate: aggregate(extraction.units),
      p_events: events,
      p_cadence: cadence,
    });
    if (error) throw error;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("BLOCKED:")
      ? "blocked"
      : message.startsWith("UNSUPPORTED:")
        ? "unsupported"
        : "error";
    const { error: saveError } = await db.rpc("fail_source", {
      p_source: s.id,
      p_token: s.lease_token,
      p_status: status,
      p_error: message,
    });
    if (saveError)
      console.error("Could not persist failure", s.id, saveError.message);
    console.error("Check failed", s.id, message);
  }
}
async function deliver() {
  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("email_requested", true)
    .is("delivered_at", null)
    .lt("attempts", 5)
    .lte("next_attempt_at", new Date().toISOString())
    .limit(20);
  if (error) throw error;
  for (const n of data || []) {
    try {
      if (!process.env.RESEND_API_KEY)
        throw new Error("Email delivery is not configured");
      const { data: account, error: accountError } =
        await db.auth.admin.getUserById(n.owner_id);
      if (accountError || !account.user?.email)
        throw new Error("Recipient has no email");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `rental-${n.id}`,
        },
        body: JSON.stringify({
          from: process.env.ALERT_FROM,
          to: [account.user.email],
          subject: "Rental Watch: a matching rental changed",
          text: `${n.message}\n\nView your rentals: ${process.env.APP_URL || ""}`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(`Email provider returned ${response.status}`);
      const { error: saveError } = await db
        .from("notifications")
        .update({
          delivered_at: new Date().toISOString(),
          delivery_error: null,
          attempts: n.attempts + 1,
        })
        .eq("id", n.id);
      if (saveError) throw saveError;
    } catch (e) {
      const { error: saveError } = await db
        .from("notifications")
        .update({
          attempts: n.attempts + 1,
          delivery_error: e instanceof Error ? e.message : "Delivery failed",
          next_attempt_at: new Date(
            Date.now() + 2 ** n.attempts * 3600000,
          ).toISOString(),
        })
        .eq("id", n.id);
      if (saveError) console.error(saveError.message);
    }
  }
}
async function tick() {
  const { data, error } = await db.rpc("claim_sources", { batch_size: 5 });
  if (error) throw error;
  for (const s of data || []) await check(s);
  await deliver();
  return data?.length || 0;
}
async function main() {
  const deadline =
    Date.now() + Number(process.env.WORKER_BUDGET_MINUTES || 10) * 60000;
  do {
    try {
      const count = await tick();
      if (
        process.env.WORKER_ONCE === "true" &&
        (count === 0 || Date.now() >= deadline)
      )
        break;
    } catch (e) {
      console.error(e);
      if (process.env.WORKER_ONCE === "true") {
        process.exitCode = 1;
        break;
      }
    }
    if (process.env.WORKER_ONCE !== "true")
      await new Promise((r) => setTimeout(r, 30000));
  } while (true);
}
void main();
