import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { auditPowerDatabase, logAuditReport, SafetyLevel } from "@/lib/powerSafety";
import { POWER_DB } from "@/data/devicePower";

const LEVEL_STYLE: Record<SafetyLevel, string> = {
  blocked: "bg-red-950/60 text-red-200 border-red-500/40",
  danger: "bg-red-950/40 text-red-200 border-red-500/30",
  warning: "bg-amber-950/40 text-amber-200 border-amber-500/30",
  info: "bg-zinc-800/60 text-zinc-200 border-zinc-600/40",
  ok: "bg-emerald-950/40 text-emerald-200 border-emerald-500/30",
};

export default function DataHealth() {
  const findings = useMemo(() => auditPowerDatabase(), []);
  useEffect(() => {
    logAuditReport(findings);
  }, [findings]);

  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.level] = (acc[f.level] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl tracking-widest uppercase">Data Health</h1>
          <p className="text-xs text-zinc-500 mt-1">
            Static audit of {POWER_DB.length} power profiles. Findings also printed to console.
          </p>
        </div>
        <Link to="/" className="text-xs text-zinc-400 hover:text-zinc-100 underline">
          ← Dashboard
        </Link>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {(["blocked", "danger", "warning", "info", "ok"] as SafetyLevel[]).map((lvl) => (
          <div key={lvl} className={`border rounded-md p-3 ${LEVEL_STYLE[lvl]}`}>
            <div className="text-[10px] uppercase tracking-widest opacity-70">{lvl}</div>
            <div className="text-2xl">{counts[lvl] ?? 0}</div>
          </div>
        ))}
      </section>

      <section className="border border-zinc-800 rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-zinc-900 text-zinc-400 uppercase tracking-widest">
            <tr>
              <th className="text-left p-2">Level</th>
              <th className="text-left p-2">Brand</th>
              <th className="text-left p-2">Model</th>
              <th className="text-left p-2">Code</th>
              <th className="text-left p-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {findings.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-emerald-300">
                  ✓ No issues found. Database is clean.
                </td>
              </tr>
            )}
            {findings.map((f, i) => (
              <tr key={`${f.id}-${f.code}-${i}`} className="border-t border-zinc-800">
                <td className="p-2">
                  <span className={`inline-block border rounded px-2 py-0.5 text-[10px] uppercase ${LEVEL_STYLE[f.level]}`}>
                    {f.level}
                  </span>
                </td>
                <td className="p-2 text-zinc-300">{f.brand}</td>
                <td className="p-2 text-zinc-100">{f.model}</td>
                <td className="p-2 text-zinc-400">{f.code}</td>
                <td className="p-2 text-zinc-300">{f.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
