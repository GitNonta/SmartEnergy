import React from 'react';

type KPIStatCardProps = {
  title: string;
  value: number | string;
  unit?: string;
  subtext?: string;
  delta?: number; // positive up / negative down
  icon?: React.ReactNode;
};

export default function KPIStatCard({ title, value, unit, subtext, delta, icon }: KPIStatCardProps) {
  const isUp = typeof delta === 'number' ? delta >= 0 : undefined;
  return (
    <div className="rounded-xl bg-white shadow p-4 flex items-center gap-4">
      {icon && (
        <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
          {icon}
        </div>
      )}
      <div className="flex-1">
        <div className="text-sm text-gray-500">{title}</div>
        <div className="mt-1 text-2xl font-semibold text-gray-900">
          {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
          {unit && <span className="ml-1 text-sm text-gray-500">{unit}</span>}
        </div>
        <div className="mt-1 text-xs text-gray-500">{subtext}</div>
      </div>
      {typeof delta === 'number' && (
        <div className={`text-sm font-medium ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>{isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%</div>
      )}
    </div>
  );
}
