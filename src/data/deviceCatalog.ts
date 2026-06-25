// Comprehensive catalog of synthesizers, drum machines, samplers, grooveboxes
// and modular gear. This is a browsing/reference catalog and is intentionally
// decoupled from `src/data/devices.ts`, which carries USB-PD voltage/polarity
// info used by the firmware bridge.
//
// To extend: append to CATALOG. Keep `id` unique and kebab-cased.

export type DeviceCategory =
  | "synthesizer"
  | "drum_machine"
  | "sampler"
  | "groovebox"
  | "sequencer"
  | "modular"
  | "workstation";

export type DeviceType =
  | "analog"
  | "digital"
  | "hybrid"
  | "fm"
  | "wavetable"
  | "sample-based"
  | "modular"
  | "virtual-analog"
  | "physical-modeling";

export type Connectivity =
  | "midi_in"
  | "midi_out"
  | "midi_thru"
  | "usb_midi"
  | "cv_in"
  | "cv_out"
  | "gate_in"
  | "gate_out"
  | "audio_in"
  | "audio_out"
  | "sync_in"
  | "sync_out";

export interface CatalogDevice {
  id: string;
  brand: string;
  model: string;
  category: DeviceCategory;
  type: DeviceType;
  keys: number | null;
  year_released: number;
  connectivity: Connectivity[];
  image_url: string;
  thomann_url: string;
  tags: string[];
}

// Common connectivity presets to keep entries compact and consistent.
const MIDI_STD: Connectivity[] = ["midi_in", "midi_out", "usb_midi"];
const MIDI_FULL: Connectivity[] = ["midi_in", "midi_out", "midi_thru", "usb_midi"];
const AUDIO_OUT: Connectivity[] = ["audio_out"];
const AUDIO_IO: Connectivity[] = ["audio_in", "audio_out"];
const CV_GATE: Connectivity[] = ["cv_in", "cv_out", "gate_in", "gate_out"];
const SYNC_IO: Connectivity[] = ["sync_in", "sync_out"];

const c = (...groups: Connectivity[][]): Connectivity[] =>
  Array.from(new Set(groups.flat()));

export const CATALOG: CatalogDevice[] = [
  // ───────────────────────── KORG ─────────────────────────
  { id: "korg-microkorg-2", brand: "Korg", model: "microKORG 2", category: "synthesizer", type: "virtual-analog", keys: 37, year_released: 2025, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "", tags: ["polyphonic", "vocoder", "compact"] },
  { id: "korg-microkorg", brand: "Korg", model: "microKORG", category: "synthesizer", type: "virtual-analog", keys: 37, year_released: 2002, connectivity: c(["midi_in", "midi_out"], AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/korg_microkorg.htm", tags: ["polyphonic", "vocoder", "classic"] },
  { id: "korg-multipoly", brand: "Korg", model: "multi/poly", category: "synthesizer", type: "virtual-analog", keys: 37, year_released: 2024, connectivity: c(MIDI_STD, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "", tags: ["polyphonic", "desktop", "multitimbral"] },
  { id: "korg-phase8", brand: "Korg", model: "Phase8", category: "synthesizer", type: "digital", keys: 49, year_released: 2025, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "", tags: ["polyphonic", "phase-distortion"] },
  { id: "korg-minilogue-xd", brand: "Korg", model: "Minilogue XD", category: "synthesizer", type: "hybrid", keys: 37, year_released: 2019, connectivity: c(MIDI_FULL, AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/korg_minilogue_xd.htm", tags: ["polyphonic", "analog", "multi-engine"] },
  { id: "korg-prologue", brand: "Korg", model: "Prologue", category: "synthesizer", type: "hybrid", keys: 61, year_released: 2018, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/korg_prologue_16.htm", tags: ["polyphonic", "analog", "flagship"] },
  { id: "korg-volca-beats", brand: "Korg", model: "Volca Beats", category: "drum_machine", type: "analog", keys: null, year_released: 2013, connectivity: c(["midi_in"], AUDIO_OUT, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/korg_volca_beats.htm", tags: ["portable", "battery"] },
  { id: "korg-volca-keys", brand: "Korg", model: "Volca Keys", category: "synthesizer", type: "analog", keys: 27, year_released: 2013, connectivity: c(["midi_in"], AUDIO_OUT, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/korg_volca_keys.htm", tags: ["portable", "battery", "polyphonic"] },
  { id: "korg-volca-bass", brand: "Korg", model: "Volca Bass", category: "synthesizer", type: "analog", keys: 27, year_released: 2013, connectivity: c(["midi_in"], AUDIO_OUT, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/korg_volca_bass.htm", tags: ["portable", "battery", "bass"] },
  { id: "korg-volca-fm", brand: "Korg", model: "Volca FM", category: "synthesizer", type: "fm", keys: 27, year_released: 2016, connectivity: c(["midi_in"], AUDIO_OUT, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/korg_volca_fm.htm", tags: ["portable", "fm", "polyphonic"] },
  { id: "korg-volca-sample-2", brand: "Korg", model: "Volca Sample 2", category: "sampler", type: "sample-based", keys: null, year_released: 2020, connectivity: c(["midi_in"], AUDIO_OUT, SYNC_IO), image_url: "", thomann_url: "", tags: ["portable", "battery"] },
  { id: "korg-volca-modular", brand: "Korg", model: "Volca Modular", category: "modular", type: "modular", keys: 27, year_released: 2019, connectivity: c(["midi_in"], AUDIO_OUT, SYNC_IO), image_url: "", thomann_url: "", tags: ["semi-modular", "west-coast"] },
  { id: "korg-volca-drum", brand: "Korg", model: "Volca Drum", category: "drum_machine", type: "digital", keys: null, year_released: 2019, connectivity: c(["midi_in"], AUDIO_OUT, SYNC_IO), image_url: "", thomann_url: "", tags: ["portable", "physical-modeling"] },
  { id: "korg-volca-nubass", brand: "Korg", model: "Volca Nubass", category: "synthesizer", type: "analog", keys: 27, year_released: 2019, connectivity: c(["midi_in"], AUDIO_OUT, SYNC_IO), image_url: "", thomann_url: "", tags: ["bass", "tube"] },
  { id: "korg-wavestate", brand: "Korg", model: "Wavestate", category: "synthesizer", type: "wavetable", keys: 37, year_released: 2020, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/korg_wavestate.htm", tags: ["polyphonic", "wave-sequencing"] },
  { id: "korg-opsix", brand: "Korg", model: "Opsix", category: "synthesizer", type: "fm", keys: 37, year_released: 2020, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/korg_opsix.htm", tags: ["polyphonic", "fm", "altered-fm"] },
  { id: "korg-modwave", brand: "Korg", model: "Modwave", category: "synthesizer", type: "wavetable", keys: 37, year_released: 2021, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/korg_modwave.htm", tags: ["polyphonic", "wavetable"] },

  // ───────────────────────── ROLAND ─────────────────────────
  { id: "roland-tr-1000", brand: "Roland", model: "TR-1000", category: "drum_machine", type: "hybrid", keys: null, year_released: 2025, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "", tags: ["flagship", "acb", "sampling"] },
  { id: "roland-tr-8s", brand: "Roland", model: "TR-8S", category: "drum_machine", type: "hybrid", keys: null, year_released: 2018, connectivity: c(MIDI_STD, AUDIO_IO, ["sync_out"]), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_tr_8s.htm", tags: ["acb", "sampling", "performance"] },
  { id: "roland-tr-6s", brand: "Roland", model: "TR-6S", category: "drum_machine", type: "hybrid", keys: null, year_released: 2020, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_tr_6s.htm", tags: ["compact", "acb", "sampling"] },
  { id: "roland-sp-404mkii", brand: "Roland", model: "SP-404MKII", category: "sampler", type: "sample-based", keys: null, year_released: 2021, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_sp_404mk2.htm", tags: ["live-sampling", "effects", "performance"] },
  { id: "roland-aira-compact-t-8", brand: "Roland", model: "AIRA Compact T-8", category: "drum_machine", type: "hybrid", keys: null, year_released: 2022, connectivity: c(["midi_in", "midi_out", "usb_midi"], AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_aira_compact_t_8.htm", tags: ["portable", "battery", "acb"] },
  { id: "roland-aira-compact-j-6", brand: "Roland", model: "AIRA Compact J-6", category: "synthesizer", type: "virtual-analog", keys: null, year_released: 2022, connectivity: c(MIDI_STD, AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_aira_compact_j_6.htm", tags: ["portable", "chord", "battery"] },
  { id: "roland-aira-compact-p-6", brand: "Roland", model: "AIRA Compact P-6", category: "sampler", type: "sample-based", keys: null, year_released: 2024, connectivity: c(MIDI_STD, AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "", tags: ["portable", "creative-sampler", "battery"] },
  { id: "roland-aira-compact-e-4", brand: "Roland", model: "AIRA Compact E-4", category: "sampler", type: "sample-based", keys: null, year_released: 2022, connectivity: c(MIDI_STD, AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_aira_compact_e_4.htm", tags: ["voice-tweaker", "fx", "battery"] },
  { id: "roland-jupiter-x", brand: "Roland", model: "Jupiter-X", category: "synthesizer", type: "virtual-analog", keys: 61, year_released: 2019, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_jupiter_x.htm", tags: ["polyphonic", "zen-core", "multitimbral"] },
  { id: "roland-jupiter-xm", brand: "Roland", model: "Jupiter-Xm", category: "synthesizer", type: "virtual-analog", keys: 37, year_released: 2019, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_jupiter_xm.htm", tags: ["polyphonic", "zen-core", "compact"] },
  { id: "roland-sh-4d", brand: "Roland", model: "SH-4d", category: "synthesizer", type: "digital", keys: 25, year_released: 2023, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_sh_4d.htm", tags: ["desktop", "polyphonic", "sequencer"] },
  { id: "roland-mc-101", brand: "Roland", model: "MC-101", category: "groovebox", type: "digital", keys: null, year_released: 2019, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_mc_101.htm", tags: ["compact", "zen-core", "battery"] },
  { id: "roland-mc-707", brand: "Roland", model: "MC-707", category: "groovebox", type: "digital", keys: null, year_released: 2019, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_mc_707.htm", tags: ["zen-core", "performance"] },
  { id: "roland-system-8", brand: "Roland", model: "System-8", category: "synthesizer", type: "virtual-analog", keys: 49, year_released: 2016, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/roland_system_8.htm", tags: ["polyphonic", "plug-out"] },

  // ─────────────────────── BEHRINGER ───────────────────────
  { id: "behringer-ub-xa-d", brand: "Behringer", model: "UB-Xa D", category: "synthesizer", type: "analog", keys: null, year_released: 2024, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "", tags: ["polyphonic", "desktop", "ob-x clone"] },
  { id: "behringer-syncussion-sy-1", brand: "Behringer", model: "Syncussion SY-1", category: "drum_machine", type: "analog", keys: null, year_released: 2023, connectivity: c(["midi_in"], AUDIO_OUT, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/behringer_syncussion_sy_1.htm", tags: ["percussion", "desktop"] },
  { id: "behringer-kobol-expander", brand: "Behringer", model: "Kobol Expander", category: "synthesizer", type: "analog", keys: null, year_released: 2022, connectivity: c(["midi_in"], AUDIO_OUT, CV_GATE), image_url: "", thomann_url: "", tags: ["monophonic", "desktop", "rms clone"] },
  { id: "behringer-poly-d", brand: "Behringer", model: "Poly D", category: "synthesizer", type: "analog", keys: 37, year_released: 2019, connectivity: c(["midi_in", "midi_thru", "usb_midi"], AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/behringer_poly_d.htm", tags: ["paraphonic", "model-d"] },
  { id: "behringer-model-d", brand: "Behringer", model: "Model D", category: "synthesizer", type: "analog", keys: null, year_released: 2017, connectivity: c(["midi_in", "midi_thru", "usb_midi"], AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/behringer_model_d.htm", tags: ["monophonic", "desktop"] },
  { id: "behringer-neutron", brand: "Behringer", model: "Neutron", category: "synthesizer", type: "analog", keys: null, year_released: 2018, connectivity: c(["midi_in", "midi_thru", "usb_midi"], AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/behringer_neutron.htm", tags: ["semi-modular", "paraphonic"] },
  { id: "behringer-rd-8-mkii", brand: "Behringer", model: "RD-8 MKII", category: "drum_machine", type: "analog", keys: null, year_released: 2023, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "", tags: ["808-clone", "sequencer"] },
  { id: "behringer-td-3-mkii", brand: "Behringer", model: "TD-3 MKII", category: "synthesizer", type: "analog", keys: null, year_released: 2023, connectivity: c(["midi_in", "midi_thru", "usb_midi"], AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "", tags: ["bass", "303-clone", "sequencer"] },
  { id: "behringer-ms-1", brand: "Behringer", model: "MS-1", category: "synthesizer", type: "analog", keys: 32, year_released: 2018, connectivity: c(["midi_in", "midi_thru", "usb_midi"], AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/behringer_ms_1.htm", tags: ["monophonic", "sh-101 clone"] },
  { id: "behringer-crave", brand: "Behringer", model: "Crave", category: "synthesizer", type: "analog", keys: null, year_released: 2019, connectivity: c(["midi_in", "midi_thru", "usb_midi"], AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/behringer_crave.htm", tags: ["semi-modular", "sequencer"] },
  { id: "behringer-edge", brand: "Behringer", model: "Edge", category: "drum_machine", type: "analog", keys: null, year_released: 2022, connectivity: c(["midi_in", "midi_thru", "usb_midi"], AUDIO_OUT, CV_GATE), image_url: "", thomann_url: "", tags: ["semi-modular", "percussion"] },

  // ─────────────────────── ELEKTRON ───────────────────────
  { id: "elektron-digitakt-ii", brand: "Elektron", model: "Digitakt II", category: "sampler", type: "sample-based", keys: null, year_released: 2024, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/elektron_digitakt_ii.htm", tags: ["groovebox", "16-tracks", "overbridge"] },
  { id: "elektron-digitone-ii", brand: "Elektron", model: "Digitone II", category: "synthesizer", type: "fm", keys: null, year_released: 2024, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/elektron_digitone_ii.htm", tags: ["fm", "multitimbral", "overbridge"] },
  { id: "elektron-syntakt", brand: "Elektron", model: "Syntakt", category: "groovebox", type: "hybrid", keys: null, year_released: 2022, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/elektron_syntakt.htm", tags: ["analog", "digital", "drums"] },
  { id: "elektron-analog-four-mkii", brand: "Elektron", model: "Analog Four MKII", category: "synthesizer", type: "analog", keys: null, year_released: 2017, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/elektron_analog_four_mkii.htm", tags: ["4-voice", "multitimbral"] },
  { id: "elektron-analog-rytm-mkii", brand: "Elektron", model: "Analog Rytm MKII", category: "drum_machine", type: "hybrid", keys: null, year_released: 2017, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/elektron_analog_rytm_mkii.htm", tags: ["analog", "sampling", "pads"] },
  { id: "elektron-model-cycles", brand: "Elektron", model: "Model:Cycles", category: "groovebox", type: "fm", keys: null, year_released: 2020, connectivity: c(["midi_in", "midi_out", "midi_thru", "usb_midi"], AUDIO_OUT), image_url: "", thomann_url: "https://www.thomann.de/pt/elektron_model_cycles.htm", tags: ["fm", "compact"] },
  { id: "elektron-model-samples", brand: "Elektron", model: "Model:Samples", category: "sampler", type: "sample-based", keys: null, year_released: 2019, connectivity: c(["midi_in", "midi_out", "midi_thru", "usb_midi"], AUDIO_OUT), image_url: "", thomann_url: "https://www.thomann.de/pt/elektron_model_samples.htm", tags: ["groovebox", "compact"] },
  { id: "elektron-octatrack-mkiii", brand: "Elektron", model: "Octatrack MKIII", category: "sampler", type: "sample-based", keys: null, year_released: 2025, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "", tags: ["performance", "live-sampling", "8-tracks"] },

  // ─────────────────────── ARTURIA ───────────────────────
  { id: "arturia-polybrute-12", brand: "Arturia", model: "PolyBrute 12", category: "synthesizer", type: "analog", keys: 61, year_released: 2024, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/arturia_polybrute_12.htm", tags: ["polyphonic", "mpe", "flagship"] },
  { id: "arturia-astrolab", brand: "Arturia", model: "AstroLab", category: "workstation", type: "digital", keys: 61, year_released: 2024, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/arturia_astrolab.htm", tags: ["stage", "v-collection"] },
  { id: "arturia-astrolab-37", brand: "Arturia", model: "AstroLab 37", category: "workstation", type: "digital", keys: 37, year_released: 2025, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "", tags: ["stage", "compact"] },
  { id: "arturia-astrolab-88", brand: "Arturia", model: "AstroLab 88", category: "workstation", type: "digital", keys: 88, year_released: 2025, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "", tags: ["stage", "weighted"] },
  { id: "arturia-minifreak", brand: "Arturia", model: "MiniFreak", category: "synthesizer", type: "hybrid", keys: 37, year_released: 2022, connectivity: c(MIDI_STD, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/arturia_minifreak.htm", tags: ["paraphonic", "fx", "sequencer"] },
  { id: "arturia-matrixbrute", brand: "Arturia", model: "MatrixBrute", category: "synthesizer", type: "analog", keys: 49, year_released: 2017, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/arturia_matrixbrute.htm", tags: ["monophonic", "paraphonic", "matrix"] },
  { id: "arturia-microfreak", brand: "Arturia", model: "MicroFreak", category: "synthesizer", type: "hybrid", keys: 25, year_released: 2019, connectivity: c(MIDI_STD, AUDIO_OUT, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/arturia_microfreak.htm", tags: ["paraphonic", "touch-keys"] },
  { id: "arturia-drumbrute-impact", brand: "Arturia", model: "DrumBrute Impact", category: "drum_machine", type: "analog", keys: null, year_released: 2018, connectivity: c(MIDI_FULL, AUDIO_OUT, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/arturia_drumbrute_impact.htm", tags: ["analog", "compact"] },
  { id: "arturia-beatstep-pro", brand: "Arturia", model: "BeatStep Pro", category: "sequencer", type: "digital", keys: null, year_released: 2015, connectivity: c(MIDI_FULL, CV_GATE, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/arturia_beatstep_pro.htm", tags: ["controller", "sequencer"] },
  { id: "arturia-keystep-pro", brand: "Arturia", model: "KeyStep Pro", category: "sequencer", type: "digital", keys: 37, year_released: 2020, connectivity: c(MIDI_FULL, CV_GATE, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/arturia_keystep_pro.htm", tags: ["controller", "sequencer"] },

  // ───────────────────────── MOOG ─────────────────────────
  { id: "moog-minimoog-model-d", brand: "Moog", model: "Minimoog Model D", category: "synthesizer", type: "analog", keys: 44, year_released: 2016, connectivity: c(["midi_in"], AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/moog_minimoog_model_d_2022.htm", tags: ["monophonic", "classic"] },
  { id: "moog-subsequent-37", brand: "Moog", model: "Subsequent 37", category: "synthesizer", type: "analog", keys: 37, year_released: 2017, connectivity: c(MIDI_STD, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/moog_subsequent_37.htm", tags: ["paraphonic", "duo"] },
  { id: "moog-subsequent-25", brand: "Moog", model: "Subsequent 25", category: "synthesizer", type: "analog", keys: 25, year_released: 2020, connectivity: c(MIDI_STD, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/moog_subsequent_25.htm", tags: ["paraphonic", "compact"] },
  { id: "moog-matriarch", brand: "Moog", model: "Matriarch", category: "synthesizer", type: "analog", keys: 49, year_released: 2019, connectivity: c(["midi_in", "midi_out", "midi_thru"], AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/moog_matriarch.htm", tags: ["semi-modular", "paraphonic"] },
  { id: "moog-grandmother", brand: "Moog", model: "Grandmother", category: "synthesizer", type: "analog", keys: 32, year_released: 2018, connectivity: c(["midi_in", "midi_out", "midi_thru"], AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/moog_grandmother.htm", tags: ["semi-modular", "monophonic"] },
  { id: "moog-dfam", brand: "Moog", model: "DFAM", category: "drum_machine", type: "analog", keys: null, year_released: 2018, connectivity: c(AUDIO_OUT, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/moog_dfam.htm", tags: ["semi-modular", "percussion"] },
  { id: "moog-mother-32", brand: "Moog", model: "Mother-32", category: "synthesizer", type: "analog", keys: null, year_released: 2015, connectivity: c(["midi_in"], AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/moog_mother_32.htm", tags: ["semi-modular", "monophonic"] },
  { id: "moog-mavis", brand: "Moog", model: "Mavis", category: "synthesizer", type: "analog", keys: null, year_released: 2022, connectivity: c(AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/moog_mavis.htm", tags: ["semi-modular", "diy"] },
  { id: "moog-one", brand: "Moog", model: "One", category: "synthesizer", type: "analog", keys: 61, year_released: 2018, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/moog_one_16.htm", tags: ["polyphonic", "flagship"] },

  // ────────────────────── SEQUENTIAL ──────────────────────
  { id: "sequential-prophet-6", brand: "Sequential", model: "Prophet 6", category: "synthesizer", type: "analog", keys: 49, year_released: 2015, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/dave_smith_instr_prophet_6.htm", tags: ["polyphonic", "6-voice"] },
  { id: "sequential-prophet-10", brand: "Sequential", model: "Prophet 10", category: "synthesizer", type: "analog", keys: 61, year_released: 2020, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/sequential_prophet_10.htm", tags: ["polyphonic", "10-voice"] },
  { id: "sequential-prophet-x", brand: "Sequential", model: "Prophet X", category: "synthesizer", type: "hybrid", keys: 61, year_released: 2018, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/dave_smith_instr_prophet_x.htm", tags: ["sample+synth", "polyphonic"] },
  { id: "sequential-ob-6", brand: "Sequential", model: "OB-6", category: "synthesizer", type: "analog", keys: 49, year_released: 2016, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/dave_smith_instr_ob_6.htm", tags: ["polyphonic", "oberheim"] },
  { id: "sequential-take-5", brand: "Sequential", model: "Take 5", category: "synthesizer", type: "analog", keys: 44, year_released: 2021, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/sequential_take_5.htm", tags: ["polyphonic", "5-voice"] },
  { id: "sequential-trigon-6", brand: "Sequential", model: "Trigon-6", category: "synthesizer", type: "analog", keys: 49, year_released: 2022, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/sequential_trigon_6.htm", tags: ["polyphonic", "3-osc"] },

  // ──────────────────────── AKAI ────────────────────────
  { id: "akai-mpc-key-37-g2", brand: "Akai Professional", model: "MPC Key 37 G2", category: "workstation", type: "digital", keys: 37, year_released: 2025, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "", tags: ["standalone", "sampler", "synth-engines"] },
  { id: "akai-mpc-key-37", brand: "Akai Professional", model: "MPC Key 37", category: "workstation", type: "digital", keys: 37, year_released: 2023, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/akai_professional_mpc_key_37.htm", tags: ["standalone", "synth-engines"] },
  { id: "akai-mpc-one-plus", brand: "Akai Professional", model: "MPC One+", category: "groovebox", type: "digital", keys: null, year_released: 2023, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/akai_professional_mpc_one.htm", tags: ["standalone", "wifi"] },
  { id: "akai-mpc-live-ii", brand: "Akai Professional", model: "MPC Live II", category: "groovebox", type: "digital", keys: null, year_released: 2020, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/akai_professional_mpc_live_ii.htm", tags: ["standalone", "battery", "speakers"] },
  { id: "akai-mpc-x-se", brand: "Akai Professional", model: "MPC X SE", category: "groovebox", type: "digital", keys: null, year_released: 2023, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/akai_professional_mpc_x_se.htm", tags: ["flagship", "standalone"] },
  { id: "akai-mpc-sample", brand: "Akai Professional", model: "MPC Sample", category: "sampler", type: "sample-based", keys: null, year_released: 2025, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "", tags: ["compact", "sampler"] },
  { id: "akai-force", brand: "Akai Professional", model: "Force", category: "groovebox", type: "digital", keys: null, year_released: 2019, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/akai_professional_force.htm", tags: ["standalone", "clip-launcher"] },

  // ─────────────── NATIVE INSTRUMENTS ───────────────
  { id: "ni-maschine-plus", brand: "Native Instruments", model: "Maschine+", category: "groovebox", type: "digital", keys: null, year_released: 2020, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/native_instruments_maschine_plus.htm", tags: ["standalone", "sampler"] },
  { id: "ni-maschine-mk3", brand: "Native Instruments", model: "Maschine MK3", category: "groovebox", type: "digital", keys: null, year_released: 2017, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/native_instruments_maschine_mk3.htm", tags: ["controller", "host-required"] },
  { id: "ni-maschine-studio", brand: "Native Instruments", model: "Maschine Studio", category: "groovebox", type: "digital", keys: null, year_released: 2013, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "", tags: ["controller", "host-required"] },
  { id: "ni-maschine-mikro-mk3", brand: "Native Instruments", model: "Maschine Mikro MK3", category: "groovebox", type: "digital", keys: null, year_released: 2018, connectivity: c(["usb_midi"]), image_url: "", thomann_url: "https://www.thomann.de/pt/native_instruments_maschine_mikro_mk3.htm", tags: ["compact", "controller"] },

  // ─────────────────────── NOVATION ───────────────────────
  { id: "novation-circuit-rhythm", brand: "Novation", model: "Circuit Rhythm", category: "sampler", type: "sample-based", keys: null, year_released: 2021, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/novation_circuit_rhythm.htm", tags: ["groovebox", "battery"] },
  { id: "novation-circuit-tracks", brand: "Novation", model: "Circuit Tracks", category: "groovebox", type: "digital", keys: null, year_released: 2021, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/novation_circuit_tracks.htm", tags: ["battery", "performance"] },
  { id: "novation-summit", brand: "Novation", model: "Summit", category: "synthesizer", type: "hybrid", keys: 61, year_released: 2019, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/novation_summit.htm", tags: ["polyphonic", "16-voice"] },
  { id: "novation-peak", brand: "Novation", model: "Peak", category: "synthesizer", type: "hybrid", keys: null, year_released: 2017, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/novation_peak.htm", tags: ["polyphonic", "desktop"] },
  { id: "novation-bass-station-ii", brand: "Novation", model: "Bass Station II", category: "synthesizer", type: "analog", keys: 25, year_released: 2013, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/novation_bass_station_ii.htm", tags: ["monophonic", "bass"] },
  { id: "novation-mininova", brand: "Novation", model: "MiniNova", category: "synthesizer", type: "virtual-analog", keys: 37, year_released: 2012, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/novation_mininova.htm", tags: ["polyphonic", "vocoder"] },
  { id: "novation-ultranova", brand: "Novation", model: "UltraNova", category: "synthesizer", type: "virtual-analog", keys: 37, year_released: 2010, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/novation_ultranova.htm", tags: ["polyphonic", "vocoder"] },

  // ──────────────────────── WALDORF ────────────────────────
  { id: "waldorf-iridium", brand: "Waldorf", model: "Iridium", category: "synthesizer", type: "digital", keys: null, year_released: 2020, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/waldorf_iridium_desktop.htm", tags: ["polyphonic", "multi-engine"] },
  { id: "waldorf-quantum-mk2", brand: "Waldorf", model: "Quantum MK2", category: "synthesizer", type: "hybrid", keys: 61, year_released: 2023, connectivity: c(MIDI_FULL, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/waldorf_quantum_mk2.htm", tags: ["polyphonic", "flagship"] },
  { id: "waldorf-m", brand: "Waldorf", model: "M", category: "synthesizer", type: "wavetable", keys: null, year_released: 2021, connectivity: c(MIDI_FULL, AUDIO_OUT), image_url: "", thomann_url: "https://www.thomann.de/pt/waldorf_m.htm", tags: ["polyphonic", "microwave"] },
  { id: "waldorf-blofeld", brand: "Waldorf", model: "Blofeld", category: "synthesizer", type: "wavetable", keys: null, year_released: 2007, connectivity: c(["midi_in", "midi_out", "usb_midi"], AUDIO_OUT), image_url: "", thomann_url: "https://www.thomann.de/pt/waldorf_blofeld_black.htm", tags: ["polyphonic", "desktop"] },
  { id: "waldorf-kyra", brand: "Waldorf", model: "Kyra", category: "synthesizer", type: "virtual-analog", keys: null, year_released: 2020, connectivity: c(MIDI_FULL, AUDIO_OUT), image_url: "", thomann_url: "https://www.thomann.de/pt/waldorf_kyra.htm", tags: ["polyphonic", "fpga"] },
  { id: "waldorf-protein", brand: "Waldorf", model: "Protein", category: "synthesizer", type: "digital", keys: null, year_released: 2025, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "", tags: ["desktop", "polyphonic"] },

  // ─────────────────────── MAKE NOISE ───────────────────────
  { id: "make-noise-0-coast", brand: "Make Noise", model: "0-Coast", category: "synthesizer", type: "analog", keys: null, year_released: 2016, connectivity: c(["midi_in"], AUDIO_OUT, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/make_noise_0_coast.htm", tags: ["semi-modular", "west-coast"] },
  { id: "make-noise-0-ctrl", brand: "Make Noise", model: "0-CTRL", category: "sequencer", type: "analog", keys: null, year_released: 2020, connectivity: c(CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/make_noise_0_ctrl.htm", tags: ["touch-sequencer", "controller"] },
  { id: "make-noise-shared-system", brand: "Make Noise", model: "Shared System", category: "modular", type: "modular", keys: null, year_released: 2014, connectivity: c(AUDIO_IO, CV_GATE), image_url: "", thomann_url: "", tags: ["eurorack", "system"] },

  // ─────────────── TEENAGE ENGINEERING ───────────────
  { id: "te-op-1-field", brand: "Teenage Engineering", model: "OP-1 Field", category: "workstation", type: "digital", keys: 24, year_released: 2022, connectivity: c(["usb_midi"], AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/teenage_engineering_op_1_field.htm", tags: ["portable", "battery", "synth+sampler"] },
  { id: "te-op-z", brand: "Teenage Engineering", model: "OP-Z", category: "groovebox", type: "digital", keys: null, year_released: 2018, connectivity: c(["usb_midi"], AUDIO_OUT), image_url: "", thomann_url: "https://www.thomann.de/pt/teenage_engineering_op_z.htm", tags: ["portable", "battery", "16-track"] },
  { id: "te-ep-133-ko-ii", brand: "Teenage Engineering", model: "EP-133 K.O. II", category: "sampler", type: "sample-based", keys: null, year_released: 2023, connectivity: c(["midi_in", "midi_out", "usb_midi"], AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/teenage_engineering_ep_133_ko_ii.htm", tags: ["portable", "battery"] },
  { id: "te-po-12", brand: "Teenage Engineering", model: "Pocket Operator PO-12", category: "drum_machine", type: "digital", keys: null, year_released: 2015, connectivity: c(AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/teenage_engineering_po_12_rhythm.htm", tags: ["pocket", "battery"] },
  { id: "te-po-14", brand: "Teenage Engineering", model: "Pocket Operator PO-14", category: "synthesizer", type: "digital", keys: null, year_released: 2015, connectivity: c(AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/teenage_engineering_po_14_sub.htm", tags: ["pocket", "bass"] },
  { id: "te-po-16", brand: "Teenage Engineering", model: "Pocket Operator PO-16", category: "synthesizer", type: "digital", keys: null, year_released: 2015, connectivity: c(AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/teenage_engineering_po_16_factory.htm", tags: ["pocket", "lead"] },
  { id: "te-po-20", brand: "Teenage Engineering", model: "Pocket Operator PO-20", category: "synthesizer", type: "digital", keys: null, year_released: 2016, connectivity: c(AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/teenage_engineering_po_20_arcade.htm", tags: ["pocket", "chiptune"] },
  { id: "te-po-32", brand: "Teenage Engineering", model: "Pocket Operator PO-32", category: "drum_machine", type: "digital", keys: null, year_released: 2017, connectivity: c(AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/teenage_engineering_po_32_tonic.htm", tags: ["pocket", "microtonic"] },
  { id: "te-po-33", brand: "Teenage Engineering", model: "Pocket Operator PO-33", category: "sampler", type: "sample-based", keys: null, year_released: 2018, connectivity: c(AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/teenage_engineering_po_33_ko.htm", tags: ["pocket", "sampler"] },
  { id: "te-po-35", brand: "Teenage Engineering", model: "Pocket Operator PO-35", category: "sampler", type: "sample-based", keys: null, year_released: 2018, connectivity: c(AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/teenage_engineering_po_35_speak.htm", tags: ["pocket", "vocal"] },

  // ───────────────────────── NORD ─────────────────────────
  { id: "nord-lead-a1", brand: "Clavia Nord", model: "Nord Lead A1", category: "synthesizer", type: "virtual-analog", keys: 49, year_released: 2014, connectivity: c(MIDI_STD, AUDIO_OUT), image_url: "", thomann_url: "https://www.thomann.de/pt/clavia_nord_lead_a1.htm", tags: ["polyphonic", "performance"] },
  { id: "nord-wave-2", brand: "Clavia Nord", model: "Nord Wave 2", category: "synthesizer", type: "hybrid", keys: 49, year_released: 2020, connectivity: c(MIDI_STD, AUDIO_OUT), image_url: "", thomann_url: "https://www.thomann.de/pt/clavia_nord_wave_2.htm", tags: ["polyphonic", "sample+wavetable"] },
  { id: "nord-drum-3p", brand: "Clavia Nord", model: "Nord Drum 3P", category: "drum_machine", type: "digital", keys: null, year_released: 2015, connectivity: c(["midi_in", "midi_out"], AUDIO_OUT), image_url: "", thomann_url: "https://www.thomann.de/pt/clavia_nord_drum_3p.htm", tags: ["physical-modeling", "pads"] },

  // ──────────────────────── ABLETON ────────────────────────
  { id: "ableton-move", brand: "Ableton", model: "Move", category: "groovebox", type: "digital", keys: null, year_released: 2024, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/ableton_move.htm", tags: ["portable", "battery", "standalone"] },

  // ─────────────────── EXPRESSIVE E ───────────────────
  { id: "expressive-e-osmose", brand: "Expressive E", model: "Osmose", category: "synthesizer", type: "physical-modeling", keys: 49, year_released: 2023, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/expressive_e_osmose.htm", tags: ["mpe", "polyphonic-aftertouch"] },

  // ─────────────────── SOMA LABORATORY ───────────────────
  { id: "soma-flux", brand: "Soma Laboratory", model: "Flux", category: "synthesizer", type: "digital", keys: null, year_released: 2024, connectivity: c(MIDI_STD, AUDIO_OUT), image_url: "", thomann_url: "", tags: ["gestural", "experimental"] },
  { id: "soma-lyra-8", brand: "Soma Laboratory", model: "Lyra-8", category: "synthesizer", type: "analog", keys: null, year_released: 2016, connectivity: c(AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/soma_lyra_8.htm", tags: ["drone", "organismic"] },
  { id: "soma-cosmos", brand: "Soma Laboratory", model: "Cosmos", category: "synthesizer", type: "digital", keys: null, year_released: 2023, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/soma_cosmos.htm", tags: ["drifting-memory", "fx"] },

  // ──────────────────────── POLYEND ────────────────────────
  { id: "polyend-play-plus", brand: "Polyend", model: "Play+", category: "groovebox", type: "sample-based", keys: null, year_released: 2024, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/polyend_play.htm", tags: ["sampler", "synth-engines"] },
  { id: "polyend-tracker-plus", brand: "Polyend", model: "Tracker+", category: "sampler", type: "sample-based", keys: null, year_released: 2024, connectivity: c(MIDI_FULL, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/polyend_tracker.htm", tags: ["tracker-workflow", "portable"] },
  { id: "polyend-seq", brand: "Polyend", model: "Seq", category: "sequencer", type: "digital", keys: null, year_released: 2018, connectivity: c(MIDI_FULL, CV_GATE), image_url: "", thomann_url: "", tags: ["8-track", "performance"] },
  { id: "polyend-endless", brand: "Polyend", model: "Endless", category: "sequencer", type: "digital", keys: null, year_released: 2025, connectivity: c(MIDI_FULL, CV_GATE), image_url: "", thomann_url: "", tags: ["sequencer", "performance"] },

  // ─────────────────── ERICA SYNTHS ───────────────────
  { id: "erica-bassline-db-01", brand: "Erica Synths", model: "Bassline DB-01", category: "synthesizer", type: "analog", keys: null, year_released: 2017, connectivity: c(MIDI_STD, AUDIO_OUT, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/erica_synths_db_01.htm", tags: ["bass", "sequencer"] },
  { id: "erica-sample-drum", brand: "Erica Synths", model: "Sample Drum", category: "drum_machine", type: "sample-based", keys: null, year_released: 2020, connectivity: c(AUDIO_OUT, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/erica_synths_sample_drum.htm", tags: ["eurorack", "dual"] },
  { id: "erica-drum-sequencer", brand: "Erica Synths", model: "Drum Sequencer", category: "sequencer", type: "digital", keys: null, year_released: 2019, connectivity: c(MIDI_FULL, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/erica_synths_drum_sequencer.htm", tags: ["eurorack", "16-track"] },
  { id: "erica-perkons-hd-01", brand: "Erica Synths", model: "Pērkons HD-01", category: "drum_machine", type: "hybrid", keys: null, year_released: 2021, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/erica_synths_perkons_hd_01.htm", tags: ["4-voice", "performance"] },

  // ──────────────────────── 1010MUSIC ────────────────────────
  { id: "1010music-blackbox", brand: "1010music", model: "Blackbox", category: "sampler", type: "sample-based", keys: null, year_released: 2019, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/1010music_blackbox.htm", tags: ["compact", "touchscreen"] },
  { id: "1010music-bluebox", brand: "1010music", model: "Bluebox", category: "workstation", type: "digital", keys: null, year_released: 2020, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/1010music_bluebox.htm", tags: ["digital-mixer", "recorder"] },
  { id: "1010music-nanobox-razzmatazz", brand: "1010music", model: "Nanobox Razzmatazz", category: "drum_machine", type: "hybrid", keys: null, year_released: 2022, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/1010music_nanobox_razzmatazz.htm", tags: ["pocket", "touchscreen"] },
  { id: "1010music-nanobox-lemondrop", brand: "1010music", model: "Nanobox Lemondrop", category: "synthesizer", type: "wavetable", keys: null, year_released: 2022, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/1010music_nanobox_lemondrop.htm", tags: ["pocket", "granular"] },
  { id: "1010music-nanobox-tangerine", brand: "1010music", model: "Nanobox Tangerine", category: "synthesizer", type: "wavetable", keys: null, year_released: 2023, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/1010music_nanobox_tangerine.htm", tags: ["pocket", "polyphonic"] },

  // ──────────────────────── SONICWARE ────────────────────────
  { id: "sonicware-liven-8bit-warps", brand: "Sonicware", model: "Liven 8bit Warps", category: "synthesizer", type: "digital", keys: 27, year_released: 2020, connectivity: c(MIDI_STD, AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/sonicware_liven_8bit_warps.htm", tags: ["lo-fi", "chiptune"] },
  { id: "sonicware-liven-xfm", brand: "Sonicware", model: "Liven XFM", category: "synthesizer", type: "fm", keys: 27, year_released: 2021, connectivity: c(MIDI_STD, AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/sonicware_liven_xfm.htm", tags: ["fm", "compact"] },
  { id: "sonicware-liven-bass-and-beats", brand: "Sonicware", model: "Liven Bass & Beats", category: "groovebox", type: "digital", keys: 27, year_released: 2022, connectivity: c(MIDI_STD, AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "https://www.thomann.de/pt/sonicware_liven_bass_beats.htm", tags: ["bass", "drums"] },
  { id: "sonicware-elf-wave", brand: "Sonicware", model: "Elf Wave", category: "groovebox", type: "wavetable", keys: null, year_released: 2024, connectivity: c(MIDI_STD, AUDIO_IO, SYNC_IO), image_url: "", thomann_url: "", tags: ["pocket", "battery"] },
  { id: "sonicware-deconstruct-minimal", brand: "Sonicware", model: "deconstruct MINIMAL", category: "synthesizer", type: "digital", keys: null, year_released: 2024, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "", tags: ["experimental", "compact"] },

  // ─────────────────── OXI INSTRUMENTS ───────────────────
  { id: "oxi-one", brand: "OXI Instruments", model: "OXI One", category: "sequencer", type: "digital", keys: null, year_released: 2021, connectivity: c(MIDI_FULL, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/oxi_instruments_oxi_one.htm", tags: ["4-track", "performance"] },
  { id: "oxi-coral", brand: "OXI Instruments", model: "Coral", category: "synthesizer", type: "digital", keys: null, year_released: 2024, connectivity: c(MIDI_STD, AUDIO_IO), image_url: "", thomann_url: "", tags: ["multi-engine", "desktop"] },
  { id: "oxi-meta", brand: "OXI Instruments", model: "Meta", category: "modular", type: "modular", keys: null, year_released: 2024, connectivity: c(MIDI_STD, AUDIO_IO, CV_GATE), image_url: "", thomann_url: "", tags: ["eurorack", "macro"] },

  // ────────────────── INTELLIJEL DESIGNS ──────────────────
  { id: "intellijel-palette-62", brand: "Intellijel Designs", model: "Palette 62", category: "modular", type: "modular", keys: null, year_released: 2019, connectivity: c(AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/intellijel_palette_62.htm", tags: ["eurorack-case", "portable"] },
  { id: "intellijel-palette-104", brand: "Intellijel Designs", model: "Palette 104", category: "modular", type: "modular", keys: null, year_released: 2019, connectivity: c(AUDIO_IO, CV_GATE), image_url: "", thomann_url: "https://www.thomann.de/pt/intellijel_palette_104.htm", tags: ["eurorack-case"] },
  { id: "intellijel-planar-3", brand: "Intellijel Designs", model: "Planar 3", category: "modular", type: "modular", keys: null, year_released: 2024, connectivity: c(CV_GATE), image_url: "", thomann_url: "", tags: ["eurorack", "joystick", "performance"] },
  { id: "intellijel-swells", brand: "Intellijel Designs", model: "Swells", category: "modular", type: "modular", keys: null, year_released: 2024, connectivity: c(AUDIO_IO, CV_GATE), image_url: "", thomann_url: "", tags: ["eurorack", "vca"] },
];

// Lightweight indexes for fast lookup in UI layers.
export const CATALOG_BY_ID: Record<string, CatalogDevice> = Object.fromEntries(
  CATALOG.map((d) => [d.id, d]),
);

export const CATALOG_BRANDS: string[] = Array.from(
  new Set(CATALOG.map((d) => d.brand)),
).sort();
