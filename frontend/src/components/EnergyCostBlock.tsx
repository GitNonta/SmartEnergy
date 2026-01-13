import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './EnergyCostBlock.css';
import { getApiBase } from '../config/api';
import { calculateBill, formatCurrency, TARIFF_CONFIG, type BillBreakdown } from '../utils/tariffCalc';
import { useTheme, THEME } from './AppShell';
import { useLanguage } from '../context/LanguageContext';
import { TrendingUp } from 'lucide-react';
import EnergyCostHistoryChart from './EnergyCostHistoryChart';

interface MonthInfo {
  name: string;
  number: number;
  year: number;
}

// Mini Pie Chart Component
const PieChart: React.FC<{ base: number; ft: number; vat: number }> = ({ base, ft, vat }) => {
  const total = base + ft + vat;
  if (total === 0) return null;

  const basePercent = (base / total) * 100;
  const ftPercent = (ft / total) * 100;
  const vatPercent = (vat / total) * 100;

  // SVG pie chart using conic gradient simulation with stroke-dasharray
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const baseDash = (basePercent / 100) * circumference;
  const ftDash = (ftPercent / 100) * circumference;
  const vatDash = (vatPercent / 100) * circumference;

  const baseOffset = 0;
  const ftOffset = -baseDash;
  const vatOffset = -(baseDash + ftDash);

  return (
    <div className="pie-chart-container">
      <svg width="100" height="100" viewBox="0 0 100 100">
        {/* Base segment - amber/gold */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="18"
          strokeDasharray={`${baseDash} ${circumference - baseDash}`}
          strokeDashoffset={baseOffset}
          transform="rotate(-90 50 50)"
        />
        {/* Ft segment - orange */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="#ea580c"
          strokeWidth="18"
          strokeDasharray={`${ftDash} ${circumference - ftDash}`}
          strokeDashoffset={ftOffset}
          transform="rotate(-90 50 50)"
        />
        {/* VAT segment - red */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="#dc2626"
          strokeWidth="18"
          strokeDasharray={`${vatDash} ${circumference - vatDash}`}
          strokeDashoffset={vatOffset}
          transform="rotate(-90 50 50)"
        />
        {/* Center circle - background */}
        <circle cx="50" cy="50" r="30" fill="#1e293b" />
        <text x="50" y="48" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">
          {formatCurrency(total)}
        </text>
        <text x="50" y="58" textAnchor="middle" fill="#a8a29e" fontSize="7">
          บาท
        </text>
      </svg>
      {/* Legend */}
      <div className="pie-legend">
        <div className="legend-item">
          <span className="dot" style={{ background: '#f59e0b' }}></span>
          <span>ค่าฐาน {basePercent.toFixed(0)}%</span>
        </div>
        <div className="legend-item">
          <span className="dot" style={{ background: '#ea580c' }}></span>
          <span>Ft {ftPercent.toFixed(0)}%</span>
        </div>
        <div className="legend-item">
          <span className="dot" style={{ background: '#dc2626' }}></span>
          <span>VAT {vatPercent.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
};

// Visual Bar Component for each section
const VisualBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="visual-bar-track">
      <div
        className="visual-bar-fill"
        style={{ width: `${percent}%`, background: color }}
      />
    </div>
  );
};

const EnergyCostBlock: React.FC = () => {
  const [monthlyEnergy, setMonthlyEnergy] = useState<number>(0);
  const [monthInfo, setMonthInfo] = useState<MonthInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);
  const lastMonthChecked = useRef<number>(new Date().getMonth());

  // State สำหรับค่า Ft (หน่วย: บาท/หน่วย)
  const [ftRate, setFtRate] = useState<number>(TARIFF_CONFIG.defaultFt);
  const [isEditingFt, setIsEditingFt] = useState(false);
  const [showHistoryChart, setShowHistoryChart] = useState(false);

  // Get theme and language - hooks must be called unconditionally at top level
  // Fixed theme used directly
  const theme = THEME;
  const themeAccent = THEME.accent;
  const { t } = useLanguage();
  // ✅ Use utility function instead of hardcoded logic
  const bill: BillBreakdown = calculateBill(monthlyEnergy, ftRate);

  useEffect(() => {
    const fetchMonthlyEnergy = async () => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      setLoading(true);

      // Check if month has changed - reset energy if new month
      const currentMonth = new Date().getMonth();
      if (lastMonthChecked.current !== currentMonth) {
        console.log(`🔄 Month changed - Resetting monthly energy from ${lastMonthChecked.current + 1} to ${currentMonth + 1}`);
        setMonthlyEnergy(0);
        lastMonthChecked.current = currentMonth;
      }

      try {
        const response = await fetch(`${getApiBase()}/api/energy/monthly-realtime?deviceId=AI205`, { cache: 'no-store' });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setMonthlyEnergy(result.monthly || 0);
            setMonthInfo({
              name: result.monthName,
              number: result.monthNumber,
              year: result.year
            });
            console.log(`📊 Monthly energy (${result.monthName} ${result.year}): ${result.monthly?.toFixed(2)} kWh`);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching monthly energy for cost:', error);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    };

    fetchMonthlyEnergy();
    const interval = setInterval(fetchMonthlyEnergy, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="energy-cost-block-modern w-full min-h-[180px] rounded-xl border border-slate-200 dark:border-amber-400/15 bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-stone-800 p-5 transition-all duration-200 hover:border-amber-400/50 dark:hover:border-amber-400/25 text-slate-800 dark:text-stone-200 font-sans relative overflow-hidden flex flex-col shadow-sm dark:shadow-none">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-700 rounded-lg flex items-center justify-center">
          <span className="text-2xl font-bold text-white">฿</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-extrabold text-amber-400 tracking-wider font-sans">{t('cost.title').toUpperCase()}</span>
          <span className="text-[0.7rem] text-slate-500 dark:text-stone-400 font-medium">
            {monthInfo ? `${monthInfo.name} ${monthInfo.year}` : t('common.loading')} • Type {TARIFF_CONFIG.type}
          </span>
        </div>
      </div>

      {/* Visual Summary - Pie Chart (คลิกเพื่อดูย้อนหลัง) */}
      <div
        className="visual-summary clickable group flex items-center gap-6 p-4 bg-slate-50 dark:bg-black/20 rounded-xl mb-4 border border-slate-200 dark:border-white/5 relative transition-all duration-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-black/30 hover:border-amber-400/30 hover:-translate-y-[2px]"
        onClick={() => setShowHistoryChart(true)}
        title="คลิกเพื่อดูกราฟค่าไฟฟ้าย้อนหลัง"
      >
        <PieChart base={bill.baseTariff} ft={bill.ftCharge} vat={bill.vat} />
        <div className="usage-summary flex-1 flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.65rem] text-slate-500 dark:text-stone-500 uppercase tracking-wider">ใช้ไป</span>
            <span className="text-2xl font-bold text-amber-400 font-mono leading-none">{formatCurrency(monthlyEnergy)}</span>
            <span className="text-[0.7rem] text-slate-400 dark:text-stone-400">หน่วย</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.65rem] text-slate-500 dark:text-stone-500 uppercase tracking-wider">เฉลี่ย/วัน</span>
            <span className="text-2xl font-bold text-amber-400 font-mono leading-none">{formatCurrency(monthlyEnergy / Math.max(new Date().getDate(), 1))}</span>
            <span className="text-[0.7rem] text-slate-400 dark:text-stone-400">หน่วย</span>
          </div>
        </div>
        <div className="click-hint absolute bottom-2 right-3 flex items-center gap-1 text-[0.65rem] text-amber-400 opacity-50 transition-opacity duration-200 group-hover:opacity-100">
          <TrendingUp size={14} />
          <span className="font-medium">ดูย้อนหลัง</span>
        </div>
      </div>

      {/* Breakdown Content */}
      <div className="flex-grow flex flex-col gap-3">

        {/* Section 1: Base Tariff */}
        <div className="border-b border-slate-200 dark:border-white/10 pb-2 mb-1">
          <div className="text-xs text-amber-400 font-bold mb-1 opacity-90 flex items-center">
            <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[0.6rem] font-bold text-white mr-1.5 bg-amber-500">1</span>
            ค่าไฟฟ้าฐาน
          </div>
          <VisualBar value={bill.baseTariff} max={bill.total} color="linear-gradient(90deg, #f59e0b, #fbbf24)" />
          <div className="flex justify-between text-xs text-slate-600 dark:text-stone-300 mb-[3px]">
            <span>ค่าพลังงานไฟฟ้า ({formatCurrency(monthlyEnergy)} หน่วย)</span>
            <span className="font-mono font-medium">{formatCurrency(bill.energyCharge)} บาท</span>
          </div>
          <div className="flex justify-between text-xs text-slate-600 dark:text-stone-300 mb-[3px]">
            <span>ค่าบริการ</span>
            <span className="font-mono font-medium">{formatCurrency(bill.serviceCharge)} บาท</span>
          </div>
          <div className="flex justify-between text-xs text-slate-800 dark:text-white mb-[3px] mt-1 font-semibold">
            <span>รวมค่าไฟฟ้าฐาน</span>
            <span className="font-mono font-medium text-amber-400">{formatCurrency(bill.baseTariff)} บาท</span>
          </div>
        </div>

        {/* Section 2: Ft (Editable) */}
        <div className="border-b border-slate-200 dark:border-white/10 pb-2 mb-1">
          <div className="text-xs text-amber-400 font-bold mb-1 opacity-90 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[0.6rem] font-bold text-white bg-orange-600">2</span>
              <span>ค่าไฟฟ้าผันแปร (Ft)</span>
            </div>
            <button
              onClick={() => setIsEditingFt(!isEditingFt)}
              className="bg-transparent border border-amber-400/30 text-amber-400 text-[0.65rem] px-1.5 py-0.5 rounded cursor-pointer hover:bg-amber-400/10 transition-colors"
            >
              {isEditingFt ? 'Done' : 'Edit Ft'}
            </button>
          </div>
          <VisualBar value={Math.abs(bill.ftCharge)} max={bill.total} color="linear-gradient(90deg, #ea580c, #f97316)" />

          <div className="flex justify-between text-xs text-slate-600 dark:text-stone-300 mb-[3px] items-center">
            <div className="flex items-center gap-2">
              <span>ค่า Ft</span>
              {isEditingFt ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={(ftRate * 100).toFixed(2)}
                    onChange={(e) => setFtRate(Number(e.target.value) / 100)}
                    step="0.01"
                    className="w-[60px] bg-slate-100 dark:bg-black/30 border border-amber-400 text-slate-900 dark:text-white px-1 py-0.5 rounded text-right text-[0.8rem]"
                  />
                  <span className="text-[0.75rem] text-slate-500 dark:text-stone-400">สตางค์/หน่วย</span>
                </div>
              ) : (
                <span className="text-[0.8rem] text-slate-500 dark:text-stone-400">
                  ({(ftRate * 100).toFixed(2)} สตางค์/หน่วย)
                </span>
              )}
            </div>
            <span className="font-mono font-medium">{formatCurrency(bill.ftCharge)} บาท</span>
          </div>
        </div>

        {/* Section 3: VAT */}
        <div className="border-b border-slate-200 dark:border-white/10 pb-2 mb-1">
          <div className="text-xs text-amber-400 font-bold mb-1 opacity-90 flex items-center">
            <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[0.6rem] font-bold text-white mr-1.5 bg-red-600">3</span>
            ภาษีมูลค่าเพิ่ม 7%
          </div>
          <VisualBar value={bill.vat} max={bill.total} color="linear-gradient(90deg, #dc2626, #ef4444)" />
          <div className="flex justify-between text-xs text-slate-600 dark:text-stone-300 mb-[3px]">
            <span>(ค่าไฟฟ้าฐาน + ค่า Ft) x 7%</span>
            <span className="font-mono font-medium">{formatCurrency(bill.vat)} บาท</span>
          </div>
        </div>

        {/* Total Grand */}
        <div className="bg-slate-100 dark:bg-black/30 px-4 py-3 rounded-xl flex justify-between items-center mt-2 border border-slate-200 dark:border-amber-400/20">
          <span className="text-[0.85rem] font-bold text-slate-800 dark:text-white">{t('cost.total')}</span>
          <span className="text-[1.4rem] font-extrabold text-amber-400 font-mono">
            {loading ? '...' : formatCurrency(bill.total)}
            <span className="text-[0.85rem] text-slate-400 dark:text-stone-400 font-sans font-normal ml-1"> บาท</span>
          </span>
        </div>

      </div>

      {/* Budget Bar with markers */}
      <div className="mt-4">
        <div className="flex justify-between text-[0.6rem] text-stone-500 mb-1">
          <span>0</span>
          <span>เป้า 5,000</span>
        </div>
        <div className="relative h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-visible">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-out ${bill.total > 5000 ? 'bg-gradient-to-r from-red-500 to-red-400' : 'bg-gradient-to-r from-amber-500 to-amber-300'}`}
            style={{ width: `${Math.min((bill.total / 5000) * 100, 100)}%` }}
          ></div>
          {/* Markers */}
          <div className="absolute top-[-2px] w-0.5 h-2.5 bg-white/30 rounded-[1px] left-1/2"></div>
          <div className="absolute top-[-2px] w-0.5 h-2.5 bg-white/30 rounded-[1px] left-[80%]"></div>
        </div>
      </div>

      {/* History Button - Absolute */}
      <button
        onClick={() => setShowHistoryChart(true)}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-amber-500/15 border border-amber-500/30 rounded-lg text-amber-400 cursor-pointer transition-all duration-200 hover:bg-amber-500/25 hover:border-amber-400 hover:scale-105"
      >
        <TrendingUp size={18} />
      </button>

      {/* History Chart Popup (Portal เพื่อแก้ z-index stacking) */}
      {showHistoryChart && createPortal(
        <div className="history-chart-overlay fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-200" onClick={() => setShowHistoryChart(false)}>
          <div className="history-chart-popup w-full max-w-[900px] max-h-[90vh] bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-amber-400/20 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
            <EnergyCostHistoryChart
              initialMode="monthly"
              onClose={() => setShowHistoryChart(false)}
              isPopup={true}
              ftRate={ftRate}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default EnergyCostBlock;