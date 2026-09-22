// Pure pre-flight evaluation used by both the staging card (preview) and the
// actual send path (enforcement). No side effects, no I/O.

import { findPowerSpec, specPolarityFromUi, type MusicalDevice } from '../data/devices';
import type { PowerPolarity } from '../data/devicePower';
import {
  acDeviceGuard,
  assertVoltageInRange,
  currentHeadroom,
  incompleteDataGuard,
  polarityMismatch,
  VoltageRangeError,
  type SafetyResult,
} from './powerSafety';

export interface PreflightInput {
  voltage: number;
  current: number;
  device?: MusicalDevice | null;
  supplyPolarity: PowerPolarity;
}

export interface PreflightReport {
  /** Everything worth showing the operator, in evaluation order. */
  checks: SafetyResult[];
  /** Non-null when the send must be refused outright. */
  blocked: SafetyResult | null;
  /** Non-null when the operator has to explicitly acknowledge before sending. */
  confirm: SafetyResult | null;
  /** Warnings that should be logged but do not stop the send. */
  warnings: SafetyResult[];
}

export function evaluatePreflight({
  voltage,
  current,
  device,
  supplyPolarity,
}: PreflightInput): PreflightReport {
  const checks: SafetyResult[] = [];
  const warnings: SafetyResult[] = [];
  let blocked: SafetyResult | null = null;
  let confirm: SafetyResult | null = null;

  // 1) Hard voltage envelope.
  try {
    assertVoltageInRange(voltage);
    checks.push({ level: 'ok', code: 'VOLTAGE_RANGE', message: `Voltage ${voltage.toFixed(1)}V within the allowed DC envelope.` });
  } catch (err) {
    const message = err instanceof VoltageRangeError ? err.message : String(err);
    blocked = { level: 'blocked', code: 'VOLTAGE_OUT_OF_RANGE', message };
    checks.push(blocked);
    return { checks, blocked, confirm, warnings };
  }

  const spec = device ? findPowerSpec(device) : null;

  // 2) AC / mains devices can never be driven from the DC output.
  const ac = acDeviceGuard(spec);
  if (ac) {
    blocked = ac;
    checks.push(ac);
    return { checks, blocked, confirm, warnings };
  }

  if (!device) {
    checks.push({ level: 'info', code: 'NO_PROFILE', message: 'No device profile staged — manual values only.' });
    return { checks, blocked, confirm, warnings };
  }

  const expected = spec?.power_polarity ?? specPolarityFromUi(device.defaultPolarity);

  // 3) Incomplete / unverified device data fails closed.
  const incomplete = incompleteDataGuard(device.voltage, device.current, expected);
  if (incomplete) {
    checks.push(incomplete);
    if (incomplete.level === 'blocked') {
      blocked = incomplete;
      return { checks, blocked, confirm, warnings };
    }
    warnings.push(incomplete);
  } else {
    checks.push({ level: 'ok', code: 'DEVICE_DATA', message: `Verified spec on file for ${device.name}.` });
  }

  // 4) Polarity against the supply's actual output polarity.
  const pol = polarityMismatch(expected, supplyPolarity);
  checks.push(pol);
  if (pol.level === 'danger') confirm = pol;
  else if (pol.level !== 'ok') warnings.push(pol);

  // 5) Current headroom.
  const required = spec?.power_current_ma ?? (device.current != null ? device.current * 1000 : null);
  const head = currentHeadroom(current * 1000, required);
  checks.push(head);
  if (head.level === 'danger' || head.level === 'warning') warnings.push(head);

  return { checks, blocked, confirm, warnings };
}
