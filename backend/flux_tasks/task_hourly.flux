import "timezone"

option location = timezone.location(name: "Asia/Bangkok")
option task = {name: "aggregate_hourly", every: 1h, offset: 5m}

// 1. ===== Total 3-Phase Metrics (Mean) =====
from(bucket: "AI205_raw")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_3phase")
  |> filter(fn: (r) => r._field == "power_active" or r._field == "power_factor" or r._field == "frequency")
  |> group(columns: ["_measurement", "_field", "device_id"])
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_hourly", org: "Ennergy")

// 2. ===== Total Energy Consumption (Power × Time) =====
// ✅ NEW: ใช้ integral(power_active_kw) แทน energy_total เพราะ ESP32 ส่ง energy_total ผิด (×10)
// สูตร: Energy (kWh) = ∫ Power(kW) dt
from(bucket: "AI205_raw")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_3phase" and r._field == "power_active_kw")
  |> group(columns: ["device_id"])
  |> integral(unit: 1h)
  |> map(fn: (r) => ({
      _time: r._stop,
      _measurement: "energy_3phase",
      _field: "energy_consumed",
      device_id: r.device_id,
      _value: r._value,
      quality: if r._value < 0.0 then "invalid" else "measured",
      calculation_method: "power_integral"
  }))
  |> to(bucket: "AI205_hourly", org: "Ennergy")

// 3. ===== Per-Phase Metrics =====
from(bucket: "AI205_raw")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "energy_per_phase")
  |> filter(fn: (r) => r._field == "voltage" or r._field == "current" or r._field == "power_active")
  |> group(columns: ["_measurement", "_field", "device_id", "phase"]) 
  |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
  |> to(bucket: "AI205_hourly", org: "Ennergy")