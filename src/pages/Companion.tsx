import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Cable, Power, ShieldAlert, ShieldCheck, Activity, History as HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useCompanionSerial, onCompanionTelemetry, type CompanionTelemetry } from "@/hooks/useCompanionSerial";
import { DEVICES } from "@/data/devices";

const VOLT_TOLERANCE = 0.05; // ±5%
const CHART_WINDOW = 120;    // samples (~24s @ 5Hz)

type DeclaredPolarity = "center-positive" | "center-negative" | null;

type LogRow = {
  id: string;
  ts: number;
  profile: string;
  expectedV: number;
  measuredV: number;
  measuredI: number;
  declared: DeclaredPolarity;
  reported?: string;
  match: boolean;
  failure?: string;
};

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const timeStr = (ts: number) => new Date(ts).toLocaleTimeString();

const Companion = () => {
  const { supported, status, error, telemetry, connect, disconnect, setOutput, selectProfile } = useCompanionSerial();

  // Force dark mode for this industrial view.
  useEffect(() => {
    const html = document.documentElement;
    const had = html.classList.contains("dark");
    html.classList.add("dark");
    return () => { if (!had) html.classList.remove("dark"); };
  }, []);

  const connected = status === "connected";
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [declaredPolarity, setDeclaredPolarity] = useState<DeclaredPolarity>(null);
  const [flash, setFlash] = useState(false);
  const [series, setSeries] = useState<Array<{ t: number; v: number; i: number }>>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const lastTelemetryRef = useRef<CompanionTelemetry | null>(null);
  const lastVRef = useRef<number>(0);

  // The selected device specs.
  const device = useMemo(
    () => DEVICES.find((d) => d.name === selectedProfile) ?? null,
    [selectedProfile],
  );
  const expectedV = device?.voltage ?? 0;
  const expectedPolarity = device?.defaultPolarity ?? null;

  // When user changes profile in the UI, command the firmware too.
  const onProfileChange = useCallback((name: string) => {
    setSelectedProfile(name);
    setDeclaredPolarity(null);
    if (connected) void selectProfile(name);
  }, [connected, selectProfile]);

  // Stream telemetry → chart, flash detector, failure detector.
  useEffect(() => {
    return onCompanionTelemetry((t) => {
      setSeries((prev) => {
        const next = [...prev, { t: t.ts, v: t.v, i: t.i }];
        return next.length > CHART_WINDOW ? next.slice(-CHART_WINDOW) : next;
      });

      // 5V-sensitive-device overvoltage flash
      const isFiveVoltSensitive = !!device && device.voltage <= 5.0;
      if (isFiveVoltSensitive && t.v > 5.2) {
        setFlash(true);
        window.setTimeout(() => setFlash(false), 250);
      }

      // Failure detection: sudden power drop or unexpected en=false
      const prevT = lastTelemetryRef.current;
      const drop = prevT && prevT.v > 1.0 && t.v < prevT.v * 0.4;
      const unexpectedOff = prevT?.en === true && t.en === false;
      if (drop || unexpectedOff) {
        appendLog({
          id: `${t.ts}-fail`, ts: t.ts,
          profile: selectedProfile || t.profile || "—",
          expectedV, measuredV: t.v, measuredI: t.i,
          declared: declaredPolarity, reported: t.polarity, match: false,
          failure: "Hardware fault / possible short from inverted polarity",
        });
      }
      lastTelemetryRef.current = t;
      lastVRef.current = t.v;
    });
  }, [device, expectedV, declaredPolarity, selectedProfile]);

  const appendLog = (row: LogRow) => {
    setLogs((prev) => [row, ...prev].slice(0, 100));
  };

  // Compliance evaluation (deep validation)
  const voltageDelta = telemetry ? telemetry.v - expectedV : 0;
  const voltagePct = expectedV > 0 ? Math.abs(voltageDelta) / expectedV : 1;
  const voltageOk = !!device && telemetry != null && voltagePct <= VOLT_TOLERANCE;
  const overvoltage = !!device && telemetry != null && telemetry.v > expectedV * (1 + VOLT_TOLERANCE);
  const undervoltage = !!device && telemetry != null && telemetry.v < expectedV * (1 - VOLT_TOLERANCE);
  const polarityDeclared = declaredPolarity !== null;
  const polarityMatch = polarityDeclared && expectedPolarity === declaredPolarity;
  const reportedPolarityMatch = telemetry?.polarity ? telemetry.polarity === expectedPolarity : true;
  const releaseOk = !!device && voltageOk && polarityMatch && reportedPolarityMatch && !telemetry?.err;

  const releaseBatch = () => {
    if (!device || !telemetry) return;
    appendLog({
      id: `${Date.now()}-rel`, ts: Date.now(),
      profile: device.name, expectedV, measuredV: telemetry.v, measuredI: telemetry.i,
      declared: declaredPolarity, reported: telemetry.polarity,
      match: releaseOk,
    });
  };

  const epo = () => { void setOutput(false); };
  const armOutput = () => { void setOutput(true); };

  // Critical 5V flash overlay
  const fiveVoltDanger = !!device && device.voltage <= 5.0 && (telemetry?.v ?? 0) > 5.2;

  return (
    <div className={`min-h-screen bg-background text-foreground ${flash || fiveVoltDanger ? "ring-8 ring-destructive animate-pulse" : ""}`}>
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8 space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">PicoPD Pro · Companion</div>
            <h1 className="text-xl font-extrabold md:text-2xl">Laboratory Compliance Dashboard</h1>
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

        {/* Critical alerts */}
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
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</div>
        )}

        {/* Big EPO + Output + Profile picker */}
        <section className="panel p-5 md:p-6 grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Active Profile</div>
            <Select value={selectedProfile} onValueChange={onProfileChange}>
              <SelectTrigger className="mt-2 h-12 text-base font-bold">
                <SelectValue placeholder="Select a device profile…" />
              </SelectTrigger>
              <SelectContent className="max-h-[60vh]">
                {DEVICES.map((d) => (
                  <SelectItem key={d.name} value={d.name}>
                    {d.name} <span className="text-muted-foreground font-mono-tech">· {d.voltage.toFixed(1)} V · {d.current.toFixed(2)} A</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 text-xs text-muted-foreground">
              Expected: <span className="font-mono-tech text-foreground">{device ? `${device.voltage.toFixed(1)} V / ${device.current.toFixed(2)} A · ${device.defaultPolarity}` : "—"}</span>
            </div>
          </div>
          <Button onClick={armOutput} disabled={!connected || !device}
            className="h-16 min-w-[160px] rounded-2xl px-6 text-base font-extrabold tracking-wider hw-btn-primary">
            <Power className="mr-2 h-5 w-5" /> ARM OUTPUT
          </Button>
          <Button onClick={epo} disabled={!connected}
            className="h-16 min-w-[200px] rounded-2xl px-6 text-lg font-extrabold tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg">
            <ShieldAlert className="mr-2 h-6 w-6" /> EMERGENCY OFF
          </Button>
        </section>

        {/* Live telemetry */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Voltage" value={`${fmt(telemetry?.v ?? 0)} V`} accent />
          <Stat label="Current" value={`${fmt(telemetry?.i ?? 0)} A`} accent />
          <Stat label="Power" value={`${fmt(telemetry?.p ?? 0)} W`} accent />
          <Stat label="Mode" value={telemetry?.mode ?? "—"} />
          <Stat label="Output" value={telemetry?.en ? "ON" : "OFF"} accent={telemetry?.en} />
        </section>

        {/* Compliance Panel */}
        <section className="panel p-5 md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Painel de Conformidade de Laboratório</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {/* Voltage match */}
            <div className={`rounded-xl border p-4 ${voltageOk ? "border-success/40 bg-success/5" : overvoltage ? "border-destructive/60 bg-destructive/10" : undervoltage ? "border-warning/50 bg-warning/10" : "border-border bg-muted/20"}`}>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Voltage match (±5%)</div>
              <div className="mt-2 font-mono-tech text-2xl font-extrabold">
                {fmt(telemetry?.v ?? 0)} / {fmt(expectedV, 1)} V
              </div>
              <div className="mt-1 text-xs">
                {!device ? "Select a profile" :
                  overvoltage ? <span className="text-destructive font-bold">OVERVOLTAGE — Δ {fmt(voltageDelta)} V</span> :
                  undervoltage ? <span className="text-warning font-bold">UNDERVOLTAGE — Δ {fmt(voltageDelta)} V</span> :
                  voltageOk ? <span className="text-success font-bold">WITHIN TOLERANCE</span> :
                  <span className="text-muted-foreground">Awaiting telemetry…</span>}
              </div>
            </div>

            {/* Polarity declaration */}
            <div className={`rounded-xl border p-4 ${polarityMatch ? "border-success/40 bg-success/5" : polarityDeclared ? "border-destructive/60 bg-destructive/10" : "border-border bg-muted/20"}`}>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Declared cable polarity</div>
              <div className="mt-2 flex gap-2">
                <Button onClick={() => setDeclaredPolarity("center-positive")}
                  className={`flex-1 hw-btn ${declaredPolarity === "center-positive" ? "ring-2 ring-primary" : ""}`}>
                  Center +
                </Button>
                <Button onClick={() => setDeclaredPolarity("center-negative")}
                  className={`flex-1 hw-btn ${declaredPolarity === "center-negative" ? "ring-2 ring-primary" : ""}`}>
                  Center −
                </Button>
              </div>
              <div className="mt-2 text-xs">
                {!device ? "Select a profile" :
                  !polarityDeclared ? <span className="text-muted-foreground">Operator must declare cable polarity</span> :
                  polarityMatch ? <span className="text-success font-bold">MATCHES PROFILE ({expectedPolarity})</span> :
                  <span className="text-destructive font-bold">MISMATCH — expected {expectedPolarity}</span>}
              </div>
            </div>

            {/* Reported polarity from firmware */}
            <div className={`rounded-xl border p-4 ${telemetry?.polarity ? (reportedPolarityMatch ? "border-success/40 bg-success/5" : "border-destructive/60 bg-destructive/10") : "border-border bg-muted/20"}`}>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Firmware-reported polarity</div>
              <div className="mt-2 font-mono-tech text-lg font-bold">{telemetry?.polarity ?? "—"}</div>
              <div className="mt-1 text-xs">
                {!device ? "Select a profile" :
                  !telemetry?.polarity ? <span className="text-muted-foreground">No telemetry yet</span> :
                  reportedPolarityMatch ? <span className="text-success font-bold">Matches expected</span> :
                  <span className="text-destructive font-bold">Mismatch vs expected ({expectedPolarity})</span>}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className={`font-mono-tech text-sm font-bold tracking-wider ${releaseOk ? "text-success" : "text-destructive"}`}>
              {releaseOk ? "✓ READY TO RELEASE LOT" : "✗ RELEASE BLOCKED — resolve checks above"}
            </div>
            <Button onClick={releaseBatch} disabled={!releaseOk} className="hw-btn-primary rounded-full px-5 font-bold">
              Log batch release
            </Button>
          </div>
        </section>

        {/* Live chart */}
        <section className="panel p-5 md:p-6">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Live telemetry (V / A)</h2>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {series.length} samples
            </span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t) => new Date(t).toLocaleTimeString().slice(3, 8)}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                />
                <YAxis yAxisId="v" stroke="hsl(var(--primary))" fontSize={11} domain={[0, 'auto']} />
                <YAxis yAxisId="i" orientation="right" stroke="hsl(var(--success))" fontSize={11} domain={[0, 'auto']} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(t) => new Date(t as number).toLocaleTimeString()}
                  formatter={(v: number, name: string) => [`${v.toFixed(2)} ${name === "v" ? "V" : "A"}`, name === "v" ? "Voltage" : "Current"]}
                />
                <Legend />
                <Line yAxisId="v" type="monotone" dataKey="v" name="Voltage" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line yAxisId="i" type="monotone" dataKey="i" name="Current" stroke="hsl(var(--success))" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Audit log */}
        <section className="panel p-5 md:p-6">
          <div className="mb-3 flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Audit log</h2>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {logs.length} entries
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead className="text-right">Expected V</TableHead>
                  <TableHead className="text-right">Measured V</TableHead>
                  <TableHead className="text-right">I (A)</TableHead>
                  <TableHead>Declared</TableHead>
                  <TableHead>Reported</TableHead>
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
                    <TableCell className="text-xs">{r.declared ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.reported ?? "—"}</TableCell>
                    <TableCell className="text-xs font-bold">
                      {r.failure ? r.failure : r.match ? "RELEASED ✓" : "BLOCKED ✗"}
                    </TableCell>
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

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="panel p-4">
    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
    <div className={`mt-1 font-mono-tech text-2xl font-extrabold ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
  </div>
);

export default Companion;
