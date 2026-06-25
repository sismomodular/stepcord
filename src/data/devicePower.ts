// Power-safety database (additive — does not replace firmware-mirrored devices.ts).
// All values cross-checked against manufacturer specs. Treat this file as source
// of truth for the Data Health audit and runtime polarity/current guards.

export type PowerPolarity =
  | "center_negative"
  | "center_positive"
  | "ac"
  | "usb_c_pd"
  | "usb_micro"
  | "usb_a"
  | "iec_mains"
  | "battery";

export type ConnectorType =
  | "barrel_5.5x2.1"
  | "barrel_5.5x2.5"
  | "barrel_4.0x1.7"
  | "barrel_6.3x3.0"
  | "usb_c"
  | "usb_micro"
  | "usb_a"
  | "iec_c14"
  | "iec_c8"
  | "battery"
  | null;

export interface PowerSpec {
  id: string;
  brand: string;
  model: string;
  power_voltage: number | null;     // V DC (null for mains/battery)
  power_current_ma: number | null;  // mA
  power_polarity: PowerPolarity | null;
  connector_type: ConnectorType;
  notes?: string;
}

export const APPROVED_VOLTAGES = [3.3, 5, 6, 7.5, 9, 12, 15, 18, 19, 24] as const;
export const VOLTAGE_MIN = 3.3;
export const VOLTAGE_MAX = 24;

// Connector ↔ polarity compatibility matrix
export const POLARITY_CONNECTOR_MATRIX: Record<PowerPolarity, ConnectorType[]> = {
  center_negative: ["barrel_5.5x2.1", "barrel_5.5x2.5", "barrel_4.0x1.7", "barrel_6.3x3.0"],
  center_positive: ["barrel_5.5x2.1", "barrel_5.5x2.5", "barrel_4.0x1.7", "barrel_6.3x3.0"],
  ac: ["barrel_5.5x2.1", "barrel_5.5x2.5"],
  usb_c_pd: ["usb_c"],
  usb_micro: ["usb_micro"],
  usb_a: ["usb_a"],
  iec_mains: ["iec_c14", "iec_c8"],
  battery: ["battery", null],
};

export const POWER_DB: PowerSpec[] = [
  // ───────── KORG ─────────
  { id: "korg-microkorg",       brand: "Korg",      model: "microKORG",         power_voltage: 9,  power_current_ma: 1700, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "korg-microkorg-2",     brand: "Korg",      model: "microKORG 2",       power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "korg-volca",           brand: "Korg",      model: "Volca series",      power_voltage: 9,  power_current_ma: 1700, power_polarity: "center_positive", connector_type: "barrel_4.0x1.7" },
  { id: "korg-minilogue-xd",    brand: "Korg",      model: "minilogue xd",      power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "korg-prologue",        brand: "Korg",      model: "Prologue",          power_voltage: 12, power_current_ma: 3000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },

  // ───────── ROLAND ─────────
  { id: "roland-tr-8s",         brand: "Roland",    model: "TR-8S",             power_voltage: 9,  power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "roland-tr-6s",         brand: "Roland",    model: "TR-6S",             power_voltage: 9,  power_current_ma: 1000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "roland-sp-404mkii",    brand: "Roland",    model: "SP-404MKII",        power_voltage: 9,  power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "roland-mc-101",        brand: "Roland",    model: "MC-101",            power_voltage: 9,  power_current_ma: 1000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "roland-mc-707",        brand: "Roland",    model: "MC-707",            power_voltage: 9,  power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "roland-aira-compact",  brand: "Roland",    model: "AIRA Compact series", power_voltage: 5, power_current_ma: 1000, power_polarity: "usb_c_pd",       connector_type: "usb_c" },
  { id: "roland-jupiter-x",     brand: "Roland",    model: "Jupiter-X",         power_voltage: null, power_current_ma: null, power_polarity: "iec_mains",    connector_type: "iec_c14" },
  { id: "roland-sh-4d",         brand: "Roland",    model: "SH-4d",             power_voltage: 9,  power_current_ma: 3000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },

  // ───────── BEHRINGER ─────────
  { id: "beh-model-d",          brand: "Behringer", model: "Model D",           power_voltage: 12, power_current_ma: 1000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "beh-neutron",          brand: "Behringer", model: "Neutron",           power_voltage: 12, power_current_ma: 1000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "beh-poly-d",           brand: "Behringer", model: "Poly D",            power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "beh-rd-8-mkii",        brand: "Behringer", model: "RD-8 MKII",         power_voltage: 12, power_current_ma: 1500, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "beh-td-3-mkii",        brand: "Behringer", model: "TD-3 MKII",         power_voltage: 9,  power_current_ma: 500,  power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "beh-crave",            brand: "Behringer", model: "Crave",             power_voltage: 12, power_current_ma: 1000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },

  // ───────── ELEKTRON ─────────
  { id: "elek-digitakt-ii",     brand: "Elektron",  model: "Digitakt II",       power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "elek-digitone-ii",     brand: "Elektron",  model: "Digitone II",       power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "elek-syntakt",         brand: "Elektron",  model: "Syntakt",           power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "elek-a4-mkii",         brand: "Elektron",  model: "Analog Four MKII",  power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "elek-rytm-mkii",       brand: "Elektron",  model: "Analog Rytm MKII",  power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "elek-model-cycles",    brand: "Elektron",  model: "Model:Cycles",      power_voltage: 5,  power_current_ma: 1000, power_polarity: "usb_c_pd",        connector_type: "usb_c" },
  { id: "elek-model-samples",   brand: "Elektron",  model: "Model:Samples",     power_voltage: 5,  power_current_ma: 1000, power_polarity: "usb_c_pd",        connector_type: "usb_c" },
  { id: "elek-octatrack-mkiii", brand: "Elektron",  model: "Octatrack MKIII",   power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },

  // ───────── MOOG ─────────
  { id: "moog-mother-32",       brand: "Moog",      model: "Mother-32",         power_voltage: 12, power_current_ma: 1200, power_polarity: "center_positive", connector_type: "barrel_5.5x2.5" },
  { id: "moog-dfam",            brand: "Moog",      model: "DFAM",              power_voltage: 12, power_current_ma: 1200, power_polarity: "center_positive", connector_type: "barrel_5.5x2.5" },
  { id: "moog-grandmother",     brand: "Moog",      model: "Grandmother",       power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.5" },
  { id: "moog-matriarch",       brand: "Moog",      model: "Matriarch",         power_voltage: null, power_current_ma: null, power_polarity: "iec_mains",    connector_type: "iec_c14" },
  { id: "moog-minimoog-d",      brand: "Moog",      model: "Minimoog Model D (reissue)", power_voltage: null, power_current_ma: null, power_polarity: "iec_mains", connector_type: "iec_c14" },
  { id: "moog-mavis",           brand: "Moog",      model: "Mavis",             power_voltage: 12, power_current_ma: 500,  power_polarity: "center_positive", connector_type: "barrel_5.5x2.5" },

  // ───────── ARTURIA ─────────
  { id: "art-minifreak",        brand: "Arturia",   model: "MiniFreak",         power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "art-microfreak",       brand: "Arturia",   model: "MicroFreak",        power_voltage: 12, power_current_ma: 500,  power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "art-matrixbrute",      brand: "Arturia",   model: "MatrixBrute",       power_voltage: null, power_current_ma: null, power_polarity: "iec_mains",    connector_type: "iec_c14" },
  { id: "art-polybrute-12",     brand: "Arturia",   model: "PolyBrute 12",      power_voltage: null, power_current_ma: null, power_polarity: "iec_mains",    connector_type: "iec_c14" },
  { id: "art-drumbrute-impact", brand: "Arturia",   model: "DrumBrute Impact",  power_voltage: 12, power_current_ma: 1000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "art-beatstep-pro",     brand: "Arturia",   model: "BeatStep Pro",      power_voltage: 5,  power_current_ma: 500,  power_polarity: "usb_c_pd",        connector_type: "usb_c" },
  { id: "art-keystep-pro",      brand: "Arturia",   model: "KeyStep Pro",       power_voltage: 5,  power_current_ma: 500,  power_polarity: "usb_c_pd",        connector_type: "usb_c" },

  // ───────── TEENAGE ENGINEERING ─────────
  { id: "te-op-1-field",        brand: "Teenage Engineering", model: "OP-1 Field",     power_voltage: 5, power_current_ma: 2000, power_polarity: "usb_c_pd", connector_type: "usb_c" },
  { id: "te-op-z",              brand: "Teenage Engineering", model: "OP-Z",           power_voltage: 5, power_current_ma: 1000, power_polarity: "usb_c_pd", connector_type: "usb_c" },
  { id: "te-ep-133",            brand: "Teenage Engineering", model: "EP-133 K.O. II", power_voltage: 5, power_current_ma: 1500, power_polarity: "usb_c_pd", connector_type: "usb_c" },
  { id: "te-pocket-operators",  brand: "Teenage Engineering", model: "Pocket Operators", power_voltage: null, power_current_ma: null, power_polarity: "battery", connector_type: "battery", notes: "2x AAA" },

  // ───────── NOVATION ─────────
  { id: "nov-summit",           brand: "Novation",  model: "Summit",            power_voltage: null, power_current_ma: null, power_polarity: "iec_mains",    connector_type: "iec_c14" },
  { id: "nov-peak",             brand: "Novation",  model: "Peak",              power_voltage: null, power_current_ma: null, power_polarity: "iec_mains",    connector_type: "iec_c14" },
  { id: "nov-bass-station-ii",  brand: "Novation",  model: "Bass Station II",   power_voltage: 9,  power_current_ma: 1000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "nov-circuit-rhythm",   brand: "Novation",  model: "Circuit Rhythm",    power_voltage: 9,  power_current_ma: 1000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "nov-circuit-tracks",   brand: "Novation",  model: "Circuit Tracks",    power_voltage: 9,  power_current_ma: 1000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },

  // ───────── NATIVE INSTRUMENTS ─────────
  { id: "ni-maschine-plus",     brand: "Native Instruments", model: "Maschine+",   power_voltage: 19, power_current_ma: 3420, power_polarity: "center_positive", connector_type: "barrel_5.5x2.5" },
  { id: "ni-maschine-mk3",      brand: "Native Instruments", model: "Maschine MK3", power_voltage: 12, power_current_ma: 2000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },

  // ───────── SEQUENTIAL ─────────
  { id: "seq-prophet-6",        brand: "Sequential", model: "Prophet 6",        power_voltage: null, power_current_ma: null, power_polarity: "iec_mains",    connector_type: "iec_c14" },
  { id: "seq-prophet-10",       brand: "Sequential", model: "Prophet 10",       power_voltage: null, power_current_ma: null, power_polarity: "iec_mains",    connector_type: "iec_c14" },
  { id: "seq-ob-6",             brand: "Sequential", model: "OB-6",             power_voltage: null, power_current_ma: null, power_polarity: "iec_mains",    connector_type: "iec_c14" },
  { id: "seq-take-5",           brand: "Sequential", model: "Take 5",           power_voltage: 12, power_current_ma: 3000, power_polarity: "center_positive", connector_type: "barrel_5.5x2.1" },
  { id: "seq-trigon-6",         brand: "Sequential", model: "Trigon-6",         power_voltage: null, power_current_ma: null, power_polarity: "iec_mains",    connector_type: "iec_c14" },
];
