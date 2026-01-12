// =========================================
// SMART Energy - InfluxDB Aggregation Tasks
// =========================================
// ทุก bucket aggregate จาก raw โดยตรง
// ใช้ difference(nonNegative: true) เพื่อกันค่าติดลบ
// 
// AI205_raw ─┬─> AI205_hourly  (Hourly)
//            ├─> AI205_daily   (Daily)
//            ├─> AI205_weekly  (Weekly)
//            ├─> AI205_monthly (Monthly)
//            └─> AI205_yearly  (Yearly/Billing)
// =========================================

// วิธีใช้งาน:
// 1. ไปที่ InfluxDB UI → Data → Buckets → สร้าง buckets ทั้ง 5 ตัว
// 2. ไปที่ InfluxDB UI → Data → Tasks → Create Task
// 3. Copy Flux Script ไปวาง

// =========================================
// TASK 1: Hourly Aggregation (ทุก 1 ชั่วโมง)
// =========================================
// Name: aggregate_hourly
// Every: 1h
// Offset: 5m (รอให้ข้อมูลครบก่อน)

/*
option task = {name: "aggregate_hourly", every: 1h, offset: 5m}

// Aggregate power metrics (mean)
from(bucket: "AI205_raw")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active" or r._field == "power_factor" or r._field == "frequency")
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_hourly", org: "Ennergy")

// Aggregate energy (difference - nonNegative to handle meter reset)
from(bucket: "AI205_raw")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_import" or r._field == "energy_total")
  |> aggregateWindow(every: 1h, fn: last, createEmpty: false)
  |> difference(nonNegative: true)
  |> to(bucket: "AI205_hourly", org: "Ennergy")

// Aggregate per-phase data
from(bucket: "AI205_raw")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_per_phase")
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_hourly", org: "Ennergy")
*/


// =========================================
// TASK 2: Daily Aggregation (ทุกวัน)
// =========================================
// Name: aggregate_daily
// Every: 1d
// Offset: 10m

/*
option task = {name: "aggregate_daily", every: 1d, offset: 10m}

// Aggregate power metrics from RAW (not from hourly!)
from(bucket: "AI205_raw")
  |> range(start: -1d)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active" or r._field == "power_factor" or r._field == "frequency")
  |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_daily", org: "Ennergy")

// Daily energy consumption (difference with nonNegative)
from(bucket: "AI205_raw")
  |> range(start: -1d)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_import" or r._field == "energy_total")
  |> aggregateWindow(every: 1d, fn: last, createEmpty: false)
  |> difference(nonNegative: true)
  |> to(bucket: "AI205_daily", org: "Ennergy")

// Per-phase daily aggregation
from(bucket: "AI205_raw")
  |> range(start: -1d)
  |> filter(fn: (r) => r._measurement == "energy_per_phase")
  |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_daily", org: "Ennergy")
*/


// =========================================
// TASK 3: Weekly Aggregation (ทุกสัปดาห์)
// =========================================
// Name: aggregate_weekly
// Every: 1w
// Offset: 15m

/*
option task = {name: "aggregate_weekly", every: 1w, offset: 15m}

// Weekly power metrics from RAW
from(bucket: "AI205_raw")
  |> range(start: -1w)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active" or r._field == "power_factor" or r._field == "frequency")
  |> aggregateWindow(every: 1w, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_weekly", org: "Ennergy")

// Weekly energy consumption
from(bucket: "AI205_raw")
  |> range(start: -1w)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_import" or r._field == "energy_total")
  |> aggregateWindow(every: 1w, fn: last, createEmpty: false)
  |> difference(nonNegative: true)
  |> to(bucket: "AI205_weekly", org: "Ennergy")

// Per-phase weekly aggregation
from(bucket: "AI205_raw")
  |> range(start: -1w)
  |> filter(fn: (r) => r._measurement == "energy_per_phase")
  |> aggregateWindow(every: 1w, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_weekly", org: "Ennergy")
*/


// =========================================
// TASK 4: Monthly Aggregation (ทุกเดือน)
// =========================================
// Name: aggregate_monthly
// Every: 1mo
// Offset: 30m

/*
option task = {name: "aggregate_monthly", every: 1mo, offset: 30m}

// Monthly power metrics from RAW
from(bucket: "AI205_raw")
  |> range(start: -1mo)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active" or r._field == "power_factor" or r._field == "frequency")
  |> aggregateWindow(every: 1mo, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_monthly", org: "Ennergy")

// Monthly energy consumption
from(bucket: "AI205_raw")
  |> range(start: -1mo)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_import" or r._field == "energy_total")
  |> aggregateWindow(every: 1mo, fn: last, createEmpty: false)
  |> difference(nonNegative: true)
  |> to(bucket: "AI205_monthly", org: "Ennergy")

// Per-phase monthly aggregation
from(bucket: "AI205_raw")
  |> range(start: -1mo)
  |> filter(fn: (r) => r._measurement == "energy_per_phase")
  |> aggregateWindow(every: 1mo, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_monthly", org: "Ennergy")
*/


// =========================================
// TASK 5: Yearly/Billing Aggregation (ทุกปี)
// =========================================
// Name: aggregate_yearly
// Every: 1y
// Offset: 1h

/*
option task = {name: "aggregate_yearly", every: 1y, offset: 1h}

// Yearly power metrics from RAW
from(bucket: "AI205_raw")
  |> range(start: -1y)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active" or r._field == "power_factor" or r._field == "frequency")
  |> aggregateWindow(every: 1y, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_yearly", org: "Ennergy")

// Yearly energy consumption
from(bucket: "AI205_raw")
  |> range(start: -1y)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_import" or r._field == "energy_total")
  |> aggregateWindow(every: 1y, fn: last, createEmpty: false)
  |> difference(nonNegative: true)
  |> to(bucket: "AI205_yearly", org: "Ennergy")
*/


// =========================================
// BUCKET RETENTION POLICY (ตั้งค่าใน InfluxDB UI)
// =========================================
// Bucket: AI205_raw     → Retention: 30 days
// Bucket: AI205_hourly  → Retention: 90 days
// Bucket: AI205_daily   → Retention: 365 days
// Bucket: AI205_weekly  → Retention: 2 years
// Bucket: AI205_monthly → Retention: 5 years
// Bucket: AI205_yearly  → Retention: Forever

module.exports = {
  // Export for documentation purposes
  buckets: {
    raw: 'AI205_raw',
    hourly: 'AI205_hourly',
    daily: 'AI205_daily',
    weekly: 'AI205_weekly',
    monthly: 'AI205_monthly',
    yearly: 'AI205_yearly'
  },
  
  // Task schedule reference
  tasks: [
    { name: 'aggregate_hourly', every: '1h', offset: '5m', source: 'raw', target: 'hourly' },
    { name: 'aggregate_daily', every: '1d', offset: '10m', source: 'raw', target: 'daily' },
    { name: 'aggregate_weekly', every: '1w', offset: '15m', source: 'raw', target: 'weekly' },
    { name: 'aggregate_monthly', every: '1mo', offset: '30m', source: 'raw', target: 'monthly' },
    { name: 'aggregate_yearly', every: '1y', offset: '1h', source: 'raw', target: 'yearly' }
  ]
};
