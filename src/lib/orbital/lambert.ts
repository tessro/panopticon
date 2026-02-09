import type { OrbitalState, Vec3 } from "@/types/orbital";

function vecMag(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vecCross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function normalize(v: Vec3): Vec3 | null {
  const m = vecMag(v);
  if (!Number.isFinite(m) || m <= 1e-14) return null;
  return vecScale(v, 1 / m);
}

function xToTimeOfTransit(x: number, lambda: number, lambda2: number): number {
  const oneMinusX2 = 1 - x * x;
  if (Math.abs(oneMinusX2) <= 1e-14) return Number.NaN;

  const z = 1 / oneMinusX2;

  if (z > 0) {
    const psi = 2 * Math.acos(Math.max(-1, Math.min(1, x)));
    const phiArg = Math.max(0, Math.min(1, lambda2 / z));
    let phi = 2 * Math.asin(Math.sqrt(phiArg));
    if (lambda < 0) phi = -phi;
    return (
      (z * Math.sqrt(z) * ((psi - Math.sin(psi)) - (phi - Math.sin(phi)))) / 2
    );
  }

  if (x < 1) return Number.NaN;
  const minusZ = -z;
  const psi = 2 * Math.acosh(x);
  const phiArg = Math.max(0, -lambda2 / z);
  let phi = 2 * Math.asinh(Math.sqrt(phiArg));
  if (lambda < 0) phi = -phi;
  return (
    (minusZ * Math.sqrt(minusZ) * ((Math.sinh(psi) - psi) - (Math.sinh(phi) - phi))) /
    2
  );
}

function dTdx(
  x: number,
  T: number,
  lambda2: number,
  lambda3: number,
): [number, number, number] {
  const w = 1 - x * x;
  if (Math.abs(w) <= 1e-14) return [Number.NaN, Number.NaN, Number.NaN];

  const y = 1 - lambda2 * w;
  if (y <= 0) return [Number.NaN, Number.NaN, Number.NaN];

  const g = Math.sqrt(y);
  const h = y * g;
  const oneMinusLambda2 = 1 - lambda2;
  const lambda5 = lambda2 * lambda3;
  const invW = 1 / w;

  const dT = invW * (3 * T * x - 2 + (2 * lambda3 * x) / g);
  const ddT = invW * (3 * T + 5 * x * dT + (2 * oneMinusLambda2 * lambda3) / h);
  const dddT =
    invW *
    (7 * x * ddT + 8 * dT - (6 * oneMinusLambda2 * lambda5 * x) / (h * y));

  return [dT, ddT, dddT];
}

export interface LambertResult {
  initialVelocity: Vec3;
  finalVelocity: Vec3;
  burn0: Vec3;
  burn1: Vec3;
  totalDV: number;
}

/**
 * Terra Invicta's Izzo/Lancaster-Blanchard Lambert implementation.
 * All units must be SI-consistent: meters, seconds, m^3/s^2.
 */
export function solveLambert(
  transitTimeSeconds: number,
  initialState: OrbitalState,
  endState: OrbitalState,
  barycenterMu: number,
  retrograde = false,
): LambertResult | null {
  if (!Number.isFinite(transitTimeSeconds) || transitTimeSeconds <= 0) return null;
  if (!Number.isFinite(barycenterMu) || barycenterMu <= 0) return null;

  const r1 = initialState.pos;
  const r2 = endState.pos;
  const r1mag = vecMag(r1);
  const r2mag = vecMag(r2);
  if (r1mag <= 0 || r2mag <= 0) return null;

  const r1hat = vecScale(r1, 1 / r1mag);
  const r2hat = vecScale(r2, 1 / r2mag);

  let nhat = vecCross(r1hat, r2hat);
  let nMag2 = vecDot(nhat, nhat);

  if (nMag2 < 0.5) {
    const h1 = normalize(vecCross(initialState.pos, initialState.vel));
    const h2 = normalize(vecCross(endState.pos, endState.vel));
    if (h1 && h2) {
      const merged = normalize(vecAdd(h1, h2));
      nhat = merged ?? { x: 0, y: 0, z: 1 };
    } else {
      nhat = { x: 0, y: 0, z: 1 };
    }
    nMag2 = vecDot(nhat, nhat);
    if (nMag2 <= 0) nhat = { x: 0, y: 0, z: 1 };
  } else {
    nhat = vecScale(nhat, 1 / Math.sqrt(nMag2));
  }

  const chord = vecMag(vecSub(r2, r1));
  if (chord <= 0) return null;
  const s = (chord + r1mag + r2mag) / 2;
  if (s <= 0) return null;

  const lambda2 = Math.max(0, 1 - chord / s);
  let lambda = Math.sqrt(lambda2);
  const lambda3 = lambda2 * lambda;

  let t1hat: Vec3;
  let t2hat: Vec3;
  if (nhat.z >= 0) {
    t1hat = vecCross(nhat, r1hat);
    t2hat = vecCross(nhat, r2hat);
  } else {
    t1hat = vecCross(r1hat, nhat);
    t2hat = vecCross(r2hat, nhat);
    lambda = -lambda;
  }

  if (retrograde) {
    lambda = -lambda;
    t1hat = vecScale(t1hat, -1);
    t2hat = vecScale(t2hat, -1);
  }

  const T = Math.sqrt((2 * barycenterMu) / (s * s * s)) * transitTimeSeconds;
  if (!Number.isFinite(T) || T <= 0) return null;

  const T0 = Math.acos(Math.max(-1, Math.min(1, lambda))) + lambda * Math.sqrt(1 - lambda2);
  const T1 = (2 / 3) * (1 - lambda * lambda * lambda);

  let x0: number;
  if (T >= T0) {
    x0 = -(T - T0) / (T - T0 + 4);
  } else if (T <= T1) {
    const lambda5 = lambda2 * lambda3;
    x0 = 1 + (T1 * (T1 - T) * 0.4 * (1 - lambda5)) / T;
  } else {
    const denom = Math.log(T1 / T0);
    if (!Number.isFinite(denom) || Math.abs(denom) <= 1e-14) return null;
    x0 = Math.pow(T / T0, Math.log(2) / denom) - 1;
  }

  if (!Number.isFinite(x0)) return null;

  let x = x0;
  for (let i = 0; i < 15; i++) {
    const Tx = xToTimeOfTransit(x, lambda, lambda2);
    if (!Number.isFinite(Tx)) {
      x = x0;
      break;
    }
    const [dT, ddT, dddT] = dTdx(x, Tx, lambda2, lambda3);
    if (!Number.isFinite(dT) || !Number.isFinite(ddT) || !Number.isFinite(dddT)) {
      x = x0;
      break;
    }

    const delta = Tx - T;
    if (Math.abs(delta) < 1e-11) break;

    const dT2 = dT * dT;
    const numerator = delta * (dT2 - (delta * ddT) / 2);
    const denominator = dT * (dT2 - delta * ddT) + (dddT * delta * delta) / 6;
    if (Math.abs(denominator) <= 1e-30) break;

    const nextX = x - numerator / denominator;
    if (!Number.isFinite(nextX)) {
      x = x0;
      break;
    }
    x = nextX;
  }

  const gamma = Math.sqrt((barycenterMu * s) / 2);
  const rho = (r1mag - r2mag) / chord;
  const sigma2 = Math.max(0, 1 - rho * rho);
  const sigma = Math.sqrt(sigma2);
  const Warg = 1 - lambda2 * x * x + lambda2;
  if (Warg <= 0) return null;
  const W = Math.sqrt(Warg);

  const lambdaW = lambda * W;
  const xPlus = lambdaW + x;
  const xMinus = lambdaW - x;

  const v_r1 = (gamma * (xMinus - rho * xPlus)) / r1mag;
  const v_r2 = (-gamma * (xMinus + rho * xPlus)) / r2mag;
  const v_t1 = (gamma * sigma * (W + lambda * x)) / r1mag;
  const v_t2 = (gamma * sigma * (W + lambda * x)) / r2mag;

  const initialVelocity = vecAdd(vecScale(r1hat, v_r1), vecScale(t1hat, v_t1));
  const finalVelocity = vecAdd(vecScale(r2hat, v_r2), vecScale(t2hat, v_t2));
  if (!Number.isFinite(vecMag(initialVelocity)) || !Number.isFinite(vecMag(finalVelocity))) {
    return null;
  }

  const burn0 = vecSub(initialVelocity, initialState.vel);
  const burn1 = vecSub(endState.vel, finalVelocity);
  const totalDV = vecMag(burn0) + vecMag(burn1);
  if (!Number.isFinite(totalDV)) return null;

  return {
    initialVelocity,
    finalVelocity,
    burn0,
    burn1,
    totalDV,
  };
}
