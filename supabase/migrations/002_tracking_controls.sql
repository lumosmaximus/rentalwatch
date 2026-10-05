-- Atomic segment + alert creation: either both records exist or neither does.
create function public.create_tracking_segment(p_source uuid,p_name text,p_rules jsonb,p_cadence integer) returns jsonb language plpgsql set search_path=public as $$
declare s segments; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Sign in required'; end if;
 if p_cadence not in (24,48) or length(p_name) not between 1 and 100 or jsonb_typeof(p_rules)<>'object' then raise exception 'Invalid tracking rules'; end if;
 if not exists(select 1 from sources where id=p_source and owner_id=uid and extraction is not null) then raise exception 'Inspect the source before selecting options'; end if;
 insert into segments(owner_id,source_id,name,rules,cadence_hours) values(uid,p_source,p_name,p_rules,p_cadence) returning * into s;
 insert into alert_rules(owner_id,segment_id) values(uid,s.id);
 perform public.sync_source_schedule(p_source);
 return to_jsonb(s);
end $$;

-- Only a source's owner can queue it. Never let clients write ingestion fields.
create function public.request_source_check(p_source uuid) returns void language plpgsql security definer set search_path=public as $$
declare s sources; uid uuid:=auth.uid();
begin
 select * into s from sources where id=p_source and owner_id=uid for update;
 if not found then raise exception 'Source not found'; end if;
 if s.lease_until>now() then raise exception 'A check is already running'; end if;
 if s.last_checked_at>now()-interval '15 minutes' then raise exception 'Wait 15 minutes between source checks'; end if;
 update sources set status='pending',error=null,next_check_at=now() where id=s.id;
end $$;

-- Used after editing or pausing a segment to update the source schedule safely.
create function public.sync_source_schedule(p_source uuid) returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); frequency integer; has_segments boolean;
begin
 if not exists(select 1 from sources where id=p_source and owner_id=uid) then raise exception 'Source not found'; end if;
 select min(cadence_hours) into frequency from segments where source_id=p_source and enabled;
 select exists(select 1 from segments where source_id=p_source) into has_segments;
 update sources set status=case when frequency is null and has_segments then 'paused' when status='paused' then 'pending' else status end,
 next_check_at=case when frequency is not null then least(next_check_at,(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')+make_interval(hours=>frequency)) else next_check_at end where id=p_source;
end $$;
revoke all on function public.create_tracking_segment(uuid,text,jsonb,integer),public.request_source_check(uuid),public.sync_source_schedule(uuid) from public,anon;
grant execute on function public.create_tracking_segment(uuid,text,jsonb,integer),public.request_source_check(uuid),public.sync_source_schedule(uuid) to authenticated;
