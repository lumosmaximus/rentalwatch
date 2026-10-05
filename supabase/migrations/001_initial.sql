create extension if not exists pgcrypto;
create table public.groups (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, name text not null check(length(name) between 1 and 100), created_at timestamptz not null default now());
create table public.properties (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, name text not null, address text, created_at timestamptz not null default now(), unique(id,owner_id));
create table public.sources (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, group_id uuid not null references public.groups on delete cascade, property_id uuid not null, url text not null check(length(url)<2048), adapter text not null default 'generic', status text not null default 'pending' check(status in ('pending','ok','blocked','unsupported','error','paused')), error text, extraction jsonb, last_checked_at timestamptz, last_success_at timestamptz, next_check_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz, failures integer not null default 0, created_at timestamptz not null default now(), foreign key(property_id,owner_id) references public.properties(id,owner_id), unique(group_id,url));
create table public.segments (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, source_id uuid not null references public.sources on delete cascade, name text not null, rules jsonb not null default '{}', cadence_hours integer not null default 24 check(cadence_hours in (24,48)), enabled boolean not null default true, last_evaluated_at timestamptz, created_at timestamptz not null default now());
alter table public.segments add column next_evaluate_at timestamptz not null default now();
create table public.snapshots (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, source_id uuid not null references public.sources on delete cascade, checked_at timestamptz not null default now(), units jsonb not null, aggregates jsonb not null, method text not null, complete boolean not null, warnings jsonb not null default '[]', unique(source_id,checked_at));
create table public.unit_history (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, source_id uuid not null references public.sources on delete cascade, unit_key text not null, first_seen timestamptz not null, last_seen timestamptz not null, disappeared_at timestamptz, appearances integer not null default 1, metadata jsonb not null, unique(source_id,unit_key));
create table public.unit_spells (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, source_id uuid not null references public.sources on delete cascade, unit_key text not null, started_at timestamptz not null, last_seen_at timestamptz not null, ended_at timestamptz);
create unique index one_open_spell on public.unit_spells(source_id,unit_key) where ended_at is null;
create table public.events (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, source_id uuid not null references public.sources on delete cascade, segment_id uuid references public.segments on delete cascade, snapshot_id uuid not null references public.snapshots on delete cascade, kind text not null, data jsonb not null, created_at timestamptz not null default now());
create table public.alert_rules (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, segment_id uuid not null references public.segments on delete cascade, kinds text[] not null default '{price_drop,new_unit,reappearance}', min_drop numeric not null default 0 check(min_drop>=0), enabled boolean not null default true, email boolean not null default false, unique(segment_id));
create table public.notifications (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, event_id uuid not null references public.events on delete cascade, message text not null, read_at timestamptz, email_requested boolean not null default false, delivered_at timestamptz, attempts integer not null default 0, delivery_error text, next_attempt_at timestamptz not null default now(), unique(event_id,owner_id));
create index sources_due on public.sources(next_check_at) where status <> 'paused';
create index snapshots_history on public.snapshots(source_id,checked_at desc);
create index events_owner on public.events(owner_id,created_at desc);
create index notifications_due on public.notifications(next_attempt_at) where delivered_at is null and email_requested;

-- Foreign-key ownership checks prevent a tenant from referencing another tenant's parent.
create function public.check_parent_owner() returns trigger language plpgsql set search_path=public as $$
declare parent_owner uuid;
begin
 if tg_table_name='sources' then select owner_id into parent_owner from groups where id=new.group_id;
 elsif tg_table_name='segments' then select owner_id into parent_owner from sources where id=new.source_id;
 elsif tg_table_name='alert_rules' then select owner_id into parent_owner from segments where id=new.segment_id;
 end if;
 if parent_owner is distinct from new.owner_id then raise exception 'Parent ownership mismatch'; end if;
 return new;
end $$;
create trigger source_owner before insert or update on public.sources for each row execute function public.check_parent_owner();
create trigger segment_owner before insert or update on public.segments for each row execute function public.check_parent_owner();
create trigger alert_owner before insert or update on public.alert_rules for each row execute function public.check_parent_owner();
do $$ declare t text; begin
 foreach t in array array['groups','properties','sources','segments','snapshots','unit_history','unit_spells','events','alert_rules','notifications'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy read_own on public.%I for select to authenticated using (owner_id=(select auth.uid()))',t);
 end loop;
 foreach t in array array['groups','properties','segments','alert_rules'] loop
 execute format('create policy insert_own on public.%I for insert to authenticated with check (owner_id=(select auth.uid()))',t);
 execute format('create policy update_own on public.%I for update to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()))',t);
 execute format('create policy delete_own on public.%I for delete to authenticated using (owner_id=(select auth.uid()))',t);
 end loop;
end $$;
create policy source_insert on public.sources for insert to authenticated with check(owner_id=(select auth.uid()) and status='pending' and extraction is null and lease_token is null and last_checked_at is null);
create policy source_delete on public.sources for delete to authenticated using(owner_id=(select auth.uid()));
create policy notification_read on public.notifications for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on public.groups,public.properties,public.sources,public.segments,public.snapshots,public.unit_history,public.unit_spells,public.events,public.alert_rules,public.notifications to authenticated;
grant insert,update,delete on public.groups,public.properties,public.segments,public.alert_rules to authenticated;
revoke insert on public.sources from authenticated;
grant insert(owner_id,group_id,property_id,url,adapter),delete on public.sources to authenticated;
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;
grant all on all tables in schema public to service_role;

-- Claim jobs atomically. Lease expiration makes crashes retryable; token fences stale workers.
create function public.claim_sources(batch_size integer default 5) returns setof public.sources language plpgsql security definer set search_path=public as $$
begin return query
 with due as (select id from sources where next_check_at<=now() and status<>'paused' and (lease_until is null or lease_until<now()) order by next_check_at for update skip locked limit least(batch_size,20))
 update sources s set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes' from due where s.id=due.id returning s.*;
end $$;

-- One transaction persists a successful observation, lifetimes, events and the alert outbox.
create function public.finish_source(p_source uuid,p_token uuid,p_extraction jsonb,p_aggregate jsonb,p_events jsonb,p_cadence integer) returns uuid language plpgsql security definer set search_path=public as $$
declare s sources; snap uuid; u jsonb; e jsonb; eid uuid; r alert_rules; moment timestamptz:=now();
begin
 select * into s from sources where id=p_source and lease_token=p_token and lease_until>now() for update;
 if not found then raise exception 'Lease expired'; end if;
 insert into snapshots(owner_id,source_id,units,aggregates,method,complete,warnings,checked_at) values(s.owner_id,s.id,p_extraction->'units',p_aggregate,p_extraction->>'method',(p_extraction->>'complete')::boolean,p_extraction->'warnings',moment) returning id into snap;
 update properties set name=coalesce(nullif(left(p_extraction->>'propertyName',200),''),name),address=coalesce(nullif(left(p_extraction->>'address',500),''),address) where id=s.property_id and owner_id=s.owner_id;
 if (p_extraction->>'complete')::boolean then
 update unit_history set disappeared_at=moment where source_id=s.id and disappeared_at is null and not exists(select 1 from jsonb_array_elements(p_extraction->'units') j where j->>'key'=unit_key);
 update unit_spells set ended_at=moment where source_id=s.id and ended_at is null and not exists(select 1 from jsonb_array_elements(p_extraction->'units') j where j->>'key'=unit_key);
 end if;
 for u in select * from jsonb_array_elements(p_extraction->'units') loop
 if u->>'identity'='unit' then
 insert into unit_history(owner_id,source_id,unit_key,first_seen,last_seen,metadata) values(s.owner_id,s.id,u->>'key',moment,moment,u)
 on conflict(source_id,unit_key) do update set last_seen=moment,metadata=u,appearances=unit_history.appearances+case when unit_history.disappeared_at is not null then 1 else 0 end,disappeared_at=null;
 insert into unit_spells(owner_id,source_id,unit_key,started_at,last_seen_at) values(s.owner_id,s.id,u->>'key',moment,moment)
 on conflict(source_id,unit_key) where ended_at is null do update set last_seen_at=moment;
 end if; end loop;
 for e in select * from jsonb_array_elements(p_events) loop
 insert into events(owner_id,source_id,segment_id,snapshot_id,kind,data) values(s.owner_id,s.id,(e->>'segment_id')::uuid,snap,e->>'kind',e) returning id into eid;
 select * into r from alert_rules where segment_id=(e->>'segment_id')::uuid and enabled and e->>'kind'=any(kinds);
 if found and (e->>'kind'<>'price_drop' or coalesce((e->>'before')::numeric-(e->>'after')::numeric,0)>=r.min_drop) then
 insert into notifications(owner_id,event_id,message,email_requested) values(s.owner_id,eid,e->>'message',r.email);
 end if; end loop;
 -- UTC calendar scheduling avoids missing an entire day when a free cron runs slightly early.
 update segments set last_evaluated_at=moment,next_evaluate_at=(date_trunc('day',moment at time zone 'UTC') at time zone 'UTC')+make_interval(hours=>cadence_hours) where source_id=s.id and enabled and next_evaluate_at<=moment;
 update sources set extraction=p_extraction,status='ok',error=null,last_checked_at=moment,last_success_at=moment,next_check_at=(date_trunc('day',moment at time zone 'UTC') at time zone 'UTC')+make_interval(hours=>p_cadence),failures=0,lease_token=null,lease_until=null where id=s.id;
 return snap;
end $$;
create function public.fail_source(p_source uuid,p_token uuid,p_status text,p_error text) returns void language plpgsql security definer set search_path=public as $$
begin update sources set status=p_status,error=left(p_error,500),last_checked_at=now(),failures=failures+1,next_check_at=now()+make_interval(hours=>least(48,power(2,least(failures,5))::integer)),lease_token=null,lease_until=null where id=p_source and lease_token=p_token and lease_until>now(); end $$;
revoke all on function public.claim_sources(integer),public.finish_source(uuid,uuid,jsonb,jsonb,jsonb,integer),public.fail_source(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_sources(integer),public.finish_source(uuid,uuid,jsonb,jsonb,jsonb,integer),public.fail_source(uuid,uuid,text,text) to service_role;
