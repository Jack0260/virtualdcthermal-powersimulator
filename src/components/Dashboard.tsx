import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, Box, Flame, Grid3x3, Pause, Play, RotateCcw, Snowflake, Trash2, Zap } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import {
  COLS, HEAT_BG, PDU_KW, ROWS, heatLevel, initRacks, predict, step,
  type Alert, type Cooling, type Rack, type Thresholds,
} from "@/lib/sim";

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "—");

export function Dashboard() {
  const [racks, setRacks] = useState<Rack[]>(() => initRacks());
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const [view3d, setView3d] = useState(true);
  const [selected, setSelected] = useState<string>("R1-01");
  const [cooling, setCooling] = useState<Cooling>({ setpoint: 18, crac: Array(ROWS).fill(true) });
  const [th, setTh] = useState<Thresholds>({ warn: 27, crit: 32, powerPct: 90 });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const state = useRef<Record<string, string>>({});
  const alertId = useRef(0);

  const coolingRef = useRef(cooling); coolingRef.current = cooling;

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      try {
        setRacks((r) => step(r, coolingRef.current));
        setTick((t) => t + 1);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Telemetry stream error");
        setRunning(false);
      }
    }, 1000 / speed);
    return () => clearInterval(iv);
  }, [running, speed]);

  const preds = useMemo(() => new Map(racks.map((r) => [r.id, predict(r, th)])), [racks, th]);

  // automated threshold alerts (edge-triggered)
  useEffect(() => {
    const fresh: Alert[] = [];
    for (const r of racks) {
      const p = preds.get(r.id)!;
      const pct = (r.powerKw / PDU_KW) * 100;
      const checks: [string, string | null, Alert["level"], Alert["kind"], string][] = [
        ["thermal", r.inlet >= th.crit ? "crit" : r.inlet >= th.warn ? "warn" : null, r.inlet >= th.crit ? "crit" : "warn", "thermal", `Inlet ${fmt(r.inlet)}°C exceeds ${r.inlet >= th.crit ? "critical" : "warning"} threshold`],
        ["power", pct >= th.powerPct ? "crit" : null, "crit", "power", `PDU load ${fmt(pct, 0)}% ≥ ${th.powerPct}% limit`],
        ["pred", p.etaCrit !== null && p.etaCrit > 0 && p.etaCrit < 60 ? "warn" : null, "warn", "predictive", `Projected to hit ${th.crit}°C in ~${fmt(p.etaCrit ?? 0, 0)}s`],
      ];
      for (const [key, cur, level, kind, msg] of checks) {
        const k = `${r.id}:${key}`;
        if (cur && state.current[k] !== cur) fresh.push({ id: ++alertId.current, t: tick, rack: r.id, level, kind, msg });
        state.current[k] = cur ?? "";
      }
    }
    if (fresh.length) setAlerts((a) => [...fresh.reverse(), ...a].slice(0, 80));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racks]);

  const sel = racks.find((r) => r.id === selected) ?? racks[0];
  const selPred = preds.get(sel.id)!;
  const totalKw = racks.reduce((s, r) => s + r.powerKw, 0);
  const avgInlet = racks.reduce((s, r) => s + r.inlet, 0) / racks.length;
  const hot = racks.filter((r) => r.inlet >= th.warn).length;
  const pue = 1 + (cooling.crac.filter(Boolean).length * 18 + (24 - cooling.setpoint) * 6) / Math.max(totalKw, 1);
  const ranked = [...racks].sort((a, b) => preds.get(b.id)!.risk - preds.get(a.id)!.risk).slice(0, 8);

  const reset = useCallback(() => {
    setRacks(initRacks()); setAlerts([]); setTick(0); state.current = {};
    setCooling({ setpoint: 18, crac: Array(ROWS).fill(true) }); setRunning(true); setError(null);
  }, []);

  const toggleFault = () => setRacks((rs) => rs.map((r) => (r.id === sel.id ? { ...r, fault: !r.fault } : r)));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
        <div className="hazard h-1 w-full" />
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            <h1 className="font-display text-xl font-semibold uppercase tracking-wide">Virtual DC <span className="text-muted-foreground">Thermal-Power Simulator</span></h1>
          </div>
          <span className={`ml-1 flex items-center gap-1.5 font-mono text-xs ${running ? "text-ok" : "text-muted-foreground"}`}>
            <span className={`h-2 w-2 rounded-full ${running ? "bg-ok animate-crit" : "bg-muted-foreground"}`} />
            {running ? "STREAMING" : "PAUSED"} · T+{tick}s
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" onClick={() => setRunning((r) => !r)} aria-label={running ? "Pause" : "Play"}>
              {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{running ? "Pause" : "Run"}
            </button>
            <div className="flex rounded-sm border border-border" role="group" aria-label="Simulation speed">
              {[1, 2, 5].map((s) => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={`px-2 py-1 font-mono text-xs ${speed === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{s}×</button>
              ))}
            </div>
            <button className="btn" onClick={reset}><RotateCcw className="h-3.5 w-3.5" />Reset</button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="mx-auto mt-3 max-w-[1600px] px-4">
          <div className="panel flex items-center gap-3 border-destructive p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Telemetry stream stopped: {error}
            <button className="btn ml-auto" onClick={() => { setError(null); setRunning(true); }}>Retry</button>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[1fr_360px]">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2">
          <Kpi icon={Zap} label="IT Load" value={`${fmt(totalKw)} kW`} />
          <Kpi icon={Activity} label="Avg Inlet" value={`${fmt(avgInlet)} °C`} tone={avgInlet >= th.warn ? "warn" : undefined} />
          <Kpi icon={Flame} label="Hot Racks" value={`${hot} / ${racks.length}`} tone={hot > 0 ? "crit" : undefined} />
          <Kpi icon={Snowflake} label="Est. PUE" value={fmt(pue, 2)} />
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="label-caps">Rack heat map · inlet °C</span>
            <div className="flex items-center gap-2">
              <Legend th={th} />
              <button className="btn" onClick={() => setView3d((v) => !v)} aria-pressed={view3d}>
                {view3d ? <Grid3x3 className="h-3.5 w-3.5" /> : <Box className="h-3.5 w-3.5" />}{view3d ? "2D" : "3D"}
              </button>
            </div>
          </div>
          <div className="floor-grid flex min-h-[420px] items-center justify-center overflow-x-auto p-6" style={{ perspective: "1400px" }}>
            <div className="grid gap-x-2 transition-transform duration-700"
              style={{
                gridTemplateColumns: `repeat(${COLS}, minmax(34px, 52px))`,
                rowGap: view3d ? "38px" : "14px",
                transformStyle: "preserve-3d",
                transform: view3d ? "rotateX(55deg) rotateZ(-28deg)" : "none",
              }}>
              {racks.map((r) => {
                const lvl = heatLevel(r.inlet, th);
                const h = view3d ? 14 + (r.powerKw / PDU_KW) * 46 : 0;
                const isSel = r.id === sel.id;
                return (
                  <button key={r.id} onClick={() => setSelected(r.id)} aria-label={`Rack ${r.id}, ${fmt(r.inlet)} degrees`}
                    className="relative aspect-[3/4] focus:outline-none" style={{ transformStyle: "preserve-3d" }}>
                    {view3d && (
                      <>
                        <span className={`absolute inset-x-0 bottom-0 origin-bottom ${HEAT_BG[lvl]} brightness-75`}
                          style={{ height: h, transform: "rotateX(-90deg)" }} />
                        <span className={`absolute inset-y-0 right-0 origin-right ${HEAT_BG[lvl]} brightness-50`}
                          style={{ width: h, transform: "rotateY(90deg)" }} />
                      </>
                    )}
                    <span className={`absolute inset-0 flex items-center justify-center rounded-[2px] font-mono text-[9px] font-bold text-primary-foreground transition-colors ${HEAT_BG[lvl]} ${lvl === 4 ? "animate-crit" : ""} ${isSel ? "ring-2 ring-foreground" : ""}`}
                      style={{ transform: `translateZ(${h}px)` }}>
                      {r.fault ? "⚠" : Math.round(r.inlet)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border p-3 sm:grid-cols-4">
            {cooling.crac.map((on, i) => (
              <button key={i} className={`btn justify-center ${on ? "" : "border-destructive text-destructive"}`}
                onClick={() => setCooling((c) => ({ ...c, crac: c.crac.map((v, j) => (j === i ? !v : v)) }))}>
                <Snowflake className="h-3.5 w-3.5" />CRAC-{i + 1} {on ? "ON" : "FAILED"}
              </button>
            ))}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="label-caps">Selected rack</span>
              <span className="font-display text-2xl font-semibold">{sel.id}</span>
            </div>
            <Spark data={sel.hist} warn={th.warn} crit={th.crit} />
            <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
              <Stat k="Inlet" v={`${fmt(sel.inlet)} °C`} />
              <Stat k="Outlet" v={`${fmt(sel.outlet)} °C`} />
              <Stat k="Power" v={`${fmt(sel.powerKw, 2)} kW`} />
              <Stat k="PDU" v={`${fmt((sel.powerKw / PDU_KW) * 100, 0)} %`} />
              <Stat k="Fan" v={`${fmt(sel.fan, 0)} %`} />
              <Stat k="Trend" v={`${selPred.slope >= 0 ? "+" : ""}${fmt(selPred.slope * 60, 2)} °C/min`} />
            </dl>
            <div className="mt-3">
              <div className="flex justify-between font-mono text-xs"><span className="label-caps">Failure risk</span><span>{fmt(selPred.risk * 100, 0)}%</span></div>
              <div className="mt-1 h-2 rounded-sm bg-muted"><div className={`h-full rounded-sm ${selPred.risk > 0.66 ? "bg-destructive" : selPred.risk > 0.33 ? "bg-warning" : "bg-ok"}`} style={{ width: `${selPred.risk * 100}%` }} /></div>
              <p className="mt-2 text-xs text-muted-foreground">
                {selPred.etaCrit === 0 ? "Critical threshold already exceeded." : selPred.etaCrit !== null ? `Projected critical in ~${fmt(selPred.etaCrit, 0)}s at current trend.` : "No critical crossing projected."}
              </p>
            </div>
            <button className={`btn mt-3 w-full justify-center ${sel.fault ? "border-destructive text-destructive" : ""}`} onClick={toggleFault}>
              <AlertTriangle className="h-3.5 w-3.5" />{sel.fault ? "Clear injected fault" : "Inject fault"}
            </button>
          </div>

          <div className="panel space-y-3 p-4">
            <span className="label-caps">Cooling & thresholds</span>
            <Slider label="Supply setpoint" unit="°C" min={14} max={26} value={cooling.setpoint} onChange={(v) => setCooling((c) => ({ ...c, setpoint: v }))} />
            <Slider label="Warning" unit="°C" min={20} max={th.crit - 1} value={th.warn} onChange={(v) => setTh((t) => ({ ...t, warn: v }))} />
            <Slider label="Critical" unit="°C" min={th.warn + 1} max={45} value={th.crit} onChange={(v) => setTh((t) => ({ ...t, crit: v }))} />
            <Slider label="PDU limit" unit="%" min={60} max={100} value={th.powerPct} onChange={(v) => setTh((t) => ({ ...t, powerPct: v }))} />
          </div>
        </aside>

        <section className="panel p-4">
          <span className="label-caps">Predictive analytics · highest risk</span>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1 pr-3">Rack</th><th className="pr-3">Inlet</th><th className="pr-3">Power</th><th className="pr-3">Trend/min</th><th className="pr-3">ETA crit</th><th className="w-1/3">Risk</th></tr>
              </thead>
              <tbody>
                {ranked.map((r) => {
                  const p = preds.get(r.id)!;
                  return (
                    <tr key={r.id} onClick={() => setSelected(r.id)} className="cursor-pointer border-t border-border hover:bg-muted">
                      <td className="py-1.5 pr-3 font-semibold">{r.id}{r.fault && <span className="ml-1 text-destructive">⚠</span>}</td>
                      <td className="pr-3">{fmt(r.inlet)}°</td>
                      <td className="pr-3">{fmt(r.powerKw, 1)}kW</td>
                      <td className="pr-3">{fmt(p.slope * 60, 2)}</td>
                      <td className="pr-3">{p.etaCrit === 0 ? "NOW" : p.etaCrit === null ? "—" : `${fmt(p.etaCrit, 0)}s`}</td>
                      <td><div className="h-1.5 rounded-sm bg-muted"><div className={`h-full rounded-sm ${p.risk > 0.66 ? "bg-destructive" : p.risk > 0.33 ? "bg-warning" : "bg-ok"}`} style={{ width: `${p.risk * 100}%` }} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel flex max-h-[420px] flex-col p-4">
          <div className="flex items-center justify-between">
            <span className="label-caps">Automated alerts ({alerts.length})</span>
            <button className="btn" onClick={() => setAlerts([])} disabled={!alerts.length}><Trash2 className="h-3.5 w-3.5" />Clear</button>
          </div>
          <ul className="mt-2 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {alerts.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">All systems nominal.</li>}
            {alerts.map((a) => (
              <li key={a.id}>
                <button onClick={() => setSelected(a.rack)} className={`w-full border-l-2 bg-muted/50 px-2 py-1.5 text-left text-xs hover:bg-muted ${a.level === "crit" ? "border-destructive" : "border-warning"}`}>
                  <div className="flex justify-between font-mono">
                    <span className={a.level === "crit" ? "text-destructive" : "text-warning"}>{a.level.toUpperCase()} · {a.kind}</span>
                    <span className="text-muted-foreground">T+{a.t}s</span>
                  </div>
                  <div><b>{a.rack}</b> — {a.msg}</div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function Kpi({ icon: I, label, value, tone }: { icon: typeof Zap; label: string; value: string; tone?: "warn" | "crit" }) {
  return (
    <div className="panel flex items-center gap-3 p-3">
      <I className={`h-5 w-5 ${tone === "crit" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-primary"}`} />
      <div><div className="label-caps">{label}</div><div className="font-display text-2xl font-semibold leading-none">{value}</div></div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-sm bg-muted px-2 py-1"><dt className="label-caps">{k}</dt><dd>{v}</dd></div>;
}

function Legend({ th }: { th: Thresholds }) {
  return (
    <div className="hidden items-center gap-1 font-mono text-[10px] text-muted-foreground sm:flex">
      {HEAT_BG.map((c) => <span key={c} className={`h-2.5 w-4 ${c}`} />)}
      <span className="ml-1">≤{th.warn - 6}° … ≥{th.crit}°</span>
    </div>
  );
}

function Slider({ label, unit, min, max, value, onChange }: { label: string; unit: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs"><span>{label}</span><span className="font-mono">{value}{unit}</span></div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

function Spark({ data, warn, crit }: { data: number[]; warn: number; crit: number }) {
  const W = 320, H = 80;
  if (data.length < 2) return <div className="mt-3 flex h-20 items-center justify-center rounded-sm bg-muted text-xs text-muted-foreground">Collecting telemetry…</div>;
  const lo = Math.min(...data, warn - 4), hi = Math.max(...data, crit + 1);
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-20 w-full rounded-sm bg-muted" preserveAspectRatio="none">
      <line x1="0" x2={W} y1={y(warn)} y2={y(warn)} className="stroke-warning" strokeDasharray="4 4" />
      <line x1="0" x2={W} y1={y(crit)} y2={y(crit)} className="stroke-destructive" strokeDasharray="4 4" />
      <polyline points={pts} fill="none" className="stroke-primary" strokeWidth="2" />
    </svg>
  );
}
