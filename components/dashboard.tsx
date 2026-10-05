"use client";
import { useEffect, useMemo, useState } from "react";
import {
  House,
  LayoutDashboard,
  ChartNoAxesCombined,
  Link2,
  Bell,
  Plus,
  ArrowUpRight,
  ChevronDown,
  Search,
  X,
  Check,
  Settings,
  LogOut,
  ExternalLink,
  AlertCircle,
  Building2,
  SlidersHorizontal,
  Clock,
  TrendingDown,
  Layers,
  Menu,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { browserClient, configured } from "@/lib/supabase";
import { previewSources, capturedAt } from "@/lib/preview";
import { aggregate } from "@/lib/analytics";
import { premiumComparisons } from "@/lib/premiums";
import { matches, Rule, Unit } from "@/lib/types";
const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n);
const date = (v: string) =>
  new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T12:00:00" : v,
  ).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const sourceName = (s: any) =>
  ({
    equity: "Equity Apartments",
    zillow: "Zillow",
    apartments: "Apartments.com",
    generic: "Property website",
  })[s.adapter as string] || "Property website";
export default function Dashboard() {
  const [db] = useState<SupabaseClient | null>(() =>
    configured ? browserClient() : null,
  );
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("Overview");
  const [groups, setGroups] = useState<any[]>([
    { id: "demo-group", name: "Redwood City apartments" },
  ]);
  const [groupId, setGroupId] = useState("demo-group");
  const [sources, setSources] = useState<any[]>(previewSources);
  const [segments, setSegments] = useState<any[]>([
    {
      id: "demo-segment",
      source_id: "demo-equity",
      name: "1 bedroom",
      rules: { bedrooms: [1] },
      cadence_hours: 24,
      enabled: true,
    },
  ]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [alertRules, setAlertRules] = useState<any[]>([]);
  const [modal, setModal] = useState<
    "source" | "group" | "auth" | "segment" | null
  >(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sourceId, setSourceId] = useState("demo-equity");
  const [search, setSearch] = useState("");
  const [bedFilter, setBedFilter] = useState("all");
  const [range, setRange] = useState(30);
  const [metric, setMetric] = useState("minRent");
  const [mobile, setMobile] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [bathrooms, setBathrooms] = useState<string[]>([]);
  const [spells, setSpells] = useState<any[]>([]);
  const [plans, setPlans] = useState<string[]>([]);
  const [unitSelection, setUnitSelection] = useState<string[]>([]);
  const [cadence, setCadence] = useState(24);
  const [authMode, setAuthMode] = useState("signin");
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const demo = !user;
  const activeSources = sources.filter((s) => s.group_id === groupId);
  const activeSource =
    activeSources.find((s) => s.id === sourceId) || activeSources[0];
  const currentUnits: Unit[] = activeSource?.extraction?.units || [];
  const activeSegments = segments.filter(
    (s) => s.source_id === activeSource?.id && s.enabled,
  );
  const filtered = currentUnits.filter(
    (u) =>
      (!activeSegments.length ||
        activeSegments.some((s) => matches(u, s.rules))) &&
      (bedFilter === "all" || u.bedrooms === Number(bedFilter)) &&
      `${u.unitNumber || ""} ${u.floorplan || ""} ${u.sqft || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const stats = aggregate(filtered);
  const trend = useMemo(
    () =>
      demo
        ? []
        : snapshots
            .filter(
              (s) =>
                s.source_id === activeSource?.id &&
                Date.parse(s.checked_at) > Date.now() - range * 86400000,
            )
            .map((s) => {
              const a = aggregate(
                (s.units as Unit[]).filter(
                  (u) =>
                    (!activeSegments.length ||
                      activeSegments.some((seg) => matches(u, seg.rules))) &&
                    (bedFilter === "all" || u.bedrooms === Number(bedFilter)),
                ),
              );
              return {
                ...a,
                date: s.checked_at,
                label: date(s.checked_at),
                minRent: a.minRent,
              };
            })
            .reverse(),
    [demo, snapshots, activeSource?.id, segments, range, bedFilter],
  );
  const historicalLow = trend.filter((p) => p.minRent !== null).length
    ? Math.min(
        ...trend.filter((p) => p.minRent !== null).map((p) => p.minRent!),
      )
    : null;
  const earliest = trend.find((p) => p.minRent !== null)?.minRent;
  const delta =
    earliest && stats.minRent
      ? ((stats.minRent - earliest) / earliest) * 100
      : null;
  useEffect(() => {
    if (!db) {
      setReady(true);
      return;
    }
    db.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
      setReady(true);
    });
    const { data } = db.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("update");
        setModal("auth");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [db]);
  async function reload() {
    if (!db || !user) return;
    const results = await Promise.all([
      db.from("groups").select("*").order("created_at"),
      db
        .from("sources")
        .select("*,properties(name,address)")
        .order("created_at"),
      db.from("segments").select("*"),
      Promise.resolve({ data: null, error: null }),
      db.from("unit_history").select("*"),
      db
        .from("notifications")
        .select("*")
        .order("next_attempt_at", { ascending: false })
        .limit(100),
      db.from("alert_rules").select("*"),
      db.from("unit_spells").select("*"),
    ]);
    const err = results.find((r) => r.error)?.error;
    if (err) {
      setNotice(err.message);
      return;
    }
    setGroups(results[0].data || []);
    setSources(results[1].data || []);
    setSegments(results[2].data || []);
    setHistory(results[4].data || []);
    setNotifications(results[5].data || []);
    setAlertRules(results[6].data || []);
    setSpells(results[7].data || []);
    setGroupId((prev) =>
      results[0].data?.some((g) => g.id === prev)
        ? prev
        : results[0].data?.[0]?.id || "",
    );
  }
  useEffect(() => {
    if (user) {
      setSources([]);
      setGroups([]);
      setSegments([]);
      setSnapshots([]);
      void reload();
      const timer = setInterval(() => {
        if (!document.hidden) void reload();
      }, 300000);
      return () => clearInterval(timer);
    } else {
      setGroups([{ id: "demo-group", name: "Redwood City apartments" }]);
      setGroupId("demo-group");
      setSources(previewSources);
      setSegments([
        {
          id: "demo-segment",
          source_id: "demo-equity",
          name: "1 bedroom",
          rules: { bedrooms: [1] },
          cadence_hours: 24,
          enabled: true,
        },
      ]);
      setSnapshots([]);
      setHistory([]);
      setSpells([]);
      setNotifications([]);
      setAlertRules([]);
    }
  }, [user]);
  useEffect(() => {
    if (!db || !user || !activeSource?.id) return;
    let cancelled = false;
    setSnapshots([]);
    db.from("snapshots")
      .select("id,source_id,checked_at,units,complete")
      .eq("source_id", activeSource.id)
      .gte("checked_at", new Date(Date.now() - range * 86400000).toISOString())
      .order("checked_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setNotice(error.message);
        else setSnapshots(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [db, user, activeSource?.id, activeSource?.last_success_at, range]);
  useEffect(() => {
    if (!db || !user || !sources.some((s) => s.status === "pending")) return;
    const timer = setInterval(() => {
      if (!document.hidden) void reload();
    }, 30000);
    return () => clearInterval(timer);
  }, [db, user, sources.some((s) => s.status === "pending")]);
  useEffect(() => {
    if (!modal && !selectedUnit) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    if (!dialog) return;
    const surfaces = [
      ...document.querySelectorAll<HTMLElement>(".main-shell,.sidebar"),
    ];
    surfaces.forEach((el) => (el.inert = true));
    const focusable = () => [
      ...dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]),input:not([disabled]),select,a[href]",
      ),
    ];
    const frame = requestAnimationFrame(() => {
      (
        dialog.querySelector<HTMLElement>("[autofocus],input") || focusable()[0]
      )?.focus();
    });
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setSelectedUnit(null);
      }
      if (e.key === "Tab") {
        const items = focusable();
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      cancelAnimationFrame(frame);
      surfaces.forEach((el) => (el.inert = false));
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [modal, selectedUnit]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 8000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  async function api(path: string, body: unknown) {
    if (!db) throw new Error("Connect Supabase first");
    const { data } = await db.auth.getSession();
    const response = await fetch(`/api/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session?.access_token || ""}`,
      },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Request failed");
    return json;
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  function openSegment() {
    setSelection([]);
    setBathrooms([]);
    setPlans([]);
    setUnitSelection([]);
    setModal("segment");
  }
  async function saveGroup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      const name = String(f.get("name")).trim();
      if (!name) throw new Error("Enter a group name");
      if (demo) {
        const id = `demo-${Date.now()}`;
        setGroups([...groups, { id, name }]);
        setGroupId(id);
        setNotice(
          "Preview group created for this session. Sign in to save it.",
        );
      } else {
        const { data, error } = await db!
          .from("groups")
          .insert({ name, owner_id: user.id })
          .select()
          .single();
        if (error) throw error;
        await reload();
        setGroupId(data.id);
      }
      setModal(null);
    });
  }
  async function saveSource(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      if (demo)
        throw new Error(
          "Sign in with a connected Supabase project to inspect real listing URLs. The demo does not fetch pages.",
        );
      const s = await api("sources", {
        group_id: groupId,
        property_name: String(f.get("name")),
        property_id: String(f.get("property_id")) || undefined,
        url: String(f.get("url")),
      });
      await reload();
      setSourceId(s.id);
      setModal(null);
      setTab("Sources");
      setNotice(
        "Source queued. Options appear after the worker finishes the inspection.",
      );
    });
  }
  async function saveSegment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      const rules: Rule = {};
      if (selection.length) rules.bedrooms = selection.map(Number);
      if (bathrooms.length) rules.bathrooms = bathrooms.map(Number);
      if (plans.length) rules.floorplans = plans;
      if (unitSelection.length) rules.unitKeys = unitSelection;
      if (f.get("sqft")) rules.minSqft = Number(f.get("sqft"));
      if (f.get("rent")) rules.maxRent = Number(f.get("rent"));
      if (f.get("days")) rules.availableWithinDays = Number(f.get("days"));
      if (demo) {
        setSegments([
          ...segments,
          {
            id: `demo-${Date.now()}`,
            source_id: activeSource.id,
            name: String(f.get("name")),
            rules,
            cadence_hours: cadence,
            enabled: true,
          },
        ]);
        setNotice(
          "Preview selection updated. Sign in to enable scheduled tracking.",
        );
      } else {
        await api("segments", {
          source_id: activeSource.id,
          name: String(f.get("name")),
          rules,
          cadence_hours: cadence,
        });
        await reload();
      }
      setModal(null);
    });
  }
  async function authenticate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      if (!db)
        throw new Error(
          "This preview is in demo mode. Follow the setup guide to connect Supabase and enable accounts.",
        );
      if (authMode === "reset") {
        const { error } = await db.auth.resetPasswordForEmail(
          String(f.get("email")),
          { redirectTo: window.location.origin },
        );
        if (error) throw error;
        setNotice(
          "If the account exists, a password reset email is on its way.",
        );
        setModal(null);
        return;
      }
      if (authMode === "update") {
        const { error } = await db.auth.updateUser({
          password: String(f.get("password")),
        });
        if (error) throw error;
        setNotice("Password updated.");
        setModal(null);
        return;
      }
      const credentials = {
        email: String(f.get("email")),
        password: String(f.get("password")),
      };
      const { data, error } =
        authMode === "signup"
          ? await db.auth.signUp(credentials)
          : await db.auth.signInWithPassword(credentials);
      if (error) throw error;
      if (!data.session)
        setNotice("Check your email to confirm your account, then sign in.");
      setModal(null);
    });
  }
  async function updateAlert(id: string, patch: object) {
    await run(async () => {
      const { error } = await db!
        .from("alert_rules")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
      await reload();
    });
  }
  const tabs = [
    ["Overview", LayoutDashboard],
    ["Trends", ChartNoAxesCombined],
    ["Sources", Link2],
    ["Alerts", Bell],
  ] as const;
  const periods = spells
    .filter((h) => h.source_id === activeSource?.id)
    .map((h) => ({
      unit: h.unit_key,
      spell: h.id,
      open: !h.ended_at,
      days: Math.max(
        0,
        Math.round(
          (Date.parse(h.last_seen_at) - Date.parse(h.started_at)) / 86400000,
        ),
      ),
      appearances:
        history.find(
          (u) => u.source_id === h.source_id && u.unit_key === h.unit_key,
        )?.appearances || 1,
    }));
  if (!ready)
    return (
      <div className="loading">
        <House size={36} />
        <p>Opening your rental workspace…</p>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "shown" : ""}`}>
        <a href="/" className="brand">
          <span className="brand-icon">
            <House size={22} />
          </span>
          rental<span className="brand-light">watch</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {tabs.map(([name, Icon]) => (
            <button
              key={name}
              className={`nav-item ${tab === name ? "active" : ""}`}
              onClick={() => {
                setTab(name);
                setMobile(false);
              }}
            >
              <Icon size={19} />
              {name}
              {name === "Alerts" &&
                notifications.filter((n) => !n.read_at).length > 0 && (
                  <span className="nav-count">
                    {notifications.filter((n) => !n.read_at).length}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="section-row">
          <span>MY GROUPS</span>
          <button aria-label="Create group" onClick={() => setModal("group")}>
            <Plus size={17} />
          </button>
        </div>
        <div className="group-list">
          {groups.map((g) => (
            <button
              className={g.id === groupId ? "selected" : ""}
              key={g.id}
              onClick={() => {
                setGroupId(g.id);
                setMobile(false);
                setTab("Overview");
              }}
            >
              <span className="group-mark" />
              {g.name}
            </button>
          ))}
        </div>
        <button className="new-group" onClick={() => setModal("group")}>
          <Plus size={16} />
          New group
        </button>
        <div className="sidebar-bottom">
          <div className="quiet-card">
            <Layers size={21} />
            <strong>A little history goes a long way.</strong>
            <p>Watch the market. Find your moment.</p>
          </div>
          <button
            className="account"
            onClick={() =>
              demo
                ? setModal("auth")
                : run(async () => {
                    await db!.auth.signOut();
                  })
            }
          >
            <span className="avatar">
              {user?.email?.[0]?.toUpperCase() || "D"}
            </span>
            <span>
              {demo ? "Preview workspace" : user.email}
              <small>
                {demo ? "Captured Riva Terra inventory" : "Signed in"}
              </small>
            </span>
            {demo ? <Settings size={17} /> : <LogOut size={17} />}
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle"
              onClick={() => setMobile(!mobile)}
              aria-label="Toggle navigation"
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{tab}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              {demo ? "Captured snapshot" : "Live workspace"}
            </span>
            <button
              aria-label="Open alerts"
              className="icon-button"
              onClick={() => setTab("Alerts")}
            >
              <Bell size={19} />
            </button>
            <button
              className="avatar small"
              onClick={() => (demo ? setModal("auth") : setTab("Alerts"))}
            >
              {user?.email?.[0]?.toUpperCase() || "D"}
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR RENTAL RADAR</div>
              <h1>
                {tab === "Overview"
                  ? groups.find((g) => g.id === groupId)?.name ||
                    "Your rental groups"
                  : tab === "Trends"
                    ? "The bigger picture"
                    : tab === "Sources"
                      ? "Your listing sources"
                      : "Stay one step ahead"}
              </h1>
              <p>
                {tab === "Overview"
                  ? "A clear view of your options, and how they’re changing."
                  : tab === "Trends"
                    ? "Asking prices and availability over time, source by source."
                    : tab === "Sources"
                      ? "Connect listings and choose exactly what you want to watch."
                      : "Choose the changes that matter to you."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() =>
                groups.length ? setModal("source") : setModal("group")
              }
            >
              <Plus size={18} />
              {groups.length ? "Add listing" : "Create group"}
            </button>
          </div>
          {demo && (
            <div className="demo-banner">
              <span>
                <span className="tag">SNAPSHOT</span>
                Riva Terra inventory captured{" "}
                {new Date(capturedAt).toLocaleString("en-US", {
                  timeZone: "America/Los_Angeles",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                Pacific. This preview does not refresh automatically; connect
                your workspace for scheduled checks.
              </span>
              <button onClick={() => setModal("auth")}>
                Connect your workspace <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          {!groups.length && (
            <div className="empty-state">
              <Building2 size={42} />
              <h2>Your search starts with a group</h2>
              <p>
                Keep neighborhoods, apartment sizes, or move dates together.
              </p>
              <button className="primary" onClick={() => setModal("group")}>
                Create your first group
              </button>
            </div>
          )}
          {groups.length > 0 && (
            <>
              <div className="group-toolbar">
                <div className="toolbar-start">
                  <Building2 size={18} />
                  <select
                    aria-label="Property source"
                    value={activeSource?.id || ""}
                    onChange={(e) => setSourceId(e.target.value)}
                  >
                    {activeSources.length ? (
                      activeSources.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.properties?.name || "Property"} · {sourceName(s)}
                        </option>
                      ))
                    ) : (
                      <option value="">No sources yet</option>
                    )}
                  </select>
                </div>
                <div className="toolbar-end">
                  <span className="check-time">
                    <Clock size={14} />
                    {activeSource?.last_checked_at
                      ? `Checked ${date(activeSource.last_checked_at)}`
                      : "Awaiting first check"}
                  </span>
                  {activeSource?.extraction && (
                    <button className="subtle" onClick={openSegment}>
                      <SlidersHorizontal size={15} />
                      Tracking rules
                    </button>
                  )}
                </div>
              </div>
              {activeSource && activeSource.status !== "ok" && (
                <div className="source-warning">
                  <AlertCircle size={18} />
                  <div>
                    <strong>
                      {activeSource.status === "pending"
                        ? "Inspection queued"
                        : `${sourceName(activeSource)} · ${activeSource.status}`}
                    </strong>
                    <p>
                      {activeSource.error ||
                        "The worker will inspect this source and expose the detected options."}
                    </p>
                    {activeSource.extraction && (
                      <small>
                        Showing the last successful observation; this data may
                        be stale.
                      </small>
                    )}
                  </div>
                </div>
              )}
              {activeSource?.extraction &&
                !activeSource.extraction.complete && (
                  <div className="source-warning">
                    <AlertCircle size={18} />
                    <span>
                      Partial source coverage. Counts are observed inventory;
                      unavailable units cannot be inferred.
                    </span>
                  </div>
                )}
              {tab === "Overview" && (
                <>
                  <div className="stats-grid">
                    <Stat
                      label="Lowest asking rent"
                      value={money(stats.minRent)}
                      detail={
                        delta !== null
                          ? `${Math.abs(delta).toFixed(1)}% ${delta <= 0 ? "lower" : "higher"} than first observation`
                          : "Waiting for price history"
                      }
                      icon={<TrendingDown size={18} />}
                      green={delta !== null && delta < 0}
                    />
                    <Stat
                      label="Available apartments"
                      value={
                        activeSource?.extraction ? String(stats.count) : "—"
                      }
                      detail={`${stats.identified} identifiable units · source specific`}
                      icon={<Building2 size={18} />}
                    />
                    <Stat
                      label="Average rent / sqft"
                      value={
                        stats.dollarsPerSqft
                          ? `$${stats.dollarsPerSqft.toFixed(2)}`
                          : "—"
                      }
                      detail="Monthly asking rent per square foot"
                      icon={<Layers size={18} />}
                    />
                    <Stat
                      label="Historical low"
                      value={money(historicalLow)}
                      detail={
                        demo
                          ? "Repeated checks are needed"
                          : "Within the selected history window"
                      }
                      icon={<ChartNoAxesCombined size={18} />}
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel chart-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Rent, in perspective</h2>
                          <p>Lowest asking rent · matching options</p>
                        </div>
                        <select
                          aria-label="Chart period"
                          value={range}
                          onChange={(e) => setRange(Number(e.target.value))}
                        >
                          <option value={30}>Last 30 days</option>
                          <option value={90}>Last 90 days</option>
                          <option value={365}>Last year</option>
                        </select>
                      </div>
                      <TrendChart data={trend} metric="minRent" />
                      <div className="chart-footer">
                        <span className="legend-dot" />
                        Lowest asking rent
                        <span className="chart-note">
                          Gaps mean no available priced inventory
                        </span>
                      </div>
                    </section>
                    <section className="panel watch-panel">
                      <div className="panel-heading">
                        <h2>What you’re watching</h2>
                        <button
                          className="icon-button"
                          aria-label="Add tracking selection"
                          onClick={() =>
                            activeSource?.extraction
                              ? openSegment()
                              : setNotice("Inspect a source first")
                          }
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      {activeSegments.length ? (
                        activeSegments.map((s) => (
                          <div className="watch-item" key={s.id}>
                            <div className="watch-icon">
                              <House size={19} />
                            </div>
                            <div>
                              <strong>{s.name}</strong>
                              <small>
                                {s.rules.minSqft
                                  ? `${s.rules.minSqft}+ sqft · `
                                  : ""}
                                {s.rules.maxRent
                                  ? `${money(s.rules.maxRent)} max · `
                                  : ""}
                                Every{" "}
                                {s.cadence_hours === 24 ? "day" : "2 days"}
                                {demo ? " · preview only" : ""}
                              </small>
                            </div>
                            <span className="watch-check">
                              <Check size={15} />
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="small-empty">
                          Choose bedrooms, floorplans, or units after inspecting
                          a listing.
                        </div>
                      )}
                      <div className="watch-summary">
                        <span>{activeSources.length} listing sources</span>
                        <span>{activeSegments.length} tracked segments</span>
                      </div>
                      <button
                        className="full-button"
                        onClick={() => setTab("Sources")}
                      >
                        Manage sources <ArrowUpRight size={16} />
                      </button>
                    </section>
                  </div>
                  <section className="panel inventory">
                    <div className="inventory-heading">
                      <div>
                        <h2>
                          Available options{" "}
                          <span className="count-pill">
                            {activeSource?.extraction ? stats.count : "—"}
                          </span>
                        </h2>
                        <p>
                          {activeSource?.properties?.name ||
                            "Add a listing to see inventory"}{" "}
                          ·{" "}
                          {activeSource?.properties?.address ||
                            "Source-specific inventory"}
                        </p>
                      </div>
                      <div className="inventory-controls">
                        <div className="search-box">
                          <Search size={16} />
                          <input
                            aria-label="Search available units"
                            placeholder="Unit, floorplan or sqft"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                        </div>
                        <select
                          aria-label="Filter bedrooms"
                          value={bedFilter}
                          onChange={(e) => setBedFilter(e.target.value)}
                        >
                          <option value="all">All tracked options</option>
                          {[
                            ...new Set(
                              currentUnits
                                .map((u) => u.bedrooms)
                                .filter((x) => x !== undefined),
                            ),
                          ].map((b) => (
                            <option key={b} value={b}>
                              {b === 0 ? "Studio" : `${b} bedroom`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>APARTMENT / FLOORPLAN</th>
                            <th>BEDS / BATHS</th>
                            <th>SIZE</th>
                            <th>ASKING RENT</th>
                            <th>RENT / SQFT</th>
                            <th>AVAILABILITY</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((u) => (
                            <tr key={u.key}>
                              <td>
                                <div className="unit-name">
                                  <span className="unit-icon">
                                    <House size={17} />
                                  </span>
                                  <div>
                                    <strong>
                                      {u.identity === "unit"
                                        ? `Unit ${u.unitNumber}`
                                        : u.floorplan || "Aggregate inventory"}
                                    </strong>
                                    <small>
                                      {u.floorplan || "Floorplan unknown"}
                                      {u.floor !== undefined
                                        ? ` · Floor ${u.floor}`
                                        : ""}
                                      {u.identity !== "unit"
                                        ? ` · ${u.count} available`
                                        : ""}
                                    </small>
                                  </div>
                                </div>
                              </td>
                              <td>
                                {u.bedrooms ?? "—"} bd{" "}
                                <span className="muted">/</span>{" "}
                                {u.bathrooms ?? "—"} ba
                              </td>
                              <td>
                                {u.sqft?.toLocaleString() || "—"}{" "}
                                <span className="muted">sqft</span>
                              </td>
                              <td>
                                <strong>{money(u.rent)}</strong>
                                <small className="rent-label">
                                  {u.leaseMonths
                                    ? `${u.leaseMonths} mo lease`
                                    : "per month"}
                                </small>
                              </td>
                              <td>
                                {u.rent && u.sqft
                                  ? `$${(u.rent / u.sqft).toFixed(2)}`
                                  : "—"}
                              </td>
                              <td>
                                {u.availableDate
                                  ? date(u.availableDate)
                                  : "Not specified"}
                              </td>
                              <td>
                                <button
                                  aria-label={`View ${u.unitNumber || u.floorplan} history`}
                                  className="icon-button"
                                  onClick={() => setSelectedUnit(u)}
                                >
                                  <ArrowUpRight size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!filtered.length && (
                      <div className="small-empty">
                        {currentUnits.length
                          ? "No options match these filters."
                          : "No trustworthy inventory has been observed yet."}
                      </div>
                    )}
                    <div className="table-footer">
                      <span>
                        Rent excludes fees and concessions unless explicitly
                        reported.
                      </span>
                      {activeSource && (
                        <a
                          href={activeSource.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Visit source <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </section>
                </>
              )}
              {tab === "Trends" && (
                <>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Market history</h2>
                        <p>
                          Each check is preserved, including unchanged prices.
                        </p>
                      </div>
                      <div className="inline-controls">
                        <select
                          aria-label="Trend metric"
                          value={metric}
                          onChange={(e) => setMetric(e.target.value)}
                        >
                          <option value="minRent">Lowest rent</option>
                          <option value="meanRent">Average rent</option>
                          <option value="count">Inventory count</option>
                          <option value="dollarsPerSqft">Rent / sqft</option>
                        </select>
                        <select
                          aria-label="History window"
                          value={range}
                          onChange={(e) => setRange(Number(e.target.value))}
                        >
                          <option value={30}>30 days</option>
                          <option value={90}>90 days</option>
                          <option value={365}>1 year</option>
                        </select>
                      </div>
                    </div>
                    <TrendChart data={trend} metric={metric} />
                  </section>
                  <div className="insight-grid">
                    <section className="panel insight">
                      <div className="insight-label">FLOOR & SIZE PREMIUMS</div>
                      <h2>Compare similar apartments</h2>
                      <p>
                        Observed monthly $/sqft, grouped by bed/bath and size.
                        These are descriptive differences, not a causal floor
                        premium.
                      </p>
                      <PremiumTable
                        units={
                          demo
                            ? currentUnits
                            : snapshots
                                .filter((s) => s.source_id === activeSource?.id)
                                .flatMap((s) =>
                                  (s.units as Unit[]).map((u) => ({
                                    ...u,
                                    observedDay: s.checked_at.slice(0, 10),
                                  })),
                                )
                        }
                      />
                    </section>
                    <section className="panel insight">
                      <div className="insight-label">UNIT LIFECYCLES</div>
                      <h2>Availability & reappearance</h2>
                      <p>
                        Observed days in each availability period. Disappearance
                        does not confirm a lease.
                      </p>
                      {demo ? (
                        <div className="small-empty">
                          Only one captured observation is available. Connect
                          scheduled checks to measure availability periods and
                          reappearance.
                        </div>
                      ) : periods.length ? (
                        <ul className="lifecycle-list">
                          {periods.slice(0, 10).map((p) => (
                            <li key={p.spell}>
                              <span>{p.unit.replace("unit:", "Unit ")}</span>
                              <strong>
                                {p.days} observed days
                                {p.open ? " · ongoing" : ""} · {p.appearances}{" "}
                                appearances
                              </strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="small-empty">
                          Identifiable units and repeated checks are needed.
                        </div>
                      )}
                    </section>
                  </div>
                  <div className="method-note">
                    <AlertCircle size={16} />
                    Historical data is source-specific. Floorplan aggregates do
                    not support individual lifetimes or floor premiums. Prices
                    may vary by lease term and move-in date.
                  </div>
                </>
              )}
              {tab === "Sources" && (
                <>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Sources in this group</h2>
                        <p>
                          Link different websites to the same property without
                          mixing their inventories.
                        </p>
                      </div>
                    </div>
                    {activeSources.map((s) => (
                      <div className="source-card" key={s.id}>
                        <div className={`source-logo ${s.adapter}`}>
                          {s.adapter === "equity" ? (
                            "E"
                          ) : s.adapter === "zillow" ? (
                            "Z"
                          ) : (
                            <Link2 size={21} />
                          )}
                        </div>
                        <div className="source-info">
                          <h3>
                            {s.properties?.name}{" "}
                            <span className={`status ${s.status}`}>
                              {s.status === "ok" ? "Observed" : s.status}
                            </span>
                          </h3>
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {sourceName(s)} <ExternalLink size={13} />
                          </a>
                          <p>
                            {s.error ||
                              `${s.extraction?.units?.length || 0} detected options · ${s.extraction?.complete ? "complete inventory" : "coverage not confirmed"}`}
                          </p>
                          {s.extraction?.warnings?.map((w: string) => (
                            <small className="warning-text" key={w}>
                              {w}
                            </small>
                          ))}
                        </div>
                        <button
                          className="secondary"
                          disabled={!s.extraction}
                          onClick={() => {
                            setSourceId(s.id);
                            setSelection([]);
                            setBathrooms([]);
                            setPlans([]);
                            setUnitSelection([]);
                            setModal("segment");
                          }}
                        >
                          Select options
                        </button>
                        {!demo && (
                          <button
                            className="icon-button"
                            aria-label="Remove source"
                            onClick={() =>
                              run(async () => {
                                if (
                                  !confirm(
                                    "Remove this source and all of its tracking history?",
                                  )
                                )
                                  return;
                                const { error } = await db!
                                  .from("sources")
                                  .delete()
                                  .eq("id", s.id);
                                if (error) throw error;
                                await reload();
                              })
                            }
                          >
                            <X size={17} />
                          </button>
                        )}
                      </div>
                    ))}
                    {!activeSources.length && (
                      <div className="empty-state">
                        <Link2 size={36} />
                        <h2>Add your first rental link</h2>
                        <p>
                          Paste a property page. We’ll inspect it and show
                          supported options.
                        </p>
                        <button
                          className="primary"
                          onClick={() => setModal("source")}
                        >
                          Add listing
                        </button>
                      </div>
                    )}
                  </section>
                  <div className="method-note">
                    <AlertCircle size={16} />
                    Sites without readable rental data need a verified adapter.
                    Access challenges are reported as blocked; they are never
                    bypassed.
                  </div>
                </>
              )}
              {tab === "Alerts" && (
                <>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Your alert preferences</h2>
                        <p>
                          In-app notifications are always available. Email
                          requires a configured delivery provider.
                        </p>
                      </div>
                    </div>
                    {demo ? (
                      <div className="alert-demo">
                        <Bell size={22} />
                        <div>
                          <strong>
                            Price drops, new matches, and returning units
                          </strong>
                          <p>
                            Default alerts for each tracked segment. Sign in to
                            configure delivery and thresholds.
                          </p>
                        </div>
                      </div>
                    ) : (
                      alertRules
                        .filter((r) =>
                          segments.some(
                            (s) =>
                              s.id === r.segment_id &&
                              activeSources.some(
                                (src) => src.id === s.source_id,
                              ),
                          ),
                        )
                        .map((r) => (
                          <div className="alert-rule" key={r.id}>
                            <h3>
                              {
                                segments.find((s) => s.id === r.segment_id)
                                  ?.name
                              }
                            </h3>
                            <div className="checkbox-grid">
                              {[
                                "price_drop",
                                "new_unit",
                                "inventory_change",
                                "threshold_crossing",
                                "reappearance",
                              ].map((kind) => (
                                <label key={kind}>
                                  <input
                                    type="checkbox"
                                    checked={r.kinds.includes(kind)}
                                    disabled={busy}
                                    onChange={(e) =>
                                      updateAlert(r.id, {
                                        kinds: e.target.checked
                                          ? [...r.kinds, kind]
                                          : r.kinds.filter(
                                              (k: string) => k !== kind,
                                            ),
                                      })
                                    }
                                  />
                                  {kind.replaceAll("_", " ")}
                                </label>
                              ))}
                            </div>
                            <div className="inline-controls">
                              <label>
                                Minimum price drop ($)
                                <input
                                  aria-label="Minimum price drop"
                                  type="number"
                                  min="0"
                                  defaultValue={r.min_drop}
                                  key={r.min_drop}
                                  onBlur={(e) => {
                                    if (
                                      Number(e.target.value) >= 0 &&
                                      Number(e.target.value) !== r.min_drop
                                    )
                                      void updateAlert(r.id, {
                                        min_drop: Number(e.target.value),
                                      });
                                  }}
                                />
                              </label>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={r.email}
                                  onChange={(e) =>
                                    updateAlert(r.id, {
                                      email: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Send email
                              </label>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={r.enabled}
                                  onChange={(e) =>
                                    updateAlert(r.id, {
                                      enabled: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Enabled
                              </label>
                            </div>
                          </div>
                        ))
                    )}
                  </section>
                  <section className="panel notifications">
                    <div className="panel-heading">
                      <h2>Recent notifications</h2>
                    </div>
                    {demo ? (
                      <div className="small-empty">
                        No changes can be established from a single snapshot.
                        Connect your workspace to collect history and receive
                        real notifications.
                      </div>
                    ) : notifications.length ? (
                      notifications.map((n) => (
                        <div className="notification-row" key={n.id}>
                          <span className="notification-icon">
                            <Bell size={18} />
                          </span>
                          <div>
                            <strong>{n.message}</strong>
                            <small>
                              {n.email_requested
                                ? n.delivered_at
                                  ? "Email delivered"
                                  : n.delivery_error || "Email pending"
                                : "In-app notification"}
                              {n.attempts >= 5
                                ? " · Delivery stopped after 5 attempts"
                                : ""}
                            </small>
                          </div>
                          <button
                            className="subtle"
                            disabled={!!n.read_at}
                            onClick={() =>
                              run(async () => {
                                const { error } = await db!
                                  .from("notifications")
                                  .update({ read_at: new Date().toISOString() })
                                  .eq("id", n.id);
                                if (error) throw error;
                                await reload();
                              })
                            }
                          >
                            {n.read_at ? "Read" : "Mark read"}
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="small-empty">
                        No changes yet. The first observation sets your
                        baseline.
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>rentalwatch</span>
            <span>A little more clarity. A better next move.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <AlertCircle size={18} />
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X />
            </button>
            {modal === "group" && (
              <form onSubmit={saveGroup}>
                <div className="modal-icon">
                  <Layers />
                </div>
                <h2 id="modal-title">Make room for your options</h2>
                <p>A group keeps the listings you want to compare together.</p>
                <label>
                  Group name
                  <input
                    autoFocus
                    name="name"
                    maxLength={100}
                    required
                    placeholder="Redwood City · 1 bedroom"
                  />
                </label>
                <button className="primary full" disabled={busy}>
                  {busy ? "Saving…" : "Create group"}
                </button>
              </form>
            )}
            {modal === "source" && (
              <form onSubmit={saveSource}>
                <div className="modal-icon">
                  <Link2 />
                </div>
                <h2 id="modal-title">Add a rental listing</h2>
                <p>
                  We’ll inspect the page, then let you choose multiple bedrooms,
                  floorplans, or units.
                </p>
                <label>
                  Property name
                  <input
                    autoFocus
                    name="name"
                    maxLength={150}
                    required
                    placeholder="Riva Terra"
                  />
                </label>
                <label>
                  Link to an existing property
                  <select name="property_id">
                    <option value="">Create a new property</option>
                    {[
                      ...new Map(
                        sources.map((s) => [s.property_id, s]),
                      ).values(),
                    ].map((s) => (
                      <option key={s.property_id} value={s.property_id}>
                        {s.properties?.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Listing URL
                  <input
                    name="url"
                    type="url"
                    required
                    placeholder="https://property-website.com/apartments"
                  />
                </label>
                <div className="form-note">
                  Some websites restrict automated access. We’ll show a clear
                  status if the page cannot be read.
                </div>
                <button className="primary full" disabled={busy}>
                  {busy ? "Adding…" : "Inspect listing"}
                </button>
              </form>
            )}
            {modal === "segment" && (
              <form onSubmit={saveSegment}>
                <div className="modal-icon">
                  <SlidersHorizontal />
                </div>
                <h2 id="modal-title">Choose what to track</h2>
                <p>
                  {activeSource?.properties?.name} ·{" "}
                  {sourceName(activeSource || {})}. Select multiple options.
                  Filters across categories combine.
                </p>
                <label>
                  Tracking name
                  <input
                    name="name"
                    autoFocus
                    required
                    maxLength={100}
                    placeholder="1 & 2 bedrooms · 700+ sqft"
                  />
                </label>
                <fieldset>
                  <legend>Bedrooms (leave empty for all)</legend>
                  <div className="choice-grid">
                    {[
                      ...new Set(
                        currentUnits
                          .map((u) => u.bedrooms)
                          .filter((b) => b !== undefined),
                      ),
                    ].map((b) => (
                      <label className="choice" key={b}>
                        <input
                          type="checkbox"
                          checked={selection.includes(String(b))}
                          onChange={(e) =>
                            setSelection(
                              e.target.checked
                                ? [...selection, String(b)]
                                : selection.filter((v) => v !== String(b)),
                            )
                          }
                        />
                        {b === 0 ? "Studio" : `${b} bedroom`}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Bathrooms (leave empty for all)</legend>
                  <div className="choice-grid">
                    {[
                      ...new Set(
                        currentUnits
                          .map((u) => u.bathrooms)
                          .filter((b) => b !== undefined),
                      ),
                    ].map((b) => (
                      <label className="choice" key={b}>
                        <input
                          type="checkbox"
                          checked={bathrooms.includes(String(b))}
                          onChange={(e) =>
                            setBathrooms(
                              e.target.checked
                                ? [...bathrooms, String(b)]
                                : bathrooms.filter((v) => v !== String(b)),
                            )
                          }
                        />
                        {b} bath
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Floorplans (leave empty for all)</legend>
                  <div className="choice-grid">
                    {[
                      ...new Set(
                        currentUnits.map((u) => u.floorplan).filter(Boolean),
                      ),
                    ].map((p) => (
                      <label className="choice" key={p}>
                        <input
                          type="checkbox"
                          checked={plans.includes(p!)}
                          onChange={(e) =>
                            setPlans(
                              e.target.checked
                                ? [...plans, p!]
                                : plans.filter((v) => v !== p),
                            )
                          }
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Specific units (optional)</legend>
                  <div className="choice-grid">
                    {currentUnits
                      .filter((u) => u.identity === "unit")
                      .map((u) => (
                        <label className="choice" key={u.key}>
                          <input
                            type="checkbox"
                            checked={unitSelection.includes(u.key)}
                            onChange={(e) =>
                              setUnitSelection(
                                e.target.checked
                                  ? [...unitSelection, u.key]
                                  : unitSelection.filter((v) => v !== u.key),
                              )
                            }
                          />
                          Unit {u.unitNumber}
                        </label>
                      ))}
                  </div>
                </fieldset>
                <div className="form-grid">
                  <label>
                    Minimum sqft
                    <input
                      name="sqft"
                      type="number"
                      min="0"
                      max="50000"
                      placeholder="Any"
                    />
                  </label>
                  <label>
                    Maximum rent ($)
                    <input
                      name="rent"
                      type="number"
                      min="1"
                      max="1000000"
                      placeholder="Any"
                    />
                  </label>
                  <label>
                    Available within (days)
                    <input
                      name="days"
                      type="number"
                      min="0"
                      max="365"
                      placeholder="Any"
                    />
                  </label>
                  <label>
                    Check frequency
                    <select
                      value={cadence}
                      onChange={(e) => setCadence(Number(e.target.value))}
                    >
                      <option value={24}>Daily</option>
                      <option value={48}>Every 2 days</option>
                    </select>
                  </label>
                </div>
                <button className="primary full" disabled={busy}>
                  {busy ? "Saving…" : "Start tracking these options"}
                </button>
              </form>
            )}
            {modal === "auth" && (
              <form onSubmit={authenticate}>
                <div className="modal-icon">
                  <House />
                </div>
                <h2 id="modal-title">
                  {authMode === "signup"
                    ? "Create your workspace"
                    : authMode === "reset"
                      ? "Reset your password"
                      : authMode === "update"
                        ? "Choose a new password"
                        : "Welcome back"}
                </h2>
                <p>
                  {configured
                    ? "Save groups, track real listings, and receive changes."
                    : "Accounts become available after connecting your Supabase project. You can explore the captured Riva Terra inventory now."}
                </p>
                {authMode !== "update" && (
                  <label>
                    Email
                    <input
                      autoFocus
                      type="email"
                      name="email"
                      required
                      autoComplete="email"
                    />
                  </label>
                )}
                {authMode !== "reset" && (
                  <label>
                    Password
                    <input
                      type="password"
                      name="password"
                      required
                      minLength={8}
                      autoComplete={
                        authMode === "signup" || authMode === "update"
                          ? "new-password"
                          : "current-password"
                      }
                    />
                  </label>
                )}
                <button className="primary full" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : authMode === "signup"
                      ? "Create account"
                      : authMode === "reset"
                        ? "Send reset link"
                        : authMode === "update"
                          ? "Update password"
                          : "Sign in"}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setAuthMode(authMode === "signup" ? "signin" : "signup")
                  }
                >
                  {authMode === "signup"
                    ? "Already have an account? Sign in"
                    : "New here? Create an account"}
                </button>
                {authMode === "signin" && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setAuthMode("reset")}
                  >
                    Forgot password?
                  </button>
                )}
              </form>
            )}
          </section>
        </div>
      )}
      {selectedUnit && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unit-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close unit history"
              onClick={() => setSelectedUnit(null)}
            >
              <X />
            </button>
            <h2 id="unit-title">
              {selectedUnit.identity === "unit"
                ? `Unit ${selectedUnit.unitNumber}`
                : selectedUnit.floorplan || "Aggregate inventory"}
            </h2>
            <p>
              {selectedUnit.floorplan} · {selectedUnit.sqft || "Unknown"} sqft ·{" "}
              {money(selectedUnit.rent)}/month
            </p>
            <div className="feature-tags">
              {selectedUnit.features.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
            {selectedUnit.identity !== "unit" ? (
              <div className="form-note">
                This source reports aggregate inventory. Individual lifetimes
                and reappearance cannot be established.
              </div>
            ) : (
              <>
                <h3>Observed price history</h3>
                <ul className="lifecycle-list">
                  {demo ? (
                    <li>
                      <span>{date(capturedAt)} · captured snapshot</span>
                      <strong>{money(selectedUnit.rent)}</strong>
                    </li>
                  ) : (
                    snapshots
                      .filter((s) => s.source_id === activeSource?.id)
                      .filter((s) =>
                        s.units.some((u: Unit) => u.key === selectedUnit.key),
                      )
                      .slice(0, 30)
                      .map((s) => (
                        <li key={s.id}>
                          <span>{date(s.checked_at)}</span>
                          <strong>
                            {money(
                              s.units.find(
                                (u: Unit) => u.key === selectedUnit.key,
                              )?.rent,
                            )}
                          </strong>
                        </li>
                      ))
                  )}
                </ul>
              </>
            )}
            {activeSource && (
              <a
                className="primary full"
                target="_blank"
                rel="noreferrer"
                href={activeSource.url}
              >
                Open original listing <ExternalLink size={16} />
              </a>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
  green,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  green?: boolean;
}) {
  return (
    <section className="stat-card">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className={`stat-detail ${green ? "positive" : ""}`}>
        {green && <TrendingDown size={13} />} {detail}
      </div>
    </section>
  );
}
function TrendChart({ data, metric }: { data: any[]; metric: string }) {
  if (!data.length)
    return (
      <div className="chart-empty">
        Trend lines appear after successful checks. Failed checks never become
        zero inventory.
      </div>
    );
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 15, right: 18, bottom: 0, left: 2 }}
        >
          <defs>
            <linearGradient id="rentFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3a8a72" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#3a8a72" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={false}
            stroke="#e8eeeb"
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            minTickGap={45}
            tick={{ fontSize: 12, fill: "#7f8a86" }}
            tickMargin={15}
          />
          <YAxis
            domain={metric === "count" ? [0, "auto"] : ["auto", "auto"]}
            axisLine={false}
            tickLine={false}
            width={64}
            tick={{ fontSize: 12, fill: "#7f8a86" }}
            tickFormatter={(v) =>
              metric === "count"
                ? `${v}`
                : metric === "dollarsPerSqft"
                  ? `$${v.toFixed(2)}`
                  : `$${v.toLocaleString()}`
            }
          />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #e3e9e5" }}
            formatter={(v: any) =>
              metric === "count"
                ? `${v} available`
                : metric === "dollarsPerSqft"
                  ? `$${Number(v).toFixed(2)}`
                  : money(Number(v))
            }
          />
          <Area
            type="stepAfter"
            dataKey={metric}
            name={metric === "count" ? "Inventory" : "Asking price"}
            stroke="#337a62"
            strokeWidth={2.5}
            fill="url(#rentFill)"
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
function PremiumTable({
  units,
}: {
  units: (Unit & { observedDay?: string })[];
}) {
  const groups = new Map<string, number[]>();
  for (const u of units) {
    if (u.identity !== "unit" || !u.rent || !u.sqft || u.floor === undefined)
      continue;
    const key = `${u.bedrooms ?? "?"}bd / ${u.bathrooms ?? "?"}ba · ${u.sqft} sqft · Floor ${u.floor}`;
    groups.set(key, [...(groups.get(key) || []), u.rent / u.sqft]);
  }
  const comparisons = [
    ...premiumComparisons(units, "floor").map((c) => ({
      ...c,
      dimension: "floor",
    })),
    ...premiumComparisons(units, "size").map((c) => ({
      ...c,
      dimension: "size",
    })),
  ];
  return groups.size ? (
    <>
      <div className="premium-comparisons">
        {comparisons.slice(0, 6).map((c, i) => (
          <div className="premium-comparison" key={i}>
            <strong>
              {c.dimension === "floor"
                ? `Floor ${c.key} vs floor ${c.base}`
                : `${c.key} vs ${c.base} sqft`}
              : {c.deltaPct >= 0 ? "+" : ""}
              {c.deltaPct.toFixed(1)}% / sqft
            </strong>
            <small>
              {c.context} · {c.observations + c.baselineObservations}{" "}
              observations
            </small>
          </div>
        ))}
        {!comparisons.length && (
          <p>
            Not enough comparable floors or exact sizes to estimate a premium.
          </p>
        )}
      </div>
      <ul className="premium-list">
        {[...groups].slice(0, 12).map(([name, values]) => (
          <li key={name}>
            <span>
              {name}
              <small>{values.length} observations</small>
            </span>
            <strong>
              ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)}{" "}
              / sqft
            </strong>
          </li>
        ))}
      </ul>
    </>
  ) : (
    <div className="small-empty">
      Floor, size, and unit identity are required to estimate premiums.
    </div>
  );
}
