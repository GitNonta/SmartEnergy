/**
 * AI Chat Service - Google Gemini Function Calling
 * Enables AI to query InfluxDB, export CSV, and analyze energy data
 */

const { GoogleGenAI } = require('@google/genai');
const influxService = require('./influxdb');
const fs = require('fs');
const path = require('path');

// Initialize Gemini client
let ai = null;

if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log(`✅ Gemini AI initialized`);
} else {
  console.warn('⚠️ GEMINI_API_KEY is not set. AI Chat features will be disabled.');
}

// CSV export directory
const CSV_DIR = path.join(__dirname, '../../exports');
if (!fs.existsSync(CSV_DIR)) {
  fs.mkdirSync(CSV_DIR, { recursive: true });
}

// ========================================
// FUNCTION DECLARATIONS (Gemini Format)
// ========================================

const functionDeclarations = [
  {
    name: "get_daily_consumption",
    description: "ดึงข้อมูลการใช้พลังงานรายวัน (24 ชั่วโมง) วันนี้หรือวันที่ระบุ รวมถึง kWh รายชั่วโมง",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "วันที่ต้องการ (YYYY-MM-DD), ถ้าไม่ระบุจะใช้วันนี้"
        }
      }
    }
  },
  {
    name: "get_monthly_summary",
    description: "ดึงข้อมูลสรุปการใช้พลังงานรายเดือน รวมถึง kWh รายวัน ค่าสูงสุด ต่ำสุด และค่าเฉลี่ย",
    parameters: {
      type: "object",
      properties: {
        month: {
          type: "integer",
          description: "เดือน (1-12), ถ้าไม่ระบุจะใช้เดือนปัจจุบัน"
        },
        year: {
          type: "integer",
          description: "ปี (YYYY), ถ้าไม่ระบุจะใช้ปีปัจจุบัน"
        }
      }
    }
  },
  {
    name: "get_realtime_power",
    description: "ดึงข้อมูลพลังงานปัจจุบัน (real-time) รวมถึง voltage, current, power, power factor ทั้ง 3 เฟส",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_energy_comparison",
    description: "เปรียบเทียบการใช้พลังงานระหว่างช่วงเวลา เช่น วันนี้ vs เมื่อวาน หรือ เดือนนี้ vs เดือนก่อน",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["daily", "weekly", "monthly"],
          description: "ช่วงเวลาที่ต้องการเปรียบเทียบ"
        }
      },
      required: ["period"]
    }
  },
  {
    name: "get_alerts",
    description: "ดึงรายการแจ้งเตือน (alerts) ล่าสุด เช่น overcurrent, undervoltage, power factor ต่ำ",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "จำนวน alerts ที่ต้องการ (default: 10)"
        },
        severity: {
          type: "string",
          enum: ["all", "warning", "critical"],
          description: "ระดับความรุนแรง"
        }
      }
    }
  },
  {
    name: "export_to_csv",
    description: "ส่งออกข้อมูลพลังงานเป็นไฟล์ CSV สำหรับดาวน์โหลด",
    parameters: {
      type: "object",
      properties: {
        dataType: {
          type: "string",
          enum: ["daily", "monthly", "yearly", "custom"],
          description: "ประเภทข้อมูลที่ต้องการ export"
        },
        startDate: {
          type: "string",
          description: "วันเริ่มต้น (YYYY-MM-DD) สำหรับ custom"
        },
        endDate: {
          type: "string",
          description: "วันสิ้นสุด (YYYY-MM-DD) สำหรับ custom"
        }
      },
      required: ["dataType"]
    }
  },
  {
    name: "get_peak_demand",
    description: "ดึงข้อมูล peak demand (ค่าพีค) ของการใช้ไฟฟ้าในช่วงเวลาต่างๆ",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "week", "month"],
          description: "ช่วงเวลา"
        }
      },
      required: ["period"]
    }
  },
  {
    name: "analyze_energy_anomalies",
    description: "วิเคราะห์ความผิดปกติจากข้อมูล Raw (AI205_raw) ใช้ aggregate avg/max/min/stddev หาสาเหตุปัญหาและแนะนำการปรับปรุง",
    parameters: {
      type: "object",
      properties: {
        analysisType: {
          type: "string",
          enum: ["usage_pattern", "cost_optimization", "anomaly_detection", "efficiency_check", "raw_statistics"],
          description: "ประเภทการวิเคราะห์: usage_pattern=รูปแบบการใช้งาน, cost_optimization=ลดค่าใช้จ่าย, anomaly_detection=หาความผิดปกติ, efficiency_check=ตรวจประสิทธิภาพ, raw_statistics=สถิติดิบ"
        },
        timeRange: {
          type: "string",
          enum: ["today", "yesterday", "week", "month"],
          description: "ช่วงเวลาที่ต้องการวิเคราะห์"
        }
      },
      required: ["analysisType"]
    }
  }
];

// ========================================
// TOOL IMPLEMENTATIONS
// ========================================

async function executeTool(toolName, args) {
  console.log(`🔧 Executing tool: ${toolName}`, args);
  
  try {
    switch (toolName) {
      case 'get_daily_consumption':
        return await getDailyConsumption(args.date);
      
      case 'get_monthly_summary':
        return await getMonthlySummary(args.month, args.year);
      
      case 'get_realtime_power':
        return await getRealtimePower();
      
      case 'get_energy_comparison':
        return await getEnergyComparison(args.period);
      
      case 'get_alerts':
        return await getAlerts(args.limit, args.severity);
      
      case 'export_to_csv':
        return await exportToCsv(args.dataType, args.startDate, args.endDate);
      
      case 'get_peak_demand':
        return await getPeakDemand(args.period);
      
      case 'analyze_energy_anomalies':
        return await analyzeEnergyAnomalies(args.analysisType, args.timeRange);
      
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`❌ Tool execution error: ${toolName}`, error);
    return { error: error.message };
  }
}

// --- Tool Implementations ---

async function getDailyConsumption(date) {
  try {
    const result = await influxService.getRealtimeDailyUsage('AI205');
    return {
      date: date || new Date().toISOString().split('T')[0],
      totalKwh: result?.total || 0,
      hourlyBreakdown: result?.hourly || [],
      peakHour: result?.peakHour || null,
      peakValue: result?.peakValue || 0
    };
  } catch (error) {
    return { error: error.message, totalKwh: 0 };
  }
}

async function getMonthlySummary(month, year) {
  try {
    const now = new Date();
    const targetMonth = month || now.getMonth() + 1;
    const targetYear = year || now.getFullYear();
    
    const result = await influxService.getRealtimeMonthlyUsage('AI205');
    return {
      month: targetMonth,
      year: targetYear,
      totalKwh: result?.total || 0,
      dailyAverage: result?.dailyAverage || 0,
      daysWithData: result?.daysWithData || 0
    };
  } catch (error) {
    return { error: error.message, totalKwh: 0 };
  }
}

async function getRealtimePower() {
  try {
    // Get from WebSocket state or latest InfluxDB data
    const result = await influxService.queryFromBucket('raw', '-5m', 'power_total');
    
    return {
      timestamp: new Date().toISOString(),
      power: {
        total: result?.[0]?.value || 0,
        unit: 'W'
      },
      note: 'Real-time data from AI205 device'
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function getEnergyComparison(period) {
  try {
    const result = await influxService.getUsageComparison('AI205', period);
    return {
      period,
      current: result?.current || 0,
      previous: result?.previous || 0,
      change: result?.change || 0,
      changePercent: result?.changePercent || 0,
      trend: result?.trend || 'stable'
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function getAlerts(limit = 10, severity = 'all') {
  try {
    const result = await influxService.queryAlertHistory({
      limit,
      severity: severity === 'all' ? null : severity,
      startTime: '-7d'
    });
    
    return {
      count: result.count || 0,
      alerts: result.alerts || []
    };
  } catch (error) {
    return { error: error.message, alerts: [] };
  }
}

async function exportToCsv(dataType, startDate, endDate) {
  try {
    let data = [];
    let filename = '';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (dataType === 'daily') {
      const result = await influxService.getRealtimeDailyUsage('AI205');
      data = result?.hourly || [];
      filename = `daily_consumption_${timestamp}.csv`;
    } else if (dataType === 'monthly') {
      const result = await influxService.getRealtimeMonthlyUsage('AI205');
      data = result?.daily || [];
      filename = `monthly_consumption_${timestamp}.csv`;
    } else if (dataType === 'yearly') {
      const result = await influxService.getRealtimeYearlyUsage('AI205');
      data = result?.monthly || [];
      filename = `yearly_consumption_${timestamp}.csv`;
    }
    
    if (data.length > 0) {
      // Generate CSV content
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row => Object.values(row).join(','));
      const csvContent = [headers, ...rows].join('\n');
      
      // Save file
      const filePath = path.join(CSV_DIR, filename);
      fs.writeFileSync(filePath, csvContent);
      
      return {
        success: true,
        filename,
        downloadUrl: `/api/chat/csv/${filename}`,
        rowCount: data.length
      };
    }
    
    return { success: false, error: 'No data available' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getPeakDemand(period) {
  try {
    const result = await influxService.getPeakDemand('AI205', period);
    return {
      period,
      peakPower: result?.peakPower || 0,
      peakTime: result?.peakTime || null,
      unit: 'kW'
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Analyze Energy Anomalies using aggregated data from RAW bucket
 * Uses InfluxDB Flux aggregation (mean, max, min, stddev, integral)
 * @param {string} analysisType - Type of analysis
 * @param {string} timeRange - Time range for analysis
 */
async function analyzeEnergyAnomalies(analysisType, timeRange = 'today') {
  try {
    // Get aggregated summary from RAW bucket
    const summary = await influxService.getDataSummaryForAI(timeRange, 'AI205');
    
    if (!summary.success) {
      return { error: summary.error || 'Failed to fetch data summary' };
    }

    // Build AI-friendly hints based on analysis type
    const aiHints = [];
    
    switch (analysisType) {
      case 'usage_pattern':
        aiHints.push(`⏰ Peak usage at ${summary.peakTime || 'N/A'}`);
        aiHints.push(`📊 Avg power: ${summary.power.avg} kW`);
        aiHints.push(`📈 Max power: ${summary.power.max} kW`);
        aiHints.push(`📉 Min power: ${summary.power.min} kW`);
        break;
        
      case 'cost_optimization':
        const estimatedCost = (summary.energy.total * 4.0).toFixed(2);
        aiHints.push(`💰 Est. cost: ${estimatedCost} THB (at 4 THB/kWh)`);
        aiHints.push(`⚡ Total energy: ${summary.energy.total} kWh`);
        if (summary.power.max > summary.power.avg * 2) {
          aiHints.push(`💡 Tip: Reduce peak demand to lower costs`);
        }
        break;
        
      case 'anomaly_detection':
        summary.insights.forEach(insight => aiHints.push(insight));
        if (summary.power.stddev > summary.power.avg * 0.3) {
          aiHints.push(`⚠️ High variance detected in power usage`);
        }
        break;
        
      case 'efficiency_check':
        aiHints.push(`📈 Power Factor avg: ${summary.powerFactor.avg}`);
        aiHints.push(`📉 Power Factor min: ${summary.powerFactor.min}`);
        if (summary.powerFactor.avg < 0.9) {
          aiHints.push(`💡 Consider power factor correction`);
        }
        aiHints.push(`🔌 Voltage avg: ${summary.voltage.avg}V (${summary.voltage.min}V - ${summary.voltage.max}V)`);
        break;
        
      case 'raw_statistics':
      default:
        aiHints.push(`📊 Power: avg=${summary.power.avg}kW, max=${summary.power.max}kW, min=${summary.power.min}kW`);
        aiHints.push(`⚡ Energy total: ${summary.energy.total} kWh`);
        aiHints.push(`🔌 Voltage: avg=${summary.voltage.avg}V`);
        aiHints.push(`〰️ Current: avg=${summary.current.avg}A, max=${summary.current.max}A`);
        aiHints.push(`📈 PF: avg=${summary.powerFactor.avg}`);
        break;
    }

    return {
      analysisType,
      timeRange,
      dataSource: summary.dataSource,
      aggregationMethod: summary.aggregationMethod,
      statistics: {
        power: summary.power,
        voltage: summary.voltage,
        current: summary.current,
        powerFactor: summary.powerFactor,
        energy: summary.energy
      },
      peakTime: summary.peakTime,
      insights: summary.insights,
      aiHints,
      timestamp: summary.timestamp
    };
  } catch (error) {
    console.error('❌ Error in analyzeEnergyAnomalies:', error);
    return { error: error.message };
  }
}

// ========================================
// MAIN CHAT HANDLER
// ========================================

const SYSTEM_PROMPT = `คุณเป็น AI Assistant สำหรับระบบ Smart Energy Monitoring (SMART)
คุณช่วยวิเคราะห์ข้อมูลพลังงานไฟฟ้า ตอบคำถามเกี่ยวกับการใช้ไฟฟ้า และช่วย export ข้อมูล

ข้อมูลระบบ:
- Device: AI205 (3-Phase Power Meter)
- Location: Main Distribution Board (MDB)
- Database: InfluxDB
- Measurements: voltage, current, power, power factor, energy

คุณสามารถ:
1. ดึงข้อมูลการใช้ไฟฟ้ารายวัน/เดือน/ปี
2. เปรียบเทียบการใช้ไฟฟ้าระหว่างช่วงเวลา
3. แสดง alerts และคำเตือน
4. Export ข้อมูลเป็น CSV
5. วิเคราะห์ peak demand

ตอบเป็นภาษาไทยเสมอ ยกเว้นข้อมูลทางเทคนิค
ใช้ emoji เพื่อทำให้ข้อความน่าอ่าน`;

/**
 * Process chat message with Gemini function calling (@google/genai SDK)
 */
async function processMessage(userMessage, conversationHistory = []) {
  try {
    if (!ai) {
      return {
        success: false,
        message: 'AI Chat is currently disabled because the server is missing the Gemini API Key. Please contact the administrator.',
        error: 'GEMINI_API_KEY_MISSING'
      };
    }

    console.log('🤖 Sending to Gemini...');

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const toolsUsed = [];

    // Build contents with conversation history
    const contents = [
      { role: 'user', parts: [{ text: userMessage }] }
    ];

    // Initial request with function declarations
    let response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations }]
      }
    });

    // Handle function calls loop
    while (response.functionCalls && response.functionCalls.length > 0) {
      console.log(`🔧 Gemini wants to use ${response.functionCalls.length} function(s)`);
      
      const functionResponses = [];
      
      for (const call of response.functionCalls) {
        const toolName = call.name;
        const toolArgs = call.args || {};
        toolsUsed.push(toolName);
        
        const toolResult = await executeTool(toolName, toolArgs);
        
        functionResponses.push({
          name: toolName,
          response: toolResult
        });
      }

      // Add assistant response and function results to contents
      contents.push({
        role: 'model',
        parts: response.functionCalls.map(fc => ({ functionCall: fc }))
      });
      
      contents.push({
        role: 'user',
        parts: functionResponses.map(fr => ({
          functionResponse: {
            name: fr.name,
            response: fr.response
          }
        }))
      });

      // Get next response
      response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations }]
        }
      });
    }

    console.log('✅ Gemini response received');

    // Extract text from response
    const text = response.text || '';

    return {
      success: true,
      message: text || 'ขออภัย ไม่สามารถประมวลผลได้',
      toolsUsed
    };

  } catch (error) {
    console.error('❌ AI Chat error:', error);
    return {
      success: false,
      message: `ขออภัย เกิดข้อผิดพลาด: ${error.message}`,
      error: error.message
    };
  }
}

module.exports = {
  processMessage,
  executeTool,
  tools: functionDeclarations,
  CSV_DIR
};
