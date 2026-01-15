#include <WiFi.h>
// ✅ ESP-MQTT Native (ESP-IDF) for QoS 1/2 support
#include "mqtt_client.h"
#include <ModbusMaster.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <time.h>
#include <sys/time.h>

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ======================= TIME / NTP ======================
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.nist.gov";
const char* TZ_INFO      = "ICT-7";   // Thailand UTC+7

bool timeReady = false;
bool timeFromRTC = false;

// RTC memory (persist across reboot)
RTC_DATA_ATTR time_t rtcEpoch = 0;
RTC_DATA_ATTR bool rtcValid = false;

#include <Update.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_task_wdt.h"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "esp_system.h"   // esp_random()

#define OLED_ADDR 0x3C
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

uint8_t oledPage = 0;   // 0–10
unsigned long lastOledTick = 0;

#define FS LittleFS

// ======================= CONFIG =========================
#define LED_PIN        2
#define RX_PIN         16
#define TX_PIN         17
#define SLAVE_ID       1
#define BAUDRATE       38400
#define WDT_TIMEOUT_MS 15000

// 🔹 เวอร์ชันเฟิร์มแวร์ปัจจุบัน
#define FW_VERSION "0.1.21.1401205"

// ===== Default WiFi & MQTT (Static Fallback) =====
const char* DEFAULT_SSID        = "Speedlow";
const char* DEFAULT_PASS        = "33334444";
const char* DEFAULT_MQTT_SERVER = "202.29.50.41";
const int   DEFAULT_MQTT_PORT   = 1883;
const char* DEFAULT_MQTT_USER   = "s6710886217";
const char* DEFAULT_MQTT_PASS   = "nkey5632";

const char* DEFAULT_TOPIC_DATA   = "AI205/data";
const char* DEFAULT_TOPIC_STATUS = "AI205/status";
const char* DEFAULT_TOPIC_ALERT  = "AI205/alert";

// 🔹 HTTP base ของ server ที่เสิร์ฟไฟล์เฟิร์มแวร์ (ค่า default)
const char* DEFAULT_FW_HOST = "202.29.50.41";
const int   DEFAULT_FW_PORT = 80;

// ===== Alert Thresholds (DEFAULT) =====
#define DEFAULT_OVERVOLTAGE_LIMIT   250.0
#define DEFAULT_UNDERVOLTAGE_LIMIT  180.0
#define DEFAULT_OVERCURRENT_LIMIT   5.0
#define PHASE_MISSING_I             0.02
#define PHASE_MISSING_V             100.0
#define DEFAULT_LOW_PF_LIMIT        0.8
#define ALERT_COOLDOWN_MS           30000

// ===== CT/PT default =====
#define DEFAULT_CT_RATIO  20.0f
#define DEFAULT_PT_RATIO  1.0f

// ===== AP Mode =====
const char* AP_SSID = "AI205_Config";
const char* AP_PASS = "12345678";
const byte  DNS_PORT = 53;

// ======================= STRUCTS =======================
struct SensorData {
  float v1,v2,v3;
  float i1,i2,i3;
  float pf1,pf2,pf3;
  float kW1,kW2,kW3,kWsum;
  float PFsys,Hz;
  uint16_t Ep_imp,Ep_exp;
  uint32_t Ep_total;
  int32_t Ep_net;
  uint64_t timestamp;
  bool validRead;
};

// ===== Persistent config (NVS) =====
struct SysConfig {
  String ssid;
  String pass;
  String mqttServer;
  int    mqttPort;
  String mqttUser;
  String mqttPass;
  String topicData;
  String topicStatus;
  String topicAlert;

  // Advanced config
  float  ctRatio;
  float  ptRatio;
  float  ovLimit;
  float  uvLimit;
  float  ocLimit;
  float  lowPfLimit;

  // Firmware HTTP server (configurable via dashboard)
  String fwHost;
  int    fwPort;

  // Service config (NEW)
  String webUser;           // Web login username
  String webPass;           // Web login password
  String apSsid;            // AP mode SSID
  String apPass;            // AP mode password
  int    modbusSlaveId;     // Modbus slave ID
  int    modbusBaudrate;    // Modbus baudrate
  uint32_t alertCooldown;   // Alert cooldown in ms
  float  phaseMissingI;     // Phase missing current threshold
  float  phaseMissingV;     // Phase missing voltage threshold
};

SysConfig conf;

// ===== Runtime variables (configurable) =====
float CT_RATIO = DEFAULT_CT_RATIO;
float PT_RATIO = DEFAULT_PT_RATIO;

float overvoltageLimit = DEFAULT_OVERVOLTAGE_LIMIT;
float undervoltageLimit = DEFAULT_UNDERVOLTAGE_LIMIT;
float overcurrentLimit  = DEFAULT_OVERCURRENT_LIMIT;
float lowPfLimit        = DEFAULT_LOW_PF_LIMIT;

// ===== Firmware update info (from MQTT) =====
struct FwInfo {
  String newVersion;
  String url;
  uint32_t size;
  bool available;
};
FwInfo fwInfo = { "", "", 0, false };

// ===== System metrics (Core 0 & 1 speed, etc.) =====
volatile uint32_t core0LastCycleUs = 0;
volatile uint32_t core0AvgCycleUs  = 0;
volatile uint32_t core1LastLoopUs  = 0;
volatile uint32_t core1AvgLoopUs   = 0;

// ===== Device identity =====
String deviceMac;   // MAC address ของ ESP32

// ===== Web Login / Session (Local only, no MySQL) =====
const char* DEFAULT_WEB_USER = "admin";
const char* DEFAULT_WEB_PASS = "1234";
String sessionToken;

// ======================= ALERT SYSTEM ====================
enum AlertType {
  ALERT_OVERVOLTAGE,
  ALERT_UNDERVOLTAGE,
  ALERT_OVERCURRENT,
  ALERT_PHASE_MISSING,
  ALERT_LOW_PF,
  ALERT_WIFI_DISCONNECTED,
  ALERT_MQTT_DISCONNECTED,
  ALERT_MODBUS_ERROR,
  ALERT_COUNT
};

struct AlertInfo {
  const char* type;
  const char* level;
  const char* emoji;
};

const AlertInfo alertInfo[ALERT_COUNT] = {
  {"overvoltage",       "warning",  "🟡"},
  {"undervoltage",      "warning",  "🟡"},
  {"overcurrent",       "critical", "🔴"},
  {"phase_missing",     "critical", "🔴"},
  {"low_power_factor",  "warning",  "🟡"},
  {"wifi_disconnected", "info",     "🟢"},
  {"mqtt_disconnected", "info",     "🟢"},
  {"modbus_error",      "info",     "🟢"}
};

unsigned long lastAlertTime[ALERT_COUNT] = {0};
uint8_t modbusErrorCount = 0;

// ======================= GLOBAL =======================
Preferences prefs;
bool hasUserWiFiConf = false;
bool apMode          = false;
unsigned long wifiStartTime = 0;
bool firstWifiTryDone = false;

DNSServer dnsServer;
WebServer server(80);

// ✅ ESP-MQTT Native client (replaces PubSubClient)
esp_mqtt_client_handle_t mqttClient = NULL;
bool mqttConnected = false;
ModbusMaster node;

QueueHandle_t dataQueue;
SensorData lastData;        // สำหรับ Dashboard

// Mutex for Serial output to prevent corruption between tasks
SemaphoreHandle_t serialMutex = NULL;

// ======================= HISTORY BUFFER =======================
#define HISTORY_LEN 256

SensorData historyBuf[HISTORY_LEN];
uint16_t historyIndex = 0;

// Modbus diagnostics
uint32_t lastModbusOkTs = 0;

// Firmware last result (for dashboard popup)
String fw_last_result = "";     // "success" | "fail"
String fw_last_version = "";
String fw_last_notes = "";
uint32_t fw_last_ts = 0;


void addHistory(const SensorData &d) {
  historyBuf[historyIndex] = d;
  historyIndex = (historyIndex + 1) % HISTORY_LEN;
}


// ======================= PROTOTYPES =====================
bool wifiConnected();
void connectWiFi_STA();
void applyConfigRuntime();
void loadConfig();
void saveConfig();
void readCT();
bool safeReadHoldingRegisters(uint16_t addr, uint8_t len);
void handleConfigBackup();
void handleFirmwareBackup();
void handleFirmwareUpload();
void handleFirmwareUpdateDone();
void api_status();
void api_status_v2();
void attachAPI();
void setupWebRoutes();
void startAPMode();
void checkWiFiFail();
void autoCloseAP();
void Task_RS485(void *pv);
void Task_MQTT(void *pv);
void initSystem();
bool performHttpUpdateFromUrl(const String& url, uint32_t expectedSize);

// ✅ ESP-MQTT Native prototypes
void initMqtt();
void handleMqttMessage(const char* topic, int topic_len, const char* data, int data_len);
static void mqtt_event_handler(void *args, esp_event_base_t base, int32_t event_id, void *event_data);

// login / session helpers
String generateSessionToken();
bool isAuthenticated();
bool ensureAuthPage();
bool ensureAuthApi();
void handleLogout();

// firmware HTTP base URL
String getFwBaseUrl();

// OLED helper prototype
void oledPrint(const char* title, float value, const char* unit = "");

// publish helpers
void publishSensorData(const SensorData &d);
void publishStatus();

// ======================= UTILITIES =======================
int16_t toInt16(uint16_t val){ return (val>32767)? val-65536 : val; }

void blink(int t,int d){
  for(int i=0;i<t;i++){
    digitalWrite(LED_PIN,HIGH);
    delay(d);
    digitalWrite(LED_PIN,LOW);
    delay(d);
  }
}

// ======================= APPLY CONFIG RUNTIME ============
void applyConfigRuntime() {
  if (conf.ctRatio > 0.0f) {
    CT_RATIO = conf.ctRatio;
  } else {
    CT_RATIO = DEFAULT_CT_RATIO;
  }

  if (conf.ptRatio > 0.0f) {
    PT_RATIO = conf.ptRatio;
  } else {
    PT_RATIO = DEFAULT_PT_RATIO;
  }

  overvoltageLimit = (conf.ovLimit    > 0.0f) ? conf.ovLimit    : DEFAULT_OVERVOLTAGE_LIMIT;
  undervoltageLimit= (conf.uvLimit    > 0.0f) ? conf.uvLimit    : DEFAULT_UNDERVOLTAGE_LIMIT;
  overcurrentLimit = (conf.ocLimit    > 0.0f) ? conf.ocLimit    : DEFAULT_OVERCURRENT_LIMIT;
  lowPfLimit       = (conf.lowPfLimit > 0.0f) ? conf.lowPfLimit : DEFAULT_LOW_PF_LIMIT;
}

// ======================= CONFIG LOAD/SAVE ================
void loadConfig() {
  prefs.begin("ai205", true);
  conf.ssid       = prefs.getString("ssid", "");
  conf.pass       = prefs.getString("pass", "");
  conf.mqttServer = prefs.getString("mqtt", "");
  conf.mqttPort   = prefs.getInt("port", 0);
  conf.mqttUser   = prefs.getString("muser", "");
  conf.mqttPass   = prefs.getString("mpass", "");
  conf.topicData   = prefs.getString("tData",   "");
  conf.topicStatus = prefs.getString("tStat",   "");
  conf.topicAlert  = prefs.getString("tAlert",  "");

  conf.ctRatio    = prefs.getFloat("ctRatio", -1.0f);
  conf.ptRatio    = prefs.getFloat("ptRatio", -1.0f);
  conf.ovLimit    = prefs.getFloat("ovLimit", DEFAULT_OVERVOLTAGE_LIMIT);
  conf.uvLimit    = prefs.getFloat("uvLimit", DEFAULT_UNDERVOLTAGE_LIMIT);
  conf.ocLimit    = prefs.getFloat("ocLimit", DEFAULT_OVERCURRENT_LIMIT);
  conf.lowPfLimit = prefs.getFloat("lowPf",   DEFAULT_LOW_PF_LIMIT);

  // Firmware HTTP server
  conf.fwHost     = prefs.getString("fwHost", "");
  conf.fwPort     = prefs.getInt("fwPort", 0);

  // Service config (new)
  conf.webUser       = prefs.getString("webUser", "");
  conf.webPass       = prefs.getString("webPass", "");
  conf.apSsid        = prefs.getString("apSsid", "");
  conf.apPass        = prefs.getString("apPass", "");
  conf.modbusSlaveId = prefs.getInt("mbSlave", 0);
  conf.modbusBaudrate= prefs.getInt("mbBaud", 0);
  conf.alertCooldown = prefs.getUInt("alertCD", 0);
  conf.phaseMissingI = prefs.getFloat("phMissI", -1.0f);
  conf.phaseMissingV = prefs.getFloat("phMissV", -1.0f);

  prefs.end();

  if (conf.ssid.length() > 0) {
    hasUserWiFiConf = true;
  } else {
    hasUserWiFiConf = false;
    conf.ssid = DEFAULT_SSID;
    conf.pass = DEFAULT_PASS;
  }

  if (conf.mqttServer.length() == 0) conf.mqttServer = DEFAULT_MQTT_SERVER;
  if (conf.mqttPort == 0)            conf.mqttPort   = DEFAULT_MQTT_PORT;
  if (conf.mqttUser.length() == 0)   conf.mqttUser   = DEFAULT_MQTT_USER;
  if (conf.mqttPass.length() == 0)   conf.mqttPass   = DEFAULT_MQTT_PASS;

  if (conf.topicData.length()   == 0) conf.topicData   = DEFAULT_TOPIC_DATA;
  if (conf.topicStatus.length() == 0) conf.topicStatus = DEFAULT_TOPIC_STATUS;
  if (conf.topicAlert.length()  == 0) conf.topicAlert  = DEFAULT_TOPIC_ALERT;

  if (conf.fwHost.length() == 0) conf.fwHost = DEFAULT_FW_HOST;
  if (conf.fwPort == 0)          conf.fwPort = DEFAULT_FW_PORT;

  // Defaults for service config
  if (conf.webUser.length() == 0)  conf.webUser = DEFAULT_WEB_USER;
  if (conf.webPass.length() == 0)  conf.webPass = DEFAULT_WEB_PASS;
  if (conf.apSsid.length() == 0)   conf.apSsid = AP_SSID;
  if (conf.apPass.length() == 0)   conf.apPass = AP_PASS;
  if (conf.modbusSlaveId == 0)     conf.modbusSlaveId = SLAVE_ID;
  if (conf.modbusBaudrate == 0)    conf.modbusBaudrate = BAUDRATE;
  if (conf.alertCooldown == 0)     conf.alertCooldown = ALERT_COOLDOWN_MS;
  if (conf.phaseMissingI < 0)      conf.phaseMissingI = PHASE_MISSING_I;
  if (conf.phaseMissingV < 0)      conf.phaseMissingV = PHASE_MISSING_V;
}

void saveConfig() {
  prefs.begin("ai205", false);
  prefs.putString("ssid",  conf.ssid);
  prefs.putString("pass",  conf.pass);
  prefs.putString("mqtt",  conf.mqttServer);
  prefs.putInt("port",     conf.mqttPort);
  prefs.putString("muser", conf.mqttUser);
  prefs.putString("mpass", conf.mqttPass);
  prefs.putString("tData", conf.topicData);
  prefs.putString("tStat", conf.topicStatus);
  prefs.putString("tAlert",conf.topicAlert);

  prefs.putFloat("ctRatio", conf.ctRatio);
  prefs.putFloat("ptRatio", conf.ptRatio);
  prefs.putFloat("ovLimit", conf.ovLimit);
  prefs.putFloat("uvLimit", conf.uvLimit);
  prefs.putFloat("ocLimit", conf.ocLimit);
  prefs.putFloat("lowPf",   conf.lowPfLimit);

  // Firmware HTTP server
  prefs.putString("fwHost", conf.fwHost);
  prefs.putInt("fwPort",    conf.fwPort);

  // Service config (new)
  prefs.putString("webUser", conf.webUser);
  prefs.putString("webPass", conf.webPass);
  prefs.putString("apSsid",  conf.apSsid);
  prefs.putString("apPass",  conf.apPass);
  prefs.putInt("mbSlave",    conf.modbusSlaveId);
  prefs.putInt("mbBaud",     conf.modbusBaudrate);
  prefs.putUInt("alertCD",   conf.alertCooldown);
  prefs.putFloat("phMissI",  conf.phaseMissingI);
  prefs.putFloat("phMissV",  conf.phaseMissingV);

  prefs.end();

  hasUserWiFiConf = true;
  applyConfigRuntime();
}

// ======================= WIFI / MQTT HELPERS =============
bool wifiConnected() {
  return WiFi.status() == WL_CONNECTED;
}

void connectWiFi_STA() {
  // Prevent connecting if already connecting or connected
  wl_status_t status = WiFi.status();
  if (status == WL_CONNECTED) {
    Serial.println("✅ WiFi already connected");
    return;
  }
  
  // Disconnect first to clear any pending connection
  // Note: Using WL_IDLE_STATUS check as WL_CONNECTING is not available in ESP32 core 3.0.7
  if (status != WL_CONNECTED && status != WL_NO_SHIELD && status != WL_DISCONNECTED) {
    Serial.println("⚠️ WiFi is busy, disconnecting first...");
    WiFi.disconnect(true);
    delay(100);
  }
  
  Serial.printf("🔌 Connecting WiFi (STA) SSID=%s\n", conf.ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(conf.ssid.c_str(), conf.pass.c_str());
  wifiStartTime = millis();
}

// ======================= CT AUTO-DETECT ===================
void readCT(){
  if(node.readHoldingRegisters(0x0200,1)==node.ku8MBSuccess){
    uint16_t reg=node.getResponseBuffer(0);
    if(reg>0&&reg<1000){
      CT_RATIO=reg;
      Serial.printf("📘 CT Ratio Auto=%.1f\n",CT_RATIO);
    }
  }
  node.clearResponseBuffer();
}

bool syncTimeNTP(unsigned long timeoutMs = 30000) {
  Serial.println("⏰ Syncing time via NTP...");
  configTzTime(TZ_INFO, NTP_SERVER_1, NTP_SERVER_2);

  time_t now;
  struct tm tm;
  unsigned long start = millis();

  while (millis() - start < timeoutMs) {
    time(&now);
    localtime_r(&now, &tm);

    if (tm.tm_year + 1900 >= 2024) {
      rtcEpoch = now;
      rtcValid = true;
      timeReady = true;
      timeFromRTC = false;

      Serial.printf("✅ NTP OK: %04d-%02d-%02d %02d:%02d:%02d\n",
        tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday,
        tm.tm_hour, tm.tm_min, tm.tm_sec);
      return true;
    }
    delay(500);
  }
  Serial.println("❌ NTP sync failed");
  return false;
}

bool loadTimeFromRTC() {
  if (!rtcValid || rtcEpoch < 1700000000) {
    Serial.println("❌ RTC time invalid");
    return false;
  }

  struct timeval tv;
  tv.tv_sec = rtcEpoch;
  tv.tv_usec = 0;
  settimeofday(&tv, nullptr);

  timeReady = true;
  timeFromRTC = true;

  struct tm tm;
  localtime_r(&rtcEpoch, &tm);
  Serial.printf("🟡 RTC time used: %04d-%02d-%02d %02d:%02d:%02d\n",
    tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday,
    tm.tm_hour, tm.tm_min, tm.tm_sec);

  return true;
}

String nowISO() {
  if (!timeReady) return "";
  time_t now;
  struct tm tm;
  time(&now);
  localtime_r(&now, &tm);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S+07:00", &tm);
  return String(buf);
}

// ======================= SAFE MODBUS READ =================
bool safeReadHoldingRegisters(uint16_t addr, uint8_t len){
  unsigned long start = millis();
  uint8_t retries = 0;
  const uint8_t MAX_RETRIES = 3;

  while(retries < MAX_RETRIES){
    esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(2));

    uint8_t result = node.readHoldingRegisters(addr, len);

    if(result == node.ku8MBSuccess) {
      return true;
    }

    if(millis() - start > 300) {
      retries++;
      start = millis();
      vTaskDelay(pdMS_TO_TICKS(5));
    }

    yield();
  }

  return false;
}

// ======================= ALERT SYSTEM =====================
bool shouldTrigger(AlertType type) {
  unsigned long now = millis();
  if (now - lastAlertTime[type] >= ALERT_COOLDOWN_MS) {
    lastAlertTime[type] = now;
    return true;
  }
  return false;
}

void publishAlert(AlertType type, const char* message, SensorData &d) {
  if (!shouldTrigger(type)) return;

  const AlertInfo &info = alertInfo[type];

  String payload = "{";
  payload += "\"type\":\"" + String(info.type) + "\","; 
  payload += "\"level\":\"" + String(info.level) + "\","; 
  payload += "\"message\":\"" + String(message) + "\","; 
  payload += "\"V1\":" + String(d.v1, 2) + ","; 
  payload += "\"V2\":" + String(d.v2, 2) + ","; 
  payload += "\"V3\":" + String(d.v3, 2) + ","; 
  payload += "\"I1\":" + String(d.i1, 3) + ","; 
  payload += "\"I2\":" + String(d.i2, 3) + ","; 
  payload += "\"I3\":" + String(d.i3, 3) + ","; 
  payload += "\"PFsys\":" + String(d.PFsys, 3) + ","; 
  payload += "}";

  // ✅ ESP-MQTT Native: Publish alert with QoS 1
  if (mqttConnected) {
    esp_mqtt_client_publish(mqttClient, conf.topicAlert.c_str(), payload.c_str(), 0, 2, 1);  // qos=2, retain=1
  }

  Serial.print(info.emoji);
  Serial.print(" ALERT [");
  Serial.print(info.level);
  Serial.print("]: ");
  Serial.println(message);
  Serial.println("   📄 Payload: " + payload);
}

void checkAlerts(SensorData &d) {
  if (d.v1 > overvoltageLimit || d.v2 > overvoltageLimit || d.v3 > overvoltageLimit) {
    String msg = "Overvoltage detected (";
    if (d.v1 > overvoltageLimit) msg += "V1=" + String(d.v1, 1) + "V ";
    if (d.v2 > overvoltageLimit) msg += "V2=" + String(d.v2, 1) + "V ";
    if (d.v3 > overvoltageLimit) msg += "V3=" + String(d.v3, 1) + "V";
    msg += ")";
    publishAlert(ALERT_OVERVOLTAGE, msg.c_str(), d);
  }

  if (d.v1 < undervoltageLimit || d.v2 < undervoltageLimit || d.v3 < undervoltageLimit) {
    String msg = "Undervoltage detected (";
    if (d.v1 < undervoltageLimit) msg += "V1=" + String(d.v1, 1) + "V ";
    if (d.v2 < undervoltageLimit) msg += "V2=" + String(d.v2, 1) + "V ";
    if (d.v3 < undervoltageLimit) msg += "V3=" + String(d.v3, 1) + "V";
    msg += ")";
    publishAlert(ALERT_UNDERVOLTAGE, msg.c_str(), d);
  }

  if (d.i1 > overcurrentLimit || d.i2 > overcurrentLimit || d.i3 > overcurrentLimit) {
    String msg = "Overcurrent detected (";
    if (d.i1 > overcurrentLimit) msg += "I1=" + String(d.i1, 2) + "A ";
    if (d.i2 > overcurrentLimit) msg += "I2=" + String(d.i2, 2) + "A ";
    if (d.i3 > overcurrentLimit) msg += "I3=" + String(d.i3, 2) + "A";
    msg += ")";
    publishAlert(ALERT_OVERCURRENT, msg.c_str(), d);
  }

  if ((d.i1 < PHASE_MISSING_I && d.v1 > PHASE_MISSING_V) ||
      (d.i2 < PHASE_MISSING_I && d.v2 > PHASE_MISSING_V) ||
      (d.i3 < PHASE_MISSING_I && d.v3 > PHASE_MISSING_V)) {
    String msg = "Phase missing detected (";
    if (d.i1 < PHASE_MISSING_I && d.v1 > PHASE_MISSING_V) msg += "Phase1 ";
    if (d.i2 < PHASE_MISSING_I && d.v2 > PHASE_MISSING_V) msg += "Phase2 ";
    if (d.i3 < PHASE_MISSING_I && d.v3 > PHASE_MISSING_V) msg += "Phase3";
    msg += ")";
    publishAlert(ALERT_PHASE_MISSING, msg.c_str(), d);
  }

  if (d.PFsys < lowPfLimit && d.PFsys > 0) {
    String msg = "Low power factor (PFsys=" + String(d.PFsys, 3) + ")";
    publishAlert(ALERT_LOW_PF, msg.c_str(), d);
  }

  if (!wifiConnected()) {
    String msg = "WiFi disconnected";
    publishAlert(ALERT_WIFI_DISCONNECTED, msg.c_str(), d);
  }

  // ✅ ESP-MQTT Native
  if (!mqttConnected) {
    String msg = "MQTT disconnected";
    publishAlert(ALERT_MQTT_DISCONNECTED, msg.c_str(), d);
  }

  if (!d.validRead) {
    modbusErrorCount++;
    if (modbusErrorCount >= 3) {
      String msg = "Modbus read error (3 consecutive failures)";
      publishAlert(ALERT_MODBUS_ERROR, msg.c_str(), d);
      modbusErrorCount = 0;
    }
  } else {
    modbusErrorCount = 0;
  }
}

// ======================= LOGIN / SESSION (LOCAL) =========
// สร้าง token แบบสุ่ม (hex 32 ตัว)
String generateSessionToken() {
  char buf[33];
  for (int i = 0; i < 32; i++) {
    int r = esp_random() & 0x0F;
    buf[i] = "0123456789abcdef"[r];
  }
  buf[32] = 0;
  return String(buf);
}

bool isAuthenticated() {
  if (sessionToken.length() == 0) return false;
  
  // Check query parameter: ?token=xxx
  if (server.hasArg("token")) {
    String queryToken = server.arg("token");
    if (queryToken == sessionToken) return true;
  }
  
  // Check Authorization header: Bearer xxx
  if (server.hasHeader("Authorization")) {
    String auth = server.header("Authorization");
    if (auth.startsWith("Bearer ")) {
      String headerToken = auth.substring(7);
      if (headerToken == sessionToken) return true;
    }
  }
  
  // Check Cookie (original method)
  if (server.hasHeader("Cookie")) {
    String cookie = server.header("Cookie");
    String expected = "AI205SESSION=" + sessionToken;
    if (cookie.indexOf(expected) >= 0) return true;
  }
  
  return false;
}

// ใช้กับหน้า HTML
bool ensureAuthPage() {
  if (isAuthenticated()) return true;
  server.sendHeader("Location", "/login");
  server.send(302, "text/plain", "");
  return false;
}

// ใช้กับ API (JSON)
bool ensureAuthApi() {
  if (isAuthenticated()) return true;
  server.send(401, "application/json", "{\"error\":\"unauthorized\"}");
  return false;
}

void handleLogout() {
  sessionToken = "";
  server.sendHeader("Set-Cookie", "AI205SESSION=deleted; Max-Age=0; Path=/");
  server.sendHeader("Location", "/login");
  server.send(302, "text/plain", "");
}

// ======================= BACKUP CONFIG (JSON) ============
void handleConfigBackup() {
  String j = "{";
  j += "\"ssid\":\""         + conf.ssid         + "\",";
  j += "\"mqttServer\":\""   + conf.mqttServer   + "\",";
  j += "\"mqttPort\":"       + String(conf.mqttPort) + ",";
  j += "\"mqttUser\":\""     + conf.mqttUser     + "\",";
  j += "\"mqttPass\":\""     + conf.mqttPass     + "\",";
  j += "\"topicData\":\""    + conf.topicData    + "\",";
  j += "\"topicStatus\":\""  + conf.topicStatus  + "\",";
  j += "\"topicAlert\":\""   + conf.topicAlert   + "\",";
  j += "\"ctRatio\":"        + String(CT_RATIO, 2)       + ",";
  j += "\"ptRatio\":"        + String(PT_RATIO, 2)       + ",";
  j += "\"ovLimit\":"        + String(overvoltageLimit, 1) + ",";
  j += "\"uvLimit\":"        + String(undervoltageLimit, 1) + ",";
  j += "\"ocLimit\":"        + String(overcurrentLimit, 2)  + ",";
  j += "\"lowPfLimit\":"     + String(lowPfLimit, 3);
  j += "}";

  server.send(200, "application/json", j);
}

// ======================= BACKUP FIRMWARE (.bin) ==========
void handleFirmwareBackup() {
  WiFiClient clientSock = server.client();

  const esp_partition_t* running = esp_ota_get_running_partition();
  if (!running) {
    server.send(500, "text/plain", "No running partition");
    return;
  }

  uint32_t sketchSize = ESP.getSketchSize();
  if (sketchSize == 0 || sketchSize > running->size) {
    sketchSize = running->size;
  }

  String header = "HTTP/1.1 200 OK\r\n";
  header += "Content-Type: application/octet-stream\r\n";
  header += "Content-Disposition: attachment; filename=\"ai205-firmware-backup.bin\"\r\n";
  header += "Content-Length: " + String(sketchSize) + "\r\n";
  header += "Connection: close\r\n\r\n";
  clientSock.print(header);

  const size_t BUF_SIZE = 1024;
  uint8_t buf[BUF_SIZE];
  uint32_t offset = 0;

  while (offset < sketchSize) {
    size_t toRead = (sketchSize - offset) > BUF_SIZE ? BUF_SIZE : (sketchSize - offset);
    if (esp_partition_read(running, offset, buf, toRead) != ESP_OK) {
      break;
    }
    clientSock.write(buf, toRead);
    offset += toRead;
    delay(0);
  }
}

// ======================= HTTP OTA FROM URL ===============
bool performHttpUpdateFromUrl(const String& url, uint32_t expectedSize) {
  if (!wifiConnected()) {
    Serial.println("❌ OTA: WiFi not connected");
    return false;
  }

  Serial.println("🌐 OTA HTTP: " + url);

  WiFiClient net;
  HTTPClient http;

  if (!http.begin(net, url)) {
    Serial.println("❌ http.begin failed");
    return false;
  }

  int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    Serial.printf("❌ HTTP code=%d\n", httpCode);
    http.end();
    return false;
  }

  int len = http.getSize();
  uint32_t updateSize =
      (len > 0) ? len :
      (expectedSize > 0 ? expectedSize : UPDATE_SIZE_UNKNOWN);

  if (!Update.begin(updateSize)) {
    Serial.println("❌ Update.begin failed");
    Update.printError(Serial);
    http.end();
    return false;
  }

  WiFiClient *stream = http.getStreamPtr();
  uint8_t buf[1024];
  uint32_t written = 0;
  unsigned long lastData = millis();

  while (http.connected() && (updateSize == UPDATE_SIZE_UNKNOWN || written < updateSize)) {
    size_t avail = stream->available();
    if (avail) {
      int r = stream->readBytes(buf, avail > sizeof(buf) ? sizeof(buf) : avail);
      if (r <= 0) break;

      if (Update.write(buf, r) != r) {
        Serial.println("❌ Update.write failed");
        Update.printError(Serial);
        http.end();
        return false;
      }
      written += r;
      lastData = millis();
    } else {
      if (millis() - lastData > 10000) {
        Serial.println("❌ OTA timeout");
        http.end();
        return false;
      }
      delay(1);
    }
  }

  if (!Update.end()) {
    Serial.println("❌ Update.end failed");
    Update.printError(Serial);
    http.end();
    return false;
  }

  http.end();
  Serial.println("✅ OTA success");
  return true;
}

// ======================= OTA UPLOAD (WEB) ================
void handleFirmwareUpload() {
  HTTPUpload& upload = server.upload();
  static bool authSuccess = false;

  if (upload.status == UPLOAD_FILE_START) {
    // Check authentication at start
    authSuccess = isAuthenticated();
    if (!authSuccess) {
      Serial.println("⛔ OTA: Unauthorized upload attempt blocked!");
      return;
    }

    Serial.printf("💾 OTA: Update start: %s\n", upload.filename.c_str());
    uint32_t freeSpace = (ESP.getFreeSketchSpace() - 0x1000) & 0xFFFFF000;
    if (!Update.begin(freeSpace)) {
      Update.printError(Serial);
    }
    esp_task_wdt_reset();  // Reset watchdog at start
    
  } else if (upload.status == UPLOAD_FILE_WRITE) {
    if (!authSuccess) return;

    esp_task_wdt_reset();  // Reset watchdog during write
    
    // Write data to flash
    if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
      Update.printError(Serial);
    }
    
  } else if (upload.status == UPLOAD_FILE_END) {
    if (!authSuccess) return;

    esp_task_wdt_reset();  // Reset watchdog before final
    
    if (Update.end(true)) {
      Serial.printf("✅ OTA: Update Success, size: %u bytes\n", upload.totalSize);
    } else {
      Update.printError(Serial);
    }
    
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    Serial.println("❌ OTA: Update aborted");
    Update.end();
  }
}

void handleFirmwareUpdateDone() {
  // Add CORS headers
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (Update.hasError()) {
    fw_last_result = "fail";
    fw_last_version = fwInfo.newVersion;
    fw_last_ts = time(nullptr);
    server.send(500, "text/plain", "OTA Update Failed");
  } else {
    fw_last_result = "success";
    fw_last_version = fwInfo.newVersion.length() > 0 ? fwInfo.newVersion : FW_VERSION;
    fw_last_ts = time(nullptr);
    
    // Publish firmware update success notification via MQTT
    // ✅ ESP-MQTT Native
    if (mqttConnected) {
      StaticJsonDocument<256> doc;
      doc["event"] = "firmware_updated";
      doc["message"] = "Firmware update successful";
      doc["version"] = fw_last_version;
      doc["mac"] = deviceMac;
      doc["timestamp"] = nowISO();
      char buf[256];
      serializeJson(doc, buf);
      esp_mqtt_client_publish(mqttClient, "AI205/notifications", buf, 0, 2, 0);  // QoS 2
      Serial.println("📢 Firmware update notification sent");
    }
    
    server.send(200, "text/plain", "OTA Update OK. Rebooting...");
    delay(1500);
    ESP.restart();
  }
}
 
void api_history() {
  if (!ensureAuthApi()) return;

  StaticJsonDocument<4096> doc;
  JsonArray arr = doc.to<JsonArray>();

  for (int i = 0; i < HISTORY_LEN; i++) {
    int idx = (historyIndex + i) % HISTORY_LEN;
    if (historyBuf[idx].timestamp == 0) continue;

    JsonObject o = arr.createNestedObject();
    o["ts"] = (unsigned long)historyBuf[idx].timestamp;
    o["V1"] = historyBuf[idx].v1;
    o["I1"] = historyBuf[idx].i1;
    o["kWsum"] = historyBuf[idx].kWsum;
    o["PFsys"] = historyBuf[idx].PFsys;
  }

  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}


void publishSensorData(const SensorData &d) {
  if (!wifiConnected()) {
    Serial.println("⚠️ MQTT skip: WiFi not connected");
    return;
  }
  
  // ✅ ESP-MQTT Native: Check connection state
  if (!mqttConnected) {
    Serial.println("⚠️ MQTT skip: not connected");
    return;
  }

  StaticJsonDocument<512> doc;

  doc["ts"] = (unsigned long)d.timestamp;

  doc["V1"] = d.v1; doc["V2"] = d.v2; doc["V3"] = d.v3;
  doc["I1"] = d.i1; doc["I2"] = d.i2; doc["I3"] = d.i3;
  doc["PF1"] = d.pf1; doc["PF2"] = d.pf2; doc["PF3"] = d.pf3;
  doc["kW1"] = d.kW1; doc["kW2"] = d.kW2; doc["kW3"] = d.kW3;
  doc["kWsum"] = d.kWsum;
  doc["PFsys"] = d.PFsys;
  doc["Hz"] = d.Hz;
  doc["Ep_imp"] = d.Ep_imp;
  doc["Ep_exp"] = d.Ep_exp;
  doc["Ep_total"] = d.Ep_total;
  doc["Ep_net"] = d.Ep_net;

  char buf[512];
  size_t n = serializeJson(doc, buf, sizeof(buf));

  // ✅ ESP-MQTT Native: Publish with QoS 2 (exactly once delivery)
  int msg_id = esp_mqtt_client_publish(mqttClient, conf.topicData.c_str(), buf, n, 2, 1);  // qos=2, retain=1
  
  if (msg_id < 0) {
    Serial.println("❌ MQTT publish failed!");
  }
}


void publishStatus() {
  // ✅ ESP-MQTT Native: Check connection state
  if (!mqttConnected) return;
  
  StaticJsonDocument<256> doc;
  doc["ssid"] = conf.ssid;
  doc["ip"] = WiFi.localIP().toString();
  doc["mac"] = deviceMac;
  doc["fw_version"] = FW_VERSION;
  doc["heap_free_kb"] = (float)ESP.getFreeHeap() / 1024.0f;
  doc["cpu_freq_mhz"] = getCpuFrequencyMhz();
  doc["uptime_sec"] = millis() / 1000;
  char buf[256];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  
  // ✅ ESP-MQTT Native: Publish with QoS 2
  esp_mqtt_client_publish(mqttClient, conf.topicStatus.c_str(), buf, n, 2, 1);  // qos=2, retain=1
}


// ======================= WEB API =========================
void api_status() {
  if (!ensureAuthApi()) return;

  String j = "{";

  j += "\"wifi\":" + String(wifiConnected() ? 1 : 0) + ",";
  j += "\"ssid\":\"" + conf.ssid + "\",";
  j += "\"ip\":\"" + WiFi.localIP().toString() + "\",";

  j += "\"mqtt\":" + String(mqttConnected ? 1 : 0) + ",";  // ✅ ESP-MQTT Native

  j += "\"V1\":" + String(lastData.v1,2) + ",";
  j += "\"V2\":" + String(lastData.v2,2) + ",";
  j += "\"V3\":" + String(lastData.v3,2) + ",";

  j += "\"I1\":" + String(lastData.i1,3) + ",";
  j += "\"I2\":" + String(lastData.i2,3) + ",";
  j += "\"I3\":" + String(lastData.i3,3) + ",";

  j += "\"PFsys\":" + String(lastData.PFsys,3) + ",";
  j += "\"Hz\":" + String(lastData.Hz,2) + ",";

  j += "\"kWsum\":" + String(lastData.kWsum,3) + ",";
  j += "\"modbus\":" + String(lastData.validRead ? 1 : 0);

  j += "}";

  server.send(200, "application/json", j);
}

void api_status_v2() {
  if (!ensureAuthApi()) return;

  float heapFreeKb     = ESP.getFreeHeap()     / 1024.0f;
  float heapMinFreeKb  = ESP.getMinFreeHeap()  / 1024.0f;
  float heapTotalKb    = ESP.getHeapSize()     / 1024.0f;
  float psramSizeKb    = ESP.getPsramSize()    / 1024.0f;
  uint32_t flashSize   = ESP.getFlashChipSize();
  uint32_t sketchSize  = ESP.getSketchSize();
  uint32_t freeSketch  = ESP.getFreeSketchSpace();
  uint32_t cpuFreqMhz  = getCpuFrequencyMhz();
  int32_t  rssi        = wifiConnected() ? WiFi.RSSI() : 0;

  float core0CycleMs   = core0LastCycleUs / 1000.0f;
  float core0AvgMs     = core0AvgCycleUs  / 1000.0f;
  float core1CycleMs   = core1LastLoopUs  / 1000.0f;
  float core1AvgMs     = core1AvgLoopUs   / 1000.0f;

  String j = "{";

  j += "\"wifi\": " + String(wifiConnected() ? 1 : 0) + ",";
  j += "\"ssid\": \"" + conf.ssid + "\",";
  j += "\"rssi\": " + String(rssi) + ",";
  j += "\"ip\": \"" + WiFi.localIP().toString() + "\",";

  j += "\"mqtt\": " + String(mqttConnected ? 1 : 0) + ",";  // ✅ ESP-MQTT Native
  j += "\"mqtt_server\": \"" + conf.mqttServer + "\",";
  j += "\"mqtt_user\": \"" + conf.mqttUser + "\",";
  j += "\"mqtt_port\": " + String(conf.mqttPort) + ",";

  // Firmware HTTP server info
  j += "\"fw_server\": \"" + conf.fwHost + "\",";
  j += "\"fw_port\": " + String(conf.fwPort) + ",";

  j += "\"mac\": \"" + deviceMac + "\",";

  j += "\"topicData\": \""   + conf.topicData   + "\",";
  j += "\"topicStatus\": \"" + conf.topicStatus + "\",";
  j += "\"topicAlert\": \""  + conf.topicAlert  + "\",";

  j += "\"modbus\": " + String(lastData.validRead ? 1 : 0) + ",";

  // Firmware info
  j += "\"fw_current_version\":\"" + String(FW_VERSION) + "\",";
  j += "\"fw_new_version\":\"" + String(fwInfo.newVersion) + "\",";
  j += "\"fw_update_available\":" + String(fwInfo.available ? 1 : 0) + ",";

  // System metrics
  j += "\"heap_free_kb\": "     + String(heapFreeKb, 1)    + ",";
  j += "\"heap_min_free_kb\": " + String(heapMinFreeKb, 1) + ",";
  j += "\"heap_total_kb\": "    + String(heapTotalKb, 1)   + ",";
  j += "\"psram_size_kb\": "    + String(psramSizeKb, 1)   + ",";
  j += "\"flash_size_bytes\": " + String(flashSize)        + ",";
  j += "\"sketch_size_bytes\": "+ String(sketchSize)       + ",";
  j += "\"free_sketch_bytes\": "+ String(freeSketch)       + ",";
  j += "\"cpu_freq_mhz\": "     + String(cpuFreqMhz)       + ",";

  j += "\"core0_cycle_ms\": "   + String(core0CycleMs, 3)  + ",";
  j += "\"core0_avg_ms\": "     + String(core0AvgMs, 3)    + ",";
  j += "\"core1_cycle_ms\": "   + String(core1CycleMs, 3)  + ",";
  j += "\"core1_avg_ms\": "     + String(core1AvgMs, 3)    + ",";

  // Sensor data
  j += "\"V1\": " + String(lastData.v1, 2) + ",";
  j += "\"V2\": " + String(lastData.v2, 2) + ",";
  j += "\"V3\": " + String(lastData.v3, 2) + ",";

  j += "\"I1\": " + String(lastData.i1, 3) + ",";
  j += "\"I2\": " + String(lastData.i2, 3) + ",";
  j += "\"I3\": " + String(lastData.i3, 3) + ",";

  j += "\"PF1\": " + String(lastData.pf1, 3) + ",";
  j += "\"PF2\": " + String(lastData.pf2, 3) + ",";
  j += "\"PF3\": " + String(lastData.pf3, 3) + ",";
  j += "\"PFsys\": " + String(lastData.PFsys, 3) + ",";

  j += "\"kW1\": " + String(lastData.kW1, 3) + ",";
  j += "\"kW2\": " + String(lastData.kW2, 3) + ",";
  j += "\"kW3\": " + String(lastData.kW3, 3) + ",";
  j += "\"kWsum\": " + String(lastData.kWsum, 3) + ",";

  j += "\"Hz\": " + String(lastData.Hz, 2) + ",";

  j += "\"Ep_imp\": " + String(lastData.Ep_imp) + ",";
  j += "\"Ep_exp\": " + String(lastData.Ep_exp) + ",";
  j += "\"Ep_total\": " + String(lastData.Ep_total) + ",";
  j += "\"Ep_net\": " + String(lastData.Ep_net) + ",";

    // ===== Runtime config =====
  j += "\"ctRatio\": " + String(CT_RATIO, 2) + ",";
  j += "\"ptRatio\": " + String(PT_RATIO, 2) + ",";
  j += "\"ovLimit\": " + String(overvoltageLimit, 1) + ",";
  j += "\"uvLimit\": " + String(undervoltageLimit, 1) + ",";
  j += "\"ocLimit\": " + String(overcurrentLimit, 2) + ",";
  j += "\"lowPfLimit\": " + String(lowPfLimit, 3) + ",";

  // ===== Firmware dashboard info =====
  j += "\"fw_new_size\": " + String(fwInfo.size) + ",";
  j += "\"fw_last_result\": \"" + fw_last_result + "\",";
  j += "\"fw_last_version\": \"" + fw_last_version + "\",";
  j += "\"fw_last_notes\": \"" + fw_last_notes + "\",";
  j += "\"fw_last_timestamp\": " + String(fw_last_ts) + ",";

  // ===== Modbus diagnostics =====
  j += "\"modbusErrorCount\": " + String(modbusErrorCount) + ",";
  j += "\"lastModbusTs\": " + String(lastModbusOkTs) + ",";

  // ===== Service config (for dashboard) =====
  j += "\"webUser\": \"" + conf.webUser + "\",";
  // Note: webPass intentionally not exposed for security
  j += "\"apSsid\": \"" + conf.apSsid + "\",";
  // Note: apPass intentionally not exposed for security
  j += "\"modbusSlaveId\": " + String(conf.modbusSlaveId) + ",";
  j += "\"modbusBaudrate\": " + String(conf.modbusBaudrate) + ",";
  j += "\"alertCooldown\": " + String(conf.alertCooldown) + ",";
  j += "\"phaseMissingI\": " + String(conf.phaseMissingI, 3) + ",";
  j += "\"phaseMissingV\": " + String(conf.phaseMissingV, 1) + ",";

  j += "\"uptime\": " + String(millis() / 1000);

  j += "}";

  server.send(200, "application/json", j);
}

void attachAPI() {
  server.on("/api/status",  HTTP_GET, api_status);
  server.on("/api/status2", HTTP_GET, api_status_v2);
  server.on("/api/history", HTTP_GET, api_history);

}

// ======================= CORS HELPER =======================
void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  server.sendHeader("Access-Control-Allow-Credentials", "true");
}

// ======================= WEB ROUTES / CONFIG =============
void setupWebRoutes() {
  // CORS Preflight handler for all routes
  server.on("/api/login", HTTP_OPTIONS, []() {
    sendCorsHeaders();
    server.send(204);
  });
  
  server.on("/fwupdate", HTTP_OPTIONS, []() {
    sendCorsHeaders();
    server.send(204);
  });
  
  server.on("/api/status", HTTP_OPTIONS, []() {
    sendCorsHeaders();
    server.send(204);
  });
  // Root: ถ้า login แล้วไป dashboard, ถ้ายัง -> login
  server.on("/", HTTP_GET, []() {
    if (isAuthenticated()) {
      server.sendHeader("Location", "/dashboard");
    } else {
      server.sendHeader("Location", "/login");
    }
    server.send(302, "text/plain", "");
  });

  server.onNotFound([]() {
    server.sendHeader("Location", "/login");
    server.send(302, "text/plain", "");
  });

  // Captive portal checks
  server.on("/generate_204", HTTP_GET, []() {
    server.sendHeader("Location", "/login");
    server.send(302, "text/plain", "");
  });

  server.on("/hotspot-detect.html", HTTP_GET, []() {
    server.sendHeader("Location", "/login");
    server.send(302, "text/plain", "");
  });

  server.on("/fwlink", HTTP_GET, []() {
    server.sendHeader("Location", "/login");
    server.send(302, "text/plain", "");
  });

  // ====== LOGIN PAGE ======
  server.on("/login", HTTP_GET, []() {
    if (isAuthenticated()) {
      server.sendHeader("Location", "/dashboard");
      server.send(302, "text/plain", "");
      return;
    }
    File f = FS.open("/login.html", "r");
    if (!f) {
      server.send(500, "text/plain", "login.html not found");
      return;
    }
    server.streamFile(f, "text/html");
    f.close();
  });

  // ====== LOGOUT ======
  server.on("/logout", HTTP_GET, handleLogout);

  // ====== API LOGIN (local, ไม่ใช้ MySQL) ======
  server.on("/api/login", HTTP_POST, []() {
    sendCorsHeaders();
    
    String user = server.arg("username");
    String pass = server.arg("password");

    bool ok = (user == conf.webUser && pass == conf.webPass);

    if (!ok) {
      server.send(401, "application/json", "{\"ok\":0,\"error\":\"invalid\"}");
      return;
    }

    sessionToken = generateSessionToken();
    String cookie = "AI205SESSION=" + sessionToken + "; Path=/";
    server.sendHeader("Set-Cookie", cookie);
    server.send(200, "application/json", "{\"ok\":1,\"token\":\"" + sessionToken + "\"}");
  });

  // ====== Protected pages ======
  server.on("/config", HTTP_GET, []() {
    if (!ensureAuthPage()) return;
    File file = FS.open("/config.html", "r");
    server.streamFile(file, "text/html");
    file.close();
  });

  server.on("/dashboard", HTTP_GET, []() {
    if (!ensureAuthPage()) return;
    File file = FS.open("/dashboard.html", "r");
    server.streamFile(file, "text/html");
    file.close();
  });

  server.on("/advanced", HTTP_GET, []() {
    if (!ensureAuthPage()) return;
    File file = FS.open("/advanced.html", "r");
    server.streamFile(file, "text/html");
    file.close();
  });

  // Static assets (ไม่ต้องล็อกอินก็โหลดได้)
  server.on("/script.js", HTTP_GET, []() {
    File f = FS.open("/script.js", "r");
    server.streamFile(f, "application/javascript");
    f.close();
  });

  server.on("/style.css", HTTP_GET, []() {
    File f = FS.open("/style.css", "r");
    server.streamFile(f, "text/css");
    f.close();
  });

  // OTA upload (ต้อง login)
  server.on(
    "/fwupdate",
    HTTP_POST,
    []() {
      if (!ensureAuthApi()) return;
      handleFirmwareUpdateDone();
    },
    handleFirmwareUpload
  );

  // Save config + reboot (ต้อง login)
  server.on("/api/save", HTTP_POST, []() {
    if (!ensureAuthApi()) return;

    if (server.hasArg("ssid"))        conf.ssid       = server.arg("ssid");
    if (server.hasArg("pass"))        conf.pass       = server.arg("pass");
    if (server.hasArg("mqtt"))        conf.mqttServer = server.arg("mqtt");
    if (server.hasArg("port"))        conf.mqttPort   = server.arg("port").toInt();
    if (server.hasArg("muser"))       conf.mqttUser   = server.arg("muser");
    if (server.hasArg("mpass"))       conf.mqttPass   = server.arg("mpass");
    if (server.hasArg("topicData"))   conf.topicData   = server.arg("topicData");
    if (server.hasArg("topicStatus")) conf.topicStatus = server.arg("topicStatus");
    if (server.hasArg("topicAlert"))  conf.topicAlert  = server.arg("topicAlert");

    if (server.hasArg("ctRatio"))   conf.ctRatio    = server.arg("ctRatio").toFloat();
    if (server.hasArg("ptRatio"))   conf.ptRatio    = server.arg("ptRatio").toFloat();
    if (server.hasArg("ovLimit"))   conf.ovLimit    = server.arg("ovLimit").toFloat();
    if (server.hasArg("uvLimit"))   conf.uvLimit    = server.arg("uvLimit").toFloat();
    if (server.hasArg("ocLimit"))   conf.ocLimit    = server.arg("ocLimit").toFloat();
    if (server.hasArg("lowPf"))     conf.lowPfLimit = server.arg("lowPf").toFloat();

    // Firmware HTTP server from dashboard
    if (server.hasArg("fwHost")) conf.fwHost = server.arg("fwHost");
    if (server.hasArg("fwPort")) conf.fwPort = server.arg("fwPort").toInt();

    // Service config (new)
    if (server.hasArg("webUser"))     conf.webUser = server.arg("webUser");
    if (server.hasArg("webPass"))     conf.webPass = server.arg("webPass");
    if (server.hasArg("apSsid"))      conf.apSsid = server.arg("apSsid");
    if (server.hasArg("apPass"))      conf.apPass = server.arg("apPass");
    if (server.hasArg("mbSlave"))     conf.modbusSlaveId = server.arg("mbSlave").toInt();
    if (server.hasArg("mbBaud"))      conf.modbusBaudrate = server.arg("mbBaud").toInt();
    if (server.hasArg("alertCD"))     conf.alertCooldown = (uint32_t)server.arg("alertCD").toInt();
    if (server.hasArg("phMissI"))     conf.phaseMissingI = server.arg("phMissI").toFloat();
    if (server.hasArg("phMissV"))     conf.phaseMissingV = server.arg("phMissV").toFloat();

    saveConfig();

    server.send(200, "application/json", "{\"status\":\"saved\"}");
    delay(800);
    ESP.restart();
  });

  server.on("/api/reboot", HTTP_GET, []() {
    if (!ensureAuthApi()) return;
    server.send(200, "text/plain", "Rebooting...");
    delay(1000);
    ESP.restart();
  });

  // Backup (ต้อง login)
  server.on("/api/backup",  HTTP_GET, []() {
    if (!ensureAuthApi()) return;
    handleConfigBackup();
  });

  server.on("/api/fwbackup", HTTP_GET, []() {
    if (!ensureAuthApi()) return;
    handleFirmwareBackup();
  });

  // Trigger HTTP OTA (ต้อง login)
  server.on("/api/fw/apply", HTTP_POST, []() {
    if (!ensureAuthApi()) return;

    if (!fwInfo.available || fwInfo.url.length() == 0) {
      server.send(400, "application/json", "{\"status\":\"no_update\"}");
      return;
    }

    server.send(200, "application/json", "{\"status\":\"updating\"}");
    delay(300);
    bool ok = performHttpUpdateFromUrl(fwInfo.url, fwInfo.size);
    if (!ok) {
      Serial.println("❌ HTTP OTA fail");
      return;
    }

    delay(500);
    ESP.restart();
  });

  // APIs (ภายในจะเช็ค auth เอง)
  attachAPI();
}

// ======================= AP MODE =========================
void startAPMode() {
  Serial.println("❌ WiFi connect fail → Starting AP Mode");
  apMode = true;

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, AP_PASS);
  delay(300);

  IPAddress apIP = WiFi.softAPIP();
  Serial.print("📡 AP IP: ");
  Serial.println(apIP);

  dnsServer.start(DNS_PORT, "*", apIP);

  // เก็บ Cookie header ไว้ใช้กับ session
  const char* headerKeys[] = {"Cookie"};
  server.collectHeaders(headerKeys, 1);

  setupWebRoutes();
  server.begin();
  Serial.println("🌐 WebServer Started (AP Mode)");

  if (!wifiConnected()) {
    WiFi.begin(conf.ssid.c_str(), conf.pass.c_str());
  }
}

// ======================= WIFI FAIL CHECK =================
void checkWiFiFail() {
  static unsigned long lastRetry = 0;
  static bool wasConnected = false;

  if (!apMode && !wifiConnected()) {
    if (millis() - wifiStartTime > 60000UL) {
      startAPMode();
    }
  }

  if (apMode) {
    dnsServer.processNextRequest();
    server.handleClient();

    // Retry WiFi connection every 30 seconds (not 10) to reduce conflicts
    if (!wifiConnected() && millis() - lastRetry > 30000UL) {
      wl_status_t status = WiFi.status();
      // Only retry if not already connected (WL_CONNECTING not available in ESP32 core 3.0.7)
      if (status != WL_CONNECTED) {
        Serial.println("🔁 AP Mode: retry STA connect...");
        WiFi.disconnect(true);  // Disconnect first
        delay(100);
        WiFi.begin(conf.ssid.c_str(), conf.pass.c_str());
      }
      lastRetry = millis();
    }
  }
  
  // Track WiFi state changes for debugging
  if (wifiConnected() && !wasConnected) {
    Serial.println("✅ WiFi reconnected!");
    wasConnected = true;
  } else if (!wifiConnected() && wasConnected) {
    Serial.println("⚠️ WiFi disconnected");
    wasConnected = false;
  }
}

void autoCloseAP() {
  if (apMode && wifiConnected()) {
    Serial.println("📴 Closing AP Mode…");
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    apMode = false;
    
    // Sync time after WiFi reconnection
    if (!timeReady) {
      Serial.println("⏰ Syncing time after AP close...");
      syncTimeNTP(15000);
    }
  }
}

// ======================= TASK RS485 (CORE 0) =============
void Task_RS485(void *pv) {
  // Initialize watchdog timer
  // ✅ ESP-IDF 5.1 API uses esp_task_wdt_config_t struct
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = WDT_TIMEOUT_MS,
    .idle_core_mask = 0,  // Don't watch idle tasks
    .trigger_panic = false
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);

  uint32_t dynamicDelay = 10;
  unsigned long lastCT = 0;
  SensorData d{};
  TickType_t xLast = xTaskGetTickCount();

  for(;;){
    esp_task_wdt_reset();
    unsigned long start = micros();
    bool ok = true;
    d.validRead = true;

    if(millis()-lastCT > 60000){
      readCT();
      lastCT = millis();
      applyConfigRuntime();
    }

    if(safeReadHoldingRegisters(0x0131,3)){
      d.v1=node.getResponseBuffer(0)/10.0;
      d.v2=node.getResponseBuffer(1)/10.0;
      d.v3=node.getResponseBuffer(2)/10.0;
    } else { ok=false; d.validRead=false; }
    node.clearResponseBuffer();
    vTaskDelay(pdMS_TO_TICKS(2));

    if(safeReadHoldingRegisters(0x0139,3)){
      d.i1=node.getResponseBuffer(0)*CT_RATIO/1000.0;
      d.i2=node.getResponseBuffer(1)*CT_RATIO/1000.0;
      d.i3=node.getResponseBuffer(2)*CT_RATIO/1000.0;
    } else { ok=false; d.validRead=false; }
    node.clearResponseBuffer();
    vTaskDelay(pdMS_TO_TICKS(2));

    if(safeReadHoldingRegisters(0x014A,3)){
      d.pf1=toInt16(node.getResponseBuffer(0))/1000.0;
      d.pf2=toInt16(node.getResponseBuffer(1))/1000.0;
      d.pf3=toInt16(node.getResponseBuffer(2))/1000.0;
    } else { ok=false; d.validRead=false; }
    node.clearResponseBuffer();
    vTaskDelay(pdMS_TO_TICKS(2));

    d.kW1=(d.v1*d.i1*d.pf1)/1000.0;
    d.kW2=(d.v2*d.i2*d.pf2)/1000.0;
    d.kW3=(d.v3*d.i3*d.pf3)/1000.0;
    d.kWsum=d.kW1+d.kW2+d.kW3;
    float Ssum=(d.v1*d.i1+d.v2*d.i2+d.v3*d.i3)/1000.0;
    d.PFsys=(Ssum>0)?(d.kWsum/Ssum):0;
    if(d.PFsys>1)d.PFsys=1;

    if(safeReadHoldingRegisters(0x0130,1)){
      d.Hz=node.getResponseBuffer(0)/100.0;
    } else { d.validRead=false; }
    node.clearResponseBuffer();
    vTaskDelay(pdMS_TO_TICKS(2));

    if(safeReadHoldingRegisters(0x0156,2)){
      d.Ep_imp=node.getResponseBuffer(0);
      d.Ep_exp=node.getResponseBuffer(1);
      d.Ep_total=d.Ep_imp+d.Ep_exp;
      d.Ep_net=d.Ep_imp-d.Ep_exp;
    } else { d.validRead=false; }
    node.clearResponseBuffer();

    // timestamp (epoch seconds)
  d.timestamp = timeReady ? (uint64_t)time(nullptr) : (uint64_t)(millis() / 1000);

  // modbus success timestamp
  if (d.validRead) {
  lastModbusOkTs = d.timestamp;
  }


    lastData = d;
    addHistory(d);

    // ✅ Changed from xQueueOverwrite to xQueueSend (xQueueOverwrite only works with queue size 1)
    // If queue is full, drop oldest data by receiving and discarding before sending
    if (uxQueueSpacesAvailable(dataQueue) == 0) {
      SensorData discarded;
      xQueueReceive(dataQueue, &discarded, 0);  // Remove oldest item
    }
    xQueueSend(dataQueue, &d, 0);  // Non-blocking send
    digitalWrite(LED_PIN,!digitalRead(LED_PIN));

    unsigned long rtt = micros() - start;

    core0LastCycleUs = rtt;
    if (core0AvgCycleUs == 0) {
      core0AvgCycleUs = rtt;
    } else {
      core0AvgCycleUs = (core0AvgCycleUs * 7 + rtt) / 8;
    }

    if(ok){
      if(rtt<8000 && dynamicDelay>8) dynamicDelay--;
      else if(rtt>15000 && dynamicDelay<30) dynamicDelay++;
    }else{
      if(dynamicDelay<30) dynamicDelay+=3;
    }

    yield();
    vTaskDelayUntil(&xLast, pdMS_TO_TICKS(dynamicDelay));
    esp_task_wdt_reset();
  }
}

// ======================= ESP-MQTT NATIVE IMPLEMENTATION ==================

// ✅ Handle incoming MQTT messages (called from event handler)
void handleMqttMessage(const char* topic, int topic_len, const char* data, int data_len) {
  // Create null-terminated strings
  char topicStr[128];
  char dataStr[1024];
  int tLen = min(topic_len, 127);
  int dLen = min(data_len, 1023);
  memcpy(topicStr, topic, tLen);
  topicStr[tLen] = '\0';
  memcpy(dataStr, data, dLen);
  dataStr[dLen] = '\0';
  
  String t(topicStr);
  
  if (t == "AI205/firmware/info") {
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, dataStr);
    if (err) {
      Serial.printf("❌ FW info JSON error: %s\n", err.c_str());
      return;
    }

    const char* device   = doc["device"]   | "";
    const char* ver      = doc["version"]  | "";
    const char* urlField = doc["url"]      | "";
    uint32_t size        = doc["size"]     | 0;

    if (strlen(device) > 0 && String(device) != "AI205") {
      return;
    }

    if (String(ver).length() == 0 || String(urlField).length() == 0) {
      return;
    }

    String base = getFwBaseUrl();
    String fullUrl;
    String urlStr = String(urlField);

    if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
      fullUrl = urlStr;
    } else if (urlStr.startsWith("/")) {
      fullUrl = base + urlStr;
    } else {
      fullUrl = base + "/" + urlStr;
    }

    Serial.printf("📥 FW update available: v%s\n", ver);

    if (String(ver) == FW_VERSION) {
      fwInfo.available = false;
      fwInfo.newVersion = "";
      fwInfo.url = "";
      fwInfo.size = 0;
    } else {
      fwInfo.newVersion = ver;
      fwInfo.url = fullUrl;
      fwInfo.size = size;
      fwInfo.available = true;
    }
    return;
  }

  if (t == "AI205/commands") {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, dataStr);
    if (err) {
      Serial.printf("❌ Command JSON error: %s\n", err.c_str());
      return;
    }

    const char* action = doc["action"] | "";
    Serial.printf("📥 Command received: action=%s\n", action);

    if (String(action) == "restart") {
      Serial.println("🔄 Restart command received via MQTT. Restarting in 2s...");
      
      StaticJsonDocument<128> ack;
      ack["action"] = "restart";
      ack["status"] = "acknowledged";
      ack["mac"] = deviceMac;
      char buf[128];
      serializeJson(ack, buf);
      esp_mqtt_client_publish(mqttClient, "AI205/status", buf, 0, 2, 0);  // QoS 2
      
      delay(2000);
      ESP.restart();
      return;
    }

    if (String(action) == "status") {
      publishStatus();
      return;
    }
  }
}

// ✅ ESP-MQTT Event Handler (handles all MQTT events)
static void mqtt_event_handler(void *args, esp_event_base_t base, int32_t event_id, void *event_data) {
  esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;
  
  switch ((esp_mqtt_event_id_t)event_id) {
    case MQTT_EVENT_CONNECTED:
      mqttConnected = true;
      Serial.println("✅ MQTT connected (ESP-IDF Native with QoS 2)");
      
      // Subscribe with QoS 2 for exactly once delivery
      esp_mqtt_client_subscribe(mqttClient, "AI205/firmware/info", 2);
      esp_mqtt_client_subscribe(mqttClient, "AI205/commands", 2);
      
      // Publish online presence with QoS 2
      {
        StaticJsonDocument<128> doc;
        doc["online"] = 1;
        doc["mac"] = deviceMac;
        char buf[128];
        serializeJson(doc, buf);
        esp_mqtt_client_publish(mqttClient, conf.topicStatus.c_str(), buf, 0, 2, 1);  // QoS 2, retain
      }
      break;
      
    case MQTT_EVENT_DISCONNECTED:
      mqttConnected = false;
      Serial.println("⚠️ MQTT disconnected - auto reconnecting...");
      break;
      
    case MQTT_EVENT_DATA:
      handleMqttMessage(event->topic, event->topic_len, event->data, event->data_len);
      break;
      
    case MQTT_EVENT_PUBLISHED:
      // Message delivered with QoS 1 confirmation (PUBACK received)
      Serial.printf("📤 Message delivered (msg_id=%d) ✅ QoS1 ACK\n", event->msg_id);
      break;
      
    case MQTT_EVENT_ERROR:
      Serial.println("❌ MQTT error occurred");
      if (event->error_handle->error_type == MQTT_ERROR_TYPE_TCP_TRANSPORT) {
        Serial.printf("   TCP error: %d\n", event->error_handle->esp_tls_last_esp_err);
      }
      break;
      
    case MQTT_EVENT_BEFORE_CONNECT:
      Serial.println("🔁 MQTT connecting...");
      break;
      
    default:
      break;
  }
}

// ✅ Initialize ESP-MQTT Native client
void initMqtt() {
  if (mqttClient != NULL) {
    esp_mqtt_client_destroy(mqttClient);
    mqttClient = NULL;
  }
  
  // Build broker URI
  char brokerUri[128];
  snprintf(brokerUri, sizeof(brokerUri), "mqtt://%s:%d", 
           conf.mqttServer.c_str(), conf.mqttPort);
  
  // Build client ID
  String clientId = "AI205-" + deviceMac;
  
  // Build LWT payload
  String willPayload = "{\"online\":0,\"mac\":\"" + deviceMac + "\"}";
  
  // Configure MQTT client
  esp_mqtt_client_config_t mqtt_cfg = {};
  mqtt_cfg.broker.address.uri = brokerUri;
  mqtt_cfg.credentials.username = conf.mqttUser.c_str();
  mqtt_cfg.credentials.authentication.password = conf.mqttPass.c_str();
  mqtt_cfg.credentials.client_id = clientId.c_str();
  mqtt_cfg.session.keepalive = 60;
  mqtt_cfg.session.last_will.topic = conf.topicStatus.c_str();
  mqtt_cfg.session.last_will.msg = willPayload.c_str();
  mqtt_cfg.session.last_will.msg_len = willPayload.length();
  mqtt_cfg.session.last_will.qos = 1;
  mqtt_cfg.session.last_will.retain = true;
  mqtt_cfg.network.reconnect_timeout_ms = 2000;  // ✅ Fast reconnect (2 seconds)
  mqtt_cfg.buffer.size = 1024;
  mqtt_cfg.buffer.out_size = 1024;
  
  Serial.printf("🔌 Initializing ESP-MQTT: %s as %s\n", brokerUri, conf.mqttUser.c_str());
  
  mqttClient = esp_mqtt_client_init(&mqtt_cfg);
  if (mqttClient == NULL) {
    Serial.println("❌ Failed to initialize MQTT client");
    return;
  }
  
  esp_mqtt_client_register_event(mqttClient, MQTT_EVENT_ANY, mqtt_event_handler, NULL);
  esp_mqtt_client_start(mqttClient);
  
  Serial.println("✅ ESP-MQTT Native client started");
}

// ======================= Firmware HTTP Base URL ==========
String getFwBaseUrl() {
  String host = conf.fwHost.length() ? conf.fwHost : String(DEFAULT_FW_HOST);
  int port    = (conf.fwPort > 0) ? conf.fwPort : DEFAULT_FW_PORT;

  String base = "http://" + host;
  if (port != 80) {
    base += ":" + String(port);
  }
  return base;
}


// OLD mqttCallback REMOVED - now using handleMqttMessage() in ESP-MQTT Native


// ======================= TASK MQTT (CORE 1) ==============
void Task_MQTT(void *pv) {
  SensorData d;
  uint32_t sendDelay = 200;
  unsigned long lastStatus = 0;
  static bool mqttInitialized = false;

  for (;;) {
    unsigned long loopStart = micros();

    if (apMode) {
      // In AP mode, just wait
      unsigned long loopUs = micros() - loopStart;
      core1LastLoopUs = loopUs;
      if (core1AvgLoopUs == 0) core1AvgLoopUs = loopUs;
      else core1AvgLoopUs = (core1AvgLoopUs * 7 + loopUs) / 8;

      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    if (!wifiConnected()) {
      // Only try to connect if not in AP mode
      if (!apMode && !firstWifiTryDone) {
        connectWiFi_STA();
        firstWifiTryDone = true;
      }
      unsigned long loopUs = micros() - loopStart;
      core1LastLoopUs = loopUs;
      if (core1AvgLoopUs == 0) core1AvgLoopUs = loopUs;
      else core1AvgLoopUs = (core1AvgLoopUs * 7 + loopUs) / 8;

      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    } else if (firstWifiTryDone) {
      // WiFi just reconnected, sync time if needed
      if (!timeReady) {
        syncTimeNTP(10000);
      }
      firstWifiTryDone = false;
    }

    // ✅ ESP-MQTT Native: Initialize MQTT once when WiFi is ready
    if (!mqttInitialized && wifiConnected()) {
      initMqtt();
      mqttInitialized = true;
    }

    // Retry NTP sync periodically if time is not ready
    static unsigned long lastNtpRetry = 0;
    if (!timeReady && wifiConnected() && (millis() - lastNtpRetry > 60000UL || lastNtpRetry == 0)) {
      lastNtpRetry = millis();
      if (xSemaphoreTake(serialMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        Serial.println("⏰ Retrying NTP sync...");
        xSemaphoreGive(serialMutex);
      }
      syncTimeNTP(5000);
    }

    // Process sensor data from queue
    if (xQueueReceive(dataQueue, &d, pdMS_TO_TICKS(100))) {
      lastData = d;
      checkAlerts(d);

      // publish sensor JSON with QoS 1
      publishSensorData(d);

      Serial.printf("📡 MQTT sent: V1=%.2f I1=%.3f kWsum=%.3f PF=%.3f\n", d.v1, d.i1, d.kWsum, d.PFsys);
    }

    // Send STATUS every 10 seconds
    if (millis() - lastStatus > 10000UL) {
      lastStatus = millis();
      publishStatus();
      Serial.println("📊 ESP STATUS published");
    }

    // ✅ ESP-MQTT Native: No client.loop() needed - handled automatically

    unsigned long loopUs = micros() - loopStart;
    core1LastLoopUs = loopUs;
    if (core1AvgLoopUs == 0) core1AvgLoopUs = loopUs;
    else core1AvgLoopUs = (core1AvgLoopUs * 7 + loopUs) / 8;

    vTaskDelay(pdMS_TO_TICKS(sendDelay));
  }
}

// ======================= INIT / SETUP / LOOP =============
void initSystem() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  setCpuFrequencyMhz(240);

  Wire.begin(21, 22);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("❌ OLED not found");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(0, 8);
    display.println("AI205");
    display.display();
  }

  if (!FS.begin(true)) {
    Serial.println("❌ LittleFS Mount Failed");
  }

  loadConfig();
  applyConfigRuntime();

  WiFi.mode(WIFI_STA);
  connectWiFi_STA();
  wifiStartTime = millis();

  // Wait for WiFi to connect before NTP sync (max 10 seconds)
  Serial.println("⏳ Waiting for WiFi connection...");
  unsigned long wifiWaitStart = millis();
  while (!wifiConnected() && (millis() - wifiWaitStart < 10000)) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (wifiConnected()) {
    Serial.println("✅ WiFi connected, syncing NTP...");
    if (!syncTimeNTP()) {
      loadTimeFromRTC();
    }
  } else {
    Serial.println("⚠️ WiFi not connected yet, using RTC time");
    loadTimeFromRTC();
  }

  // MAC
  deviceMac = WiFi.macAddress();
  Serial.printf("🆔 Device MAC: %s\n", deviceMac.c_str());

  Serial2.begin(BAUDRATE, SERIAL_8N1, RX_PIN, TX_PIN);
  node.begin(SLAVE_ID, Serial2);

  readCT();
  applyConfigRuntime();

  dataQueue = xQueueCreate(16, sizeof(SensorData));  // ✅ Increased from 1 to 16 for better buffering during MQTT reconnect

  // เก็บ Cookie header สำหรับ session
  const char* headerKeys[] = {"Cookie"};
  server.collectHeaders(headerKeys, 1);

  setupWebRoutes();
  server.begin();
  Serial.println("🌐 WebServer (STA Mode) started");

  // ✅ ESP-MQTT Native: Initialization moved to Task_MQTT (when WiFi is ready)
  // Old PubSubClient code removed

  // Create mutex for Serial output synchronization
  serialMutex = xSemaphoreCreateMutex();

  xTaskCreatePinnedToCore(Task_RS485,"RS485",10240,NULL,2,NULL,0);
  xTaskCreatePinnedToCore(Task_MQTT, "MQTT", 8192, NULL,1,NULL,1);

  Serial.printf("🚀 AI205 Smart Alert System v%s Ready @240MHz / %d bps\n", FW_VERSION, BAUDRATE);
  Serial.printf("⚙️  WDT Timeout: %d ms\n", WDT_TIMEOUT_MS);
  Serial.printf("🚨 Alert Cooldown: %d seconds\n", ALERT_COOLDOWN_MS/1000);
  Serial.println("📋 Alert Thresholds (runtime):");
  Serial.printf("   • Overvoltage:  > %.1f V\n", overvoltageLimit);
  Serial.printf("   • Undervoltage: < %.1f V\n", undervoltageLimit);
  Serial.printf("   • Overcurrent:  > %.1f A\n", overcurrentLimit);
  Serial.printf("   • Low PF:       < %.2f\n",  lowPfLimit);
  Serial.printf("   • CT Ratio:     %.2f\n", CT_RATIO);
  Serial.printf("   • PT Ratio:     %.2f\n", PT_RATIO);
  Serial.printf("   • FW Server:    %s:%d\n", conf.fwHost.c_str(), conf.fwPort);
}

// ----------------- OLED helper -----------------
void oledPrint(const char* title, float value, const char* unit) {
  char buf[32];
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0,0);
  display.println(title);

  if (unit && strlen(unit) > 0) {
    snprintf(buf, sizeof(buf), "%.3f %s", value, unit);
  } else {
    snprintf(buf, sizeof(buf), "%.3f", value);
  }

  display.setTextSize(2);
  display.setCursor(0, 12);
  display.println(buf);
  display.display();
}

// ----------------- OLED render -----------------
void renderOLEDPage() {
  // Use oledPrint for numeric pages where appropriate
  switch (oledPage) {
    case 0: {
      display.clearDisplay();
      display.setTextSize(1);
      display.setCursor(0,0);
      display.setTextColor(SSD1306_WHITE);
      char s1[32], s2[32];
      snprintf(s1, sizeof(s1), "WiFi: %s", wifiConnected() ? "OK" : "NO");
      snprintf(s2, sizeof(s2), "MQTT: %s", mqttConnected ? "OK" : "NO");  // ✅ ESP-MQTT Native
      display.println(s1);
      display.println(s2);
      display.display();
      break;
    }

    case 1:
      oledPrint("V1", lastData.v1, "V");
      break;
    case 2:
      oledPrint("I1", lastData.i1, "A");
      break;
    case 3:
      oledPrint("kW1", lastData.kW1, "");
      break;
    case 4:
      oledPrint("V2", lastData.v2, "V");
      break;
    case 5:
      oledPrint("I2", lastData.i2, "A");
      break;
    case 6:
      oledPrint("kW2", lastData.kW2, "");
      break;
    case 7:
      oledPrint("V3", lastData.v3, "V");
      break;
    case 8:
      oledPrint("I3", lastData.i3, "A");
      break;
    case 9:
      oledPrint("kW3", lastData.kW3, "");
      break;
    case 10:
      oledPrint("Hz", lastData.Hz, "");
      break;
    case 11:
      oledPrint("kWsum", lastData.kWsum, "kW");
      break;
    case 12:
      oledPrint("PFsys", lastData.PFsys, "");
      break;
    case 13:
      // Total kWh = Ep_total / 10 (meter stores in 0.1 kWh units)
      oledPrint("Total kWh", (float)lastData.Ep_total / 10.0f, "kWh");
      break;
    default:
      oledPage = 0;
      break;
  }
}

void setup() {
  initSystem();
}

void loop(){
  checkWiFiFail();
  autoCloseAP();

  if (!apMode) {
    server.handleClient();
  }
  if (millis() - lastOledTick > 2000) {   // 2 วินาทีต่อหน้า
    lastOledTick = millis();
    oledPage++;
    if (oledPage > 13) oledPage = 0;  // Updated to include Total kWh page
    renderOLEDPage();
  }

  delay(20);
}
