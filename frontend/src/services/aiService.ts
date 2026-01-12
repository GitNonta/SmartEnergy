import axios from 'axios';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';

export interface AIAnalysisResult {
    text: string;
    isLocal: boolean;
    error?: string;
}

/**
 * Check if OpenAI API is configured
 */
export const isAIConfigured = (): boolean => {
    return !!(OPENAI_API_KEY && OPENAI_API_KEY.trim() !== '');
};

/**
 * Generic AI analysis function using OpenAI
 */
export const analyzeWithAI = async (prompt: string): Promise<string> => {
    if (!isAIConfigured()) {
        throw new Error('OpenAI API key not configured');
    }

    try {
        console.log('🔄 Calling OpenAI API for analysis...');

        const response = await axios.post(OPENAI_API_URL, {
            model: OPENAI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert electrical engineer analyzing power monitoring data. Provide concise, practical insights in Thai language. Keep responses under 150 words.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 300,
            temperature: 0.7
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            }
        });

        const data = response.data;

        console.log('✅ OpenAI API response received');

        const analysisText = data.choices?.[0]?.message?.content;

        if (!analysisText) {
            throw new Error('No analysis text in response');
        }

        return `🤖 AI ANALYSIS\n━━━━━━━━━━━━━━━━━━━━━━\n${analysisText}`;
    } catch (error) {
        console.error('❌ OpenAI API error:', error);
        throw error;
    }
};

/**
 * Analyze voltage reading
 */
export const analyzeVoltage = async (phase: string, value: number): Promise<AIAnalysisResult> => {
    const deviation = value - 220;
    const deviationPercent = ((Math.abs(deviation) / 220) * 100).toFixed(1);

    // Local analysis fallback
    const getLocalAnalysis = (): string => {
        let analysis = `📊 LOCAL ANALYSIS - ${phase}\n`;
        analysis += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        analysis += `Current Voltage: ${value.toFixed(2)}V\n`;
        analysis += `Nominal Voltage: 220V\n`;
        analysis += `Deviation: ${deviation > 0 ? '+' : ''}${deviation.toFixed(2)}V (${deviationPercent}%)\n\n`;

        if (Math.abs(deviation) < 5) {
            analysis += `✅ STATUS: NORMAL\nVoltage is within acceptable range (220V ±5%)\n`;
        } else if (Math.abs(deviation) < 11) {
            analysis += `⚠️ STATUS: WARNING\nVoltage is slightly out of normal range.\n`;
            analysis += deviation > 0 ? '• Over-voltage condition\n' : '• Under-voltage condition\n';
        } else {
            analysis += `🚨 STATUS: CRITICAL\nVoltage deviation exceeds safe limits!\n`;
            analysis += deviation > 0 ? '• Severe over-voltage\n' : '• Severe under-voltage\n';
        }
        return analysis;
    };

    if (!isAIConfigured()) {
        return { text: getLocalAnalysis(), isLocal: true };
    }

    try {
        const prompt = `Analyze this 3-phase electrical system voltage reading:
        
Phase: ${phase}
Current Voltage: ${value.toFixed(2)}V
Nominal Voltage: 220V
Deviation: ${deviation.toFixed(2)}V (${deviationPercent}%)

Please provide:
1. Status (Normal/Warning/Critical)
2. Possible causes
3. Recommended actions

Format response in Thai language, keep it concise (max 150 words).`;

        const text = await analyzeWithAI(prompt);
        return { text, isLocal: false };
    } catch (error) {
        console.warn('Falling back to local analysis:', error);
        return { text: getLocalAnalysis(), isLocal: true, error: String(error) };
    }
};

/**
 * Analyze current reading
 */
export const analyzeCurrent = async (phase: string, value: number, ratedCurrent: number = 100): Promise<AIAnalysisResult> => {
    const loadPercent = ((value / ratedCurrent) * 100).toFixed(1);

    const getLocalAnalysis = (): string => {
        let analysis = `📊 LOCAL ANALYSIS - ${phase}\n`;
        analysis += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        analysis += `Current: ${value.toFixed(2)}A\n`;
        analysis += `Rated: ${ratedCurrent}A\n`;
        analysis += `Load: ${loadPercent}%\n\n`;

        const load = parseFloat(loadPercent);
        if (load < 60) {
            analysis += `✅ STATUS: NORMAL\nLoad is within safe operating range.\n`;
        } else if (load < 80) {
            analysis += `⚠️ STATUS: WARNING\nLoad approaching high levels. Monitor closely.\n`;
        } else {
            analysis += `🚨 STATUS: CRITICAL\nLoad is at dangerous levels! Reduce load immediately.\n`;
        }
        return analysis;
    };

    if (!isAIConfigured()) {
        return { text: getLocalAnalysis(), isLocal: true };
    }

    try {
        const prompt = `Analyze this electrical current reading:
        
Phase: ${phase}
Current: ${value.toFixed(2)}A
Rated Current: ${ratedCurrent}A
Load: ${loadPercent}%

Please provide:
1. Status (Normal/Warning/Critical)
2. Load assessment
3. Recommendations

Format response in Thai language, keep it concise (max 150 words).`;

        const text = await analyzeWithAI(prompt);
        return { text, isLocal: false };
    } catch (error) {
        console.warn('Falling back to local analysis:', error);
        return { text: getLocalAnalysis(), isLocal: true, error: String(error) };
    }
};

/**
 * Analyze power reading
 */
export const analyzePower = async (type: string, value: number, maxPower: number = 100): Promise<AIAnalysisResult> => {
    const powerKW = value / 1000;
    const usagePercent = ((value / maxPower) * 100).toFixed(1);

    const getLocalAnalysis = (): string => {
        let analysis = `📊 LOCAL ANALYSIS - ${type}\n`;
        analysis += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        analysis += `Power: ${value.toFixed(1)}W (${powerKW.toFixed(2)}kW)\n`;
        analysis += `Usage: ${usagePercent}%\n\n`;

        const usage = parseFloat(usagePercent);
        if (usage < 50) {
            analysis += `✅ STATUS: NORMAL\nPower consumption is at normal levels.\n`;
        } else if (usage < 80) {
            analysis += `⚠️ STATUS: MODERATE\nPower consumption is elevated.\n`;
        } else {
            analysis += `🚨 STATUS: HIGH\nHigh power consumption detected.\n`;
        }
        return analysis;
    };

    if (!isAIConfigured()) {
        return { text: getLocalAnalysis(), isLocal: true };
    }

    try {
        const prompt = `Analyze this power consumption reading:
        
Type: ${type}
Power: ${value.toFixed(1)}W (${powerKW.toFixed(2)}kW)
Usage Level: ${usagePercent}%

Please provide:
1. Status assessment
2. Energy efficiency observations
3. Cost-saving recommendations

Format response in Thai language, keep it concise (max 150 words).`;

        const text = await analyzeWithAI(prompt);
        return { text, isLocal: false };
    } catch (error) {
        console.warn('Falling back to local analysis:', error);
        return { text: getLocalAnalysis(), isLocal: true, error: String(error) };
    }
};

/**
 * Analyze energy consumption trend
 */
export const analyzeEnergy = async (daily: number, monthly: number, yearly: number): Promise<AIAnalysisResult> => {
    const avgDaily = monthly / Math.max(new Date().getDate(), 1);

    const getLocalAnalysis = (): string => {
        let analysis = `📊 LOCAL ENERGY ANALYSIS\n`;
        analysis += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        analysis += `Daily: ${daily.toFixed(2)} kWh\n`;
        analysis += `Monthly: ${monthly.toFixed(2)} kWh\n`;
        analysis += `Yearly: ${yearly.toFixed(2)} kWh\n`;
        analysis += `Avg Daily: ${avgDaily.toFixed(2)} kWh\n\n`;

        if (daily <= avgDaily * 1.1) {
            analysis += `✅ STATUS: NORMAL\nToday's consumption is within average.\n`;
        } else if (daily <= avgDaily * 1.3) {
            analysis += `⚠️ STATUS: ELEVATED\nToday's consumption is above average.\n`;
        } else {
            analysis += `🚨 STATUS: HIGH\nToday's consumption is significantly above average.\n`;
        }
        return analysis;
    };

    if (!isAIConfigured()) {
        return { text: getLocalAnalysis(), isLocal: true };
    }

    try {
        const prompt = `Analyze this energy consumption data:
        
Today: ${daily.toFixed(2)} kWh
This Month: ${monthly.toFixed(2)} kWh  
This Year: ${yearly.toFixed(2)} kWh
Average Daily: ${avgDaily.toFixed(2)} kWh

Please provide:
1. Consumption trend analysis
2. Comparison with average
3. Energy saving recommendations

Format response in Thai language, keep it concise (max 150 words).`;

        const text = await analyzeWithAI(prompt);
        return { text, isLocal: false };
    } catch (error) {
        console.warn('Falling back to local analysis:', error);
        return { text: getLocalAnalysis(), isLocal: true, error: String(error) };
    }
};

export default {
    isAIConfigured,
    analyzeWithAI,
    analyzeVoltage,
    analyzeCurrent,
    analyzePower,
    analyzeEnergy
};
