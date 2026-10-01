export const ROWS = 4;
export const COLS = 10;
export const HISTORY = 60;
export const PDU_KW = 12;

export type Rack = {
  id: string; row: number; col: number;
  load: number; // 0..1 baseline workload
  powerKw: number; inlet: number; outlet: number; fan: number;
  fault: boolean;
  hist: number[]; pHist: number[];
};

export type Cooling = { setpoint: number; crac: boolean[] };
export type Thresholds = { warn: number; crit: number; powerPct: number };

export type Prediction = {
  slope: number; // °C per tick
  etaCrit: number | null; // ticks until critical
  powerRisk: number; thermalRisk: number; risk: number;
};

export type Alert = { id: number; t: number; rack: string; level: "warn" | "crit"; kind: "thermal" | "power" | "predictive"; msg: string };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function initRacks(): Rack[] {
  const r: Rack[] = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) {
      const load = 0.35 + Math.random() * 0.45;
      r.push({ id: `R${row + 1}-${String(col + 1).padStart(2, "0")}`, row, col, load,
        powerKw: load * PDU_KW * 0.8, inlet: 22, outlet: 32, fan: 50, fault: false, hist: [], pHist: [] });
    }
  return r;
}

export function step(racks: Rack[], cooling: Cooling): Rack[] {
  return racks.map((rk) => {
    const load = clamp(rk.load + (Math.random() - 0.5) * 0.04, 0.15, 0.98);
    const faultBoost = rk.fault ? 0.35 : 0;
    const powerKw = clamp((load + faultBoost) * PDU_KW * 0.85 + (Math.random() - 0.5) * 0.4, 0.5, PDU_KW * 1.2);
    const cracOk = cooling.crac[rk.row] ?? true;
    // end-of-row racks see more hot-air recirculation
    const recirc = Math.abs(rk.col - (COLS - 1) / 2) / ((COLS - 1) / 2) * 2.2;
    const target = cooling.setpoint + recirc + powerKw * 0.45 + (cracOk ? 0 : 9) + (rk.fault ? 4 : 0);
    const inlet = rk.inlet + (target - rk.inlet) * 0.08 + (Math.random() - 0.5) * 0.25;
    const fan = clamp(30 + (inlet - 18) * 4, 20, 100);
    const outlet = inlet + powerKw * 1.1 * (100 / (fan + 20));
    const hist = [...rk.hist, inlet].slice(-HISTORY);
    const pHist = [...rk.pHist, powerKw].slice(-HISTORY);
    return { ...rk, load, powerKw, inlet, outlet, fan, hist, pHist };
  });
}

function slopeOf(arr: number[]): number {
  const n = arr.length;
  if (n < 4) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += arr[i]; sxy += i * arr[i]; sxx += i * i; }
  const d = n * sxx - sx * sx;
  return d === 0 ? 0 : (n * sxy - sx * sy) / d;
}

export function predict(rk: Rack, th: Thresholds): Prediction {
  const slope = slopeOf(rk.hist.slice(-20));
  const gap = th.crit - rk.inlet;
  const etaCrit = gap <= 0 ? 0 : slope > 0.005 ? gap / slope : null;
  const pSlope = slopeOf(rk.pHist.slice(-20));
  const projPower = rk.powerKw + Math.max(0, pSlope) * 30;
  const powerRisk = clamp((projPower / PDU_KW * 100 - (th.powerPct - 20)) / 25, 0, 1);
  const thermalRisk = etaCrit === 0 ? 1 : etaCrit === null ? clamp((rk.inlet - th.warn + 3) / 10, 0, 0.6) : clamp(1 - etaCrit / 120, 0, 1);
  const risk = clamp(1 - (1 - powerRisk) * (1 - thermalRisk), 0, 1);
  return { slope, etaCrit, powerRisk, thermalRisk, risk };
}

export function heatLevel(t: number, th: Thresholds): number {
  if (t >= th.crit) return 4;
  if (t >= th.warn) return 3;
  if (t >= th.warn - 3) return 2;
  if (t >= th.warn - 6) return 1;
  return 0;
}

export const HEAT_BG = ["bg-heat-0", "bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4"];
