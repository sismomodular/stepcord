import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  BatteryCharging,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gauge,
  MonitorCheck,
  Plug,
  PlugZap,
  Power,
  Settings2,
  Usb,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSerialTelemetry } from "@/hooks/useSerialTelemetry";

const FIXED_PROFILES = [5, 9, 12, 15, 20];

const Index = () => {
  const { supported, status, error, telemetry, connect, disconnect, send } = useSerialTelemetry();

  const [mode, setMode] = useState<"PD" | "PPS">("PPS");
  const [voltage, setVoltage] = useState(9.0);
  const [profileIdx, setProfileIdx] = useState(1);

  // Sync local state from device telemetry when it arrives
  useEffect(() => {
    if (!telemetry) return;
    setVoltage(telemetry.v);
    if (telemetry.mode) setMode(telemetry.mode);
    if (typeof telemetry.profile === "number") setProfileIdx(telemetry.profile);
  }, [telemetry]);

  const current = telemetry?.i ?? 0;
  const power = +(((telemetry?.p ?? voltage * current)) || 0).toFixed(2);
  const live = status === "connected" && telemetry !== null;

  const adjust = (delta: number) => {
    if (mode === "PPS") {
      const next = Math.max(3.3, Math.min(21, +(voltage + delta).toFixed(2)));
      setVoltage(next);
      void send({ cmd: "setVoltage", v: next });
    } else {
      const nextIdx = Math.max(0, Math.min(FIXED_PROFILES.length - 1, profileIdx + (delta > 0 ? 1 : -1)));
      setProfileIdx(nextIdx);
      setVoltage(FIXED_PROFILES[nextIdx]);
      void send({ cmd: "setProfile", idx: nextIdx });
    }
  };

  return (
    <div className="min-h-screen px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-[var(--shadow-glow)]">
              <Zap className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                <span className="text-gradient">PicoPD</span> Control
              </h1>
              <p className="text-sm text-muted-foreground">
                USB-C PD/PPS programmable power supply · AP33772S
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                live
                  ? "gap-1.5 border-success/40 bg-success/10 text-success"
                  : status === "connecting"
                  ? "gap-1.5 border-warning/40 bg-warning/10 text-warning"
                  : "gap-1.5 border-border/60 bg-secondary/40 text-muted-foreground"
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  live ? "animate-pulse-glow bg-success" : status === "connecting" ? "bg-warning" : "bg-muted-foreground"
                }`}
              />
              {live ? "Live · WebSerial" : status === "connecting" ? "Connecting" : status === "unsupported" ? "WebSerial unsupported" : "Disconnected"}
            </Badge>
            <Badge variant="outline" className="gap-1 border-border/60 text-muted-foreground">
              <Cpu className="h-3 w-3" /> RP2040
            </Badge>
            {status === "connected" ? (
              <Button size="sm" variant="outline" onClick={() => void disconnect()} className="gap-2">
                <Plug className="h-3.5 w-3.5" /> Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void connect()}
                disabled={!supported || status === "connecting"}
                className="gap-2"
              >
                <PlugZap className="h-3.5 w-3.5" />
                {status === "connecting" ? "Connecting…" : "Connect device"}
              </Button>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!supported && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
            WebSerial isn't available in this browser. Open the dashboard in Chrome or Edge on desktop to connect to the PicoPD over USB.
          </div>
        )}

        {/* Top stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Voltage" value={voltage.toFixed(2)} unit="V" icon={Zap} accent="primary" />
          <StatCard label="Current" value={current.toFixed(2)} unit="A" icon={Activity} accent="accent" />
          <StatCard label="Power" value={power.toFixed(1)} unit="W" icon={BatteryCharging} accent="primary" />
          <StatCard label="Mode" value={mode} unit="" icon={Settings2} accent="accent" />
        </div>

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* OLED preview + controls */}
          <Card className="lg:col-span-2 overflow-hidden border-border/60 bg-[var(--gradient-card)] p-6 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MonitorCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  OLED Live Preview · 128×64 SSD1306
                </h2>
              </div>
              <Badge variant="outline" className="border-primary/40 text-primary">I2C 0x3C</Badge>
            </div>

            {/* Faux OLED display */}
            <div className="relative mx-auto aspect-[2/1] w-full max-w-md overflow-hidden rounded-lg border border-primary/30 bg-black p-6 shadow-[var(--shadow-elevated)]">
              <div className="absolute inset-0 oled-grid opacity-50" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent animate-scan" />
              <div className="relative flex h-full flex-col justify-between font-mono text-primary">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs opacity-70">{mode} MODE</span>
                  <span className="text-xs opacity-70">{current.toFixed(2)}A</span>
                </div>
                <div className="text-center">
                  <div className="text-5xl font-bold tracking-tight drop-shadow-[0_0_8px_hsl(var(--primary))]">
                    {voltage.toFixed(2)}
                  </div>
                  <div className="text-xs opacity-70">VOLTS</div>
                </div>
                <div className="flex items-center justify-between text-xs opacity-70">
                  <span>USB-C</span>
                  <span>{power.toFixed(1)}W</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Button
                variant={mode === "PD" ? "default" : "outline"}
                onClick={() => {
                  setMode("PD");
                  setVoltage(FIXED_PROFILES[profileIdx]);
                  void send({ cmd: "setMode", mode: "PD" });
                  void send({ cmd: "setProfile", idx: profileIdx });
                }}
                className="h-14 gap-2"
              >
                <Power className="h-4 w-4" /> Fixed PD
              </Button>
              <Button
                variant={mode === "PPS" ? "default" : "outline"}
                onClick={() => {
                  setMode("PPS");
                  void send({ cmd: "setMode", mode: "PPS" });
                }}
                className="h-14 gap-2"
              >
                <Gauge className="h-4 w-4" /> PPS Mode
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => adjust(mode === "PPS" ? -0.02 : -1)} className="h-14 flex-1">
                  <ChevronDown />
                </Button>
                <Button variant="outline" onClick={() => adjust(mode === "PPS" ? 0.02 : 1)} className="h-14 flex-1">
                  <ChevronUp />
                </Button>
              </div>
            </div>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              {mode === "PPS" ? "Fine adjustment: ±20 mV per step" : `Profile ${profileIdx + 1} of ${FIXED_PROFILES.length}`}
            </p>
          </Card>

          {/* PD Profiles */}
          <Card className="border-border/60 bg-[var(--gradient-card)] p-6 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex items-center gap-2">
              <Usb className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                PD Profiles
              </h2>
            </div>
            <div className="space-y-2">
              {FIXED_PROFILES.map((v, i) => {
                const active = mode === "PD" && i === profileIdx;
                return (
                  <button
                    key={v}
                    onClick={() => {
                      setMode("PD");
                      setProfileIdx(i);
                      setVoltage(v);
                      void send({ cmd: "setMode", mode: "PD" });
                      void send({ cmd: "setProfile", idx: i });
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-[var(--transition-smooth)] ${
                      active
                        ? "border-primary/60 bg-primary/10 shadow-[var(--shadow-glow)]"
                        : "border-border/60 bg-secondary/40 hover:border-primary/30 hover:bg-secondary/70"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-md ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <Zap className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold">{v} V</div>
                        <div className="text-xs text-muted-foreground">Fixed PDO #{i + 1}</div>
                      </div>
                    </div>
                    {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Bottom row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* System health */}
          <Card className="border-border/60 bg-[var(--gradient-card)] p-6 shadow-[var(--shadow-card)]">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              System Health
            </h2>
            <div className="space-y-5">
              <Metric label="I2C Bus Stability" value={98} />
              <Metric label="PD Negotiation" value={100} />
              <Metric label="OLED Refresh" value={92} />
              <Metric label="Polling Loop" value={74} hint="Optimization pending" />
            </div>
          </Card>

          {/* Status / tasks */}
          <Card className="border-border/60 bg-[var(--gradient-card)] p-6 shadow-[var(--shadow-card)]">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Project Status
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <Status ok label="OLED working" />
              <Status ok label="Fixed PD profiles" />
              <Status ok label="PPS operational" />
              <Status ok label="Buttons responsive" />
              <Status ok label="Stable I2C" />
              <Status ok label="PD output validated" />
              <Status label="External module test" />
              <Status label="PD polling optimization" />
            </div>

            <div className="mt-6 rounded-lg border border-warning/30 bg-warning/5 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="text-sm">
                  <div className="font-medium text-foreground">Next milestone</div>
                  <p className="text-muted-foreground">
                    Review I2C pull-ups, modularize firmware, and finalize 3D-printed enclosure.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  unit,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "accent";
}) => (
  <Card className="relative overflow-hidden border-border/60 bg-[var(--gradient-card)] p-5 shadow-[var(--shadow-card)]">
    <div className="flex items-start justify-between">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <Icon className={`h-4 w-4 ${accent === "primary" ? "text-primary" : "text-accent"}`} />
    </div>
    <div className="mt-3 flex items-baseline gap-1">
      <span className="text-3xl font-bold tracking-tight">{value}</span>
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
    </div>
  </Card>
);

const Metric = ({ label, value, hint }: { label: string; value: number; hint?: string }) => (
  <div>
    <div className="mb-1.5 flex items-center justify-between text-sm">
      <span className="text-foreground">{label}</span>
      <span className="font-mono text-muted-foreground">{value}%</span>
    </div>
    <Progress value={value} className="h-1.5" />
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const Status = ({ label, ok }: { label: string; ok?: boolean }) => (
  <div className="flex items-center gap-2 rounded-md border border-border/40 bg-secondary/30 px-3 py-2 text-sm">
    {ok ? (
      <CheckCircle2 className="h-4 w-4 text-success" />
    ) : (
      <div className="h-2 w-2 rounded-full bg-warning" />
    )}
    <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
  </div>
);

export default Index;
