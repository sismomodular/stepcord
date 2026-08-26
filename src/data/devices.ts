// Device profiles for the Dashboard selector.
//
// SINGLE SOURCE OF TRUTH: every voltage / current / polarity value comes from
// POWER_DB (src/data/devicePower.ts). Nothing in this file hardcodes electrical
// specs — it only derives display shapes from the audited database.

import {
  POWER_DB,
  type PowerPolarity,
  type PowerSpec,
} from './devicePower';

export type Polarity = 'center-positive' | 'center-negative' | 'unverified';

export type MusicalDevice = {
  name: string;
  brand?: string;
  /** Volts. `null` when the source data does not define it (never invented). */
  voltage: number | null;
  /** Amps. `null` when the source data does not define it (never invented). */
  current: number | null;
  defaultPolarity: Polarity;
  polarityLabel: string;
  /** POWER_DB id when the profile is backed by the audited catalog. */
  specId?: string;
  /** True only when voltage, current AND polarity are all known. */
  verified: boolean;
  source: 'local' | 'synced' | 'manual';
};

export const POLARITY_LABELS: Record<Polarity, string> = {
  'center-positive': 'KEEP CENTER +',
  'center-negative': 'USE INVERTER C-',
  unverified: 'UNVERIFIED — CHECK MANUALLY',
};

/** Maps the audited PowerPolarity enum onto the UI polarity type. Fails closed. */
export function polarityFromSpec(p: PowerPolarity | null | undefined): Polarity {
  switch (p) {
    case 'center_positive':
      return 'center-positive';
    case 'center_negative':
      return 'center-negative';
    // USB VBUS is inherently fixed-polarity on the connector.
    case 'usb_c_pd':
    case 'usb_a':
    case 'usb_micro':
      return 'center-positive';
    default:
      return 'unverified';
  }
}

/** Reverse mapping used by the runtime safety guards. */
export function specPolarityFromUi(p: Polarity): PowerPolarity | null {
  if (p === 'center-positive') return 'center_positive';
  if (p === 'center-negative') return 'center_negative';
  return null;
}

export function powerSpecToMusicalDevice(spec: PowerSpec): MusicalDevice {
  const defaultPolarity = polarityFromSpec(spec.power_polarity);
  const voltage = spec.power_voltage ?? null;
  const current = spec.power_current_ma != null ? spec.power_current_ma / 1000 : null;
  return {
    name: spec.model,
    brand: spec.brand,
    voltage,
    current,
    defaultPolarity,
    polarityLabel: POLARITY_LABELS[defaultPolarity],
    specId: spec.id,
    verified: voltage != null && current != null && defaultPolarity !== 'unverified',
    source: 'local',
  };
}

/** Specs that cannot be driven from a DC output at all (mains / battery). */
export function isDcDrivable(spec: PowerSpec): boolean {
  return (
    spec.power_polarity !== 'iec_mains' &&
    spec.power_polarity !== 'ac' &&
    spec.power_polarity !== 'battery'
  );
}

export const MANUAL_DEVICE: MusicalDevice = {
  name: '[ MANUAL MODE ]',
  brand: 'Custom',
  voltage: 5.0,
  current: 3.0,
  defaultPolarity: 'unverified',
  polarityLabel: POLARITY_LABELS.unverified,
  verified: false,
  source: 'manual',
};

/** Local profiles, derived entirely from POWER_DB. Manual mode is always last. */
export const DEVICES: MusicalDevice[] = [
  ...POWER_DB.filter(isDcDrivable).map(powerSpecToMusicalDevice),
  MANUAL_DEVICE,
];

export const MANUAL_IDX = DEVICES.length - 1;

/** Profile names the firmware knows by name (safe to use with {"select":...}). */
export const FIRMWARE_PROFILE_NAMES = [
  'Safe 5V',
  'iPhone Fast Chg',
  'MacBook Air',
  'Quad Cortex',
  'HX Stomp',
  'Strymon BigSky',
  'Volca Series',
  'OP-1 Field',
  'Pedalboard PPS',
] as const;

export function isFirmwareProfile(name: string): boolean {
  return FIRMWARE_PROFILE_NAMES.some((n) => n.toLowerCase() === name.toLowerCase());
}

/** Resolves the audited PowerSpec behind a profile (by id, else by brand+model). */
export function findPowerSpec(device: MusicalDevice): PowerSpec | null {
  if (device.specId) {
    return POWER_DB.find((s) => s.id === device.specId) ?? null;
  }
  const name = device.name.trim().toLowerCase();
  const brand = (device.brand ?? '').trim().toLowerCase();
  return (
    POWER_DB.find(
      (s) =>
        s.model.trim().toLowerCase() === name &&
        (!brand || s.brand.trim().toLowerCase() === brand),
    ) ?? null
  );
}

// PPS voltage bounds for manual mode (USB-PD PPS spec range, AP33772S typical).
export const MANUAL_MIN_V = 3.3;
export const MANUAL_MAX_V = 21.0;
export const MANUAL_STEP_V = 0.1;
export const MANUAL_SAFETY_THRESHOLD_V = 12.0;
export const MANUAL_SAFETY_HOLD_MS = 2000;
