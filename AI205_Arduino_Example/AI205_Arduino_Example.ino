/*
  AI205 Energy Monitor - MQTT Publisher
  ESP32/Arduino code for publishing energy data to the specified MQTT broker
  
  Hardware Requirements:
  - ESP32 development board
  - Energy monitoring sensors (voltage, current)
  - WiFi connection
  
  Libraries Required:
  - WiFi
  - PubSubClient
  - ArduinoJson
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT Configuration (AI205 specific)
const char* mqtt_server = "202.29.50.41";
const int   mqtt_port   = 1883;
const char* mqtt_user   = "s6710886217";
const char* mqtt_pass   = "nkey5632";

// MQTT Topics
const char* topic_ai205 = "AI205/data";
const char* topic_alerts = "AI205/alerts";
const char* topic_status = "AI205/status";

// Device Configuration
const char* device_id = "AI205";
const char* device_location = "Energy Lab";

WiFiClient espClient;
PubSubClient client(espClient);

// Data collection interval (milliseconds)
unsigned long lastDataPublish = 0;
unsigned long dataInterval = 5000; // 5 seconds

// Status publish interval
unsigned long lastStatusPublish = 0;
unsigned long statusInterval = 60000; // 1 minute

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("🔌 AI205 Energy Monitor Starting...");
  
  // Initialize WiFi
  setupWiFi();
  
  // Initialize MQTT
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(onMqttMessage);
  
  Serial.println("✅ AI205 Energy Monitor Ready");
}

void loop() {
  // Ensure MQTT connection
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();
  
  unsigned long now = millis();
  
  // Publish energy data
  if (now - lastDataPublish > dataInterval) {
    publishEnergyData();
    lastDataPublish = now;
  }
  
  // Publish status
  if (now - lastStatusPublish > statusInterval) {
    publishStatus();
    lastStatusPublish = now;
  }
  
  delay(100);
}

void setupWiFi() {
  delay(10);
  Serial.printf("📶 Connecting to WiFi: %s\n", ssid);
  
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.printf("✅ WiFi Connected! IP: %s\n", WiFi.localIP().toString().c_str());
}

void reconnectMQTT() {
  while (!client.connected()) {
    Serial.printf("📡 Connecting to MQTT: %s:%d\n", mqtt_server, mqtt_port);
    
    // Create unique client ID
    String clientId = "AI205_ESP32_";
    clientId += String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("✅ MQTT Connected!");
      
      // Subscribe to control topics
      client.subscribe("AI205/control/+");
      
      // Publish connection status
      publishStatus();
      
    } else {
      Serial.printf("❌ MQTT Connection failed, rc=%d. Retry in 5 seconds...\n", client.state());
      delay(5000);
    }
  }
}

void publishEnergyData() {
  // Create JSON document
  StaticJsonDocument<512> doc;
  
  // Add timestamp
  doc["timestamp"] = getISOTimestamp();
  doc["device_id"] = device_id;
  doc["location"] = device_location;
  
  // Voltage measurements (simulated - replace with actual sensor readings)
  doc["f1"] = readVoltagePhase1();  // Phase 1 voltage
  doc["f2"] = readVoltagePhase2();  // Phase 2 voltage
  doc["f3"] = readVoltagePhase3();  // Phase 3 voltage
  
  // Current measurements (simulated - replace with actual sensor readings)
  doc["i1"] = readCurrentPhase1();  // Phase 1 current
  doc["i2"] = readCurrentPhase2();  // Phase 2 current
  doc["i3"] = readCurrentPhase3();  // Phase 3 current
  
  // Power Factor measurements (simulated - replace with actual calculations)
  doc["pf1"] = readPowerFactorPhase1();  // Phase 1 power factor
  doc["pf2"] = readPowerFactorPhase2();  // Phase 2 power factor
  doc["pf3"] = readPowerFactorPhase3();  // Phase 3 power factor
  
  // Additional environmental data
  doc["temperature"] = readTemperature();
  doc["humidity"] = readHumidity();
  
  // Energy accumulated (optional)
  doc["daily"] = getDailyEnergy();
  doc["monthly"] = getMonthlyEnergy();
  doc["yearly"] = getYearlyEnergy();
  
  // Convert to string and publish
  String jsonString;
  serializeJson(doc, jsonString);
  
  if (client.publish(topic_ai205, jsonString.c_str())) {
    Serial.println("📤 Energy data published");
    Serial.printf("   V: F1=%.1fV F2=%.1fV F3=%.1fV\n", 
                  doc["f1"].as<float>(), doc["f2"].as<float>(), doc["f3"].as<float>());
    Serial.printf("   I: I1=%.1fA I2=%.1fA I3=%.1fA\n", 
                  doc["i1"].as<float>(), doc["i2"].as<float>(), doc["i3"].as<float>());
  } else {
    Serial.println("❌ Failed to publish energy data");
  }
}

void publishStatus() {
  StaticJsonDocument<256> doc;
  
  doc["timestamp"] = getISOTimestamp();
  doc["device_id"] = device_id;
  doc["status"] = "online";
  doc["uptime"] = millis();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["version"] = "1.0.0";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  if (client.publish(topic_status, jsonString.c_str())) {
    Serial.println("📊 Status published");
  }
}

void publishAlert(String type, String title, String message) {
  StaticJsonDocument<256> doc;
  
  doc["timestamp"] = getISOTimestamp();
  doc["device"] = device_id;
  doc["type"] = type;
  doc["title"] = title;
  doc["message"] = message;
  doc["severity"] = (type == "error") ? "high" : (type == "warning") ? "medium" : "low";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  if (client.publish(topic_alerts, jsonString.c_str())) {
    Serial.printf("🚨 Alert published: %s\n", title.c_str());
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String message;
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.printf("📨 MQTT Message [%s]: %s\n", topic, message.c_str());
  
  // Handle control commands
  if (String(topic).startsWith("AI205/control/")) {
    handleControlCommand(String(topic), message);
  }
}

void handleControlCommand(String topic, String message) {
  // Extract command from topic (AI205/control/COMMAND)
  String command = topic.substring(topic.lastIndexOf('/') + 1);
  
  Serial.printf("🎛️ Control Command: %s = %s\n", command.c_str(), message.c_str());
  
  if (command == "reset") {
    Serial.println("🔄 Resetting device...");
    ESP.restart();
  } else if (command == "interval") {
    int newInterval = message.toInt();
    if (newInterval >= 1000 && newInterval <= 60000) {
      dataInterval = newInterval;
      Serial.printf("⏱️ Data interval set to %d ms\n", dataInterval);
    }
  }
}

// Sensor reading functions (replace with actual sensor code)
float readVoltagePhase1() {
  return 230.0 + random(-20, 21) / 10.0; // 228-232V
}

float readVoltagePhase2() {
  return 230.0 + random(-20, 21) / 10.0;
}

float readVoltagePhase3() {
  return 230.0 + random(-20, 21) / 10.0;
}

float readCurrentPhase1() {
  return 15.0 + random(-20, 21) / 10.0; // 13-17A
}

float readCurrentPhase2() {
  return 15.0 + random(-20, 21) / 10.0;
}

float readCurrentPhase3() {
  return 15.0 + random(-20, 21) / 10.0;
}

float readPowerFactorPhase1() {
  return 0.90 + random(0, 11) / 100.0; // 0.90-1.00
}

float readPowerFactorPhase2() {
  return 0.90 + random(0, 11) / 100.0;
}

float readPowerFactorPhase3() {
  return 0.90 + random(0, 11) / 100.0;
}

float readTemperature() {
  return 25.0 + random(-50, 101) / 10.0; // 20-35°C
}

float readHumidity() {
  return 50.0 + random(0, 201) / 10.0; // 50-70%
}

float getDailyEnergy() {
  return 125.6; // kWh
}

float getMonthlyEnergy() {
  return 3768.4; // kWh
}

float getYearlyEnergy() {
  return 45220.8; // kWh
}

String getISOTimestamp() {
  // In a real implementation, you would use NTP to get actual time
  // For now, return millis() as timestamp
  return String(millis());
}