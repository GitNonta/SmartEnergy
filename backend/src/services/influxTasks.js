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

// Task 1: Hourly Aggregation
/*
import "timezone"
option task = {name: "aggregate_hourly", every: 1h, offset: 5m}
option location = timezone.location(name: "Asia/Bangkok")

// Aggregate power metrics (mean)
from(bucket: "AI205_raw")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active_kw" or r._field == "power_factor" or r._field == "frequency")
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_hourly", org: "Ennergy")

// Aggregate energy using Integral (Power -> Energy)
from(bucket: "AI205_raw")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active_kw")
  |> integral(unit: 1h)
  |> map(fn: (r) => ({r with _field: "energy_total", _measurement: "energy_3phase"}))
  |> to(bucket: "AI205_hourly", org: "Ennergy")
*/

// Task 2: Daily Aggregation
/*
import "timezone"
option task = {name: "aggregate_daily", every: 1d, offset: 10m}
option location = timezone.location(name: "Asia/Bangkok")

from(bucket: "AI205_hourly")
  |> range(start: -1d)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active_kw")
  |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_daily", org: "Ennergy")

from(bucket: "AI205_hourly")
  |> range(start: -1d)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_total")
  |> sum()
  |> to(bucket: "AI205_daily", org: "Ennergy")
*/

// Task 3: Weekly Aggregation
/*
option task = {name: "aggregate_weekly", every: 1w, offset: 15m}

from(bucket: "AI205_daily")
  |> range(start: -1w)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active_kw")
  |> aggregateWindow(every: 1w, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_weekly", org: "Ennergy")

from(bucket: "AI205_daily")
  |> range(start: -1w)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_total")
  |> sum()
  |> to(bucket: "AI205_weekly", org: "Ennergy")
*/

// Task 4: Monthly Aggregation
/*
option task = {name: "aggregate_monthly", every: 1mo, offset: 30m}

from(bucket: "AI205_daily")
  |> range(start: -1mo)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active_kw")
  |> aggregateWindow(every: 1mo, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_monthly", org: "Ennergy")

from(bucket: "AI205_daily")
  |> range(start: -1mo)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_total")
  |> sum()
  |> to(bucket: "AI205_monthly", org: "Ennergy")
*/

// Task 5: Yearly Aggregation
/*
option task = {name: "aggregate_yearly", every: 1y, offset: 1h}

from(bucket: "AI205_monthly")
  |> range(start: -1y)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active_kw")
  |> aggregateWindow(every: 1y, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_yearly", org: "Ennergy")

from(bucket: "AI205_monthly")
  |> range(start: -1y)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "energy_total")
  |> sum()
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
