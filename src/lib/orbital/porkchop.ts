import type {
  SpaceBody,
  Orbit,
  TransferInputs,
  PorkchopCell,
  PorkchopResult,
} from "@/types/orbital";
import {
  GM_SUN_AU,
  dateToJY,
  daysToJY,
  DAYS_PER_YEAR,
  SECONDS_PER_DAY,
} from "./constants";
import { bodyStateAt } from "./kepler";
import { solveLambert } from "./lambert";
import { computeCellDV } from "./transfer";

function emptyResult(): PorkchopResult {
  return {
    grid: [],
    minDV: 0,
    maxDV: 0,
    optimal: null,
    launchStartDay: 0,
    launchStepDays: 0,
    minTransitDays: 0,
    transitStepDays: 0,
  };
}

/**
 * Find the parent body in the solar system hierarchy for an orbit.
 * Orbits around Lagrange points: trace back to the planet's heliocentric orbit.
 * Orbits around moons: trace to the moon's parent planet.
 */
function findHeliocentricBody(
  orbit: Orbit,
  bodies: SpaceBody[],
): SpaceBody | null {
  // The orbit's barycenter might be a body or a Lagrange point
  const barycenter = orbit.barycenter;

  // First, try to find the barycenter as a body
  const directBody = bodies.find((b) => b.name === barycenter);
  if (directBody) {
    // If it's a planet orbiting the Sun, use it directly
    if (directBody.objectType === "Planet" || directBody.objectType === "DwarfPlanet") {
      return directBody;
    }
    // If it's a moon, find its parent planet
    if (directBody.objectType === "PlanetaryMoon" && directBody.barycenter) {
      const parent = bodies.find((b) => b.name === directBody.barycenter);
      if (parent) return parent;
    }
  }

  // Lagrange points: parse the barycenter name to find the planet
  // Names like "SunEarthL1", "SunMarsL4", "EarthLunaL2", "JupiterIoL3"
  // For Sun-Planet Lagrange points, use the planet
  // For Planet-Moon Lagrange points, use the planet
  const lMatch = barycenter.match(/^Sun(\w+?)L[1-5]$/);
  if (lMatch) {
    const planetName = lMatch[1];
    return bodies.find((b) => b.name === planetName) ?? null;
  }

  // Planet-Moon Lagrange points (e.g., "EarthLunaL2", "JupiterIoL1")
  const mlMatch = barycenter.match(/^(\w+?)(Luna|Io|Europa|Ganymede|Callisto|Titan|Triton|Ariel|Umbriel|Titania|Oberon|Dione|Enceladus|Tethys|Rhea|Iapetus|Miranda)L[1-5]$/);
  if (mlMatch) {
    const planetName = mlMatch[1];
    return bodies.find((b) => b.name === planetName) ?? null;
  }

  return null;
}

/**
 * Find the immediate parent body for an orbit (for parking orbit dV calc).
 */
function findOrbitBody(
  orbit: Orbit,
  bodies: SpaceBody[],
): SpaceBody | null {
  return bodies.find((b) => b.name === orbit.barycenter) ?? null;
}

/**
 * Compute synodic period between two planets (in days).
 * Used to determine the search window for the porkchop plot.
 */
function synodicPeriod(a1_AU: number, a2_AU: number): number {
  const T1 = Math.sqrt(a1_AU * a1_AU * a1_AU) * DAYS_PER_YEAR;
  const T2 = Math.sqrt(a2_AU * a2_AU * a2_AU) * DAYS_PER_YEAR;
  if (Math.abs(T1 - T2) < 1) return 2 * DAYS_PER_YEAR;
  return Math.abs(T1 * T2 / (T1 - T2));
}

/**
 * Compute the porkchop plot grid for an interplanetary transfer.
 *
 * The search window spans one synodic period for launch dates,
 * with transit times from 60 days to half the synodic period.
 */
export function computePorkchopGrid(
  inputs: TransferInputs,
  bodies: SpaceBody[],
  orbits: Orbit[],
): PorkchopResult {
  const originOrbit = orbits.find((o) => o.name === inputs.originOrbit);
  const destOrbit = orbits.find((o) => o.name === inputs.destinationOrbit);
  if (!originOrbit || !destOrbit) {
    return emptyResult();
  }

  const originHelioBody = findHeliocentricBody(originOrbit, bodies);
  const destHelioBody = findHeliocentricBody(destOrbit, bodies);
  if (!originHelioBody || !destHelioBody) {
    return emptyResult();
  }

  const originLocalBody = findOrbitBody(originOrbit, bodies);
  const destLocalBody = findOrbitBody(destOrbit, bodies);

  const startDateValue = Date.parse(`${inputs.gameDate}T00:00:00Z`);
  if (!Number.isFinite(startDateValue)) {
    return emptyResult();
  }

  const clampedResolution = Math.max(20, Math.min(150, Math.floor(inputs.gridResolution)));
  const N = Number.isFinite(clampedResolution) ? clampedResolution : 80;
  const launchAcceleration_mps2 = Number.isFinite(inputs.launchAcceleration_mps2)
    ? Math.max(0, inputs.launchAcceleration_mps2)
    : 0;
  const launchImpulseDV_kms = (launchAcceleration_mps2 * SECONDS_PER_DAY) / 1000;
  const dvCap =
    Number.isFinite(inputs.maxDeltaV_kms) && inputs.maxDeltaV_kms > 0
      ? inputs.maxDeltaV_kms
      : Infinity;

  // Compute search window
  const startDate = new Date(startDateValue);
  const startJY = dateToJY(startDate);
  const startDay = startDateValue / 86400000;

  const synodic = synodicPeriod(
    originHelioBody.semiMajorAxis_AU,
    destHelioBody.semiMajorAxis_AU,
  );

  // Search over one synodic period for launch dates
  const launchSpan = Math.min(synodic, 3 * DAYS_PER_YEAR);
  // Transit times: from 30 days to 80% of the synodic period
  const minTransit = 30;
  const maxTransit = Math.min(synodic * 0.8, 3 * DAYS_PER_YEAR);

  const launchStep = N > 1 ? launchSpan / (N - 1) : 0;
  const transitStep = N > 1 ? (maxTransit - minTransit) / (N - 1) : 0;

  const grid: (PorkchopCell | null)[][] = [];
  let minDV = Infinity;
  let maxDV = 0;
  let optimal: PorkchopCell | null = null;

  for (let i = 0; i < N; i++) {
    const row: (PorkchopCell | null)[] = [];
    const launchDay = startDay + i * launchStep;
    const launchJY = startJY + daysToJY(i * launchStep);

    const originState = bodyStateAt(originHelioBody, launchJY);

    for (let j = 0; j < N; j++) {
      const transit = minTransit + j * transitStep;
      const arrivalDay = launchDay + transit;
      const arrivalJY = launchJY + daysToJY(transit);

      const destState = bodyStateAt(destHelioBody, arrivalJY);

      const tofYears = daysToJY(transit);
      const result = solveLambert(
        originState.pos,
        destState.pos,
        tofYears,
        GM_SUN_AU,
      );

      if (!result) {
        row.push(null);
        continue;
      }

      const cell = computeCellDV(
        result.v1,
        result.v2,
        originState.vel,
        destState.vel,
        launchDay,
        arrivalDay,
        originLocalBody,
        destLocalBody,
        originOrbit,
        destOrbit,
        launchImpulseDV_kms,
      );

      if (cell.totalDV > dvCap || !isFinite(cell.totalDV)) {
        row.push(null);
        continue;
      }

      if (cell.totalDV < minDV) {
        minDV = cell.totalDV;
        optimal = cell;
      }
      if (cell.totalDV > maxDV) {
        maxDV = cell.totalDV;
      }

      row.push(cell);
    }
    grid.push(row);
  }

  if (minDV === Infinity) minDV = 0;

  return {
    grid,
    minDV,
    maxDV,
    optimal,
    launchStartDay: startDay,
    launchStepDays: launchStep,
    minTransitDays: minTransit,
    transitStepDays: transitStep,
  };
}
