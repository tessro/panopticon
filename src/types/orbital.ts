export interface SpaceBody {
  name: string;
  friendlyName: string;
  objectType: "Star" | "Planet" | "DwarfPlanet" | "PlanetaryMoon";
  barycenter: string | null;
  semiMajorAxis_AU: number;
  semiMajorAxis_km: number;
  eccentricity: number;
  inclination_Deg: number;
  longAscendingNode_Deg: number;
  argPeriapsis_Deg: number;
  meanAnomalyAtEpoch_Deg: number;
  epoch_floatJYears: number;
  mass_kg: number;
  equatorialRadius_km: number;
}

export interface Orbit {
  name: string;
  friendlyName: string;
  barycenter: string;
  orbitIndex: string;
  altitude_km: number | null;
  semiMajorAxis_km: number | null;
  eccentricity: number;
  interfaceOrbit: boolean;
  mass: number | null;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface OrbitalState {
  pos: Vec3;
  vel: Vec3;
}

export interface PorkchopCell {
  launchDay: number;
  arrivalDay: number;
  departureDVRaw: number;
  launchImpulseDV: number;
  departureDV: number;
  arrivalDV: number;
  totalDV: number;
  transitDays: number;
}

export interface TransferInputs {
  originOrbit: string;
  destinationOrbit: string;
  gameDate: string;
  gridResolution: number;
  launchAcceleration_mps2: number;
  maxDeltaV_kms: number;
}

export interface PorkchopResult {
  grid: (PorkchopCell | null)[][];
  minDV: number;
  maxDV: number;
  optimal: PorkchopCell | null;
  launchStartDay: number;
  launchStepDays: number;
  minTransitDays: number;
  transitStepDays: number;
}
