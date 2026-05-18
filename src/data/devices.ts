export type Polarity = "center-positive" | "center-negative";

export type MusicalDevice = {
  name: string;
  brand?: string;
  voltage: number;       // volts
  current: number;       // amps (max draw)
  defaultPolarity: Polarity;
  polarityLabel: string; // exact label as displayed by the firmware
};

// Local device database — MUST match the firmware profile array (indices 0..6).
export const DEVICES: MusicalDevice[] = [
  { name: "Quad Cortex",      brand: "Neural DSP", voltage: 12.0, current: 3.0, defaultPolarity: "center-negative", polarityLabel: "USE INVERTER C-" },
  { name: "HX Stomp",         brand: "Line 6",     voltage:  9.0, current: 3.0, defaultPolarity: "center-negative", polarityLabel: "USE INVERTER C-" },
  { name: "Strymon BigSky",   brand: "Strymon",    voltage:  9.0, current: 0.3, defaultPolarity: "center-negative", polarityLabel: "USE INVERTER C-" },
  { name: "Digitakt II",      brand: "Elektron",   voltage: 12.0, current: 2.0, defaultPolarity: "center-positive", polarityLabel: "KEEP CENTER + " },
  { name: "MicroFreak",       brand: "Arturia",    voltage: 12.0, current: 1.0, defaultPolarity: "center-positive", polarityLabel: "KEEP CENTER + " },
  { name: "Volca Series",     brand: "Korg",       voltage:  9.0, current: 1.0, defaultPolarity: "center-positive", polarityLabel: "KORG CENTER +  " },
  { name: "[ MANUAL MODE ]",  brand: "Custom",     voltage:  5.0, current: 3.0, defaultPolarity: "center-positive", polarityLabel: "CHECK PLUG TYPE" },
];

// Index of the manual mode entry in DEVICES (last item, index 6).
export const MANUAL_IDX = DEVICES.length - 1;

// PPS voltage bounds for manual mode (USB-PD PPS spec range, AP33772S typical).
export const MANUAL_MIN_V = 3.3;
export const MANUAL_MAX_V = 21.0;
export const MANUAL_STEP_V = 0.1;
export const MANUAL_SAFETY_THRESHOLD_V = 12.0;
export const MANUAL_SAFETY_HOLD_MS = 2000;
