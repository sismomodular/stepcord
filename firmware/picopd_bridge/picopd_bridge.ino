// =============================================================================
// PicoPD Pro – Smart USB-C PD Controller (Hardware-instrument UI)
// Board:  Raspberry Pi Pico (arduino-pico core)  +  Adafruit TinyUSB (CDC)
//
// UX rules (encoder-only, no touch):
//   - Main screen shows: live voltage, active device, polarity/status.
//   - The DEVICE DATABASE is reachable ONLY through Menu > Search Device.
//     It is never browsable from the main screen or anywhere else.
//   - Menu: Search Device / Manual Voltage / Settings.
//   - Every voltage change goes through a Confirm screen
//     (encoder click = Confirm, scroll to Cancel + click = abort,
//      long-press = Back/Cancel from anywhere).
//
// Hardware
//   AP33772S  PD sink controller   I2C @ 0x51
//   SSD1306   128x64 OLED          I2C @ 0x3C  (black bg, white pixel font –
//                                              built-in 5x7 GFX font, no AA)
//   Rotary encoder + push button
//
// Pin map
//   GPIO0  SDA            GPIO6  Encoder CLK (A)
//   GPIO1  SCL            GPIO7  Encoder DT  (B)
//   GPIO3  VBUS Enable    GPIO8  Encoder SW  (button, active-low)
//
// Serial JSON (line-delimited) — kept for the companion web app:
//   { "select": "Volca Series" }
//   { "set": "pps",   "v": 12.0, "i": 2.0 }
//   { "set": "fixed", "v": 9.0,  "i": 1.0 }
//   { "output": "on" } | { "output": "off" }
//
// Telemetry @ ~5 Hz:
//   {"v":9.01,"i":0.42,"p":3.78,"mode":"FIXED",
//    "profile":"Volca Series","polarity":"center-positive",
//    "en":true,"err":""}
// =============================================================================

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// =============================================================================
// PIN MAP
// =============================================================================
static const int PIN_SDA    = 0;
static const int PIN_SCL    = 1;
static const int PIN_EN     = 3;     // VBUS output gate
static const int PIN_ENC_A  = 6;
static const int PIN_ENC_B  = 7;
static const int PIN_ENC_SW = 8;

// =============================================================================
// PD CONTROLLER (AP33772S) – mock-safe; real I2C writes when chip is present.
// =============================================================================
namespace PDController {
  static const uint8_t  ADDR              = 0x51;
  static const uint8_t  REG_STATUS        = 0x01;
  static const uint8_t  REG_VOLTAGE       = 0x20;
  static const uint8_t  REG_CURRENT       = 0x22;
  static const uint8_t  REG_RDO           = 0x30;
  static const uint32_t NEGOTIATE_TIMEOUT = 1000;

  static bool  present         = false;
  static bool  g_outputEnabled = false;
  static float g_lastSetV      = 5.0f;   // for mock telemetry when no chip
  static float g_lastSetI      = 1.0f;

  static bool readN(uint8_t reg, uint8_t* buf, size_t n) {
    Wire.beginTransmission(ADDR);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) return false;
    if (Wire.requestFrom((int)ADDR, (int)n) != (int)n) return false;
    for (size_t i = 0; i < n; i++) buf[i] = Wire.read();
    return true;
  }
  static bool writeN(uint8_t reg, const uint8_t* buf, size_t n) {
    Wire.beginTransmission(ADDR);
    Wire.write(reg);
    for (size_t i = 0; i < n; i++) Wire.write(buf[i]);
    return Wire.endTransmission() == 0;
  }

  bool detect() {
    Wire.beginTransmission(ADDR);
    present = (Wire.endTransmission() == 0);
    return present;
  }
  bool outputEnabled() { return g_outputEnabled; }
  void powerGate(bool on) {
    digitalWrite(PIN_EN, on ? HIGH : LOW);
    g_outputEnabled = on;
  }

  float readVoltage() {
    if (!present) return g_outputEnabled ? g_lastSetV : 0.0f;
    uint8_t b[2] = {0};
    if (!readN(REG_VOLTAGE, b, 2)) return 0.0f;
    return ((uint16_t)b[0] | ((uint16_t)b[1] << 8)) * 0.080f;
  }
  float readCurrent() {
    if (!present) return g_outputEnabled ? 0.10f : 0.0f;
    uint8_t b[2] = {0};
    if (!readN(REG_CURRENT, b, 2)) return 0.0f;
    return ((uint16_t)b[0] | ((uint16_t)b[1] << 8)) * 0.024f;
  }

  static bool waitForContract(uint32_t timeout_ms) {
    if (!present) { delay(20); return true; }      // mock OK
    uint32_t t0 = millis();
    while (millis() - t0 < timeout_ms) {
      uint8_t st = 0;
      if (readN(REG_STATUS, &st, 1) && (st & 0x01)) return true;
      yield();
    }
    return false;
  }

  bool requestPPS(float volts, float amps) {
    g_lastSetV = volts; g_lastSetI = amps;
    if (!present) { powerGate(true); return true; }
    uint16_t vRaw = (uint16_t)((volts * 1000.0f) / 20.0f);
    uint16_t iRaw = (uint16_t)((amps  * 1000.0f) / 50.0f);
    uint32_t rdo  = ((uint32_t)1 << 28) |
                    (((uint32_t)vRaw & 0xFFF) << 9) |
                    ((uint32_t)iRaw & 0x7F);
    uint8_t b[4]  = {(uint8_t)rdo,(uint8_t)(rdo>>8),
                     (uint8_t)(rdo>>16),(uint8_t)(rdo>>24)};
    powerGate(false);
    if (!writeN(REG_RDO, b, 4))                 return false;
    if (!waitForContract(NEGOTIATE_TIMEOUT))    return false;
    powerGate(true);
    return true;
  }
  bool requestFixed(float volts, float amps) {
    g_lastSetV = volts; g_lastSetI = amps;
    if (!present) { powerGate(true); return true; }
    uint8_t slot = 1;
    if      (volts >= 19.0f) slot = 4;
    else if (volts >= 14.0f) slot = 3;
    else if (volts >=  8.0f) slot = 2;
    uint32_t rdo = ((uint32_t)slot & 0x7) << 28;
    uint8_t  b[4]= {(uint8_t)rdo,(uint8_t)(rdo>>8),
                    (uint8_t)(rdo>>16),(uint8_t)(rdo>>24)};
    powerGate(false);
    if (!writeN(REG_RDO, b, 4))                 return false;
    if (!waitForContract(NEGOTIATE_TIMEOUT))    return false;
    powerGate(true);
    return true;
  }
}

// =============================================================================
// DEVICE DATABASE  (reachable ONLY from the Search submenu)
// =============================================================================
namespace ProfileManager {
  enum Polarity : uint8_t { CENTER_POSITIVE = 0, CENTER_NEGATIVE = 1 };

  struct DeviceProfile {
    const char* name;
    float       voltage;
    float       current;
    bool        usePPS;
    Polarity    polarity;
  };

  // NOTE: Korg Volca = 9V DC, ~1A, CENTER POSITIVE (per Korg's PSU spec).
  static const DeviceProfile PROFILES[] = {
    {"Safe 5V",            5.0f, 1.0f, false, CENTER_POSITIVE},
    {"iPhone Fast Chg",    9.0f, 2.0f, false, CENTER_POSITIVE},
    {"MacBook Air",       20.0f, 3.0f, false, CENTER_POSITIVE},
    {"Quad Cortex",       12.0f, 3.0f, false, CENTER_POSITIVE},
    {"HX Stomp",           9.0f, 3.0f, false, CENTER_NEGATIVE},
    {"Strymon BigSky",     9.0f, 0.3f, false, CENTER_NEGATIVE},
    {"Volca Series",       9.0f, 1.0f, false, CENTER_POSITIVE},
    {"OP-1 Field",         5.0f, 1.5f, false, CENTER_POSITIVE},
    {"Pedalboard PPS",     9.0f, 1.0f, true,  CENTER_NEGATIVE},
  };
  static const uint8_t COUNT = sizeof(PROFILES) / sizeof(PROFILES[0]);

  const DeviceProfile& get(uint8_t i) { return PROFILES[i % COUNT]; }
  uint8_t count() { return COUNT; }

  int findByName(const char* name) {
    for (uint8_t i = 0; i < COUNT; i++)
      if (strcasecmp(PROFILES[i].name, name) == 0) return i;
    return -1;
  }

  const char* polarityLabel(Polarity p) {
    return p == CENTER_POSITIVE ? "Center Positive" : "Center Negative";
  }
}

// =============================================================================
// SYSTEM STATE
// =============================================================================
namespace SystemState {
  // -1 = no DB profile active (Manual or boot-default)
  int8_t   activeIdx   = -1;
  float    activeV     = 5.0f;
  float    activeI     = 1.0f;
  bool     activePPS   = false;
  ProfileManager::Polarity activePolarity = ProfileManager::CENTER_POSITIVE;
  const char* activeName = "Safe 5V";

  float    liveV       = 0.0f;
  float    liveI       = 0.0f;
  float    liveVAvg    = 0.0f;
  bool     outputOn    = false;
  char     errMsg[24]  = {0};

  void setError(const char* m) {
    strncpy(errMsg, m ? m : "", sizeof(errMsg) - 1);
    errMsg[sizeof(errMsg) - 1] = 0;
  }
  void clearError() { errMsg[0] = 0; }
}

// =============================================================================
// UI MODEL — strict encoder-only state machine
// =============================================================================
enum Screen : uint8_t {
  SCREEN_MAIN,           // live readout (no DB browsing here)
  SCREEN_MENU,           // Search / Manual / Settings
  SCREEN_SEARCH,         // ONLY place the device DB is exposed
  SCREEN_MANUAL,         // adjust voltage in 0.1 V steps
  SCREEN_SETTINGS,
  SCREEN_CONFIRM,        // mandatory confirmation before applying
};

namespace UI {
  Screen   screen        = SCREEN_MAIN;
  uint8_t  menuIdx       = 0;            // Menu cursor
  uint8_t  searchIdx     = 0;            // DB cursor (Search only)
  float    manualV       = 9.0f;         // Manual cursor
  uint8_t  settingsIdx   = 0;

  // Confirm screen payload
  bool        confirmCancelHi  = false;  // false = Confirm, true = Cancel
  float       pendingV         = 9.0f;
  float       pendingI         = 1.0f;
  bool        pendingPPS       = false;
  int8_t      pendingIdx       = -1;     // -1 = manual
  const char* pendingName      = "Manual";
  ProfileManager::Polarity pendingPolarity = ProfileManager::CENTER_POSITIVE;

  static const char* MENU_ITEMS[3]     = {"Search Device","Manual Voltage","Settings"};
  static const char* SETTINGS_ITEMS[2] = {"Output: Toggle","Back"};
}

// =============================================================================
// APPLY (called only after Confirm)
// =============================================================================
static bool applyPending() {
  bool ok = UI::pendingPPS
    ? PDController::requestPPS  (UI::pendingV, UI::pendingI)
    : PDController::requestFixed(UI::pendingV, UI::pendingI);

  if (ok) {
    SystemState::activeIdx      = UI::pendingIdx;
    SystemState::activeV        = UI::pendingV;
    SystemState::activeI        = UI::pendingI;
    SystemState::activePPS      = UI::pendingPPS;
    SystemState::activeName     = UI::pendingName;
    SystemState::activePolarity = UI::pendingPolarity;
    SystemState::outputOn       = true;
    SystemState::clearError();
  } else {
    PDController::powerGate(false);
    SystemState::outputOn = false;
    SystemState::setError("PD FAIL");
  }
  return ok;
}

// Stage a confirmation from a DB entry.
static void stageProfile(uint8_t idx) {
  const auto& p = ProfileManager::get(idx);
  UI::pendingV        = p.voltage;
  UI::pendingI        = p.current;
  UI::pendingPPS      = p.usePPS;
  UI::pendingIdx      = (int8_t)idx;
  UI::pendingName     = p.name;
  UI::pendingPolarity = p.polarity;
  UI::confirmCancelHi = false;
  UI::screen          = SCREEN_CONFIRM;
}
// Stage a confirmation from the Manual screen.
static void stageManual() {
  UI::pendingV        = UI::manualV;
  UI::pendingI        = 2.0f;
  UI::pendingPPS      = true;
  UI::pendingIdx      = -1;
  UI::pendingName     = "Manual";
  UI::pendingPolarity = ProfileManager::CENTER_POSITIVE;
  UI::confirmCancelHi = false;
  UI::screen          = SCREEN_CONFIRM;
}

// =============================================================================
// INPUT HANDLER – rotary encoder + push button (debounced, long-press support)
// =============================================================================
namespace InputHandler {
  static uint8_t  lastAB     = 0;
  static int8_t   accum      = 0;
  static bool     btnLast    = true;
  static uint32_t btnDownAt  = 0;
  static bool     longFired  = false;
  static const uint32_t LONG_PRESS_MS = 700;
  static const uint32_t DEBOUNCE_MS   = 5;
  static uint32_t lastBtnEdge         = 0;

  static const int8_t QTABLE[16] = {
     0,-1, 1, 0, 1, 0, 0,-1,
    -1, 0, 0, 1, 0, 1,-1, 0
  };

  void begin() {
    pinMode(PIN_ENC_A,  INPUT_PULLUP);
    pinMode(PIN_ENC_B,  INPUT_PULLUP);
    pinMode(PIN_ENC_SW, INPUT_PULLUP);
    lastAB = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B);
  }
  int8_t pollRotation() {
    uint8_t ab = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B);
    if (ab != lastAB) {
      accum += QTABLE[(lastAB << 2) | ab];
      lastAB = ab;
      if (accum >=  4) { accum = 0; return +1; }
      if (accum <= -4) { accum = 0; return -1; }
    }
    return 0;
  }
  void pollButton(bool& outShort, bool& outLong) {
    outShort = outLong = false;
    bool btn = digitalRead(PIN_ENC_SW);
    uint32_t now = millis();
    if (btn != btnLast && (now - lastBtnEdge) > DEBOUNCE_MS) {
      lastBtnEdge = now;
      if (!btn) { btnDownAt = now; longFired = false; }
      else if (!longFired && (now - btnDownAt) < LONG_PRESS_MS) outShort = true;
      btnLast = btn;
    }
    if (!btnLast && !longFired && (now - btnDownAt) >= LONG_PRESS_MS) {
      outLong = true; longFired = true;
    }
  }
}

// =============================================================================
// DISPLAY  — black bg / white pixel font, retro-instrument layout
// =============================================================================
namespace DisplayManager {
  static Adafruit_SSD1306 oled(128, 64, &Wire, -1);
  static bool present = false;

  bool begin() {
    present = oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
    if (!present) return false;
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextWrap(false);
    // Built-in GFX 5x7 bitmap font: pixelated, OCR-A-feel, no anti-aliasing.
    oled.setFont(NULL);
    oled.setTextSize(1);
    oled.setCursor(0, 0);
    oled.print(F("PicoPD Pro"));
    oled.setCursor(0, 12);
    oled.print(F("booting..."));
    oled.display();
    return true;
  }

  // Header bar: title text on the left, OUT indicator on the right.
  static void header(const __FlashStringHelper* title) {
    oled.fillRect(0, 0, 128, 11, SSD1306_BLACK);
    oled.setTextSize(1);
    oled.setCursor(2, 2);
    oled.print(title);
    // OUT indicator
    const char* tag = SystemState::outputOn ? "ON " : "OFF";
    oled.setCursor(128 - 6 * 4, 2);
    oled.print(tag);
    oled.drawFastHLine(0, 11, 128, SSD1306_WHITE);
  }

  static void footer() {
    if (!SystemState::errMsg[0]) return;
    oled.drawFastHLine(0, 53, 128, SSD1306_WHITE);
    oled.setCursor(2, 56);
    oled.print(SystemState::errMsg);
  }

  // ---- Main: live voltage, active device, polarity (NO DB browsing) -------
  static void drawMain() {
    oled.clearDisplay();
    header(F("OUTPUT"));

    // Big voltage readout (size 3 = 18 px tall block of pixel font)
    char buf[10];
    snprintf(buf, sizeof(buf), "%4.1fV", SystemState::liveVAvg);
    oled.setTextSize(3);
    oled.setCursor(4, 16);
    oled.print(buf);

    // Current, small
    oled.setTextSize(1);
    char ibuf[16];
    snprintf(ibuf, sizeof(ibuf), "%4.2f A", SystemState::liveI);
    oled.setCursor(86, 18);
    oled.print(ibuf);

    // Active device name + polarity / mode
    oled.setCursor(0, 42);
    oled.print(SystemState::activeName);
    oled.setCursor(0, 52);
    oled.print(ProfileManager::polarityLabel(SystemState::activePolarity));
    // Mode tag, right-aligned
    const char* modeTag = SystemState::activePPS ? "PPS" : "FIX";
    oled.setCursor(128 - 6 * 3, 52);
    oled.print(modeTag);

    footer();
    oled.display();
  }

  // ---- Generic 3-line cursor list -----------------------------------------
  static void drawList(const __FlashStringHelper* title,
                       const char* const* items, uint8_t n, uint8_t cursor) {
    oled.clearDisplay();
    header(title);
    int8_t start = (int8_t)cursor - 1;
    for (int8_t row = 0; row < 3; row++) {
      int8_t idx = start + row;
      if (idx < 0)      idx += n;
      if (idx >= n)     idx -= n;
      int y = 16 + row * 12;
      if (idx == cursor) {
        oled.fillRect(0, y - 2, 128, 11, SSD1306_WHITE);
        oled.setTextColor(SSD1306_BLACK);
        oled.setCursor(2, y);
        oled.print(F("> "));
        oled.print(items[idx]);
        oled.setTextColor(SSD1306_WHITE);
      } else {
        oled.setCursor(2, y);
        oled.print(F("  "));
        oled.print(items[idx]);
      }
    }
    footer();
    oled.display();
  }

  static void drawMenu() {
    drawList(F("MENU"), UI::MENU_ITEMS, 3, UI::menuIdx);
  }
  static void drawSettings() {
    drawList(F("SETTINGS"), UI::SETTINGS_ITEMS, 2, UI::settingsIdx);
  }

  // ---- Search: the ONLY place the device DB is exposed --------------------
  static void drawSearch() {
    oled.clearDisplay();
    header(F("SEARCH DEVICE"));
    uint8_t n = ProfileManager::count();
    int8_t start = (int8_t)UI::searchIdx - 1;
    for (int8_t row = 0; row < 3; row++) {
      int8_t idx = start + row;
      if (idx < 0)  idx += n;
      if (idx >= n) idx -= n;
      int y = 16 + row * 12;
      const auto& p = ProfileManager::get(idx);
      if (idx == UI::searchIdx) {
        oled.fillRect(0, y - 2, 128, 11, SSD1306_WHITE);
        oled.setTextColor(SSD1306_BLACK);
        oled.setCursor(2, y);
        oled.print(F("> "));
        oled.print(p.name);
        oled.setTextColor(SSD1306_WHITE);
      } else {
        oled.setCursor(2, y);
        oled.print(F("  "));
        oled.print(p.name);
      }
    }
    footer();
    oled.display();
  }

  // ---- Manual: precision voltage input ------------------------------------
  static void drawManual() {
    oled.clearDisplay();
    header(F("MANUAL VOLTAGE"));
    char buf[10];
    snprintf(buf, sizeof(buf), "%5.2fV", UI::manualV);
    oled.setTextSize(3);
    oled.setCursor(8, 16);
    oled.print(buf);
    oled.setTextSize(1);
    oled.setCursor(0, 44);
    oled.print(F("rotate: 0.10V step"));
    oled.setCursor(0, 54);
    oled.print(F("click: confirm"));
    oled.display();
  }

  // ---- Confirm screen (mandatory before any voltage change) ---------------
  static void drawConfirm() {
    oled.clearDisplay();
    header(F("CONFIRM"));

    char buf[24];
    snprintf(buf, sizeof(buf), "Apply %4.2fV?", UI::pendingV);
    oled.setTextSize(1);
    oled.setCursor(2, 14);
    oled.print(buf);

    oled.setCursor(2, 24);
    oled.print(F("["));
    oled.print(UI::pendingName);
    oled.print(F("]"));

    oled.setCursor(2, 34);
    oled.print(ProfileManager::polarityLabel(UI::pendingPolarity));

    // Two-row choice list
    auto row = [&](int y, const char* label, bool hi) {
      if (hi) {
        oled.fillRect(0, y - 2, 128, 11, SSD1306_WHITE);
        oled.setTextColor(SSD1306_BLACK);
      }
      oled.setCursor(2, y);
      oled.print(hi ? F("> ") : F("  "));
      oled.print(label);
      oled.setTextColor(SSD1306_WHITE);
    };
    row(46, "Confirm", !UI::confirmCancelHi);
    row(56, "Cancel",   UI::confirmCancelHi);
    oled.display();
  }

  void render() {
    if (!present) return;
    switch (UI::screen) {
      case SCREEN_MAIN:     drawMain();     break;
      case SCREEN_MENU:     drawMenu();     break;
      case SCREEN_SEARCH:   drawSearch();   break;
      case SCREEN_MANUAL:   drawManual();   break;
      case SCREEN_SETTINGS: drawSettings(); break;
      case SCREEN_CONFIRM:  drawConfirm();  break;
    }
  }
}

// =============================================================================
// SERIAL JSON  (companion app I/O — DB is never exposed via UI from main)
// =============================================================================
namespace SerialInterface {
  static String rxBuf;

  static bool extractStr(const String& s, const char* key, String& out) {
    int k = s.indexOf(String("\"") + key + "\"");
    if (k < 0) return false;
    int q1 = s.indexOf('"', k + (int)strlen(key) + 2);
    int q2 = s.indexOf('"', q1 + 1);
    if (q1 < 0 || q2 < 0) return false;
    out = s.substring(q1 + 1, q2);
    return true;
  }
  static bool extractNum(const String& s, const char* key, float& out) {
    int k = s.indexOf(String("\"") + key + "\"");
    if (k < 0) return false;
    int c = s.indexOf(':', k); if (c < 0) return false;
    int i = c + 1;
    while (i < (int)s.length() && (s[i]==' '||s[i]=='\t')) i++;
    int j = i;
    while (j < (int)s.length() &&
           (isdigit(s[j]) || s[j]=='.' || s[j]=='-' || s[j]=='+')) j++;
    if (j == i) return false;
    out = s.substring(i, j).toFloat();
    return true;
  }

  static void handleLine(const String& line) {
    String sval;
    if (extractStr(line, "select", sval)) {
      int idx = ProfileManager::findByName(sval.c_str());
      if (idx >= 0) {
        // Serial select bypasses the encoder confirm screen by design
        // (the host UI shows its own confirmation modal).
        const auto& p = ProfileManager::get((uint8_t)idx);
        UI::pendingV        = p.voltage;
        UI::pendingI        = p.current;
        UI::pendingPPS      = p.usePPS;
        UI::pendingIdx      = (int8_t)idx;
        UI::pendingName     = p.name;
        UI::pendingPolarity = p.polarity;
        applyPending();
      } else {
        SystemState::setError("UNKNOWN PROFILE");
      }
      return;
    }
    if (extractStr(line, "set", sval)) {
      float v = 5.0f, i = 1.0f;
      extractNum(line, "v", v);
      extractNum(line, "i", i);
      UI::pendingV = v; UI::pendingI = i;
      UI::pendingPPS = (sval == "pps");
      UI::pendingIdx = -1;
      UI::pendingName = "Manual";
      UI::pendingPolarity = ProfileManager::CENTER_POSITIVE;
      applyPending();
      return;
    }
    if (extractStr(line, "output", sval)) {
      if (sval == "on") {
        applyPending();
      } else {
        PDController::powerGate(false);
        SystemState::outputOn = false;
      }
    }
  }

  void poll() {
    while (Serial.available()) {
      char c = (char)Serial.read();
      if (c == '\n' || c == '\r') {
        if (rxBuf.length()) { handleLine(rxBuf); rxBuf = ""; }
      } else if (rxBuf.length() < 256) rxBuf += c;
    }
  }

  void emitTelemetry() {
    Serial.printf(
      "{\"v\":%.2f,\"i\":%.2f,\"p\":%.2f,\"mode\":\"%s\","
      "\"profile\":\"%s\",\"polarity\":\"%s\","
      "\"en\":%s,\"err\":\"%s\"}\n",
      SystemState::liveVAvg, SystemState::liveI,
      SystemState::liveVAvg * SystemState::liveI,
      SystemState::activePPS ? "PPS" : "FIXED",
      SystemState::activeName,
      SystemState::activePolarity == ProfileManager::CENTER_POSITIVE
        ? "center-positive" : "center-negative",
      PDController::outputEnabled() ? "true" : "false",
      SystemState::errMsg);
  }
}

// =============================================================================
// ENCODER → SCREEN STATE MACHINE
// =============================================================================
static void onRotate(int8_t dir) {
  switch (UI::screen) {
    case SCREEN_MAIN:
      // Main is read-only. No DB browsing here.
      break;
    case SCREEN_MENU:
      UI::menuIdx = (uint8_t)((UI::menuIdx + dir + 3) % 3);
      break;
    case SCREEN_SEARCH: {
      uint8_t n = ProfileManager::count();
      UI::searchIdx = (uint8_t)((UI::searchIdx + dir + n) % n);
      break;
    }
    case SCREEN_MANUAL: {
      float nv = UI::manualV + dir * 0.1f;
      if (nv < 3.3f)  nv = 3.3f;
      if (nv > 21.0f) nv = 21.0f;
      UI::manualV = nv;
      break;
    }
    case SCREEN_SETTINGS:
      UI::settingsIdx = (uint8_t)((UI::settingsIdx + dir + 2) % 2);
      break;
    case SCREEN_CONFIRM:
      UI::confirmCancelHi = !UI::confirmCancelHi;
      break;
  }
}

static void onClick() {
  switch (UI::screen) {
    case SCREEN_MAIN:
      UI::screen = SCREEN_MENU; UI::menuIdx = 0; break;
    case SCREEN_MENU:
      if      (UI::menuIdx == 0) { UI::screen = SCREEN_SEARCH;   UI::searchIdx = 0; }
      else if (UI::menuIdx == 1) { UI::screen = SCREEN_MANUAL; }
      else                       { UI::screen = SCREEN_SETTINGS; UI::settingsIdx = 0; }
      break;
    case SCREEN_SEARCH:
      stageProfile(UI::searchIdx);            // -> CONFIRM
      break;
    case SCREEN_MANUAL:
      stageManual();                          // -> CONFIRM
      break;
    case SCREEN_SETTINGS:
      if (UI::settingsIdx == 0) {
        if (SystemState::outputOn) {
          PDController::powerGate(false);
          SystemState::outputOn = false;
        } else {
          // Re-apply the last active config (no surprise voltage changes).
          UI::pendingV        = SystemState::activeV;
          UI::pendingI        = SystemState::activeI;
          UI::pendingPPS      = SystemState::activePPS;
          UI::pendingIdx      = SystemState::activeIdx;
          UI::pendingName     = SystemState::activeName;
          UI::pendingPolarity = SystemState::activePolarity;
          applyPending();
        }
      } else {
        UI::screen = SCREEN_MENU;
      }
      break;
    case SCREEN_CONFIRM:
      if (UI::confirmCancelHi) {
        UI::screen = SCREEN_MENU;             // Cancel -> back to menu
      } else {
        applyPending();
        UI::screen = SCREEN_MAIN;
      }
      break;
  }
}

static void onLongPress() {
  // Universal "back / cancel"
  switch (UI::screen) {
    case SCREEN_MAIN:                                 break;
    case SCREEN_MENU:     UI::screen = SCREEN_MAIN;   break;
    case SCREEN_SEARCH:
    case SCREEN_MANUAL:
    case SCREEN_SETTINGS: UI::screen = SCREEN_MENU;   break;
    case SCREEN_CONFIRM:  UI::screen = SCREEN_MENU;   break;
  }
}

// =============================================================================
// SETUP / LOOP
// =============================================================================
void setup() {
  Serial.begin(115200);
  uint32_t t0 = millis();
  while (!Serial && (millis() - t0) < 1500) delay(10);

  pinMode(PIN_EN, OUTPUT);
  digitalWrite(PIN_EN, LOW);          // VBUS gate closed at boot

  Wire.setSDA(PIN_SDA);
  Wire.setSCL(PIN_SCL);
  Wire.begin();
  Wire.setClock(100000);

  delay(50);
  PDController::detect();

  DisplayManager::begin();
  InputHandler::begin();

  // Boot in Safe 5V (no user-facing voltage change required).
  UI::pendingV        = 5.0f;
  UI::pendingI        = 1.0f;
  UI::pendingPPS      = false;
  UI::pendingIdx      = 0;
  UI::pendingName     = "Safe 5V";
  UI::pendingPolarity = ProfileManager::CENTER_POSITIVE;
  applyPending();

  UI::screen = SCREEN_MAIN;
  DisplayManager::render();
}

void loop() {
  uint32_t now = millis();

  int8_t rot = InputHandler::pollRotation();
  if (rot) onRotate(rot);

  bool s = false, l = false;
  InputHandler::pollButton(s, l);
  if (s) onClick();
  if (l) onLongPress();

  SerialInterface::poll();

  // Sampling + watchdog
  static uint32_t tSample = 0;
  static uint8_t  lowVCount = 0;
  if (now - tSample >= 50) {
    tSample = now;
    SystemState::liveV    = PDController::readVoltage();
    SystemState::liveI    = PDController::readCurrent();
    SystemState::liveVAvg += (SystemState::liveV - SystemState::liveVAvg) * 0.25f;

    if (PDController::outputEnabled() && PDController::present &&
        SystemState::liveV < 1.0f) {
      if (++lowVCount >= 10) {
        PDController::powerGate(false);
        SystemState::outputOn = false;
        SystemState::setError("VBUS LOST");
        lowVCount = 0;
      }
    } else lowVCount = 0;
  }

  static uint32_t tDisp = 0;
  if (now - tDisp >= 100) { tDisp = now; DisplayManager::render(); }

  static uint32_t tTel = 0;
  if (now - tTel  >= 200) { tTel  = now; SerialInterface::emitTelemetry(); }
}
