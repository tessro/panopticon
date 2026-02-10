import type {
  Orbit,
  OrbitalState,
  PorkchopCell,
  PorkchopResult,
  SpaceBody,
  TransferInputs,
  Vec3,
} from "@/types/orbital";
import {
  AU_KM,
  DAYS_PER_YEAR,
  GM_SUN_KM,
  STANDARD_GRAVITY_MPS2,
  dateToJY,
  daysToJY,
} from "./constants";
import { bodyStateAt } from "./kepler";
import {
  TransferOutcome,
  bestTransferResult,
  solveTwoBurnLambertTransfer,
  transferSolutionToCell,
  type TITransferResult,
} from "./transfer";

const G_SI = 6.67384e-11;
const AU_M = AU_KM * 1000;
const GM_SUN_M3S2 = GM_SUN_KM * 1e9;
const SUN_MEAN_RADIUS_M = 695_700_000;
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_YEAR = DAYS_PER_YEAR * SECONDS_PER_DAY;

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
    failureCounts: {},
    bestFailureOutcome: null,
    bestFailureValue: 0,
    bestFailureValue2: 0,
  };
}

function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function toSIState(state: OrbitalState): OrbitalState {
  const posScale = AU_M;
  const velScale = AU_M / (DAYS_PER_YEAR * 86400);
  return {
    pos: vecScale(state.pos, posScale),
    vel: vecScale(state.vel, velScale),
  };
}

/**
 * Find the heliocentric body that represents an orbit for interplanetary transfer.
 * If the orbit is around a moon or L-point, this resolves back to the parent planet.
 */
function findHeliocentricBody(
  orbit: Orbit,
  bodies: SpaceBody[],
): SpaceBody | null {
  const barycenter = orbit.barycenter;
  const directBody = bodies.find((b) => b.name === barycenter);
  if (directBody) {
    if (directBody.objectType === "Planet" || directBody.objectType === "DwarfPlanet") {
      return directBody;
    }
    if (directBody.objectType === "PlanetaryMoon" && directBody.barycenter) {
      const parent = bodies.find((b) => b.name === directBody.barycenter);
      if (parent) return parent;
    }
  }

  const sunLag = barycenter.match(/^Sun(\w+?)L[1-5]$/);
  if (sunLag) {
    const planet = sunLag[1];
    return bodies.find((b) => b.name === planet) ?? null;
  }

  const moonLag = barycenter.match(/^(\w+?)(Luna|Io|Europa|Ganymede|Callisto|Titan|Triton|Ariel|Umbriel|Titania|Oberon|Dione|Enceladus|Tethys|Rhea|Iapetus|Miranda)L[1-5]$/);
  if (moonLag) {
    const planet = moonLag[1];
    return bodies.find((b) => b.name === planet) ?? null;
  }

  return null;
}

function findOrbitBody(orbit: Orbit, bodies: SpaceBody[]): SpaceBody | null {
  return bodies.find((b) => b.name === orbit.barycenter) ?? null;
}

function getOrbitRadiusKm(orbit: Orbit, body: SpaceBody): number {
  if (orbit.altitude_km != null) return body.equatorialRadius_km + orbit.altitude_km;
  if (orbit.semiMajorAxis_km != null) return orbit.semiMajorAxis_km;
  return body.equatorialRadius_km + 200;
}

function hohmannDuration_s(r1_m: number, r2_m: number, mu: number): number {
  const a = (r1_m + r2_m) / 2;
  return Math.PI * Math.sqrt((a * a * a) / mu);
}

function synodicPeriod_s(r1_m: number, r2_m: number, mu: number): number {
  if (!(r1_m > 0) || !(r2_m > 0) || !(mu > 0)) return Number.POSITIVE_INFINITY;
  if (Math.abs(r1_m - r2_m) <= Math.max(r1_m, r2_m) * 1e-12) {
    return Number.POSITIVE_INFINITY;
  }

  const T1 = 2 * Math.PI * Math.sqrt((r1_m * r1_m * r1_m) / mu);
  const T2 = 2 * Math.PI * Math.sqrt((r2_m * r2_m * r2_m) / mu);
  if (!Number.isFinite(T1) || !Number.isFinite(T2) || T1 <= 0 || T2 <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const maxT = Math.max(T1, T2);
  const cap = maxT * 10;
  if (Math.abs(T1 - T2) <= maxT * 1e-6) return cap;
  return Math.min(Math.abs((T1 * T2) / (T1 - T2)), cap);
}

function circularStateAtTime(
  radius_m: number,
  mu_m3s2: number,
  epoch_s: number,
  t_s: number,
): OrbitalState {
  const n = Math.sqrt(mu_m3s2 / (radius_m * radius_m * radius_m));
  const theta = n * (t_s - epoch_s);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const v = Math.sqrt(mu_m3s2 / radius_m);
  return {
    pos: { x: radius_m * c, y: radius_m * s, z: 0 },
    vel: { x: -v * s, y: v * c, z: 0 },
  };
}

function buildFailure(outcome: TransferOutcome, value = 0, value2 = 0): TITransferResult {
  return { outcome, value, value2 };
}

export function computePorkchopGrid(
  inputs: TransferInputs,
  bodies: SpaceBody[],
  orbits: Orbit[],
): PorkchopResult {
  const originOrbit = orbits.find((o) => o.name === inputs.originOrbit);
  const destOrbit = orbits.find((o) => o.name === inputs.destinationOrbit);
  if (!originOrbit || !destOrbit) return emptyResult();

  const originHelioBody = findHeliocentricBody(originOrbit, bodies);
  const destHelioBody = findHeliocentricBody(destOrbit, bodies);
  if (!originHelioBody || !destHelioBody) return emptyResult();

  const originLocalBody = findOrbitBody(originOrbit, bodies);
  const destLocalBody = findOrbitBody(destOrbit, bodies);

  const startDateValue = Date.parse(`${inputs.gameDate}T00:00:00Z`);
  if (!Number.isFinite(startDateValue)) return emptyResult();

  const N = Math.max(20, Math.min(150, Math.floor(inputs.gridResolution)));
  const launchAcceleration_mg = Number.isFinite(inputs.launchAcceleration_mg)
    ? Math.max(0, inputs.launchAcceleration_mg)
    : 0;
  const fleetAcceleration_mps2 =
    (launchAcceleration_mg * STANDARD_GRAVITY_MPS2) / 1000;
  const dvCap_kms =
    Number.isFinite(inputs.maxDeltaV_kms) && inputs.maxDeltaV_kms > 0
      ? inputs.maxDeltaV_kms
      : Number.POSITIVE_INFINITY;

  const samePrimaryBody = originHelioBody.name === destHelioBody.name;
  const sameLocalBody =
    originLocalBody !== null &&
    destLocalBody !== null &&
    originLocalBody.name === destLocalBody.name;
  const useLocalCircularModel = samePrimaryBody && sameLocalBody;
  const localBarycenterBody = useLocalCircularModel ? originLocalBody : null;
  if (useLocalCircularModel && !localBarycenterBody) {
    return emptyResult();
  }

  let barycenterMu_m3s2 = GM_SUN_M3S2;
  let barycenterMeanRadius_m = SUN_MEAN_RADIUS_M;
  let originRadius_m = originHelioBody.semiMajorAxis_AU * AU_M;
  let destinationRadius_m = destHelioBody.semiMajorAxis_AU * AU_M;
  if (useLocalCircularModel && localBarycenterBody) {
    barycenterMu_m3s2 = G_SI * localBarycenterBody.mass_kg;
    barycenterMeanRadius_m = localBarycenterBody.equatorialRadius_km * 1000;
    originRadius_m = getOrbitRadiusKm(originOrbit, localBarycenterBody) * 1000;
    destinationRadius_m = getOrbitRadiusKm(destOrbit, localBarycenterBody) * 1000;
  }
  const isSunBarycenter = !useLocalCircularModel;

  if (!Number.isFinite(barycenterMu_m3s2) || barycenterMu_m3s2 <= 0) {
    return emptyResult();
  }

  const startDate = new Date(startDateValue);
  const startJY = dateToJY(startDate);
  const startTime_s = startDateValue / 1000;

  const hohmannTransferDuration_s = hohmannDuration_s(
    originRadius_m,
    destinationRadius_m,
    barycenterMu_m3s2,
  );
  const synodic_s = synodicPeriod_s(
    originRadius_m,
    destinationRadius_m,
    barycenterMu_m3s2,
  );

  const launchSpanCap_s = isSunBarycenter ? 3 * SECONDS_PER_YEAR : 120 * SECONDS_PER_DAY;
  const launchSpan_s = Math.min(
    Number.isFinite(synodic_s) && synodic_s > 0 ? synodic_s : launchSpanCap_s,
    launchSpanCap_s,
  );
  const launchStep_s = N > 1 ? launchSpan_s / (N - 1) : 0;
  const launchStart_s = startTime_s;

  const transitMinFloor_s = isSunBarycenter ? 5 * SECONDS_PER_DAY : 3_600;
  const minTransit_s = Math.max(transitMinFloor_s, hohmannTransferDuration_s * 0.3);
  const transitSpanCap_s = isSunBarycenter ? 3 * SECONDS_PER_YEAR : 120 * SECONDS_PER_DAY;
  const synodicTransitCap_s =
    Number.isFinite(synodic_s) && synodic_s > 0 ? synodic_s * 0.9 : transitSpanCap_s;
  const maxTransitTarget_s = Math.min(
    transitSpanCap_s,
    synodicTransitCap_s,
    hohmannTransferDuration_s * 3,
  );
  const transitStepFloor_s = isSunBarycenter ? SECONDS_PER_DAY : 1_800;
  const maxTransit_s = Math.max(minTransit_s + transitStepFloor_s, maxTransitTarget_s);
  const transitStep_s = N > 1 ? (maxTransit_s - minTransit_s) / (N - 1) : 0;

  const grid: (PorkchopCell | null)[][] = [];
  let minDV = Number.POSITIVE_INFINITY;
  let maxDV = 0;
  let optimal: PorkchopCell | null = null;

  const failureCounts: Record<number, number> = {};
  let bestFailure: TITransferResult | null = null;

  for (let i = 0; i < N; i++) {
    const row: (PorkchopCell | null)[] = [];
    const launchTime_s = launchStart_s + i * launchStep_s;

    for (let j = 0; j < N; j++) {
      const transitDuration_s = minTransit_s + j * transitStep_s;
      const arrivalTime_s = launchTime_s + transitDuration_s;

      const sourceState_m = useLocalCircularModel
        ? circularStateAtTime(originRadius_m, barycenterMu_m3s2, startTime_s, launchTime_s)
        : toSIState(bodyStateAt(originHelioBody, startJY + daysToJY((launchTime_s - startTime_s) / 86400)));
      const destinationState_m = useLocalCircularModel
        ? circularStateAtTime(destinationRadius_m, barycenterMu_m3s2, startTime_s, arrivalTime_s)
        : toSIState(bodyStateAt(destHelioBody, startJY + daysToJY((arrivalTime_s - startTime_s) / 86400)));

      const solution = solveTwoBurnLambertTransfer({
        launchTime_s,
        arrivalTime_s,
        sourceState_m,
        destinationState_m,
        barycenterMu_m3s2,
        barycenterMeanRadius_m,
        fleetAcceleration_mps2,
      });

      let evaluation: TITransferResult = solution.result;

      if (evaluation.outcome === TransferOutcome.Success) {
        if (solution.launchTime_s < startTime_s) {
          evaluation = buildFailure(
            TransferOutcome.Fail_LaunchInPast,
            startTime_s - solution.launchTime_s,
            transitDuration_s,
          );
        } else if (solution.totalDV_mps / 1000 > dvCap_kms) {
          evaluation = buildFailure(
            TransferOutcome.Fail_InsufficientDV,
            solution.totalDV_mps,
            0,
          );
        } else if (
          solution.transferOrbit &&
          solution.transferOrbit.eccentricity >= 1
        ) {
          evaluation = buildFailure(
            TransferOutcome.Fail_Hyperbolic,
            solution.transferOrbit.eccentricity,
            0,
          );
        }
      }

      if (evaluation.outcome !== TransferOutcome.Success) {
        failureCounts[evaluation.outcome] = (failureCounts[evaluation.outcome] ?? 0) + 1;
        bestFailure = bestTransferResult(bestFailure, evaluation, fleetAcceleration_mps2);
        row.push(null);
        continue;
      }

      const cell = transferSolutionToCell(solution);
      row.push(cell);

      if (cell.totalDV < minDV) {
        minDV = cell.totalDV;
        optimal = cell;
      }
      if (cell.totalDV > maxDV) {
        maxDV = cell.totalDV;
      }
    }

    grid.push(row);
  }

  if (!Number.isFinite(minDV)) minDV = 0;

  return {
    grid,
    minDV,
    maxDV,
    optimal,
    launchStartDay: launchStart_s / 86400,
    launchStepDays: launchStep_s / 86400,
    minTransitDays: minTransit_s / 86400,
    transitStepDays: transitStep_s / 86400,
    failureCounts,
    bestFailureOutcome: bestFailure?.outcome ?? null,
    bestFailureValue: bestFailure?.value ?? 0,
    bestFailureValue2: bestFailure?.value2 ?? 0,
  };
}
