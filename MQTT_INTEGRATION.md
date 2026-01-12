# MQTT Integration Guide

## การเชื่อมต่อ MQTT กับ Energy Dashboard

Dashboard นี้รองรับการเชื่อมต่อกับ MQTT Broker เพื่อรับข้อมูลพลังงานแบบ Real-time

## 🔧 วิธีการตั้งค่า MQTT Broker

### 1. ติดตั้ง Mosquitto MQTT Broker (Windows)

```bash
# Download และติดตั้ง Mosquitto จาก https://mosquitto.org/download/
# หรือใช้ Chocolatey
choco install mosquitto

# เริ่มต้น Mosquitto service
net start mosquitto
```

### 2. กำหนดค่า WebSocket Support

แก้ไขไฟล์ `mosquitto.conf`:

```conf
# WebSocket listener for browser clients
listener 9001
protocol websockets
allow_anonymous true

# Standard MQTT listener  
listener 1883
allow_anonymous true
```

### 3. เริ่มต้น Mosquitto

```bash
mosquitto -c mosquitto.conf -v
```

## 📡 MQTT Topics Structure

Dashboard จะ subscribe ไปยัง topics ต่อไปนี้:

| Topic | Description | Data Format |
|-------|-------------|-------------|
| `energy/voltage` | ข้อมูลแรงดันไฟฟ้า | `{f1: 230.5, f2: 229.8, f3: 231.2, timestamp: "..."}` |
| `energy/current` | ข้อมูลกระแสไฟฟ้า | `{i1: 15.2, i2: 14.8, i3: 15.6, timestamp: "..."}` |
| `energy/powerfactor` | ข้อมูล Power Factor | `{pf1: 0.92, pf2: 0.89, pf3: 0.94, timestamp: "..."}` |
| `energy/accumulated` | ข้อมูลพลังงานสะสม | `{daily: 125.6, monthly: 3768.4, yearly: 45220.8, timestamp: "..."}` |
| `energy/alerts` | แจ้งเตือนระบบ | `{type: "warning", title: "...", message: "...", timestamp: "..."}` |
| `energy/control/*` | ส่งคำสั่งควบคุม | `{command: "reset", value: true, timestamp: "..."}` |

## 🚀 วิธีการใช้งาน

### 1. เปิด Dashboard

```bash
npm start
```

### 2. กำหนดค่าการเชื่อมต่อ

ใน Dashboard จะมี MQTT Connection Panel:
- **Broker Host**: `localhost` (หรือ IP Address ของ MQTT Broker)
- **Port**: `9001` (WebSocket port)
- **Username/Password**: ว่างไว้ถ้าไม่มีการตั้ค่า authentication
- **Use SSL**: เลือกถ้าใช้ WSS (Secure WebSocket)

### 3. กดปุ่ม "Connect"

เมื่อเชื่อมต่อสำเร็จ:
- Status จะเป็น "Connected" สีเขียว
- Energy blocks จะแสดงข้อมูลจาก MQTT แทนค่า mock data
- แสดงเวลา "Last Update" เมื่อมีข้อมูลใหม่

## 🧪 ทดสอบด้วย Mock Data

### ติดตั้ง MQTT.js สำหรับ Node.js

```bash
npm install mqtt
```

### รัน MQTT Simulator

```bash
node mqtt-simulator.js
```

Simulator จะส่งข้อมูลทดสอบไปยัง MQTT Broker:
- Voltage data ทุก 2 วินาที
- Current data ทุก 3 วินาที  
- Power Factor data ทุก 5 วินาที
- Energy data ทุก 10 วินาที
- Alerts แบบสุ่มทุก 15 วินาที

## 🔌 การเชื่อมต่อกับอุปกรณ์จริง

### ตัวอย่าง Python Script สำหรับส่งข้อมูลจริง

```python
import paho.mqtt.client as mqtt
import json
import time
from datetime import datetime

# MQTT Configuration
BROKER = "localhost"
PORT = 1883
CLIENT_ID = "energy_meter_001"

client = mqtt.Client(CLIENT_ID)
client.connect(BROKER, PORT, 60)

# ส่งข้อมูลแรงดัน
voltage_data = {
    "f1": 230.5,
    "f2": 229.8, 
    "f3": 231.2,
    "timestamp": datetime.now().isoformat()
}

client.publish("energy/voltage", json.dumps(voltage_data))
```

### ตัวอย่าง Arduino/ESP32 Code

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI";
const char* password = "YOUR_PASSWORD";
const char* mqtt_server = "YOUR_MQTT_BROKER_IP";

WiFiClient espClient;
PubSubClient client(espClient);

void publishVoltageData() {
  StaticJsonDocument<200> doc;
  doc["f1"] = 230.5;
  doc["f2"] = 229.8;
  doc["f3"] = 231.2;
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  
  client.publish("energy/voltage", output.c_str());
}
```

## 🔧 การแก้ปัญหา

### ปัญหาการเชื่อมต่อ

1. **Connection Failed**
   - ตรวจสอบว่า MQTT Broker ทำงานอยู่
   - ตรวจสอบ port และ host address
   - ตรวจสอบ firewall settings

2. **WebSocket Error** 
   - ตรวจสอบว่า Mosquitto รองรับ WebSocket (port 9001)
   - ตรวจสอบ browser console สำหรับ error messages

3. **No Data Received**
   - ตรวจสอบว่ามีการ publish ข้อมูลไปยัง topics ที่ถูกต้อง
   - ตรวจสอบ JSON format ของข้อมูล
   - ใช้ MQTT client tools เช่น MQTT Explorer เพื่อ debug

### เครื่องมือ Debug

- **MQTT Explorer**: GUI tool สำหรับ browse และ debug MQTT messages
- **Mosquitto CLI**: `mosquitto_pub` และ `mosquitto_sub` สำหรับ command line testing
- **Browser Developer Tools**: ดู WebSocket connections และ console logs

## 📊 ข้อมูล Format

ข้อมูลทั้งหมดต้องอยู่ในรูปแบบ JSON:

```json
{
  "f1": 230.5,
  "f2": 229.8,
  "f3": 231.2,
  "timestamp": "2025-10-01T10:30:00.000Z"
}
```

- **Numbers**: ใช้ floating point สำหรับความแม่นยำ
- **Timestamp**: ISO 8601 format (จะเพิ่มอัตโนมัติถ้าไม่มี)
- **Required Fields**: ขึ้นอยู่กับ topic แต่ละแบบ

## 🔐 Security

สำหรับ Production Environment:

1. **Enable Authentication**
   ```conf
   allow_anonymous false
   password_file /etc/mosquitto/passwd
   ```

2. **Use TLS/SSL**
   ```conf
   listener 8883
   protocol mqtt
   cafile /etc/ssl/certs/ca.crt
   certfile /etc/ssl/certs/server.crt  
   keyfile /etc/ssl/private/server.key
   ```

3. **Configure ACL**
   ```conf
   acl_file /etc/mosquitto/acl
   ```

## 📚 เพิ่มเติม

- [MQTT.js Documentation](https://github.com/mqttjs/MQTT.js)
- [Mosquitto MQTT Broker](https://mosquitto.org/)
- [MQTT Protocol Specification](https://mqtt.org/)