import type { Vec3 } from "@/types/orbital";

/**
 * Stumpff function C(z) = (1 - cos(sqrt(z))) / z
 */
function stumpffC(z: number): number {
  if (Math.abs(z) < 1e-6) return 1 / 2 - z / 24 + (z * z) / 720;
  if (z > 0) {
    const sz = Math.sqrt(z);
    return (1 - Math.cos(sz)) / z;
  }
  const sz = Math.sqrt(-z);
  return (Math.cosh(sz) - 1) / -z;
}

/**
 * Stumpff function S(z) = (sqrt(z) - sin(sqrt(z))) / sqrt(z^3)
 */
function stumpffS(z: number): number {
  if (Math.abs(z) < 1e-6) return 1 / 6 - z / 120 + (z * z) / 5040;
  if (z > 0) {
    const sz = Math.sqrt(z);
    return (sz - Math.sin(sz)) / (sz * sz * sz);
  }
  const sz = Math.sqrt(-z);
  return (Math.sinh(sz) - sz) / (sz * sz * sz);
}

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

export interface LambertResult {
  v1: Vec3;
  v2: Vec3;
}

/**
 * Universal variable Lambert solver.
 *
 * Given two position vectors r1, r2 (in any consistent units) and
 * time of flight tof (matching time units for mu), find the transfer
 * orbit velocities v1 and v2.
 *
 * Based on Algorithm 5.2 from Curtis, "Orbital Mechanics for Engineering Students"
 * using Newton iteration on universal variable z with Stumpff functions.
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

  const cross = vecCross(r1, r2);
  const cosTA = vecDot(r1, r2) / (r1mag * r2mag);

  // Clamp cosTA to avoid numerical issues
  const cosTA_clamped = Math.max(-1, Math.min(1, cosTA));

  // Determine transfer angle direction
  let sinTA: number;
  if (prograde) {
    sinTA = cross.z >= 0
      ? Math.sqrt(1 - cosTA_clamped * cosTA_clamped)
      : -Math.sqrt(1 - cosTA_clamped * cosTA_clamped);
  } else {
    sinTA = cross.z >= 0
      ? -Math.sqrt(1 - cosTA_clamped * cosTA_clamped)
      : Math.sqrt(1 - cosTA_clamped * cosTA_clamped);
  }

  // A parameter from Curtis eq. 5.35
  const A = sinTA * Math.sqrt(r1mag * r2mag / (1 - cosTA_clamped));
  if (!isFinite(A) || Math.abs(A) < 1e-14) return null;

  // Newton-Raphson on z to match time of flight
  // Use bisection-assisted Newton for robustness
  let zLow = -4 * Math.PI * Math.PI;
  let zHigh = 4 * Math.PI * Math.PI;
  let z = 0;

  for (let iter = 0; iter < 200; iter++) {
    const C = stumpffC(z);
    const S = stumpffS(z);

    const y = r1mag + r2mag + A * (z * S - 1) / Math.sqrt(C);

    if (y < 0) {
      // Need higher z
      zLow = z;
      z = (z + zHigh) / 2;
      continue;
    }

    const sqrtY = Math.sqrt(y);
    const chi = sqrtY / Math.sqrt(C);

    const tofCalc = (chi * chi * chi * S + A * sqrtY) / Math.sqrt(mu);

    if (Math.abs(tofCalc - tof) < 1e-10 * tof + 1e-14) {
      // Converged: compute Lagrange coefficients and velocities
      const f = 1 - y / r1mag;
      const g = A * sqrtY / Math.sqrt(mu);
      const gdot = 1 - y / r2mag;

      if (Math.abs(g) < 1e-14) return null;

      const v1: Vec3 = {
        x: (r2.x - f * r1.x) / g,
        y: (r2.y - f * r1.y) / g,
        z: (r2.z - f * r1.z) / g,
      };

      const v2: Vec3 = {
        x: (gdot * r2.x - r1.x) / g,
        y: (gdot * r2.y - r1.y) / g,
        z: (gdot * r2.z - r1.z) / g,
      };

      return { v1, v2 };
    }

    // Derivative dTOF/dz (Curtis eq. 5.43)
    let dtdz: number;
    if (Math.abs(z) > 1e-6) {
      dtdz = (chi * chi * chi * (S - 3 * S / (2 * C * z) + 1 / (2 * z)) +
              (3 * S * A * sqrtY) / (8 * C) + A * Math.sqrt(C) / (2 * sqrtY)) /
             Math.sqrt(mu);
    } else {
      // Near-parabolic approximation
      dtdz = (Math.sqrt(2) / 40 * y * sqrtY +
              A / 8 * (sqrtY + A * Math.sqrt(1 / (2 * y)))) /
             Math.sqrt(mu);
    }

    if (Math.abs(dtdz) < 1e-20) {
      // Fall back to bisection
      if (tofCalc > tof) {
        zHigh = z;
      } else {
        zLow = z;
      }
      z = (zLow + zHigh) / 2;
      continue;
    }

    // Newton step with bounds
    const zNew = z - (tofCalc - tof) / dtdz;

    // Update bisection bounds (TOF increases with z)
    if (tofCalc > tof) {
      zHigh = z;
    } else {
      zLow = z;
    }

    // Use Newton step if within bounds, otherwise bisect
    if (zNew > zLow && zNew < zHigh) {
      z = zNew;
    } else {
      z = (zLow + zHigh) / 2;
    }
  }

  return null;
}
