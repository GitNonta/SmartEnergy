Backend System Test Specification
Project: Smart Energy Monitor Version: 2.0 (Post-Fix Implementation) Date: January 22, 2026 Scope: Ingestor Service, API Server, Database Integrity, and Alerting System.

🛠 Prerequisites & Tools
Before executing the tests, ensure the following tools are ready:

MQTT Client: (e.g., MQTT Explorer or simple Node.js script) to simulate ESP32 data.

API Client: (e.g., Postman, cURL, or Thunder Client).

Database Access:

InfluxDB UI (port 8086).

MySQL Client (e.g., Workbench, DBeaver).

System Access: Terminal access to the server running PM2.

1. Data Ingestion & Parsing Tests (Ingestor Service)
Objective: Verify that the ingestor.js service correctly handles incoming MQTT data, including malformed packets.

Test Case 1.1: Standard Data Ingestion
Step 1: Publish a valid JSON payload to topic AI205/data.

JSON
{
  "deviceId": "AI205",
  "voltage": 220.5,
  "current": 10.2,
  "power_active": 2249.1,
  "energy_total": 1500.5,
  "timestamp": "2026-01-22T10:00:00Z"
}
Step 2: Check smart-ingestor logs (pm2 logs smart-ingestor).

Step 3: Query InfluxDB AI205_raw bucket.

Pass Criteria: Log shows "Data written"; InfluxDB contains the exact record.

Test Case 1.2: Malformed JSON Resilience (Critical)
Step 1: Publish a JSON payload with a trailing comma (common ESP32 issue) to AI205/data.

JSON
{ "voltage": 220, "current": 5, }
Step 2: Observe smart-ingestor logs.

Pass Criteria: Service must NOT crash. It should sanitize the string and parse it successfully.

2. API & Logic Tests (Server Service)
Objective: Verify that the API returns correct data and the recent "Route Conflict" and "Aggregation" fixes are working.

Test Case 2.1: Route Conflict Verification (The Fix)
Context: Previously, server.js overshadowed energyRoutes.js.

Step 1: Send a request to GET /api/energy/daily-consumption.

Step 2: Check the console logs of smart-api.

Pass Criteria: You should see logs indicating the request was handled by the modular route (e.g., Fetch daily consumption...), verifying the hardcoded route in server.js was removed.

Test Case 2.2: Real-time Hybrid Data (The Fix)
Context: Validation of the "Data Lag" fix.

Step 1: Ensure smart-ingestor is receiving data for the current hour.

Step 2: Request GET /api/energy/daily-consumption.

Step 3: Inspect the JSON response, specifically the last array element.

Pass Criteria: The last element must represent the current hour (e.g., if now is 14:15, the entry 14:00 must exist) and have the flag quality: 'realtime_hybrid' or similar.

Test Case 2.3: Cost Calculation Consistency
Context: Validation of the "Financial Mismatch" fix.

Step 1: Request Dashboard Summary: GET /api/summary/dashboard. Note the totalCost.

Step 2: Request Cost History: GET /api/energy/cost-history. Sum up the cost values.

Step 3: Compare the two values.

Pass Criteria: The values must be identical (or within a negligible rounding margin of 0.01 THB), proving both endpoints use the same Progressive Rate logic.

3. Database & Timezone Tests
Objective: Verify InfluxDB tasks and Timezone configurations.

Test Case 3.1: Timezone Cutoff
Context: Check if the system respects Asia/Bangkok.

Step 1: Check the AI205_daily bucket in InfluxDB.

Step 2: Look at the timestamps of the daily records.

Pass Criteria: The daily record must align with 00:00 Local Time. If it aligns with 07:00 Local Time (00:00 UTC), the Timezone fix in Flux scripts is missing.

4. Alerting System Tests
Objective: Verify the entire alert pipeline (MQTT -> Ingestor -> Line).

Test Case 4.1: Threshold Trigger
Step 1: Configure a low threshold for Power (e.g., 10kW) in .env or hardcoded config.

Step 2: Simulate MQTT data with Power = 50kW to AI205/data.

Step 3: Check smart-ingestor logs for "Alert generated".

Step 4: Check the target LINE account.

Pass Criteria: A LINE Flex Message must be received within 5-10 seconds.

Test Case 4.2: Cooldown Logic
Step 1: Immediately after Test 4.1, send another high power packet (50kW).

Pass Criteria: The system should NOT send a second LINE message immediately (due to the 5-minute cooldown logic).

5. Authentication & Security Tests
Objective: Verify user access control and protection mechanisms.

Test Case 5.1: Rate Limiting (Brute Force Protection)
Step 1: Attempt to login (POST /api/auth/login) with a wrong password 5 times consecutively.

Step 2: Attempt the 6th time.

Pass Criteria: The API must return HTTP Status 429 (Too Many Requests).

Test Case 5.2: Admin Authorization
Step 1: Login as a standard user role.

Step 2: Try to access an admin-only endpoint (e.g., DELETE /api/users/1).

Pass Criteria: The API must return HTTP Status 403 (Forbidden).

6. Resilience & Recovery Tests
Objective: Ensure the system recovers from failures.

Test Case 6.1: Service Restart
Step 1: Send continuous MQTT data stream.

Step 2: Execute pm2 restart smart-api.

Step 3: While API is restarting, check if smart-ingestor is still writing to InfluxDB.

Pass Criteria: smart-ingestor must continue working (writing data) independently even if the API server is down/restarting.

📝 Test Execution Log Template
ID	Test Case	Status	Tester	Date	Notes/Bugs Found
1.1	Normal Ingestion	[ ]			
1.2	Malformed JSON	[ ]			
2.1	Route Fix	[ ]			
2.2	Hybrid Data	[ ]			
2.3	Cost Consistency	[ ]			
3.1	Timezone Check	[ ]			
4.1	Alert Trigger	[ ]			
5.1	Rate Limit	[ ]			
End of Specification