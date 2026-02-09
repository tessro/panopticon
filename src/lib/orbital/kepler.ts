import type { SpaceBody, OrbitalState } from "@/types/orbital";
import { DEG_RAD, GM_SUN_AU } from "./constants";

/**
 * Solve Kepler's equation M = E - e*sin(E) for eccentric anomaly E
 * via Newton-Raphson iteration. Matches Terra Invicta's solver.
 *
 * Dispatches to hyperbolic solver when e >= 1.
 */
export function solveKepler(M: number, e: number): number {
  if (e >= 1) return solveKeplerHyperbolic(M, e);

  // Normalize M to [0, 2π)
  let Mn = M % (2 * Math.PI);
  if (Mn < 0) Mn += 2 * Math.PI;

  // Initial guess: E = M (TI uses M, not M + e*sin(M))
  let E = Mn;

  // Clamped eccentricity for denominator stability
  const eDenom = Math.min(e, 0.9);

  for (let i = 0; i < 1000; i++) {
    // Numerator uses real eccentricity, denominator uses clamped
    const dE = (E - e * Math.sin(E) - Mn) / (1 - eDenom * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-6) break;
  }

  return E;
}

/**
 * Solve hyperbolic Kepler's equation M = e*sinh(H) - H for H
 * via Newton-Raphson iteration.
 */
function solveKeplerHyperbolic(M: number, e: number): number {
  // Initial guess
  let H: number;
  if (Math.abs(M) <= 10) {
    H = M;
  } else {
    H = Math.sign(M) * Math.log(Math.abs(M) / e);
  }

  for (let i = 0; i < 1000; i++) {
    const dH = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
    H -= dH;
    if (Math.abs(dH) < 1e-6) break;
  }

  return H;
}

/**
 * Compute heliocentric position and velocity of a body at Julian year t_JY,
 * returned in AU and AU/yr.
 *
 * Handles both elliptical (e < 1) and hyperbolic (e >= 1) orbits.
 */
export function bodyStateAt(body: SpaceBody, t_JY: number): OrbitalState {
  const a = body.semiMajorAxis_AU;
  const e = body.eccentricity;
  const I = body.inclination_Deg * DEG_RAD;
  const Omega = body.longAscendingNode_Deg * DEG_RAD;
  const omega = body.argPeriapsis_Deg * DEG_RAD;
  const M0 = body.meanAnomalyAtEpoch_Deg * DEG_RAD;
  // epoch_floatJYears is an absolute Julian year (e.g. 2000 = J2000.0);
  // t_JY is years since J2000, so convert epoch to the same reference frame
  const epochJY = body.epoch_floatJYears - 2000;

  // Mean motion (rad/yr) = sqrt(GM/|a|^3) in AU/yr units
  const absA = Math.abs(a);
  const n = Math.sqrt(GM_SUN_AU / (absA * absA * absA));

  // Mean anomaly at time t
  const M = M0 + n * (t_JY - epochJY);

  // Solve Kepler's equation (dispatches to hyperbolic if e >= 1)
  const anomaly = solveKepler(M, e);

  let nu: number;
  let r: number;

  if (e < 1) {
    // Elliptical orbit
    const sinE = Math.sin(anomaly);
    const cosE = Math.cos(anomaly);
    const sqrtTerm = Math.sqrt(1 - e * e);
    nu = Math.atan2(sqrtTerm * sinE, cosE - e);
    r = a * (1 - e * cosE);
  } else {
    // Hyperbolic orbit
    const coshH = Math.cosh(anomaly);
    nu = Math.acos((coshH - e) / (1 - e * coshH));
    if (anomaly < 0) nu = -nu;
    r = absA * (1 - e * coshH);
    // For hyperbolic orbits with a < 0: r = |a| * (e*cosh(H) - 1)
    r = Math.abs(r);
  }

  // Position in orbital plane
  const xOrb = r * Math.cos(nu);
  const yOrb = r * Math.sin(nu);

  // Velocity in orbital plane
  let vxOrb: number;
  let vyOrb: number;
  if (e < 1) {
    const factor = n * a / Math.sqrt(1 - e * e);
    vxOrb = -factor * Math.sin(nu);
    vyOrb = factor * (e + Math.cos(nu));
  } else {
    // Hyperbolic vis-viva: v = sqrt(mu * (2/r + 1/|a|))
    // Angular momentum h = sqrt(mu * |a| * (e² - 1))
    const h = Math.sqrt(GM_SUN_AU * absA * (e * e - 1));
    vxOrb = -GM_SUN_AU * Math.sin(nu) / h;
    vyOrb = GM_SUN_AU * (e + Math.cos(nu)) / h;
  }

  // Rotation matrix elements (3-1-3 Euler angles: Ω, I, ω)
  const cosOmega = Math.cos(Omega);
  const sinOmega = Math.sin(Omega);
  const cosI = Math.cos(I);
  const sinI = Math.sin(I);
  const cosw = Math.cos(omega);
  const sinw = Math.sin(omega);

  // Perifocal to heliocentric rotation
  const Px = cosOmega * cosw - sinOmega * sinw * cosI;
  const Py = sinOmega * cosw + cosOmega * sinw * cosI;
  const Pz = sinw * sinI;

  const Qx = -cosOmega * sinw - sinOmega * cosw * cosI;
  const Qy = -sinOmega * sinw + cosOmega * cosw * cosI;
  const Qz = cosw * sinI;

  return {
    pos: {
      x: Px * xOrb + Qx * yOrb,
      y: Py * xOrb + Qy * yOrb,
      z: Pz * xOrb + Qz * yOrb,
    },
    vel: {
      x: Px * vxOrb + Qx * vyOrb,
      y: Py * vxOrb + Qy * vyOrb,
      z: Pz * vxOrb + Qz * vyOrb,
    },
  };
}
