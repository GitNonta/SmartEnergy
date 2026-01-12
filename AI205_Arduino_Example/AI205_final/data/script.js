// ===================== Helper =====================
async function fetchStatus() {
  const res = await fetch("/api/status2");
  if (!res.ok) throw new Error("status2 failed: " + res.status);
  return res.json();
}

function setActiveNav() {
  const page = document.body.dataset.page;
  const links = document.querySelectorAll(".nav-links a");
  links.forEach((a) => {
    a.classList.remove("active");
    const href = a.getAttribute("href") || "";
    if (page && href.includes("/" + page)) {
      a.classList.add("active");
    }
  });
}

function showMessage(el, msg, ok) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("ok", "error");
  el.classList.add(ok ? "ok" : "error");
}

function formatFixed(v, digits) {
  if (v === undefined || v === null || isNaN(v)) return "—";
  return Number(v).toFixed(digits);
}

// badge ที่เมนู Update แสดง “NEW” ถ้ามี fw_update_available = 1
async function initUpdateIndicator() {
  const badge = document.getElementById("nav-update-badge");
  if (!badge) return;

  try {
    const s = await fetchStatus();
    if (s.fw_update_available) {
      badge.classList.remove("hidden");
      badge.textContent = "NEW";
    } else {
      badge.classList.add("hidden");
    }
  } catch (e) {
    console.warn("updateIndicator error:", e);
  }
}

// ===================== LOGIN PAGE =====================
function initLoginPage() {
  const form = document.getElementById("login-form");
  if (!form) return;

  const msgEl = document.getElementById("login-message");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage(msgEl, "Logging in...", true);
    try {
      const fd = new FormData(form);
      const params = new URLSearchParams(fd);

      const res = await fetch("/api/login", {
        method: "POST",
        body: params,
      });

      if (res.status === 401) {
        showMessage(msgEl, "Invalid username or password", false);
        return;
      }

      if (!res.ok) throw new Error("HTTP " + res.status);

      const j = await res.json();
      if (j.ok) {
        showMessage(msgEl, "Login success, redirecting...", true);
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 500);
      } else {
        showMessage(msgEl, "Login failed", false);
      }
    } catch (err) {
      showMessage(msgEl, "Error: " + err.message, false);
    }
  });
}


// ===================== CONFIG PAGE =====================
function initConfigPage() {
  const wifiForm   = document.getElementById("wifi-form");
  const mqttForm   = document.getElementById("mqtt-form");
  const topicForm  = document.getElementById("topic-form");

  const wifiMsg    = document.getElementById("wifi-message");
  const mqttMsg    = document.getElementById("mqtt-message");
  const topicMsg   = document.getElementById("topic-message");
  const globalMsg  = document.getElementById("config-message");

  const btnWifi    = document.getElementById("btn-wifi-save");
  const btnMqtt    = document.getElementById("btn-mqtt-save");
  const btnTopic   = document.getElementById("btn-topic-save");
  const btnReload  = document.getElementById("btn-config-reload");
  const btnSaveAll = document.getElementById("btn-config-save");

  // ถ้าไม่มีฟอร์มอะไรเลยก็ไม่ต้องทำอะไร
  if (!wifiForm && !mqttForm && !topicForm) return;

  async function fillConfigFromStatus() {
    try {
      const s = await fetchStatus();

      const ssid        = document.getElementById("wifi-ssid");
      const pass        = document.getElementById("wifi-pass");
      const mqttHost    = document.getElementById("mqtt-host");
      const mqttPort    = document.getElementById("mqtt-port");
      const mqttUser    = document.getElementById("mqtt-user");
      const mqttPass    = document.getElementById("mqtt-pass");
      const topicData   = document.getElementById("topic-data");
      const topicStatus = document.getElementById("topic-status");
      const topicAlert  = document.getElementById("topic-alert");

      if (ssid) ssid.value = s.ssid ?? "";
      // ไม่ดึง password กลับมาแสดง ลด risk
      if (pass) pass.value = "";

      if (mqttHost) mqttHost.value = s.mqtt_server ?? "";
      if (mqttPort) mqttPort.value = s.mqtt_port ?? 1883;
      if (mqttUser) mqttUser.value = s.mqtt_user ?? "";
      if (mqttPass) mqttPass.value = "";

      if (topicData)   topicData.value   = s.topicData   ?? "";
      if (topicStatus) topicStatus.value = s.topicStatus ?? "";
      if (topicAlert)  topicAlert.value  = s.topicAlert  ?? "";

      showMessage(globalMsg || wifiMsg || mqttMsg || topicMsg, "Loaded config from device", true);
    } catch (e) {
      showMessage(globalMsg || wifiMsg || mqttMsg || topicMsg, "Failed to load: " + e.message, false);
    }
  }

  async function postSave(params, msgEl) {
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        body: params,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      if (j.status === "saved") {
        showMessage(msgEl, "Saved. Device will reboot...", true);
      } else {
        showMessage(msgEl, "Save failed: " + JSON.stringify(j), false);
      }
    } catch (err) {
      showMessage(msgEl, "Error: " + err.message, false);
    }
  }

  // --- Save เฉพาะ WiFi ---
  if (btnWifi && wifiForm) {
    btnWifi.addEventListener("click", async (e) => {
      e.preventDefault();
      const fd = new FormData(wifiForm);
      const params = new URLSearchParams(fd);
      await postSave(params, wifiMsg || globalMsg);
    });
  }

  // --- Save เฉพาะ MQTT ---
  if (btnMqtt && mqttForm) {
    btnMqtt.addEventListener("click", async (e) => {
      e.preventDefault();
      const fd = new FormData(mqttForm);
      const params = new URLSearchParams(fd);
      await postSave(params, mqttMsg || globalMsg);
    });
  }

  // --- Save เฉพาะ Topics ---
  if (btnTopic && topicForm) {
    btnTopic.addEventListener("click", async (e) => {
      e.preventDefault();
      const fd = new FormData(topicForm);
      const params = new URLSearchParams(fd);
      await postSave(params, topicMsg || globalMsg);
    });
  }

  // --- Save ALL & Reboot ---
  if (btnSaveAll) {
    btnSaveAll.addEventListener("click", async (e) => {
      e.preventDefault();
      const params = new URLSearchParams();

      for (const form of [wifiForm, mqttForm, topicForm]) {
        if (!form) continue;
        const fd = new FormData(form);
        for (const [k, v] of fd.entries()) {
          if (v !== "") {
            params.set(k, v);
          }
        }
      }

      await postSave(params, globalMsg || wifiMsg || mqttMsg || topicMsg);
    });
  }

  // --- Reload จาก device ---
  if (btnReload) {
    btnReload.addEventListener("click", (e) => {
      e.preventDefault();
      fillConfigFromStatus();
    });
  }

  // load ครั้งแรก
  fillConfigFromStatus();
}

// ===================== DASHBOARD PAGE =====================
function initDashboardPage() {
  const wifiBadge    = document.getElementById("wifi-status");
  const wifiSsidEl   = document.getElementById("wifi-ssid");
  const wifiRssiEl   = document.getElementById("wifi-rssi");

  const mqttBadge    = document.getElementById("mqtt-status");
  const mqttServerEl = document.getElementById("mqtt-server");

  const cpuMhzEl     = document.getElementById("cpu-mhz");
  const loopCore0El  = document.getElementById("loop-core0");
  const loopCore1El  = document.getElementById("loop-core1");
  
  // FW Elements (Main + Header Display)
  const fwVersionEl  = document.getElementById("fw-version");
  const fwDisplayEl  = document.getElementById("fw-display");
  const fwLatestEl   = document.getElementById("fw-latest");

  // Popup Elements
  const fwPopup       = document.getElementById("fw-popup");
  const fwPopupVer    = document.getElementById("fw-popup-version");
  const fwPopupNotes  = document.getElementById("fw-popup-notes");
  const fwPopupNotesRow = document.getElementById("fw-popup-notes-row");
  const fwPopupClose  = document.getElementById("fw-popup-close");

  const heapFreeEl   = document.getElementById("heap-free");
  const psramFreeEl  = document.getElementById("psram-free");

  const uptimeEl     = document.getElementById("uptime");

  const v1El = document.getElementById("v1");
  const v2El = document.getElementById("v2");
  const v3El = document.getElementById("v3");

  const i1El = document.getElementById("i1");
  const i2El = document.getElementById("i2");
  const i3El = document.getElementById("i3");

  const pf1El = document.getElementById("pf1");
  const pf2El = document.getElementById("pf2");
  const pf3El = document.getElementById("pf3");

  const barV1 = document.getElementById("bar-v1");
  const barV2 = document.getElementById("bar-v2");
  const barV3 = document.getElementById("bar-v3");

  const pfSysEl = document.getElementById("pf-sys");
  const freqEl  = document.getElementById("freq");
  const kwSumEl = document.getElementById("kw-sum");

  // New: kW per phase
  const kw1El = document.getElementById("kw1");
  const kw2El = document.getElementById("kw2");
  const kw3El = document.getElementById("kw3");

  // New: System diagnostics
  const macAddrEl = document.getElementById("mac-addr");
  const modbusStatusEl = document.getElementById("modbus-status");
  const modbusErrorsEl = document.getElementById("modbus-errors");

  const epImpEl   = document.getElementById("ep-imp");
  const epExpEl   = document.getElementById("ep-exp");
  const epTotalEl = document.getElementById("ep-total");
  const epNetEl   = document.getElementById("ep-net");

  if (!wifiBadge && !v1El) return;

  // Event listener for popup close
  if (fwPopup && fwPopupClose) {
    fwPopupClose.addEventListener("click", () => {
      fwPopup.classList.add("hidden");
    });
  }

  function setPill(el, ok, labelIfAny) {
    if (!el) return;
    el.classList.remove("ok", "bad");
    el.classList.add(ok ? "ok" : "bad");
    if (labelIfAny) el.textContent = labelIfAny;
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  async function updateDashboard() {
    try {
      const s = await fetchStatus();

      // System
      setPill(wifiBadge, !!s.wifi, s.wifi ? "Online" : "Offline");
      setText(wifiSsidEl, "SSID: " + (s.ssid || "—"));
      if (s.rssi !== undefined && s.rssi !== null) {
        setText(wifiRssiEl, "RSSI: " + s.rssi + " dBm");
      } else {
        setText(wifiRssiEl, "RSSI: — dBm");
      }

      setPill(mqttBadge, !!s.mqtt, s.mqtt ? "Connected" : "Disconnected");
      setText(mqttServerEl, "Server: " + (s.mqtt_server || "—"));

      if (s.cpu_freq_mhz !== undefined) {
        setText(cpuMhzEl, "Freq: " + s.cpu_freq_mhz + " MHz");
      }

      if (s.core0_cycle_ms !== undefined) {
        const us0 = s.core0_cycle_ms * 1000;
        setText(loopCore0El, "Core0 Loop: " + us0.toFixed(1) + " µs");
      }
      if (s.core1_cycle_ms !== undefined) {
        const us1 = s.core1_cycle_ms * 1000;
        setText(loopCore1El, "Core1 Loop: " + us1.toFixed(1) + " µs");
      }

      // Firmware Updates
      const verCur = s.fw_current_version || s.fwVersion || "—";
      // 1. In Diagnostics
      if (fwVersionEl) setText(fwVersionEl, "FW: " + verCur);
      // 2. In Status Bar (Top)
      if (fwDisplayEl) setText(fwDisplayEl, "FW: " + verCur);

      if (fwLatestEl) {
        const verNew = s.fw_new_version || s.fw_current_version || "—";
        if (s.fw_update_available) {
          fwLatestEl.textContent = "Latest: " + verNew + " (NEW)";
          fwLatestEl.classList.add("highlight");
        } else {
          fwLatestEl.textContent = "Latest: " + verNew + " (Up to date)";
          fwLatestEl.classList.remove("highlight");
        }
      }

      // Popup หลังอัปเดตสำเร็จ (อ่านจาก fw_last_*)
      if (
        fwPopup &&
        s.fw_last_result &&
        s.fw_last_version &&
        s.fw_last_version === s.fw_current_version
      ) {
        const key = "fwPopupShown_" + s.fw_last_version;
        if (!sessionStorage.getItem(key)) {
          if (fwPopupVer) fwPopupVer.textContent = s.fw_last_version;
          if (fwPopupNotes) fwPopupNotes.textContent = s.fw_last_notes || "-";
          if (fwPopupNotesRow) {
            fwPopupNotesRow.style.display = s.fw_last_notes ? "block" : "none";
          }
          fwPopup.classList.remove("hidden");
          sessionStorage.setItem(key, "1"); // ไม่ให้เด้งซ้ำใน tab เดิม
        }
      }

      if (s.heap_free_kb !== undefined && s.heap_total_kb !== undefined) {
        setText(
          heapFreeEl,
          "Heap: " +
            s.heap_free_kb.toFixed(1) +
            " / " +
            s.heap_total_kb.toFixed(1) +
            " KB"
        );
      }

      if (s.psram_size_kb !== undefined) {
        setText(
          psramFreeEl,
          "PSRAM: " + s.psram_size_kb.toFixed(1) + " KB / —"
        );
      }

      if (s.uptime !== undefined) {
        // Simple formatter
        const sec = s.uptime;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const secLeft = sec % 60;
        const timeStr = `${h}h ${m}m ${secLeft}s`;
        setText(uptimeEl, "Uptime: " + timeStr);
      }

      // Voltage & current
      if (v1El) setText(v1El, formatFixed(s.V1, 1) + " V");
      if (v2El) setText(v2El, formatFixed(s.V2, 1) + " V");
      if (v3El) setText(v3El, formatFixed(s.V3, 1) + " V");

      if (i1El) setText(i1El, formatFixed(s.I1, 3) + " A");
      if (i2El) setText(i2El, formatFixed(s.I2, 3) + " A");
      if (i3El) setText(i3El, formatFixed(s.I3, 3) + " A");

      if (pf1El) setText(pf1El, "PF: " + formatFixed(s.PF1, 3));
      if (pf2El) setText(pf2El, "PF: " + formatFixed(s.PF2, 3));
      if (pf3El) setText(pf3El, "PF: " + formatFixed(s.PF3, 3));

      const maxV = 260;
      if (barV1 && s.V1 !== undefined) {
        barV1.style.width = Math.min(100, (s.V1 / maxV) * 100) + "%";
      }
      if (barV2 && s.V2 !== undefined) {
        barV2.style.width = Math.min(100, (s.V2 / maxV) * 100) + "%";
      }
      if (barV3 && s.V3 !== undefined) {
        barV3.style.width = Math.min(100, (s.V3 / maxV) * 100) + "%";
      }

      if (pfSysEl) pfSysEl.textContent = formatFixed(s.PFsys, 3);
      if (freqEl)  freqEl.textContent  = formatFixed(s.Hz, 2) + " Hz";
      if (kwSumEl) kwSumEl.textContent = formatFixed(s.kWsum, 3) + " kW";

      // kW per phase
      if (kw1El) setText(kw1El, formatFixed(s.kW1, 3));
      if (kw2El) setText(kw2El, formatFixed(s.kW2, 3));
      if (kw3El) setText(kw3El, formatFixed(s.kW3, 3));

      // System diagnostics
      if (macAddrEl) setText(macAddrEl, s.mac || "—");
      if (modbusStatusEl) {
        const isOk = s.modbus === 1;
        modbusStatusEl.textContent = isOk ? "OK" : "Error";
        modbusStatusEl.style.color = isOk ? "var(--primary)" : "var(--danger)";
      }
      if (modbusErrorsEl) setText(modbusErrorsEl, s.modbusErrorCount ?? "0");

      // Energy
      if (epImpEl)   epImpEl.textContent   = s.Ep_imp   ?? "—";
      if (epExpEl)   epExpEl.textContent   = s.Ep_exp   ?? "—";
      if (epTotalEl) epTotalEl.textContent = s.Ep_total ?? "—";
      if (epNetEl)   epNetEl.textContent   = s.Ep_net   ?? "—";
    } catch (e) {
      console.error("updateDashboard failed:", e);
    }
  }

  updateDashboard();
  setInterval(updateDashboard, 1000);
}

// ===================== ADVANCED PAGE =====================
function initAdvancedPage() {
  const advForm      = document.getElementById("advanced-form");
  const msgEl        = document.getElementById("advanced-message");
  const btnRefresh   = document.getElementById("btn-adv-refresh");
  const btnSave      = document.getElementById("btn-adv-save");
  const diagGrid     = document.getElementById("diag-info");

  // Firmware HTTP server (ใหม่)
  const fwHostEl        = document.getElementById("fw-host");
  const fwPortEl        = document.getElementById("fw-port");
  const btnFwServerSave = document.getElementById("btn-fw-server-save");
  const fwServerMsg     = document.getElementById("fw-server-message");

  // Backup
  const btnBackupCfg = document.getElementById("btn-backup-config");
  const btnFwBackup  = document.getElementById("btn-fw-backup");
  const backupMsg    = document.getElementById("backup-message");
  const fwBackupMsg  = document.getElementById("fw-backup-message");

  // MQTT Firmware fields
  const fwCurrentEl = document.getElementById("fw-current");
  const fwLatestEl  = document.getElementById("fw-latest");
  const fwStatusEl  = document.getElementById("fw-status-text");
  const fwNotesEl   = document.getElementById("fw-notes");
  const fwSizeEl    = document.getElementById("fw-size");
  const fwTimeEl    = document.getElementById("fw-time");
  
  const btnFwCheck  = document.getElementById("btn-fw-check");
  const btnFwApply  = document.getElementById("btn-fw-apply");
  const fwMqttMsg   = document.getElementById("fw-mqtt-message");

  if (!advForm && !diagGrid && !fwHostEl) return;

  async function fillAdvancedFromStatus() {
    try {
      const s = await fetchStatus();

      // Threshold / Calibration
      const ctEl = document.getElementById("ct-ratio");
      const ptEl = document.getElementById("pt-ratio");
      const ovEl = document.getElementById("ov-limit");
      const uvEl = document.getElementById("uv-limit");
      const ocEl = document.getElementById("oc-limit");
      const lpEl = document.getElementById("lowpf-limit");

      if (ctEl) ctEl.value = s.ctRatio ?? "";
      if (ptEl) ptEl.value = s.ptRatio ?? "";
      if (ovEl) ovEl.value = s.ovLimit ?? "";
      if (uvEl) uvEl.value = s.uvLimit ?? "";
      if (ocEl) ocEl.value = s.ocLimit ?? "";
      if (lpEl) lpEl.value = s.lowPfLimit ?? "";

      // Firmware HTTP Server
      if (fwHostEl) fwHostEl.value = s.fw_server ?? "";
      if (fwPortEl) fwPortEl.value = s.fw_port ?? 80;

      // Firmware Info (MQTT OTA)
      if (fwCurrentEl) fwCurrentEl.textContent = s.fw_current_version || "—";
      if (fwLatestEl) {
        const verNew = s.fw_new_version || s.fw_current_version || s.fw_current || "—";
        fwLatestEl.textContent = verNew;
      }
      if (fwStatusEl) {
        fwStatusEl.textContent = s.fw_update_available
          ? "New firmware available"
          : "Up to date";
      }
      if (fwNotesEl) fwNotesEl.textContent = s.fw_new_notes || "—";
      if (fwSizeEl)  fwSizeEl.textContent  = s.fw_new_size
        ? (s.fw_new_size + " bytes")
        : "—";
      if (fwTimeEl)  fwTimeEl.textContent  = s.fw_new_timestamp || "—";

      // Diagnostics
      if (diagGrid) {
        diagGrid.innerHTML = "";
        const items = [
          { label: "WiFi", value: s.wifi ? "Connected" : "Disconnected" },
          { label: "SSID", value: s.ssid || "—" },
          { label: "IP", value: s.ip || "—" },
          { label: "RSSI", value: s.rssi !== undefined ? s.rssi + " dBm" : "—" },
          { label: "MQTT", value: s.mqtt ? "Connected" : "Disconnected" },
          { label: "MQTT Server", value: s.mqtt_server || "—" },
          { label: "MQTT Port", value: s.mqtt_port ?? 1883 },

          { label: "FW Server", value: s.fw_server || "—" },
          { label: "FW Port", value: s.fw_port ?? 80 },

          { label: "CPU Freq", value: s.cpu_freq_mhz !== undefined ? s.cpu_freq_mhz + " MHz" : "—" },
          { label: "Heap Free", value: s.heap_free_kb !== undefined ? s.heap_free_kb.toFixed(1) + " KB" : "—" },
          { label: "Heap Min Free", value: s.heap_min_free_kb !== undefined ? s.heap_min_free_kb.toFixed(1) + " KB" : "—" },
          { label: "Heap Total", value: s.heap_total_kb !== undefined ? s.heap_total_kb.toFixed(1) + " KB" : "—" },
          { label: "PSRAM Size", value: s.psram_size_kb !== undefined ? s.psram_size_kb.toFixed(1) + " KB" : "—" },
          { label: "Flash Size", value: s.flash_size_bytes !== undefined ? (s.flash_size_bytes / 1024 / 1024).toFixed(2) + " MB" : "—" },
          { label: "Sketch Size", value: s.sketch_size_bytes !== undefined ? (s.sketch_size_bytes / 1024).toFixed(1) + " KB" : "—" },
          { label: "Free Sketch", value: s.free_sketch_bytes !== undefined ? (s.free_sketch_bytes / 1024).toFixed(1) + " KB" : "—" },

          { label: "CT Ratio (runtime)", value: s.ctRatio ?? "—" },
          { label: "PT Ratio (runtime)", value: s.ptRatio ?? "—" },
          { label: "OV Limit", value: s.ovLimit ?? "—" },
          { label: "UV Limit", value: s.uvLimit ?? "—" },
          { label: "OC Limit", value: s.ocLimit ?? "—" },
          { label: "Low PF Limit", value: s.lowPfLimit ?? "—" },
          { label: "Uptime", value: s.uptime !== undefined ? s.uptime + " s" : "—" },
        ];

        for (const it of items) {
          const div = document.createElement("div");
          div.className = "diag-item";
          div.innerHTML = `
            <span class="label">${it.label}</span>
            <span class="value">${it.value}</span>
          `;
          diagGrid.appendChild(div);
        }
      }

      showMessage(msgEl, "Loaded advanced config", true);
    } catch (e) {
      showMessage(msgEl, "Failed to load: " + e.message, false);
    }
  }

  // Refresh
  if (btnRefresh) {
    btnRefresh.addEventListener("click", (e) => {
      e.preventDefault();
      fillAdvancedFromStatus();
    });
  }

  // Save Threshold/Calibration
  if (btnSave && advForm) {
    btnSave.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const fd = new FormData(advForm);
        const params = new URLSearchParams(fd);
        const res = await fetch("/api/save", {
          method: "POST",
          body: params,
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        if (j.status === "saved") {
          showMessage(msgEl, "Saved. Device will reboot...", true);
        } else {
          showMessage(msgEl, "Save failed: " + JSON.stringify(j), false);
        }
      } catch (err) {
        showMessage(msgEl, "Error: " + err.message, false);
      }
    });
  }

  // Save Firmware HTTP Server
  if (btnFwServerSave && (fwHostEl || fwPortEl)) {
    btnFwServerSave.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const params = new URLSearchParams();
        if (fwHostEl && fwHostEl.value.trim() !== "") {
          params.append("fwHost", fwHostEl.value.trim());
        }
        if (fwPortEl && fwPortEl.value.trim() !== "") {
          params.append("fwPort", fwPortEl.value.trim());
        }

        const res = await fetch("/api/save", {
          method: "POST",
          body: params,
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        if (j.status === "saved") {
          showMessage(fwServerMsg || msgEl, "Saved firmware server. Device will reboot...", true);
        } else {
          showMessage(fwServerMsg || msgEl, "Save failed: " + JSON.stringify(j), false);
        }
      } catch (err) {
        showMessage(fwServerMsg || msgEl, "Error: " + err.message, false);
      }
    });
  }

  // Backup CONFIG (.json)
  if (btnBackupCfg) {
    btnBackupCfg.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const res = await fetch("/api/backup");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ai205-config-backup.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showMessage(backupMsg, "Config backup downloaded", true);
      } catch (err) {
        showMessage(backupMsg, "Backup failed: " + err.message, false);
      }
    });
  }

  // Backup FIRMWARE (.bin)
  if (btnFwBackup) {
    btnFwBackup.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const res = await fetch("/api/fwbackup");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ai205-firmware-backup.bin";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showMessage(fwBackupMsg, "Firmware backup downloaded", true);
      } catch (err) {
        showMessage(fwBackupMsg, "Backup failed: " + err.message, false);
      }
    });
  }

  // MQTT FW: Check (เช็คจาก status2)
  if (btnFwCheck) {
    btnFwCheck.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const s = await fetchStatus();
        // refresh UI
        await fillAdvancedFromStatus();
        showMessage(
          fwMqttMsg,
          s.fw_update_available ? "พบเฟิร์มแวร์ใหม่จาก MQTT" : "ยังไม่มีเฟิร์มแวร์ใหม่",
          !!s.fw_update_available
        );
        if (typeof initUpdateIndicator === "function") {
          initUpdateIndicator();
        }
      } catch (err) {
        showMessage(fwMqttMsg, "Check failed: " + err.message, false);
      }
    });
  }

  // MQTT FW: Apply
  if (btnFwApply) {
    btnFwApply.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const res = await fetch("/api/fw/apply", { method: "POST" });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error("HTTP " + res.status + ": " + txt);
        }
        showMessage(
          fwMqttMsg,
          "Updating firmware... device will reboot shortly.",
          true
        );
      } catch (err) {
        showMessage(fwMqttMsg, "Update failed: " + err.message, false);
      }
    });
  }

  // ===== Service Settings Form =====
  const serviceForm   = document.getElementById("service-form");
  const btnServiceSave = document.getElementById("btn-service-save");
  const serviceMsg    = document.getElementById("service-message");
  const btnRestart    = document.getElementById("btn-restart");
  const restartMsg    = document.getElementById("restart-message");

  // Load service settings into form
  async function fillServiceFromStatus() {
    try {
      const s = await fetchStatus();
      
      const webUserEl = document.getElementById("web-user");
      const apSsidEl  = document.getElementById("ap-ssid");
      const mbSlaveEl = document.getElementById("mb-slave");
      const mbBaudEl  = document.getElementById("mb-baud");
      const alertCdEl = document.getElementById("alert-cd");
      const phMissIEl = document.getElementById("ph-miss-i");
      const phMissVEl = document.getElementById("ph-miss-v");

      if (webUserEl) webUserEl.value = s.webUser ?? "";
      if (apSsidEl)  apSsidEl.value  = s.apSsid ?? "";
      if (mbSlaveEl) mbSlaveEl.value = s.modbusSlaveId ?? "";
      if (mbBaudEl)  mbBaudEl.value  = s.modbusBaudrate ?? "";
      if (alertCdEl) alertCdEl.value = s.alertCooldown ?? "";
      if (phMissIEl) phMissIEl.value = s.phaseMissingI ?? "";
      if (phMissVEl) phMissVEl.value = s.phaseMissingV ?? "";
    } catch (e) {
      console.warn("fillServiceFromStatus error:", e);
    }
  }

  // Save service settings
  if (btnServiceSave && serviceForm) {
    btnServiceSave.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const fd = new FormData(serviceForm);
        const params = new URLSearchParams(fd);
        const res = await fetch("/api/save", {
          method: "POST",
          body: params,
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const j = await res.json();
        if (j.status === "saved") {
          showMessage(serviceMsg, "Saved. Device will reboot...", true);
        } else {
          showMessage(serviceMsg, "Save failed: " + JSON.stringify(j), false);
        }
      } catch (err) {
        showMessage(serviceMsg, "Error: " + err.message, false);
      }
    });
  }

  // Restart button
  if (btnRestart) {
    btnRestart.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("Are you sure you want to restart the device?")) return;
      try {
        showMessage(restartMsg, "Restarting device...", true);
        const res = await fetch("/api/reboot");
        if (!res.ok) throw new Error("HTTP " + res.status);
        showMessage(restartMsg, "Device restarting... Reconnect in 10 seconds.", true);
      } catch (err) {
        showMessage(restartMsg, "Restart failed: " + err.message, false);
      }
    });
  }

  // initial load
  fillAdvancedFromStatus();
  fillServiceFromStatus();
}


// ===================== INIT =====================
document.addEventListener("DOMContentLoaded", () => {
  setActiveNav();

  const page = document.body.dataset.page;
  if (page === "login")     initLoginPage();
  if (page === "config")    initConfigPage();
  if (page === "dashboard") initDashboardPage();
  if (page === "advanced")  initAdvancedPage();

  // อย่าเช็ค update indicator บนหน้า login (จะไปโดน 401)
  if (page !== "login") {
    initUpdateIndicator();
  }
});
