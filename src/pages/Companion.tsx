import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Cable, Power, ShieldAlert, ShieldCheck, Activity, History as HistoryIcon, Lock, Unlock, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useCompanionSerial, onCompanionTelemetry, type CompanionTelemetry } from "@/hooks/useCompanionSerial";
import { DEVICES, type Polarity } from "@/data/devices";

// ---------------- Safety constants ----------------
const VOLT_TOLERANCE = 0.05;     // ±5%
const CHART_WINDOW = 120;        // samples
const SHORT_V_THRESHOLD = 1.0;   // V — measured collapses below this
const SHORT_I_THRESHOLD = 1.5;   // A — current spikes above this
const SHORT_REACT_MS = 100;      // hard SLA for emergency cut
const DEFECT_LOG_KEY = "picopd.defect.log.v1";

// ---------------- Companion profile DB (mirror of firmware C++ table) ----------------
// Includes Strymon BigSky which is not in the main pedalboard DEVICES list.
type CompanionProfile = {
  name: string;
  brand: string;
  voltage: number;
  current: number;
  polarity: Polarity;
  highRisk?: boolean;
  plugSpec: string;         // physical plug operator must use
  cableConfirmText: string; // exact text on the confirmation button
};

const EXTRA_PROFILES: CompanionProfile[] = [
  {
    name: "Strymon BigSky",
    brand: "Strymon",
    voltage: 9.0,
    current: 0.3,
    polarity: "center-negative",
    plugSpec: "2.1 × 5.5 mm barrel, CENTER NEGATIVE (standard pedal)",
    cableConfirmText: "I am using the standard pedal cable (Center Negative) for the Strymon BigSky",
  },
];

const COMPANION_PROFILES: CompanionProfile[] = [
  ...DEVICES
    .filter((d) => d.name !== "[ MANUAL MODE ]")
    .map<CompanionProfile>((d) => {
      const highRisk =
        d.name === "Volca Series" || d.name === "MicroFreak" || d.name === "JD-Xi Synth";
      let plugSpec = "2.1 × 5.5 mm barrel";
      let cableConfirmText = `I am using the correct cable (${d.defaultPolarity}) for the ${d.name}`;
      if (d.name === "Volca Series") {
        plugSpec = "YELLOW / EIAJ-03 plug — 9V, CENTER POSITIVE. NEVER use a standard pedal cable.";
        cableConfirmText = "I am using the correct Yellow / EIAJ-03 cable for the Volca (Center Positive)";
      } else if (d.name === "MicroFreak") {
        plugSpec = "2.1 × 5.5 mm barrel, 9V, CENTER NEGATIVE (standard pedal cable).";
        cableConfirmText = "I am using the standard pedal cable (Center Negative) for the MicroFreak";
      } else if (d.name === "HX Stomp / XL") {
        plugSpec = "2.1 × 5.5 mm barrel, 9V, CENTER NEGATIVE (standard pedal cable).";
        cableConfirmText = "I am using the standard pedal cable (Center Negative) for the HX Stomp";
      }
      return {
        name: d.name,
        brand: d.brand ?? "",
        voltage: d.voltage,
        current: d.current,
        polarity: d.defaultPolarity,
        highRisk,
        plugSpec,
        cableConfirmText,
      };
    }),
  ...EXTRA_PROFILES,
];

const findProfile = (name: string) => COMPANION_PROFILES.find((p) => p.name === name) ?? null;

// ---------------- Types ----------------
type AuditRow = {
  id: string;
  ts: number;
  profile: string;
  expectedV: number;
  measuredV: number;
  measuredI: number;
  reported?: string;
  expectedPolarity: Polarity;
  match: boolean;
  failure?: string;
};
type DefectReport = {
  id: string;
  ts: number;
  profile: string;
  expectedV: number;
  measuredV: number;
  measuredI: number;
  expectedPolarity: Polarity;
  reportedPolarity?: string;
  note: string;
};

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const timeStr = (ts: number) => new Date(ts).toLocaleTimeString();

// ---------------- Polarity SVG ----------------
const PolarityDiagram = ({ polarity, warn }: { polarity: Polarity; warn?: boolean }) => {
  const positive = polarity === "center-positive";
  return (
    <svg viewBox="0 0 200 120" className={`w-full h-auto ${warn ? "animate-pulse" : ""}`}>
      {/* outer barrel ring */}
      <circle cx="100" cy="60" r="46" fill="none" stroke={positive ? "hsl(var(--muted-foreground))" : "hsl(var(--destructive))"} strokeWidth="6" />
      {/* inner pin */}
      <circle cx="100" cy="60" r="14" fill={positive ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))"} />
      {/* center sign */}
      <text x="100" y="67" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="900" fontSize="22"
        fill="hsl(var(--background))">{positive ? "+" : "−"}</text>
      {/* outer sign */}
      <text x="100" y="20" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="900" fontSize="18"
        fill={positive ? "hsl(var(--muted-foreground))" : "hsl(var(--destructive))"}>{positive ? "−" : "+"}</text>
      <text x="100" y="115" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="700" fontSize="11"
        fill="hsl(var(--foreground))">
        {positive ? "CENTER POSITIVE" : "CENTER NEGATIVE"}
      </text>
    </svg>
  );
};

// ---------------- Component ----------------
const Companion = () => {
  const { supported, status, error, telemetry, connect, disconnect, setOutput, selectProfile } = useCompanionSerial();

  useEffect(() => {
    const html = document.documentElement;
    const had = html.classList.contains("dark");
    html.classList.add("dark");
    return () => { if (!had) html.classList.remove("dark"); };
  }, []);

  const connected = status === "connected";

  // ---- State ----
  const [selectedName, setSelectedName] = useState<string>("");
  const [cableConfirmed, setCableConfirmed] = useState<boolean>(false);
  const [series, setSeries] = useState<Array<{ t: number; v: number; i: number }>>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [defects, setDefects] = useState<DefectReport[]>(() => {
    try { return JSON.parse(localStorage.getItem(DEFECT_LOG_KEY) ?? "[]"); } catch { return []; }
  });
  const [shortAlarm, setShortAlarm] = useState<{ ts: number; v: number; i: number } | null>(null);
  const [divergenceAlarm, setDivergenceAlarm] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const profile = useMemo(() => findProfile(selectedName), [selectedName]);
  const expectedV = profile?.voltage ?? 0;
  const expectedPolarity = profile?.polarity ?? null;

  // Persist defect log.
  useEffect(() => {
    try { localStorage.setItem(DEFECT_LOG_KEY, JSON.stringify(defects)); } catch {}
  }, [defects]);

  // ---- Profile selection (interlock) ----
  const onPickProfile = useCallback((name: string) => {
    setSelectedName(name);
    setCableConfirmed(false);    // FREEZE telemetry display
    setSeries([]);
    setShortAlarm(null);
    setDivergenceAlarm(null);
    if (connected) {
      void selectProfile(name);
      void setOutput(false);     // ensure output is off until operator confirms
    }
  }, [connected, selectProfile, setOutput]);

  const confirmCable = useCallback(() => {
    if (!profile) return;
    setCableConfirmed(true);
  }, [profile]);

  // ---- Emergency cut helper (sub-100ms target) ----
  const emergencyCutRef = useRef<(reason: string, v: number, i: number) => void>();
  emergencyCutRef.current = (reason, v, i) => {
    // Fire-and-forget: do not await, so the write hits the wire ASAP.
    try { void setOutput(false); } catch {}
    setShortAlarm({ ts: Date.now(), v, i });
    appendLog({
      id: `${Date.now()}-short`, ts: Date.now(),
      profile: profile?.name ?? "—",
      expectedV, measuredV: v, measuredI: i,
      expectedPolarity: expectedPolarity ?? "center-positive",
      match: false, failure: reason,
    });
  };

  const appendLog = (row: AuditRow) => setLogs((p) => [row, ...p].slice(0, 200));

  // ---- Telemetry stream: chart + safety logic ----
  const lastTRef = useRef<CompanionTelemetry | null>(null);
  useEffect(() => {
    return onCompanionTelemetry((t) => {
      // Always evaluate safety regardless of UI freeze.
      const prev = lastTRef.current;

      // (3) Active short / reverse-polarity protection
      if (t.en === true && t.v < SHORT_V_THRESHOLD && t.i > SHORT_I_THRESHOLD) {
        const fired = performance.now();
        emergencyCutRef.current?.(
          "POSSIBLE SHORT CIRCUIT OR REVERSED POLARITY — output cut",
          t.v, t.i,
        );
        console.warn(`[SAFETY] Emergency cut dispatched in ${(performance.now() - fired).toFixed(1)}ms`);
      }

      // (4) Divergence between expected and firmware-reported polarity
      if (cableConfirmed && profile && t.polarity && t.polarity !== profile.polarity) {
        const msg = `Polarity divergence: expected ${profile.polarity}, hardware reports ${t.polarity}`;
        setDivergenceAlarm(msg);
        try { void setOutput(false); } catch {}
        appendLog({
          id: `${t.ts}-div`, ts: t.ts,
          profile: profile.name, expectedV, measuredV: t.v, measuredI: t.i,
          expectedPolarity: profile.polarity, reported: t.polarity,
          match: false, failure: msg,
        });
      }

      // 5V over-volt flash
      if (profile && profile.voltage <= 5.0 && t.v > 5.2) {
        setFlash(true);
        window.setTimeout(() => setFlash(false), 250);
      }

      // Only feed the chart when operator unlocked telemetry display.
      if (cableConfirmed) {
        setSeries((prev2) => {
          const next = [...prev2, { t: t.ts, v: t.v, i: t.i }];
          return next.length > CHART_WINDOW ? next.slice(-CHART_WINDOW) : next;
        });
      }

      lastTRef.current = t;
      void prev;
    });
  }, [cableConfirmed, profile, expectedV, setOutput]);

  // Show telemetry only when interlock satisfied.
  const liveT = cableConfirmed ? telemetry : null;
  const voltageDelta = liveT && profile ? liveT.v - profile.voltage : 0;
  const voltageOk = !!profile && !!liveT && Math.abs(voltageDelta) <= profile.voltage * VOLT_TOLERANCE;
  const overvoltage = !!profile && !!liveT && liveT.v > profile.voltage * (1 + VOLT_TOLERANCE);
  const reportedPolarityMatch = liveT?.polarity ? liveT.polarity === expectedPolarity : true;

  const fiveVoltDanger = !!profile && profile.voltage <= 5.0 && (liveT?.v ?? 0) > 5.2;
  const criticalOverlay = shortAlarm !== null || divergenceAlarm !== null || fiveVoltDanger;

  // ---- Actions ----
  const armOutput = () => { if (cableConfirmed && profile) void setOutput(true); };
  const epo = () => { void setOutput(false); setShortAlarm(null); setDivergenceAlarm(null); };

  const reportDefect = () => {
    if (!profile || !liveT) return;
    const rep: DefectReport = {
      id: `${Date.now()}-def`, ts: Date.now(),
      profile: profile.name, expectedV: profile.voltage,
      measuredV: liveT.v, measuredI: liveT.i,
      expectedPolarity: profile.polarity, reportedPolarity: liveT.polarity,
      note: shortAlarm
        ? "Short / reverse polarity at output ARM"
        : divergenceAlarm ?? (voltageOk ? "Operator-reported defect" : "Voltage out of tolerance"),
    };
    setDefects((p) => [rep, ...p].slice(0, 500));
  };

  const clearDefects = () => setDefects([]);

  return (
    <div className={`min-h-screen bg-background text-foreground ${flash || criticalOverlay ? "ring-8 ring-destructive animate-pulse" : ""}`}>
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8 space-y-6">

        {/* ============== Header ============== */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">PicoPD Pro · Companion · Safety v2</div>
            <h1 className="text-xl font-extrabold md:text-2xl">Factory Safety Console</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-success animate-pulse-dot" : "bg-muted-foreground"}`} />
              {connected ? "LINKED · 115200 8N1" : status.toUpperCase()}
            </span>
            {connected ? (
              <Button onClick={() => void disconnect()} className="hw-btn gap-2 rounded-full">
                <Cable className="h-4 w-4" /> Disconnect
              </Button>
            ) : (
              <Button onClick={() => void connect()} disabled={!supported || status === "connecting"}
                className="hw-btn-primary gap-2 rounded-full px-5 font-bold">
                <Cable className="h-4 w-4" />
                {status === "connecting" ? "Connecting…" : "Connect PicoPD Pro"}
              </Button>
            )}
          </div>
        </header>

        {/* ============== Critical alarms ============== */}
        {shortAlarm && (
          <div className="rounded-xl border-4 border-destructive bg-destructive/25 px-5 py-5 text-destructive font-extrabold text-xl flex flex-wrap items-center justify-between gap-3 animate-pulse">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-7 w-7" />
              POSSÍVEL CURTO-CIRCUITO OU POLARIDADE INVERTIDA DETECTADA! SAÍDA CORTADA POR SEGURANÇA
            </div>
            <div className="font-mono-tech text-sm">
              V={fmt(shortAlarm.v)} V · I={fmt(shortAlarm.i)} A · {timeStr(shortAlarm.ts)}
            </div>
            <Button onClick={() => setShortAlarm(null)} className="hw-btn rounded-full">Acknowledge</Button>
          </div>
        )}
        {divergenceAlarm && (
          <div className="rounded-xl border-2 border-destructive bg-destructive/15 px-4 py-3 text-destructive flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-5 w-5" /> {divergenceAlarm}
            </div>
            <Button onClick={() => setDivergenceAlarm(null)} className="hw-btn rounded-full">Acknowledge</Button>
          </div>
        )}
        {fiveVoltDanger && (
          <div className="rounded-xl border-2 border-destructive bg-destructive/20 px-5 py-4 text-destructive font-extrabold text-lg flex items-center gap-3 animate-pulse">
            <ShieldAlert className="h-6 w-6" />
            PERIGO: SOBRETENSÃO DETECTADA EM DISPOSITIVO 5V
          </div>
        )}
        {telemetry?.err && (
          <div className="rounded-xl border border-destructive/60 bg-destructive/10 px-4 py-3 text-destructive flex items-center gap-3">
            <AlertTriangle className="h-5 w-5" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">Firmware error</div>
              <div className="font-mono-tech text-sm">{telemetry.err}</div>
            </div>
          </div>
        )}
        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</div>}

        {/* ============== Profile picker + EPO ============== */}
        <section className="panel p-5 md:p-6 grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Active Profile</div>
            <Select value={selectedName} onValueChange={onPickProfile}>
              <SelectTrigger className="mt-2 h-12 text-base font-bold">
                <SelectValue placeholder="Select a device profile…" />
              </SelectTrigger>
              <SelectContent className="max-h-[60vh]">
                {COMPANION_PROFILES.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.highRisk && "⚠ "}{p.name}
                    <span className="text-muted-foreground font-mono-tech"> · {p.voltage.toFixed(1)} V · {p.polarity === "center-positive" ? "C+" : "C−"}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 text-xs text-muted-foreground">
              Expected: <span className="font-mono-tech text-foreground">
                {profile ? `${profile.voltage.toFixed(1)} V / ${profile.current.toFixed(2)} A · ${profile.polarity}` : "—"}
              </span>
            </div>
          </div>
          <Button onClick={armOutput} disabled={!connected || !profile || !cableConfirmed || !!shortAlarm}
            className="h-16 min-w-[160px] rounded-2xl px-6 text-base font-extrabold tracking-wider hw-btn-primary">
            <Power className="mr-2 h-5 w-5" /> ARM OUTPUT
          </Button>
          <Button onClick={epo} disabled={!connected}
            className="h-16 min-w-[220px] rounded-2xl px-6 text-lg font-extrabold tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg">
            <ShieldAlert className="mr-2 h-6 w-6" /> EMERGENCY OFF
          </Button>
        </section>

        {/* ============== High-risk warning ============== */}
        {profile?.highRisk && !cableConfirmed && (
          <section className="rounded-2xl border-4 border-warning bg-warning/15 p-6 md:p-8">
            <div className="flex items-center gap-3 text-warning">
              <AlertTriangle className="h-8 w-8" />
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-wider uppercase">
                ⚠ High-risk device — {profile.name}
              </h2>
            </div>
            <p className="mt-3 font-mono-tech text-lg md:text-xl leading-snug text-foreground">
              {profile.plugSpec}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Using the wrong cable will damage this device. The dashboard is FROZEN until you confirm the physical cable below.
            </p>
          </section>
        )}

        {/* ============== Anti-distraction interlock ============== */}
        <section className={`panel p-5 md:p-6 ${cableConfirmed ? "border-success/40" : profile ? "border-warning/60" : ""}`}>
          <div className="mb-3 flex items-center gap-2">
            {cableConfirmed ? <Unlock className="h-5 w-5 text-success" /> : <Lock className="h-5 w-5 text-warning" />}
            <h2 className="text-sm font-bold uppercase tracking-wider">Cable interlock</h2>
            <span className={`ml-auto font-mono-tech text-xs font-bold ${cableConfirmed ? "text-success" : "text-warning"}`}>
              {cableConfirmed ? "UNLOCKED — telemetry live" : "LOCKED — telemetry frozen"}
            </span>
          </div>
          {!profile ? (
            <p className="text-sm text-muted-foreground">Select a profile to begin.</p>
          ) : cableConfirmed ? (
            <p className="text-sm text-muted-foreground">
              Operator confirmed: <span className="font-mono-tech text-foreground">{profile.cableConfirmText}</span>
            </p>
          ) : (
            <div className="space-y-3">
              <Button onClick={confirmCable}
                className="w-full h-auto whitespace-normal text-left rounded-xl px-5 py-4 bg-warning text-background hover:bg-warning/90 font-extrabold text-base md:text-lg">
                <ShieldCheck className="mr-2 h-5 w-5 shrink-0" />
                {profile.cableConfirmText}
              </Button>
              <p className="text-xs text-destructive font-bold">
                Telemetry display is FROZEN until you click above. Hardware safety still runs in the background.
              </p>
            </div>
          )}
        </section>

        {/* ============== Polarity diagram + giant readout ============== */}
        <section className="grid gap-4 md:grid-cols-[260px_1fr]">
          <div className="panel p-4 flex flex-col items-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground self-start">Expected polarity</div>
            {profile ? (
              <PolarityDiagram polarity={profile.polarity} warn={profile.polarity === "center-negative" || !!divergenceAlarm} />
            ) : (
              <div className="text-sm text-muted-foreground py-10">No profile selected</div>
            )}
          </div>
          <div className="panel p-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Hardware · profile</div>
              <div className={`mt-1 font-mono-tech font-extrabold text-3xl md:text-4xl truncate ${profile && telemetry?.profile && telemetry.profile !== profile.name ? "text-destructive" : "text-foreground"}`}>
                {telemetry?.profile ?? "—"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Expected: <span className="font-mono-tech text-foreground">{profile?.name ?? "—"}</span></div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Hardware · polarity</div>
              <div className={`mt-1 font-mono-tech font-extrabold text-3xl md:text-4xl truncate ${reportedPolarityMatch ? "text-foreground" : "text-destructive"}`}>
                {telemetry?.polarity ?? "—"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Expected: <span className="font-mono-tech text-foreground">{expectedPolarity ?? "—"}</span></div>
            </div>
          </div>
        </section>

        {/* ============== Live telemetry ============== */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Voltage" value={`${fmt(liveT?.v ?? 0)} V`} accent={voltageOk} bad={overvoltage} />
          <Stat label="Current" value={`${fmt(liveT?.i ?? 0)} A`} />
          <Stat label="Power" value={`${fmt(liveT?.p ?? 0)} W`} />
          <Stat label="Mode" value={liveT?.mode ?? "—"} />
          <Stat label="Output" value={liveT?.en ? "ON" : "OFF"} accent={liveT?.en} />
        </section>

        {/* ============== Chart ============== */}
        <section className="panel p-5 md:p-6">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Live telemetry (V / A)</h2>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {series.length} samples {cableConfirmed ? "" : "· FROZEN"}
            </span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="t" tickFormatter={(t) => new Date(t).toLocaleTimeString().slice(3, 8)} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis yAxisId="v" stroke="hsl(var(--primary))" fontSize={11} domain={[0, "auto"]} />
                <YAxis yAxisId="i" orientation="right" stroke="hsl(var(--success))" fontSize={11} domain={[0, "auto"]} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(t) => new Date(t as number).toLocaleTimeString()}
                  formatter={(v: number, n: string) => [`${v.toFixed(2)} ${n === "v" ? "V" : "A"}`, n === "v" ? "Voltage" : "Current"]}
                />
                <Legend />
                <Line yAxisId="v" type="monotone" dataKey="v" name="Voltage" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line yAxisId="i" type="monotone" dataKey="i" name="Current" stroke="hsl(var(--success))" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ============== Audit log ============== */}
        <section className="panel p-5 md:p-6">
          <div className="mb-3 flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Audit log</h2>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{logs.length} entries</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead><TableHead>Profile</TableHead>
                  <TableHead className="text-right">Exp V</TableHead>
                  <TableHead className="text-right">V</TableHead>
                  <TableHead className="text-right">I</TableHead>
                  <TableHead>Expected pol.</TableHead>
                  <TableHead>Reported pol.</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No entries yet.</TableCell></TableRow>
                )}
                {logs.map((r) => (
                  <TableRow key={r.id} className={r.failure || !r.match ? "bg-destructive/10 text-destructive" : ""}>
                    <TableCell className="font-mono-tech">{timeStr(r.ts)}</TableCell>
                    <TableCell className="font-bold">{r.profile}</TableCell>
                    <TableCell className="text-right font-mono-tech">{fmt(r.expectedV, 1)}</TableCell>
                    <TableCell className="text-right font-mono-tech">{fmt(r.measuredV)}</TableCell>
                    <TableCell className="text-right font-mono-tech">{fmt(r.measuredI)}</TableCell>
                    <TableCell className="text-xs">{r.expectedPolarity}</TableCell>
                    <TableCell className="text-xs">{r.reported ?? "—"}</TableCell>
                    <TableCell className="text-xs font-bold">{r.failure ?? (r.match ? "OK" : "BLOCKED")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* ============== Defect report ============== */}
        <section className="panel p-5 md:p-6">
          <div className="mb-3 flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Defective lot / cable reports</h2>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{defects.length} stored locally</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Button onClick={reportDefect} disabled={!profile || !liveT}
              className="hw-btn-primary rounded-full px-5 font-bold">
              <FileWarning className="mr-2 h-4 w-4" /> Report defective lot / cable
            </Button>
            <Button onClick={clearDefects} disabled={defects.length === 0} className="hw-btn rounded-full">
              Clear local reports
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead><TableHead>Profile</TableHead>
                  <TableHead className="text-right">Exp V</TableHead>
                  <TableHead className="text-right">V</TableHead>
                  <TableHead className="text-right">I</TableHead>
                  <TableHead>Exp. pol</TableHead>
                  <TableHead>HW pol</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defects.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No defect reports.</TableCell></TableRow>
                )}
                {defects.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono-tech">{new Date(d.ts).toLocaleString()}</TableCell>
                    <TableCell className="font-bold">{d.profile}</TableCell>
                    <TableCell className="text-right font-mono-tech">{fmt(d.expectedV, 1)}</TableCell>
                    <TableCell className="text-right font-mono-tech">{fmt(d.measuredV)}</TableCell>
                    <TableCell className="text-right font-mono-tech">{fmt(d.measuredI)}</TableCell>
                    <TableCell className="text-xs">{d.expectedPolarity}</TableCell>
                    <TableCell className="text-xs">{d.reportedPolarity ?? "—"}</TableCell>
                    <TableCell className="text-xs">{d.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

      </div>
    </div>
  );
};

const Stat = ({ label, value, accent, bad }: { label: string; value: string; accent?: boolean; bad?: boolean }) => (
  <div className={`panel p-4 ${bad ? "border-destructive/60 bg-destructive/10" : ""}`}>
    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
    <div className={`mt-1 font-mono-tech text-2xl font-extrabold ${bad ? "text-destructive" : accent ? "text-primary" : "text-foreground"}`}>{value}</div>
  </div>
);

export default Companion;
