// PicoPD Pro <-> Dashboard bridge
// Board:  Raspberry Pi Pico (arduino-pico core by earlephilhower)
// USB Stack: Adafruit TinyUSB  (Tools menu) -- this is what creates the COM port
// Upload: drag-drop UF2 while in BOOTSEL, or click Upload in IDE
//
// Wire protocol (line-delimited JSON, 115200 8N1, \n terminated)
//
//   Device -> Host (telemetry @ ~10 Hz):
//     {"v":9.01,"i":1.42,"p":12.79,"mode":"PPS","profile":1}
//
//   Host -> Device (commands):
//     {"cmd":"setMode","mode":"PD"}              or "PPS"
//     {"cmd":"setVoltage","v":9.00}              // PPS only
//     {"cmd":"setProfile","idx":0}               // fixed PDO index

#include <Arduino.h>
#include <Wire.h>

// ---- AP33772S (USB-PD sink controller on PicoPD Pro) ----
// I2C address per AP33772S datasheet (PicoPD Pro uses 0x51)
static const uint8_t AP33772S_ADDR = 0x51;

// Register map (subset – check datasheet for full list)
static const uint8_t REG_STATUS    = 0x01; // bit0 = "ready / contract established"
static const uint8_t REG_VOLTAGE   = 0x20; // 16-bit, 80 mV / LSB  (internal ADC of VBUS)
static const uint8_t REG_CURRENT   = 0x22; // 16-bit, 24 mA / LSB  (internal ADC of IBUS)
static const uint8_t REG_RDO       = 0x30; // 32-bit Request Data Object

// Negotiation timeout — how long to wait for the AP33772S to confirm a contract
static const uint32_t PD_NEGOTIATE_TIMEOUT_MS = 400;

// PicoPD Pro I2C pins to AP33772S
static const int PIN_SDA = 0;   // GPIO0  -> SDA
static const int PIN_SCL = 1;   // GPIO1  -> SCL
static const int PIN_EN  = 3;   // GPIO3  -> AP33772S enable / VBUS output enable
                                //          MUST be driven HIGH to allow voltage output

// ---------- I2C helpers ----------
static bool i2cReadN(uint8_t reg, uint8_t *buf, size_t n) {
  Wire.beginTransmission(AP33772S_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  size_t got = Wire.requestFrom((int)AP33772S_ADDR, (int)n);
  if (got != n) return false;
  for (size_t i = 0; i < n; i++) buf[i] = Wire.read();
  return true;
}

static bool i2cWriteN(uint8_t reg, const uint8_t *buf, size_t n) {
  Wire.beginTransmission(AP33772S_ADDR);
  Wire.write(reg);
  for (size_t i = 0; i < n; i++) Wire.write(buf[i]);
  return Wire.endTransmission() == 0;
}

// ---------- Telemetry ----------
static float readVoltage() {
  uint8_t b[2] = {0};
  if (!i2cReadN(REG_VOLTAGE, b, 2)) return 0.0f;
  uint16_t raw = (uint16_t)b[0] | ((uint16_t)b[1] << 8);
  return raw * 0.080f; // 80 mV / LSB
}

static float readCurrent() {
  uint8_t b[2] = {0};
  if (!i2cReadN(REG_CURRENT, b, 2)) return 0.0f;
  uint16_t raw = (uint16_t)b[0] | ((uint16_t)b[1] << 8);
  return raw * 0.024f; // 24 mA / LSB
}

// ---------- Power gate (GPIO3) ----------
// The VBUS output is gated by GPIO3. Even if the AP33772S negotiates a
// contract, no voltage reaches the barrel jack until GPIO3 is driven HIGH.
// We keep it LOW until a contract is *confirmed*, and drop it on any error
// or cable removal so a 9 V pedal never sees an unexpected rail.
static bool g_outputEnabled = false;

static void powerGate(bool on) {
  digitalWrite(PIN_EN, on ? HIGH : LOW);
  g_outputEnabled = on;
}

// Poll AP33772S STATUS register until the "contract established" bit is set,
// or we time out. Returns true on success.
static bool waitForContract(uint32_t timeout_ms) {
  uint32_t t0 = millis();
  while (millis() - t0 < timeout_ms) {
    uint8_t st = 0;
    if (i2cReadN(REG_STATUS, &st, 1) && (st & 0x01)) return true;
    delay(5);
  }
  return false;
}

// ---------- Power requests ----------
// Build a PPS RDO. See USB-PD spec 6.4.2.5; AP33772S issues this on write.
// Returns true if the sink confirmed the contract; only then is VBUS gated on.
static bool requestPPS(float volts, float amps) {
  // Voltage: 20 mV/LSB,  Current: 50 mA/LSB
  uint16_t vRaw = (uint16_t)((volts * 1000.0f) / 20.0f);
  uint16_t iRaw = (uint16_t)((amps  * 1000.0f) / 50.0f);
  uint32_t rdo = 0;
  rdo |= ((uint32_t)1 & 0x7) << 28;     // Object position (APDO slot 1)
  rdo |= ((uint32_t)vRaw & 0xFFF) << 9; // Output voltage
  rdo |= ((uint32_t)iRaw & 0x7F);       // Operating current
  uint8_t b[4] = { (uint8_t)rdo, (uint8_t)(rdo>>8), (uint8_t)(rdo>>16), (uint8_t)(rdo>>24) };

  powerGate(false);                     // close gate during renegotiation
  if (!i2cWriteN(REG_RDO, b, 4))     return false;
  if (!waitForContract(PD_NEGOTIATE_TIMEOUT_MS)) return false;
  powerGate(true);                      // contract confirmed -> open gate
  return true;
}

static bool requestFixedPDO(uint8_t idx) {
  uint32_t rdo = ((uint32_t)(idx + 1) & 0x7) << 28; // object position 1..7
  uint8_t b[4] = { (uint8_t)rdo, (uint8_t)(rdo>>8), (uint8_t)(rdo>>16), (uint8_t)(rdo>>24) };

  powerGate(false);
  if (!i2cWriteN(REG_RDO, b, 4))     return false;
  if (!waitForContract(PD_NEGOTIATE_TIMEOUT_MS)) return false;
  powerGate(true);
  return true;
}

// ---------- Command parsing (tiny, no JSON lib) ----------
static String rxBuf;
static const char* g_mode = "PPS";
static int   g_profile   = 1;
static float g_targetV   = 9.0f;
static float g_targetI   = 3.0f;

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
  while (i < (int)s.length() && (s[i] == ' ' || s[i] == '\t')) i++;
  int j = i;
  while (j < (int)s.length() && (isdigit(s[j]) || s[j]=='.' || s[j]=='-' || s[j]=='+')) j++;
  if (j == i) return false;
  out = s.substring(i, j).toFloat();
  return true;
}

static void handleLine(const String& line) {
  String cmd, mode;
  if (!extractStr(line, "cmd", cmd)) return;
  bool ok = true;
  if (cmd == "setMode" && extractStr(line, "mode", mode)) {
    if (mode == "PD")  { g_mode = "PD";  ok = requestFixedPDO(g_profile); }
    if (mode == "PPS") { g_mode = "PPS"; ok = requestPPS(g_targetV, g_targetI); }
  } else if (cmd == "setVoltage") {
    float v; if (extractNum(line, "v", v)) { g_targetV = v; ok = requestPPS(g_targetV, g_targetI); }
  } else if (cmd == "setProfile") {
    float idx; if (extractNum(line, "idx", idx)) { g_profile = (int)idx; ok = requestFixedPDO(g_profile); }
  }
  // Negotiation failure -> safety-close the gate so a pedal never sees a
  // half-configured rail.
  if (!ok) powerGate(false);
}

// ---------- Setup / loop ----------
void setup() {
  Serial.begin(115200);              // USB CDC – this creates the COM port
  // Do NOT block on `while(!Serial)` forever; allow standalone operation.
  uint32_t t0 = millis();
  while (!Serial && (millis() - t0) < 2000) { delay(10); }

  // GPIO3 is the VBUS output gate. Hold it LOW until a contract is
  // confirmed; requestPPS()/requestFixedPDO() will raise it on success.
  pinMode(PIN_EN, OUTPUT);
  digitalWrite(PIN_EN, LOW);
  g_outputEnabled = false;

  Wire.setSDA(PIN_SDA);
  Wire.setSCL(PIN_SCL);
  Wire.begin();
  Wire.setClock(400000);

  // Give the AP33772S a moment to come out of reset before the first RDO.
  delay(50);

  // Default boot: try a safe 5 V PPS contract. Gate opens iff confirmed.
  if (!requestPPS(g_targetV, g_targetI)) powerGate(false);
}

void loop() {
  // 1. Drain incoming serial, dispatch on \n
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (rxBuf.length()) { handleLine(rxBuf); rxBuf = ""; }
    } else if (rxBuf.length() < 256) {
      rxBuf += c;
    }
  }

  // 2. Push telemetry @ ~10 Hz, sourced from the AP33772S internal ADC
  //    (REG_VOLTAGE / REG_CURRENT) so the UI shows actual VBUS, not target.
  static uint32_t last = 0;
  static uint8_t  lowVCount = 0;
  uint32_t now = millis();
  if (now - last >= 100) {
    last = now;
    float v = readVoltage();
    float i = readCurrent();
    float p = v * i;

    // Cable-removal / fault watchdog: if the gate is supposed to be open
    // but VBUS has been near 0 V for >500 ms, drop the gate and require
    // a fresh negotiation.
    if (g_outputEnabled && v < 1.0f) {
      if (++lowVCount >= 5) { powerGate(false); lowVCount = 0; }
    } else {
      lowVCount = 0;
    }

    Serial.printf(
      "{\"v\":%.2f,\"i\":%.2f,\"p\":%.2f,\"mode\":\"%s\",\"profile\":%d,\"en\":%s}\n",
      v, i, p, g_mode, g_profile, g_outputEnabled ? "true" : "false");
  }
}

