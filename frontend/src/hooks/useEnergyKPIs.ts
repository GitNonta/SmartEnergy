import { useEffect, useState } from 'react';

import { getApiBase } from '../config/api';

export interface EnergyKPIs {
  dailyKWh: number | null;
  monthlyKWh: number | null;
  avgPowerKW: number | null;
  peakPowerKW: number | null;
  loading: boolean;
  error?: string;
}

export function useEnergyKPIs(): EnergyKPIs {
  const [state, setState] = useState<EnergyKPIs>({ dailyKWh: null, monthlyKWh: null, avgPowerKW: null, peakPowerKW: null, loading: true });

  useEffect(() => {
    let cancel = false;

    async function run() {
      try {
        // Daily kWh (00:00 local → now)
        const dailyRes = await fetch(`${getApiBase()}/api/energy/daily-realtime?deviceId=AI205`, { cache: 'no-store' });
        const dailyJson = await dailyRes.json();
        const dailyKWh = typeof dailyJson.daily === 'number' ? dailyJson.daily : null;

        // Monthly total kWh (last 30d via 1m bucket)
        const monthlyRes = await fetch(`${getApiBase()}/api/energy/total?timeRange=1M&deviceId=AI205`, { cache: 'no-store' });
        const monthlyJson = await monthlyRes.json();
        const monthlyKWh = typeof monthlyJson.energy === 'number' ? monthlyJson.energy : null;

        // Average power kW (1D window)
        const avgRes = await fetch(`${getApiBase()}/api/energy/average-power?timeRange=1D&deviceId=AI205`, { cache: 'no-store' });
        const avgJson = await avgRes.json();
        const avgPowerKW = typeof avgJson.averagePower === 'number' ? avgJson.averagePower : null;

        // Peak power kW (approx) from 1h bucket over last 1D, take max of power_active then /1000
        const bucketRes = await fetch(`${getApiBase()}/api/data/bucket?bucket=1h&range=-1d&deviceId=AI205&type=combined&fields=power_active`, { cache: 'no-store' });
        const bucketJson = await bucketRes.json();
        const arr: any[] = Array.isArray(bucketJson.data) ? bucketJson.data : [];
        const maxW = arr.reduce((mx, r) => {
          const v = typeof r.power_active === 'number' ? r.power_active : null;
          return v != null && v > mx ? v : mx;
        }, 0);
        const peakPowerKW = maxW > 0 ? maxW / 1000 : null;

        if (cancel) return;
        setState({ dailyKWh, monthlyKWh, avgPowerKW, peakPowerKW, loading: false });
      } catch (e: any) {
        if (cancel) return;
        setState((s) => ({ ...s, loading: false, error: e?.message || 'Failed to load KPIs' }));
      }
    }

    run();
    return () => { cancel = true; };
  }, []);

  return state;
}
