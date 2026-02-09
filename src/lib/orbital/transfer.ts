import type { Vec3, SpaceBody, Orbit, PorkchopCell } from "@/types/orbital";
import { AU_KM, SECONDS_PER_YEAR, DEFAULT_PARKING_ALTITUDE_KM } from "./constants";

/** Gravitational constant in km^3/kg/s^2 */
const G_KM = 6.67430e-20;

function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vecMag(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Get the parking orbit radius (km) for an orbit around a body.
 */
export function getParkingRadius(orbit: Orbit, body: SpaceBody): number {
  if (orbit.altitude_km != null) {
    return body.equatorialRadius_km + orbit.altitude_km;
  }
  // For Lagrange point orbits, use the semiMajorAxis_km directly
  if (orbit.semiMajorAxis_km != null) {
    return orbit.semiMajorAxis_km;
  }
  // Default: low orbit = body radius + default altitude
  return body.equatorialRadius_km + DEFAULT_PARKING_ALTITUDE_KM;
}

/**
 * Compute delta-V for a single departure or arrival.
 *
 * v_inf: hyperbolic excess velocity in km/s
 * mu_body: gravitational parameter of the body (km^3/s^2)
 * r_park: parking orbit radius (km)
 *
 * If parking orbit data available:
 *   dV = sqrt(v_inf^2 + 2*mu/r) - sqrt(mu/r)  (powered flyby from/to circular orbit)
 *
 * If no body data (e.g. Lagrange point), just return v_inf.
 */
export function computeNodeDV(
  vInf_kms: number,
  muBody_km3s2: number,
  rPark_km: number,
): number {
  if (muBody_km3s2 <= 0 || rPark_km <= 0) {
    return vInf_kms;
  }
  const vPark = Math.sqrt(muBody_km3s2 / rPark_km);
  const vHyp = Math.sqrt(vInf_kms * vInf_kms + 2 * muBody_km3s2 / rPark_km);
  return Math.abs(vHyp - vPark);
}

/**
 * Compute a porkchop cell given Lambert solution velocities and body states.
 *
 * All velocities in AU/yr, positions in AU.
 * Body data used for parking orbit dV calculation.
 */
export function computeCellDV(
  vTransfer1: Vec3,
  vTransfer2: Vec3,
  vBody1: Vec3,
  vBody2: Vec3,
  launchDay: number,
  arrivalDay: number,
  originBody: SpaceBody | null,
  destBody: SpaceBody | null,
  originOrbit: Orbit,
  destOrbit: Orbit,
): PorkchopCell {
  // Convert velocity differences to km/s
  const auYrToKms = AU_KM / SECONDS_PER_YEAR;

  const vInfDep = vecSub(vTransfer1, vBody1);
  const vInfArr = vecSub(vTransfer2, vBody2);

  const vInfDep_kms = vecMag(vInfDep) * auYrToKms;
  const vInfArr_kms = vecMag(vInfArr) * auYrToKms;

  let departureDV: number;
  let arrivalDV: number;

  if (originBody && originBody.mass_kg > 0) {
    const muOrig = G_KM * originBody.mass_kg;
    const rParkOrig = getParkingRadius(originOrbit, originBody);
    departureDV = computeNodeDV(vInfDep_kms, muOrig, rParkOrig);
  } else {
    departureDV = vInfDep_kms;
  }

  if (destBody && destBody.mass_kg > 0) {
    const muDest = G_KM * destBody.mass_kg;
    const rParkDest = getParkingRadius(destOrbit, destBody);
    arrivalDV = computeNodeDV(vInfArr_kms, muDest, rParkDest);
  } else {
    arrivalDV = vInfArr_kms;
  }

  return {
    launchDay,
    arrivalDay,
    departureDV,
    arrivalDV,
    totalDV: departureDV + arrivalDV,
    transitDays: arrivalDay - launchDay,
  };
}
