import type { Vec3 } from "@/types/orbital";

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

/**
 * Compute T(x) — the normalized time of transit for a given x parameter.
 * Elliptic branch when x ∈ (-1, 1), hyperbolic when x > 1.
 */
function xToTimeOfTransit(x: number, lambda: number): number {
  const battin = 0.01;
  const lagrange = 0.2;
  const dist = Math.abs(1 - x * x);

  if (dist < battin) {
    // Series expansion near parabolic (x ≈ ±1)
    const eta = x * x - 1;
    const s1 = 0.5 * (1 - lambda * lambda);
    let q = (4.0 / 3.0) * s1;
    const s2 = q;
    // Continued fraction for hypergeometric
    let temp = 1.0;
    for (let n = 0; n < 35; n++) {
      const k = n + 3;
      q = q * s1 * (k - 1) / k;
      temp += q;
    }
    if (dist < lagrange) {
      return (temp * eta + s2) * eta + 1 + lambda * x;
    } else if (x < 1) {
      const psi = Math.acos(x);
      return (psi / Math.sin(psi) - lambda) / dist;
    }
    const psi = Math.acosh(x);
    return (lambda - psi / Math.sinh(psi)) / dist;
  }

  if (x < 1) {
    // Elliptic
    const psi = Math.acos(x);
    return (psi / Math.sin(psi) - lambda) / dist;
  }
  // Hyperbolic
  const psi = Math.acosh(x);
  return (lambda - psi / Math.sinh(psi)) / dist;
}

/**
 * Compute the first three derivatives of T(x) analytically.
 * Returns [dT, ddT, dddT].
 */
function dTdx(x: number, T: number, lambda: number): [number, number, number] {
  const umx2 = 1 - x * x;
  const dT = (3 * T * x - 2 + 2 * lambda * lambda * lambda * x / umx2) / umx2;
  const ddT = (3 * T + 5 * x * dT + 2 * (1 - lambda * lambda) * lambda * lambda * lambda / (umx2 * umx2)) / umx2;
  const dddT = (7 * x * ddT + 8 * dT - 6 * (1 - lambda * lambda) * lambda * lambda * lambda * lambda * lambda * x / (umx2 * umx2 * umx2)) / umx2;
  return [dT, ddT, dddT];
}

export interface LambertResult {
  v1: Vec3;
  v2: Vec3;
}

/**
 * Izzo's Lambert solver (2014) with Lancaster-Blanchard λ-parameterization
 * and 3rd-order Householder iteration.
 *
 * Given two position vectors r1, r2 (in any consistent units) and
 * time of flight tof (matching time units for mu), find the transfer
 * orbit velocities v1 and v2.
 *
 * Returns null if no convergent solution found.
 */
export function solveLambert(
  r1: Vec3,
  r2: Vec3,
  tof: number,
  mu: number,
  prograde = true,
): LambertResult | null {
  if (tof <= 0) return null;

  const r1mag = vecMag(r1);
  const r2mag = vecMag(r2);
  if (r1mag < 1e-14 || r2mag < 1e-14) return null;

  // Unit vectors
  const r1hat: Vec3 = vecScale(r1, 1 / r1mag);
  const r2hat: Vec3 = vecScale(r2, 1 / r2mag);

  // Orbit plane normal: n̂ = normalize(r̂₁ × r̂₂)
  let nhat = vecCross(r1hat, r2hat);
  const nMag2 = vecDot(nhat, nhat);

  if (nMag2 < 0.5) {
    // Nearly coplanar or anti-parallel: use average angular momentum normal
    // Fall back to z-axis if completely degenerate
    nhat = { x: 0, y: 0, z: 1 };
  } else {
    const nMag = Math.sqrt(nMag2);
    nhat = vecScale(nhat, 1 / nMag);
  }

  // Tangent vectors — direction depends on prograde/retrograde
  // For prograde (nhat.z > 0): t̂₁ = n̂ × r̂₁, t̂₂ = n̂ × r̂₂
  // For retrograde: reverse
  let t1hat: Vec3;
  let t2hat: Vec3;
  if (prograde ? nhat.z >= 0 : nhat.z < 0) {
    t1hat = vecCross(nhat, r1hat);
    t2hat = vecCross(nhat, r2hat);
  } else {
    t1hat = vecCross(r1hat, nhat);
    t2hat = vecCross(r2hat, nhat);
    nhat = vecScale(nhat, -1);
  }

  // Geometry: chord c, semi-perimeter s, lambda
  const chord = vecMag(vecSub(r2, r1));
  const s = (r1mag + r2mag + chord) / 2;
  let lambda = Math.sqrt(1 - chord / s);

  // Determine sign of lambda from transfer angle
  const t1dot = vecDot(t1hat, vecSub(r2, r1));
  if (t1dot < 0) {
    lambda = -lambda;
  }

  // Normalized time of flight: T = sqrt(2μ/s³) · tof
  const T = Math.sqrt(2 * mu / (s * s * s)) * tof;

  // Compute T at key reference points
  const T0 = xToTimeOfTransit(0, lambda); // minimum energy
  const T1 = 2.0 / 3.0 * (1 - lambda * lambda * lambda); // parabolic

  // Initial guess for x
  let x0: number;
  if (T >= T0) {
    // Beyond minimum energy
    x0 = -(T - T0) / (T - T0 + 4);
  } else if (T <= T1) {
    // Sub-parabolic
    x0 = 1 + T1 * (T1 - T) * 0.4 * (1 - lambda * lambda * lambda * lambda * lambda) / T;
  } else {
    // Intermediate: logarithmic interpolation
    x0 = Math.pow(T / T0, Math.log(2) / Math.log(T1 / T0)) - 1;
  }

  // Householder iteration (3rd order)
  let x = x0;
  for (let iter = 0; iter < 15; iter++) {
    const Tx = xToTimeOfTransit(x, lambda);
    const [dt, ddt, dddt] = dTdx(x, Tx, lambda);
    const delta = Tx - T;

    if (Math.abs(delta) < 1e-11) break;

    // 3rd-order Householder update
    const dt2 = dt * dt;
    const denom = dt * (dt2 - delta * ddt / 2) + dddt * delta * delta / 6;
    if (Math.abs(denom) < 1e-30) break;
    x = x - delta * (dt2 - delta * ddt / 2) / denom;
  }

  // Velocity reconstruction
  // gamma, rho, sigma parameters
  const gamma = Math.sqrt(mu * s / 2);
  const rho = (r1mag - r2mag) / chord;
  const sigma = Math.sqrt(1 - rho * rho) * (lambda >= 0 ? 1 : -1);

  const umx2 = 1 - x * x;
  if (Math.abs(umx2) < 1e-14) {
    return null; // Degenerate parabolic limit
  }

  const y = Math.sqrt(Math.abs(umx2));
  // vr and vt components (radial and tangential velocities)
  const vr1 = gamma * ((lambda * y - x) - rho * (lambda * y + x)) / r1mag;
  const vt1 = gamma * sigma * (y + lambda * x) / r1mag;
  const vr2 = -gamma * ((lambda * y - x) + rho * (lambda * y + x)) / r2mag;
  const vt2 = gamma * sigma * (y + lambda * x) / r2mag;

  // Construct velocity vectors
  const v1 = vecAdd(vecScale(r1hat, vr1), vecScale(t1hat, vt1));
  const v2 = vecAdd(vecScale(r2hat, vr2), vecScale(t2hat, vt2));

  // Sanity check
  if (!isFinite(vecMag(v1)) || !isFinite(vecMag(v2))) return null;

  return { v1, v2 };
}
