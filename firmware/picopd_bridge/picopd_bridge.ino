// =============================================================================
// PicoPD Pro – Smart USB-C PD Controller
// Board:  Raspberry Pi Pico (arduino-pico core by earlephilhower)
// USB Stack: Adafruit TinyUSB (creates the USB CDC COM port)
//
// Hybrid UI:  USB Serial JSON  +  SSD1306 OLED  +  Rotary encoder w/ button
//
// Hardware
//   AP33772S  PD sink controller   I2C @ 0x51
//   SSD1306   128x64 OLED          I2C @ 0x3C
//   Rotary encoder + push button
//
// Pin map
//   GPIO0  SDA            GPIO6  Encoder CLK (A)
//   GPIO1  SCL            GPIO7  Encoder DT  (B)
//   GPIO3  VBUS Enable    GPIO8  Encoder SW  (button)
//
// Serial JSON commands (line-delimited, 115200 8N1, '\n' terminated)
//   { "select": "MacBook Air" }
//   { "set": "pps", "v": 12.0, "i": 2.0 }
//   { "set": "fixed", "v": 9.0, "i": 2.0 }
//   { "output": "on" }   |   { "output": "off" }
//
// Telemetry @ ~5 Hz:
//   {"v":9.01,"i":1.42,"p":12.79,"mode":"PPS","profile":"Pedalboard",
//    "en":true,"err":""}
// =============================================================================

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// =============================================================================
// PIN MAP
// =============================================================================
static const int PIN_SDA = 0;
static const int PIN_SCL = 1;
static const int PIN_EN  = 3;   // VBUS output gate – HIGH = output enabled
static const int PIN_ENC_A  = 6;
static const int PIN_ENC_B  = 7;
static const int PIN_ENC_SW = 8;

// =============================================================================
// AP33772S (USB-PD sink)  — I2C @ 0x51
// =============================================================================
namespace PDController {
  static const uint8_t  ADDR             = 0x51;
  static const uint8_t  REG_STATUS       = 0x01; // bit0 = contract established
  static const uint8_t  REG_VOLTAGE      = 0x20; // u16, 80 mV / LSB
  static const uint8_t  REG_CURRENT      = 0x22; // u16, 24 mA / LSB
  static const uint8_t  REG_RDO          = 0x30; // u32 Request Data Object
  static const uint32_t NEGOTIATE_TIMEOUT_MS = 1000;

  static bool present = false;

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

  float readVoltage() {
    uint8_t b[2] = {0};
    if (!readN(REG_VOLTAGE, b, 2)) return 0.0f;
    uint16_t raw = (uint16_t)b[0] | ((uint16_t)b[1] << 8);
    return raw * 0.080f;
  }
  float readCurrent() {
    uint8_t b[2] = {0};
    if (!readN(REG_CURRENT, b, 2)) return 0.0f;
    uint16_t raw = (uint16_t)b[0] | ((uint16_t)b[1] << 8);
    return raw * 0.024f;
  }

  // Non-blocking-ish: short polled wait with yields to keep loop responsive.
  static bool waitForContract(uint32_t timeout_ms) {
    uint32_t t0 = millis();
    while (millis() - t0 < timeout_ms) {
      uint8_t st = 0;
      if (readN(REG_STATUS, &st, 1) && (st & 0x01)) return true;
      yield();
    }
    return false;
  }

  // VBUS gate (GPIO3). Drive LOW until a contract is *confirmed*.
  static bool g_outputEnabled = false;
  void powerGate(bool on) {
    digitalWrite(PIN_EN, on ? HIGH : LOW);
    g_outputEnabled = on;
  }
  bool outputEnabled() { return g_outputEnabled; }

  bool requestPPS(float volts, float amps) {
    if (!present) return false;
    uint16_t vRaw = (uint16_t)((volts * 1000.0f) / 20.0f);  // 20 mV/LSB
    uint16_t iRaw = (uint16_t)((amps  * 1000.0f) / 50.0f);  // 50 mA/LSB
    uint32_t rdo = 0;
    rdo |= ((uint32_t)1 & 0x7) << 28;       // APDO slot 1
    rdo |= ((uint32_t)vRaw & 0xFFF) << 9;
    rdo |= ((uint32_t)iRaw & 0x7F);
    uint8_t b[4] = {(uint8_t)rdo, (uint8_t)(rdo>>8),
                    (uint8_t)(rdo>>16), (uint8_t)(rdo>>24)};
    powerGate(false);
    if (!writeN(REG_RDO, b, 4))                    return false;
    if (!waitForContract(NEGOTIATE_TIMEOUT_MS))    return false;
    powerGate(true);
    return true;
  }
  bool requestFixed(float volts, float amps) {
    // Pick PDO slot by voltage. AP33772S exposes the source PDOs in slots
    // 1..7; we approximate by mapping common voltages to typical slot order.
    if (!present) return false;
    uint8_t slot = 1;          // 5V default
    if (volts >= 19.0f)      slot = 4;   // 20V
    else if (volts >= 14.0f) slot = 3;   // 15V
    else if (volts >= 8.0f)  slot = 2;   // 9V / 12V
    uint32_t rdo = ((uint32_t)slot & 0x7) << 28;
    uint8_t b[4] = {(uint8_t)rdo, (uint8_t)(rdo>>8),
                    (uint8_t)(rdo>>16), (uint8_t)(rdo>>24)};
    powerGate(false);
    if (!writeN(REG_RDO, b, 4))                    return false;
    if (!waitForContract(NEGOTIATE_TIMEOUT_MS))    return false;
    powerGate(true);
    (void)amps;
    return true;
  }
}

// =============================================================================
// PROFILE DATABASE
// =============================================================================
namespace ProfileManager {
  struct DeviceProfile {
    const char* name;
    float voltage;
    float current;
    bool  usePPS;
  };

  static const DeviceProfile PROFILES[] = {
    {"Safe 5V",            5.0f, 1.0f, false},
    {"iPhone Fast Charge", 9.0f, 2.0f, false},
    {"iPad Pro",           9.0f, 2.2f, false},
    {"MacBook Air",       20.0f, 3.0f, false},
    {"USB-C Synth Module",12.0f, 1.5f, true },
    {"Pedalboard",         9.0f, 1.0f, true },
  };
  static const uint8_t COUNT = sizeof(PROFILES) / sizeof(PROFILES[0]);

  const DeviceProfile& get(uint8_t i) { return PROFILES[i % COUNT]; }
  uint8_t count() { return COUNT; }

  int findByName(const char* name) {
    for (uint8_t i = 0; i < COUNT; i++) {
      if (strcasecmp(PROFILES[i].name, name) == 0) return i;
    }
    return -1;
  }
}

// =============================================================================
// SYSTEM STATE
// =============================================================================
namespace SystemState {
  uint8_t  selectedIdx   = 0;   // highlighted in menu
  uint8_t  activeIdx     = 0;   // currently applied profile
  float    liveV         = 0.0f;
  float    liveI         = 0.0f;
  float    liveVAvg      = 0.0f; // smoothed
  bool     outputOn      = false;
  char     errMsg[24]    = {0};

  void setError(const char* msg) {
    strncpy(errMsg, msg ? msg : "", sizeof(errMsg) - 1);
    errMsg[sizeof(errMsg) - 1] = 0;
  }
  void clearError() { errMsg[0] = 0; }
}

// =============================================================================
// PROFILE APPLICATION (shared by encoder + serial)
// =============================================================================
static bool applyProfile(uint8_t idx) {
  const auto& p = ProfileManager::get(idx);
  bool ok = p.usePPS ? PDController::requestPPS(p.voltage, p.current)
                     : PDController::requestFixed(p.voltage, p.current);
  if (ok) {
    SystemState::activeIdx = idx;
    SystemState::outputOn  = true;
    SystemState::clearError();
  } else {
    PDController::powerGate(false);
    SystemState::outputOn = false;
    SystemState::setError("PD FAIL -> 5V");
    // Fallback: try Safe 5V (idx 0).
    const auto& s = ProfileManager::get(0);
    if (PDController::requestFixed(s.voltage, s.current)) {
      SystemState::activeIdx = 0;
      SystemState::outputOn  = true;
    }
  }
  return ok;
}

// =============================================================================
// INPUT HANDLER – rotary encoder + push button
// =============================================================================
namespace InputHandler {
  static uint8_t  lastAB     = 0;
  static int8_t   accum      = 0;
  static bool     btnLast    = true;     // pulled-up = released
  static uint32_t btnDownAt  = 0;
  static bool     longFired  = false;

  static const uint32_t LONG_PRESS_MS = 700;
  static const uint32_t DEBOUNCE_MS   = 5;
  static uint32_t       lastBtnEdge   = 0;

  // Quadrature decode lookup: index = (lastAB<<2 | newAB) -> -1/0/+1
  static const int8_t QTABLE[16] = {
     0,-1, 1, 0,
     1, 0, 0,-1,
    -1, 0, 0, 1,
     0, 1,-1, 0
  };

  void begin() {
    pinMode(PIN_ENC_A,  INPUT_PULLUP);
    pinMode(PIN_ENC_B,  INPUT_PULLUP);
    pinMode(PIN_ENC_SW, INPUT_PULLUP);
    lastAB = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B);
  }

  // Returns -1, 0, +1 detents.
  int8_t pollRotation() {
    uint8_t ab = (digitalRead(PIN_ENC_A) << 1) | digitalRead(PIN_ENC_B);
    if (ab != lastAB) {
      accum += QTABLE[(lastAB << 2) | ab];
      lastAB = ab;
      if (accum >= 4)  { accum = 0; return +1; }
      if (accum <= -4) { accum = 0; return -1; }
    }
    return 0;
  }

  // Fills outShort/outLong with edge events (one-shot).
  void pollButton(bool& outShort, bool& outLong) {
    outShort = outLong = false;
    bool btn = digitalRead(PIN_ENC_SW);
    uint32_t now = millis();
    if (btn != btnLast && (now - lastBtnEdge) > DEBOUNCE_MS) {
      lastBtnEdge = now;
      if (!btn) {                        // pressed
        btnDownAt = now;
        longFired = false;
      } else {                           // released
        if (!longFired && (now - btnDownAt) < LONG_PRESS_MS) outShort = true;
      }
      btnLast = btn;
    }
    // Fire long-press while still held
    if (!btnLast && !longFired && (now - btnDownAt) >= LONG_PRESS_MS) {
      outLong   = true;
      longFired = true;
    }
  }
}

// =============================================================================
// DISPLAY MANAGER – SSD1306 128x64 @ 0x3C
// =============================================================================
namespace DisplayManager {
  static Adafruit_SSD1306 oled(128, 64, &Wire, -1);
  static bool present = false;

  bool begin() {
    present = oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
    if (present) {
      oled.clearDisplay();
      oled.setTextColor(SSD1306_WHITE);
      oled.setTextSize(1);
      oled.setCursor(0, 0);
      oled.println(F("PicoPD Pro"));
      oled.println(F("Booting..."));
      oled.display();
    }
    return present;
  }

  void render() {
    if (!present) return;
    oled.clearDisplay();

    // Header
    oled.setTextSize(1);
    oled.setCursor(0, 0);
    oled.print(F("DEVICE SELECT"));
    oled.drawFastHLine(0, 9, 128, SSD1306_WHITE);

    // Menu: show 3 entries centered on selectedIdx
    uint8_t total = ProfileManager::count();
    int8_t  start = (int8_t)SystemState::selectedIdx - 1;
    for (int8_t row = 0; row < 3; row++) {
      int8_t idx = start + row;
      if (idx < 0)        idx += total;
      if (idx >= total)   idx -= total;
      int y = 12 + row * 9;
      const auto& p = ProfileManager::get(idx);
      if (idx == SystemState::selectedIdx) {
        oled.fillRect(0, y - 1, 128, 9, SSD1306_WHITE);
        oled.setTextColor(SSD1306_BLACK);
        oled.setCursor(2, y);
        oled.print('>');
        oled.print(' ');
        oled.print(p.name);
        oled.setTextColor(SSD1306_WHITE);
      } else {
        oled.setCursor(2, y);
        oled.print("  ");
        oled.print(p.name);
      }
    }

    // Live readings
    oled.drawFastHLine(0, 41, 128, SSD1306_WHITE);
    char line[24];
    snprintf(line, sizeof(line), "V:%4.1fV I:%4.2fA",
             SystemState::liveVAvg, SystemState::liveI);
    oled.setCursor(0, 44);
    oled.print(line);

    // Status row
    const auto& act = ProfileManager::get(SystemState::activeIdx);
    oled.setCursor(0, 54);
    oled.print(act.usePPS ? F("PPS ") : F("FIX "));
    oled.print(SystemState::outputOn ? F("ON  ") : F("OFF "));
    if (SystemState::errMsg[0]) {
      oled.print(SystemState::errMsg);
    } else {
      oled.print(act.name);
    }

    oled.display();
  }
}

// =============================================================================
// SERIAL INTERFACE – tiny JSON parser (no external dep)
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
    int c = s.indexOf(':', k);
    if (c < 0) return false;
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
    float  nval;

    // {"select":"<name>"}
    if (extractStr(line, "select", sval)) {
      int idx = ProfileManager::findByName(sval.c_str());
      if (idx >= 0) {
        SystemState::selectedIdx = (uint8_t)idx;
        applyProfile((uint8_t)idx);
      } else {
        SystemState::setError("UNKNOWN PROFILE");
      }
      return;
    }

    // {"set":"pps"|"fixed", "v":..., "i":...}
    if (extractStr(line, "set", sval)) {
      float v = 5.0f, i = 1.0f;
      extractNum(line, "v", v);
      extractNum(line, "i", i);
      bool ok = (sval == "pps") ? PDController::requestPPS(v, i)
                                : PDController::requestFixed(v, i);
      if (ok) {
        SystemState::outputOn = true;
        SystemState::clearError();
      } else {
        PDController::powerGate(false);
        SystemState::outputOn = false;
        SystemState::setError("PD FAIL");
      }
      return;
    }

    // {"output":"on"|"off"}
    if (extractStr(line, "output", sval)) {
      if (sval == "on") {
        applyProfile(SystemState::selectedIdx);
      } else {
        PDController::powerGate(false);
        SystemState::outputOn = false;
      }
    }
    (void)nval;
  }

  void poll() {
    while (Serial.available()) {
      char c = (char)Serial.read();
      if (c == '\n' || c == '\r') {
        if (rxBuf.length()) { handleLine(rxBuf); rxBuf = ""; }
      } else if (rxBuf.length() < 256) {
        rxBuf += c;
      }
    }
  }

  void emitTelemetry() {
    const auto& p = ProfileManager::get(SystemState::activeIdx);
    Serial.printf(
      "{\"v\":%.2f,\"i\":%.2f,\"p\":%.2f,\"mode\":\"%s\","
      "\"profile\":\"%s\",\"en\":%s,\"err\":\"%s\"}\n",
      SystemState::liveVAvg, SystemState::liveI,
      SystemState::liveVAvg * SystemState::liveI,
      p.usePPS ? "PPS" : "FIXED",
      p.name,
      PDController::outputEnabled() ? "true" : "false",
      SystemState::errMsg);
  }
}

// =============================================================================
// SETUP
// =============================================================================
void setup() {
  Serial.begin(115200);
  uint32_t t0 = millis();
  while (!Serial && (millis() - t0) < 1500) { delay(10); }

  // VBUS gate – LOW until a contract is confirmed.
  pinMode(PIN_EN, OUTPUT);
  digitalWrite(PIN_EN, LOW);

  // I2C – stable 100 kHz so OLED writes never wedge PD comms.
  Wire.setSDA(PIN_SDA);
  Wire.setSCL(PIN_SCL);
  Wire.begin();
  Wire.setClock(100000);

  delay(50);                     // AP33772S reset settling
  PDController::detect();

  DisplayManager::begin();
  InputHandler::begin();

  // Boot in safe 5V mode.
  if (!applyProfile(0)) {
    SystemState::setError("PD INIT FAIL");
  }
  DisplayManager::render();
}

// =============================================================================
// MAIN LOOP – fully non-blocking, millis()-driven
// =============================================================================
void loop() {
  uint32_t now = millis();

  // ---- 1. Encoder rotation -> menu navigation -----------------------------
  int8_t rot = InputHandler::pollRotation();
  if (rot != 0) {
    uint8_t total = ProfileManager::count();
    SystemState::selectedIdx =
      (uint8_t)((SystemState::selectedIdx + rot + total) % total);
  }

  // ---- 2. Encoder button --------------------------------------------------
  bool shortPress = false, longPress = false;
  InputHandler::pollButton(shortPress, longPress);
  if (shortPress) {
    applyProfile(SystemState::selectedIdx);
  }
  if (longPress) {
    if (SystemState::outputOn) {
      PDController::powerGate(false);
      SystemState::outputOn = false;
    } else {
      applyProfile(SystemState::selectedIdx);
    }
  }

  // ---- 3. Serial JSON -----------------------------------------------------
  SerialInterface::poll();

  // ---- 4. Voltage / current sampling + watchdog --------------------------
  static uint32_t tSample = 0;
  static uint8_t  lowVCount = 0;
  if (now - tSample >= 50) {
    tSample = now;
    SystemState::liveV = PDController::readVoltage();
    SystemState::liveI = PDController::readCurrent();
    // EMA smoothing on the displayed voltage
    SystemState::liveVAvg += (SystemState::liveV - SystemState::liveVAvg) * 0.25f;

    // Watchdog: gate is open but VBUS < 1V for >500ms -> close gate.
    if (PDController::outputEnabled() && SystemState::liveV < 1.0f) {
      if (++lowVCount >= 10) {
        PDController::powerGate(false);
        SystemState::outputOn = false;
        SystemState::setError("VBUS LOST");
        lowVCount = 0;
      }
    } else {
      lowVCount = 0;
    }
  }

  // ---- 5. Display refresh @ ~5 Hz ----------------------------------------
  static uint32_t tDisp = 0;
  if (now - tDisp >= 200) {
    tDisp = now;
    DisplayManager::render();
  }

  // ---- 6. Telemetry @ ~5 Hz ----------------------------------------------
  static uint32_t tTel = 0;
  if (now - tTel >= 200) {
    tTel = now;
    SerialInterface::emitTelemetry();
  }
}
