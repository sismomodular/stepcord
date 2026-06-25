// Runtime safety guards for power delivery. Use these BEFORE any DC output
// command is dispatched to the firmware. All checks fail-closed.

import {
  APPROVED_VOLTAGES,
  POLARITY_CONNECTOR_MATRIX,
  POWER_DB,
  POWER_DB as _DB,
  PowerPolarity,
  PowerSpec,
  VOLTAGE_MAX,
  VOLTAGE_MIN,
} from "@/data/devicePower";

export type SafetyLevel = "ok" | "info" | "warning" | "danger" | "blocked";

export interface SafetyResult {
  level: SafetyLevel;
  code: string;
  message: string;
}

export class VoltageRangeError extends Error {
  constructor(v: number) {
    super(`Voltage ${v}V is outside the allowed DC range (${VOLTAGE_MIN}V–${VOLTAGE_MAX}V). Hard stop.`);
    this.name = "VoltageRangeError";
  }
}

/** Hard error if voltage outside permitted DC envelope. */
export function assertVoltageInRange(v: number): void {
  if (!Number.isFinite(v) || v < VOLTAGE_MIN || v > VOLTAGE_MAX) {
    throw new VoltageRangeError(v);
  }
}

/** Block any DC operation on a mains/AC device. */
export function isMainsOrAc(spec: PowerSpec | null | undefined): boolean {
  return !!spec && (spec.power_polarity === "iec_mains" || spec.power_polarity === "ac");
}

/** Compare requested polarity against the device's expected polarity. */
export function polarityMismatch(
  expected: PowerPolarity | null | undefined,
  requested: PowerPolarity,
): SafetyResult {
  if (!expected) {
    return {
      level: "warning",
      code: "UNVERIFIED_POLARITY",
      message: "Polarity unverified for this device. Manual confirmation required before power-on.",
    };
  }
  const dcPair =
    (expected === "center_positive" && requested === "center_negative") ||
    (expected === "center_negative" && requested === "center_positive");
  if (dcPair) {
    return {
      level: "danger",
      code: "POLARITY_MISMATCH",
      message:
        "⚠️ Polarity mismatch detected. Applying incorrect polarity may permanently damage this device. Please verify your power supply before continuing.",
    };
  }
  if (expected !== requested) {
    return {
      level: "warning",
      code: "POLARITY_INCOMPATIBLE",
      message: `Requested polarity (${requested}) does not match expected (${expected}).`,
    };
  }
  return { level: "ok", code: "OK", message: "Polarity matches." };
}

/** Current headroom check against the device's minimum required current. */
export function currentHeadroom(requestedMa: number, requiredMa: number | null): SafetyResult {
  if (requiredMa == null) {
    return { level: "info", code: "NO_CURRENT_SPEC", message: "No reference current value on file." };
  }
  if (requestedMa < requiredMa) {
    return {
      level: "danger",
      code: "INSUFFICIENT_CURRENT",
      message: `⚡ Insufficient current. This device requires at least ${requiredMa}mA. Your supply may not be able to power it reliably.`,
    };
  }
  if (requestedMa > requiredMa * 1.2) {
    return {
      level: "warning",
      code: "CURRENT_OVERHEAD",
      message: `Requested current (${requestedMa}mA) exceeds device requirement by more than 20% (${requiredMa}mA).`,
    };
  }
  return { level: "ok", code: "OK", message: "Current within nominal headroom." };
}

/** Guard against issuing DC controls to AC/mains devices. */
export function acDeviceGuard(spec: PowerSpec | null | undefined): SafetyResult | null {
  if (isMainsOrAc(spec)) {
    return {
      level: "blocked",
      code: "AC_DEVICE",
      message: "🔌 This device uses mains AC power and cannot be controlled via DC output.",
    };
  }
  return null;
}

export interface AuditFinding {
  id: string;
  brand: string;
  model: string;
  level: SafetyLevel;
  code: string;
  message: string;
}

/** Static audit of POWER_DB. Returns every inconsistency found. */
export function auditPowerDatabase(db: PowerSpec[] = POWER_DB): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const push = (s: PowerSpec, level: SafetyLevel, code: string, message: string) =>
    findings.push({ id: s.id, brand: s.brand, model: s.model, level, code, message });

  for (const s of db) {
    // missing voltage (only required for DC supplies)
    const isMains = s.power_polarity === "iec_mains" || s.power_polarity === "ac" || s.power_polarity === "battery";
    if (!isMains && (s.power_voltage == null || !Number.isFinite(s.power_voltage))) {
      push(s, "danger", "MISSING_VOLTAGE", "power_voltage is missing.");
    }
    if (s.power_voltage != null && !(APPROVED_VOLTAGES as readonly number[]).includes(s.power_voltage)) {
      push(s, "warning", "NON_STANDARD_VOLTAGE", `power_voltage ${s.power_voltage}V not in approved set.`);
    }
    if (s.power_voltage != null && (s.power_voltage < VOLTAGE_MIN || s.power_voltage > VOLTAGE_MAX)) {
      push(s, "danger", "VOLTAGE_OUT_OF_RANGE", `power_voltage ${s.power_voltage}V outside ${VOLTAGE_MIN}V–${VOLTAGE_MAX}V.`);
    }
    if (!s.power_polarity) {
      push(s, "warning", "MISSING_POLARITY", "power_polarity is missing — UI will display Unverified.");
    }
    if (s.power_polarity === "center_negative") {
      push(s, "info", "REVIEW_CENTER_NEGATIVE", "Center-negative is rare in modern gear — flagged for manual review.");
    }
    if (s.power_polarity) {
      const allowed = POLARITY_CONNECTOR_MATRIX[s.power_polarity];
      if (!allowed.includes(s.connector_type)) {
        push(
          s,
          "danger",
          "CONNECTOR_POLARITY_MISMATCH",
          `connector_type "${s.connector_type}" is impossible for polarity "${s.power_polarity}".`,
        );
      }
    }
    if (!isMains && s.power_current_ma == null) {
      push(s, "warning", "MISSING_CURRENT", "power_current_ma is missing.");
    }
  }
  return findings;
}

/** Pretty-print audit report to the developer console. */
export function logAuditReport(findings: AuditFinding[] = auditPowerDatabase()): void {
  /* eslint-disable no-console */
  console.groupCollapsed(`[Power Safety Audit] ${findings.length} findings`);
  const byLevel = findings.reduce<Record<string, AuditFinding[]>>((acc, f) => {
    (acc[f.level] ||= []).push(f);
    return acc;
  }, {});
  for (const level of ["blocked", "danger", "warning", "info", "ok"] as SafetyLevel[]) {
    const rows = byLevel[level];
    if (!rows?.length) continue;
    console.groupCollapsed(`${level.toUpperCase()} (${rows.length})`);
    console.table(rows.map(({ brand, model, code, message }) => ({ brand, model, code, message })));
    console.groupEnd();
  }
  console.groupEnd();
  /* eslint-enable no-console */
}

// keep tree-shaking happy
void _DB;
