export type Polarity = "center-positive" | "center-negative";

export type MusicalDevice = {
  name: string;
  brand?: string;
  voltage: number;       // volts
  current: number;       // amps (max draw)
  defaultPolarity: Polarity;
  polarityLabel: string; // exact label as displayed by the firmware
};

// Local device database — MUST match the firmware profile array (indices 0..N).
export const DEVICES: MusicalDevice[] = [
  { name: "Quad Cortex",          brand: "Neural DSP",        voltage: 12.0, current: 3.0,  defaultPolarity: "center-negative", polarityLabel: "USE INVERTER C-" },
  { name: "Digitakt II",          brand: "Elektron",          voltage: 12.0, current: 2.0,  defaultPolarity: "center-positive", polarityLabel: "KEEP CENTER + " },
  { name: "SP-404 MKII",          brand: "Roland",            voltage:  6.0, current: 1.1,  defaultPolarity: "center-positive", polarityLabel: "KEEP CENTER + " },
  { name: "HX Stomp",             brand: "Line 6",            voltage:  9.0, current: 3.0,  defaultPolarity: "center-negative", polarityLabel: "USE INVERTER C-" },
  { name: "S-4",                  brand: "Torso Electronics", voltage: 12.0, current: 2.0,  defaultPolarity: "center-positive", polarityLabel: "KEEP CENTER + " },
  { name: "HX Stomp XL",          brand: "Line 6",            voltage:  9.0, current: 3.0,  defaultPolarity: "center-negative", polarityLabel: "USE INVERTER C-" },
  { name: "Microcosm",            brand: "Hologram",          voltage:  9.0, current: 0.5,  defaultPolarity: "center-negative", polarityLabel: "USE INVERTER C-" },
  { name: "AMPLIFi FX100",        brand: "Line 6",            voltage:  9.0, current: 2.0,  defaultPolarity: "center-negative", polarityLabel: "USE INVERTER C-" },
  { name: "Soundblox",            brand: "Source Audio",      voltage:  9.0, current: 0.14, defaultPolarity: "center-negative", polarityLabel: "USE INVERTER C-" },
  { name: "Digitakt / Digitone",  brand: "Elektron",          voltage: 12.0, current: 2.0,  defaultPolarity: "center-positive", polarityLabel: "KEEP CENTER + " },
  { name: "[ MANUAL MODE ]",      brand: "Custom",            voltage:  5.0, current: 3.0,  defaultPolarity: "center-positive", polarityLabel: "CHECK PLUG TYPE" },
];

// Index of the manual mode entry in DEVICES (last item).
export const MANUAL_IDX = DEVICES.length - 1;

// PPS voltage bounds for manual mode (USB-PD PPS spec range, AP33772S typical).
export const MANUAL_MIN_V = 3.3;
export const MANUAL_MAX_V = 21.0;
export const MANUAL_STEP_V = 0.1;
export const MANUAL_SAFETY_THRESHOLD_V = 12.0;
export const MANUAL_SAFETY_HOLD_MS = 2000;
