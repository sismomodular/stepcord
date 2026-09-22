import { CheckCircle2, AlertTriangle, Ban, Info, ShieldCheck, Zap } from 'lucide-react';
import type { PreflightReport } from '../../lib/preflight';
import type { SafetyLevel } from '../../lib/powerSafety';

export interface StagedTarget {
  name: string;
  voltage: number;
  current: number;
  mode: 'fixed' | 'pps';
  source: 'pdo' | 'pps' | 'profile';
  polarityLabel?: string;
}

interface StageArmCardProps {
  staged: StagedTarget | null;
  preflight: PreflightReport | null;
  armed: boolean;
  onToggleArm: (armed: boolean) => void;
  onApply: () => void;
  onDiscard: () => void;
  isDirty: boolean;
  appliedLabel: string | null;
}

const ICONS: Record<SafetyLevel, typeof Info> = {
  ok: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
  blocked: Ban,
};

const TONES: Record<SafetyLevel, string> = {
  ok: 'text-emerald-700',
  info: 'text-gray-500',
  warning: 'text-amber-700',
  danger: 'text-red-700',
  blocked: 'text-red-700',
};

export default function StageArmCard({
  staged,
  preflight,
  armed,
  onToggleArm,
  onApply,
  onDiscard,
  isDirty,
  appliedLabel,
}: StageArmCardProps) {
  const blocked = preflight?.blocked ?? null;
  const canArm = !!staged && !blocked;
  const canApply = canArm && armed && isDirty;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-widest text-gray-400">
          Staging · Stage &amp; Arm
        </div>
        <span
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
            !isDirty
              ? 'bg-gray-100 text-gray-500'
              : armed
                ? 'bg-amber-100 text-amber-800'
                : 'bg-blue-50 text-blue-700',
          ].join(' ')}
        >
          {!isDirty ? 'In sync' : armed ? 'Armed' : 'Staged'}
        </span>
      </div>

      {!staged ? (
        <p className="py-6 text-center text-sm text-gray-400">
          Pick a PDO, PPS setting or device profile to stage a target. Nothing is sent to the hardware yet.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="truncate text-base font-semibold text-gray-900">{staged.name}</div>
            <div className="mt-1 flex items-baseline gap-3 font-mono tabular-nums">
              <span className="text-2xl font-bold text-gray-900">{staged.voltage.toFixed(1)} V</span>
              <span className="text-sm text-gray-600">{staged.current.toFixed(1)} A</span>
              <span className="text-xs uppercase tracking-wide text-gray-400">
                {staged.mode === 'pps' ? 'PPS' : 'Fixed'}
              </span>
            </div>
            {staged.polarityLabel && (
              <div className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                Polarity · {staged.polarityLabel.trim()}
              </div>
            )}
            {appliedLabel && (
              <div className="mt-2 text-xs text-gray-500">
                Currently applied: <span className="font-mono">{appliedLabel}</span>
              </div>
            )}
          </div>

          <ul className="mt-3 space-y-1.5">
            {preflight?.checks.map((c, i) => {
              const Icon = ICONS[c.level];
              return (
                <li key={`${c.code}-${i}`} className={`flex items-start gap-2 text-xs ${TONES[c.level]}`}>
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{c.message}</span>
                </li>
              );
            })}
          </ul>

          <label
            className={[
              'mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
              blocked
                ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                : armed
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-amber-500"
              checked={armed}
              disabled={!canArm}
              onChange={(e) => onToggleArm(e.target.checked)}
            />
            <span>
              I checked the cable, connector and polarity for{' '}
              <span className="font-semibold">{staged.name}</span>. Arm this target.
            </span>
          </label>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={onDiscard}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Discard
            </button>
            <button
              onClick={onApply}
              disabled={!canApply}
              className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {armed ? <Zap className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              Apply &amp; Power On
            </button>
          </div>

          {blocked && (
            <p className="mt-2 text-right text-xs font-medium text-red-700">
              Output blocked — this target cannot be armed.
            </p>
          )}
        </>
      )}
    </div>
  );
}
