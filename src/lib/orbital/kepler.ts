import type { SpaceBody, OrbitalState } from "@/types/orbital";
import { DEG_RAD, GM_SUN_AU } from "./constants";

/**
 * Solve Kepler's equation M = E - e*sin(E) for eccentric anomaly E
 * via Newton-Raphson iteration.
 */
export function solveKepler(M: number, e: number): number {
  // Normalize M to [0, 2π)
  let Mn = M % (2 * Math.PI);
  if (Mn < 0) Mn += 2 * Math.PI;

  // Initial guess
  let E = Mn + e * Math.sin(Mn);

  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - Mn) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }

  return E;
}

/**
 * Compute heliocentric position and velocity of a body at Julian year t_JY,
 * returned in AU and AU/yr.
 */
export function bodyStateAt(body: SpaceBody, t_JY: number): OrbitalState {
  const a = body.semiMajorAxis_AU;
  const e = body.eccentricity;
  const I = body.inclination_Deg * DEG_RAD;
  const Omega = body.longAscendingNode_Deg * DEG_RAD;
  const omega = body.argPeriapsis_Deg * DEG_RAD;
  const M0 = body.meanAnomalyAtEpoch_Deg * DEG_RAD;
  const epoch = body.epoch_floatJYears;

  // Mean motion (rad/yr) = sqrt(GM/a^3) in AU/yr units
  const n = Math.sqrt(GM_SUN_AU / (a * a * a));

  // Mean anomaly at time t
  const M = M0 + n * (t_JY - epoch);

  // Solve Kepler's equation
  const E = solveKepler(M, e);

  // True anomaly
  const sinE = Math.sin(E);
  const cosE = Math.cos(E);
  const sqrtTerm = Math.sqrt(1 - e * e);
  const nu = Math.atan2(sqrtTerm * sinE, cosE - e);

  // Distance
  const r = a * (1 - e * cosE);

  // Position in orbital plane
  const xOrb = r * Math.cos(nu);
  const yOrb = r * Math.sin(nu);

  // Velocity in orbital plane
  const factor = n * a / Math.sqrt(1 - e * e);
  const vxOrb = -factor * Math.sin(nu);
  const vyOrb = factor * (e + Math.cos(nu));

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
