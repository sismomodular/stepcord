import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cable, CheckCircle2, Power, Zap, ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSerialTelemetry } from "@/hooks/useSerialTelemetry";
import { DEVICES, MANUAL_IDX } from "@/data/devices";
import myVoltsLogo from "@/assets/myvolts-logo.png";

const Dashboard = () => {
  const { supported, status, error, telemetry, connect, disconnect, send } = useSerialTelemetry();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [output, setOutput] = useState(false);

  // Force dark theme while this page is mounted.
  useEffect(() => {
    const html = document.documentElement;
    const had = html.classList.contains("dark");
    html.classList.add("dark");
    return () => { if (!had) html.classList.remove("dark"); };
  }, []);

  // If the device pushes its own state, mirror it locally.
  useEffect(() => {
    if (telemetry?.output != null) setOutput(Boolean(telemetry.output));
    if (typeof telemetry?.profile === "number") setSelectedIdx(telemetry.profile);
  }, [telemetry?.output, telemetry?.profile]);

  const connected = status === "connected";

  const pickProfile = useCallback((idx: number) => {
    setSelectedIdx(idx);
    void send({ setProfile: idx });
  }, [send]);

  const toggleOutput = useCallback((on: boolean) => {
    setOutput(on);
    void send({ setOutput: on ? 1 : 0 });
  }, [send]);

  const deviceName = telemetry?.device ?? (selectedIdx != null ? DEVICES[selectedIdx].name : "—");
  const voltage = telemetry?.v ?? (selectedIdx != null ? DEVICES[selectedIdx].voltage : 0);
  const current = telemetry?.i ?? (selectedIdx != null ? DEVICES[selectedIdx].current : 0);
  const polarity = telemetry?.polarity ?? (selectedIdx != null
    ? (DEVICES[selectedIdx].defaultPolarity === "center-negative" ? "USE INVERTER C-" : "STANDARD C+")
    : "—");
  const state = telemetry?.state ?? (connected ? "IDLE" : "DISCONNECTED");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="https://myvolts.com" target="_blank" rel="noreferrer">
              <img src={myVoltsLogo} alt="myVolts" className="h-9 w-auto object-contain invert brightness-0" />
            </a>
            <div className="hidden sm:block">
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Power Dashboard</div>
              <div className="text-sm font-semibold">USB-C PD / PPS Controller</div>
            </div>
          </div>
          <Link
            to="/"
            className="hw-btn inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Classic UI
          </Link>
        </header>

        {/* Big Connect button */}
        <section className="panel p-6 md:p-10 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-success animate-pulse-dot" : "bg-muted-foreground"}`} />
            {connected ? "HARDWARE LINK ACTIVE" : status.toUpperCase()}
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight md:text-5xl">
            {connected ? "Hardware Connected" : "Conectar ao Hardware"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {connected
              ? "Receiving live telemetry from the PicoPD bridge."
              : "Plug the USB-C interceptor and authorise the serial port."}
          </p>

          <div className="mt-6 flex justify-center">
            {connected ? (
              <Button
                onClick={() => void disconnect()}
                className="hw-btn h-16 gap-3 rounded-2xl px-8 text-base font-semibold"
              >
                <Cable className="h-5 w-5" /> Disconnect
              </Button>
            ) : (
              <Button
                onClick={() => void connect()}
                disabled={!supported || status === "connecting"}
                className="hw-btn-primary h-16 gap-3 rounded-2xl px-10 text-base font-bold tracking-wide"
              >
                <Cable className="h-5 w-5" />
                {status === "connecting" ? "Connecting…" : "Conectar ao Hardware"}
              </Button>
            )}
          </div>

          {!supported && (
            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              WebSerial requires Chrome or Edge on desktop.
            </div>
          )}
          {error && (
            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </section>

        {/* Telemetry cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Device" value={deviceName} mono={false} />
          <StatCard label="Voltage" value={`${voltage.toFixed(2)} V`} accent />
          <StatCard label="Current" value={`${current.toFixed(2)} A`} accent />
          <StatCard label="Polarity" value={polarity} small />
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <StatCard label="State" value={state} small />
          <div className="panel flex items-center justify-between p-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Output</div>
              <div className="mt-1 text-2xl font-extrabold">
                {output ? <span className="text-success">ON</span> : <span className="text-muted-foreground">OFF</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Power className={`h-5 w-5 ${output ? "text-success" : "text-muted-foreground"}`} />
              <Switch checked={output} onCheckedChange={toggleOutput} disabled={!connected} />
            </div>
          </div>
        </section>

        {/* Profile selector */}
        <section className="panel p-5 md:p-6">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">Device Profiles</h2>
              <p className="text-xs text-muted-foreground">Tap to send <span className="font-mono-tech">{`{"setProfile": N}`}</span> over serial.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DEVICES.map((d, i) => {
              const isActive = selectedIdx === i;
              const isManual = i === MANUAL_IDX;
              return (
                <button
                  key={d.name}
                  onClick={() => pickProfile(i)}
                  disabled={!connected}
                  className={`group flex items-center justify-between rounded-xl border p-4 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isActive
                      ? "border-primary/70 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
                      : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">
                      {isManual ? "Manual Mode" : d.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {d.brand} · <span className="font-mono-tech">{d.voltage.toFixed(1)} V · {d.current.toFixed(2)} A</span>
                    </div>
                  </div>
                  {isActive ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <Zap className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

const StatCard = ({
  label, value, accent, small, mono = true,
}: { label: string; value: string; accent?: boolean; small?: boolean; mono?: boolean }) => (
  <div className="panel p-5">
    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
    <div
      className={`mt-2 truncate font-extrabold ${mono ? "font-mono-tech" : ""} ${
        accent ? "text-primary" : "text-foreground"
      } ${small ? "text-lg" : "text-3xl md:text-4xl"}`}
      title={value}
    >
      {value}
    </div>
  </div>
);

export default Dashboard;
