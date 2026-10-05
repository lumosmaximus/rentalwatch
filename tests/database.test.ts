import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Postgres migration: RLS ownership, leases, snapshots, lifetimes and atomic alerts", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  const migration = (
    await readFile(
      new URL("../supabase/migrations/001_initial.sql", import.meta.url),
      "utf8",
    )
  ).replace("create extension if not exists pgcrypto;", "");
  await db.exec(migration);
  await db.exec(await readFile(new URL('../supabase/migrations/002_tracking_controls.sql',import.meta.url),'utf8'));
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  await db.exec(`insert into auth.users values('${a}'),('${b}');`);
  const g = (
    await db.query<{ id: string }>(
      `insert into groups(owner_id,name) values($1,'test') returning id`,
      [a],
    )
  ).rows[0].id;
  const p = (
    await db.query<{ id: string }>(
      `insert into properties(owner_id,name) values($1,'property') returning id`,
      [a],
    )
  ).rows[0].id;
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${b}';`);
  assert.equal((await db.query("select * from groups")).rows.length, 0);
  await assert.rejects(
    db.query(
      `insert into sources(owner_id,group_id,property_id,url) values($1,$2,$3,'https://example.com')`,
      [b, g, p],
    ),
    /ownership|security/i,
  );
  await assert.rejects(
    db.query(
      `insert into snapshots(owner_id,source_id,units,aggregates,method,complete) values($1,$2,'[]','{}','fake',true)`,
      [b, g],
    ),
    /permission/,
  );
  await assert.rejects(
    db.query("select * from claim_sources(5)"),
    /permission/,
  );
  await db.exec(
    `reset role;set role authenticated;set request.jwt.claim.sub='${a}';`,
  );
  const s = (
    await db.query<{ id: string }>(
      `insert into sources(owner_id,group_id,property_id,url) values($1,$2,$3,'https://example.com') returning id`,
      [a, g, p],
    )
  ).rows[0].id;
  await assert.rejects(
    db.query(
      `insert into sources(owner_id,group_id,property_id,url,status) values($1,$2,$3,'https://fake.com','ok')`,
      [a, g, p],
    ),
    /permission/,
  );
  const seg = (
    await db.query<{ id: string }>(
      `insert into segments(owner_id,source_id,name) values($1,$2,'1 BR') returning id`,
      [a, s],
    )
  ).rows[0].id;
  await db.query(`insert into alert_rules(owner_id,segment_id) values($1,$2)`, [
    a,
    seg,
  ]);
  await db.exec("reset role;");
  let claim = (await db.query<any>("select * from claim_sources(5)")).rows[0];
  assert.equal(
    (await db.query("select * from claim_sources(5)")).rows.length,
    0,
  );
  const u = {
    key: "unit:101",
    identity: "unit",
    unitNumber: "101",
    rent: 3200,
    count: 1,
    features: [],
    currency: "USD",
    rentBasis: "monthly",
  };
  async function finish(units: any[], complete = true, events: any[] = []) {
    await db.query(`select finish_source($1,$2,$3,$4,$5,24)`, [
      s,
      claim.lease_token,
      JSON.stringify({ units, complete, method: "test", warnings: [] }),
      JSON.stringify({ count: units.length }),
      JSON.stringify(events),
    ]);
  }
  await assert.rejects(
    db.query(`select finish_source($1,gen_random_uuid(),'{}','{}','[]',24)`, [
      s,
    ]),
    /Lease/,
  );
  await finish([u]);
  assert.equal((await db.query("select * from unit_history")).rows.length, 1);
  async function claimAgain() {
    await db.query(
      `update sources set next_check_at=now()-interval '1 day' where id=$1`,
      [s],
    );
    claim = (await db.query<any>("select * from claim_sources(5)")).rows[0];
  }
  await claimAgain();
  await finish([], false);
  assert.equal(
    (await db.query<any>("select * from unit_history")).rows[0].disappeared_at,
    null,
  );
  assert.equal(
    (await db.query<any>("select * from unit_spells")).rows[0].ended_at,
    null,
  );
  await claimAgain();
  await finish([], true);
  assert.ok(
    (await db.query<any>("select * from unit_history")).rows[0].disappeared_at,
  );
  await claimAgain();
  await finish([u], true, [
    {
      segment_id: seg,
      kind: "reappearance",
      unitKey: u.key,
      message: "101 returned",
    },
  ]);
  assert.equal(
    (await db.query<any>("select * from unit_history")).rows[0].appearances,
    2,
  );
  assert.equal((await db.query("select * from unit_spells")).rows.length, 2);
  assert.equal((await db.query("select * from notifications")).rows.length, 1);
  const count = (await db.query("select * from snapshots")).rows.length;
  await assert.rejects(finish([u]), /Lease/);
  assert.equal((await db.query("select * from snapshots")).rows.length, count);
  await claimAgain();
  await db.query(`select fail_source($1,$2,'blocked','captcha')`, [
    s,
    claim.lease_token,
  ]);
  const source = (await db.query<any>("select * from sources")).rows[0];
  assert.equal(source.status, "blocked");
  assert.equal(source.extraction.units.length, 1);
  assert.equal((await db.query("select * from snapshots")).rows.length, count);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${b}';`);
  for (const table of [
    "sources",
    "snapshots",
    "unit_history",
    "unit_spells",
    "events",
    "notifications",
  ])
    assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
  await db.exec(
    `reset role;set role authenticated;set request.jwt.claim.sub='${a}';`,
  );
  await assert.rejects(
    db.query("update notifications set delivered_at=now()"),
    /permission/,
  );
  await db.query("update notifications set read_at=now()");
  await db.close();
});
