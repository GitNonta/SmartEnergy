/**
 * Electricity Tariff Calculator
 * ตามอัตราค่าไฟฟ้าประเภท 1.1.1 (บ้านอยู่อาศัย < 150 หน่วย/เดือน)
 * 
 * Reference: การไฟฟ้าส่วนภูมิภาค (PEA)
 * Updated: December 2024
 * 
 * Usage:
 *   import { calculateBill, TARIFF_CONFIG } from './utils/tariffCalc';
 *   const bill = calculateBill(150, 0.1572); // 150 kWh, Ft 0.1572 บาท/หน่วย
 */

// ====================================
// TARIFF CONFIGURATION (Easy to update)
// ====================================
export const TARIFF_CONFIG = {
    type: '1.1.1',
    name: 'บ้านอยู่อาศัย (ไม่เกิน 150 หน่วย/เดือน)',
    serviceCharge: 8.19,      // ค่าบริการรายเดือน (บาท)
    vatRate: 0.07,            // ภาษีมูลค่าเพิ่ม 7%
    defaultFt: 0.1572,        // ค่า Ft เริ่มต้น (บาท/หน่วย) - Dec 2024

    // Progressive rate tiers (อัตราก้าวหน้า)
    tiers: [
        { from: 0, to: 15, rate: 2.3488 },   // หน่วยที่ 1-15
        { from: 15, to: 25, rate: 2.9882 },   // หน่วยที่ 16-25
        { from: 25, to: 35, rate: 3.2405 },   // หน่วยที่ 26-35
        { from: 35, to: 100, rate: 3.6237 },   // หน่วยที่ 36-100
        { from: 100, to: 150, rate: 3.7171 },   // หน่วยที่ 101-150
        { from: 150, to: 400, rate: 4.2218 },   // หน่วยที่ 151-400
        { from: 400, to: Infinity, rate: 4.4217 } // หน่วยที่ 401+
    ]
};

// ====================================
// TYPES
// ====================================
export interface BillBreakdown {
    /** จำนวนหน่วยที่ใช้ (kWh) */
    units: number;
    /** ค่าพลังงานไฟฟ้า (บาท) */
    energyCharge: number;
    /** ค่าบริการ (บาท) */
    serviceCharge: number;
    /** รวมค่าไฟฟ้าฐาน (บาท) */
    baseTariff: number;
    /** อัตรา Ft ที่ใช้ (บาท/หน่วย) */
    ftRate: number;
    /** ค่า Ft (บาท) */
    ftCharge: number;
    /** ยอดก่อน VAT (บาท) */
    preVat: number;
    /** VAT 7% (บาท) */
    vat: number;
    /** รวมทั้งหมด (บาท) */
    total: number;
    /** รายละเอียดแต่ละขั้น */
    tierBreakdown: TierBreakdown[];
}

export interface TierBreakdown {
    tier: number;
    from: number;
    to: number;
    units: number;
    rate: number;
    charge: number;
}

// ====================================
// CALCULATION FUNCTIONS
// ====================================

/**
 * Calculate energy charge using progressive rate
 * @param units - Total units consumed (kWh)
 * @returns Energy charge and tier breakdown
 */
export function calculateEnergyCharge(units: number): {
    energyCharge: number;
    tierBreakdown: TierBreakdown[]
} {
    let energyCharge = 0;
    const tierBreakdown: TierBreakdown[] = [];

    TARIFF_CONFIG.tiers.forEach((tier, index) => {
        if (units > tier.from) {
            const tierUnits = Math.min(units, tier.to) - tier.from;
            if (tierUnits > 0) {
                const charge = tierUnits * tier.rate;
                energyCharge += charge;
                tierBreakdown.push({
                    tier: index + 1,
                    from: tier.from,
                    to: Math.min(units, tier.to),
                    units: tierUnits,
                    rate: tier.rate,
                    charge
                });
            }
        }
    });

    return { energyCharge, tierBreakdown };
}

/**
 * Calculate full electricity bill
 * @param units - Total units consumed (kWh)
 * @param ftRate - Ft rate (บาท/หน่วย), defaults to config value
 * @returns Full bill breakdown
 */
export function calculateBill(
    units: number,
    ftRate: number = TARIFF_CONFIG.defaultFt
): BillBreakdown {
    // 1. Energy charge (progressive rate)
    const { energyCharge, tierBreakdown } = calculateEnergyCharge(units);

    // 2. Service charge
    const serviceCharge = TARIFF_CONFIG.serviceCharge;

    // 3. Base tariff
    const baseTariff = energyCharge + serviceCharge;

    // 4. Ft charge
    const ftCharge = units * ftRate;

    // 5. VAT base = energyCharge + serviceCharge only (PEA standard)
    // Ft is a separate line item excluded from the VAT base
    // Ref: PEA bill — VAT = (energyCharge + serviceCharge) × 7%
    const preVat = baseTariff + ftCharge; // total before VAT (for display)
    const vat = baseTariff * TARIFF_CONFIG.vatRate; // VAT on base only, not Ft

    // 7. Total
    const total = preVat + vat;

    return {
        units,
        energyCharge,
        serviceCharge,
        baseTariff,
        ftRate,
        ftCharge,
        preVat,
        vat,
        total,
        tierBreakdown
    };
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number, decimals: number = 2): string {
    return value.toLocaleString('th-TH', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Estimate monthly bill from daily average
 */
export function estimateMonthlyBill(
    dailyAvgKwh: number,
    ftRate?: number
): BillBreakdown {
    const daysInMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0
    ).getDate();

    const monthlyUnits = dailyAvgKwh * daysInMonth;
    return calculateBill(monthlyUnits, ftRate);
}
