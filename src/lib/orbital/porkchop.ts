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
  DEG_RAD,
  GM_SUN_KM,
  J2000_DATE,
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
const TWO_PI = 2 * Math.PI;
const TRANSFER_DURATION_HARD_CAP_S = 78_892_310;
const J2000_UNIX_S = J2000_DATE.getTime() / 1000;

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

function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vecApproxEqual(a: Vec3, b: Vec3): boolean {
  return (
    Math.abs(a.x - b.x) <= 1e-12 &&
    Math.abs(a.y - b.y) <= 1e-12 &&
    Math.abs(a.z - b.z) <= 1e-12
  );
}

function normalizeAngleRad(theta: number): number {
  let wrapped = theta % TWO_PI;
  if (wrapped < 0) wrapped += TWO_PI;
  return wrapped;
}

function clampRadiansPI(theta: number): number {
  return normalizeAngleRad(theta + Math.PI) - Math.PI;
}

function clampRadiansTwoPI(theta: number): number {
  return normalizeAngleRad(theta);
}

function toSIState(state: OrbitalState): OrbitalState {
  const posScale = AU_M;
  const velScale = AU_M / (DAYS_PER_YEAR * 86400);
  return {
    pos: vecScale(state.pos, posScale),
    vel: vecScale(state.vel, velScale),
  };
}

interface OrbitModel {
  semiMajorAxis_m: number;
  normalVector: Vec3;
  meanLongitudeAtTime_Rad: (t_s: number) => number;
  stateAtTime: (t_s: number) => OrbitalState;
}

interface HohmannTiming {
  initialHohmannArrivalTime_s: number;
  transferDuration_s: number;
  synodicPeriod_s: number;
  firstHohmannAfterInitial: number;
  lastHohmannAfterInitial: number;
}

interface HohmannWindow {
  launchTime_s: number;
  arrivalTime_s: number;
}

function orbitalPeriod_s(a_m: number, mu_m3s2: number): number {
  if (!(a_m > 0) || !(mu_m3s2 > 0)) return Number.POSITIVE_INFINITY;
  return TWO_PI * Math.sqrt((a_m * a_m * a_m) / mu_m3s2);
}

function bodyNormalVector(body: SpaceBody): Vec3 {
  const i = body.inclination_Deg * DEG_RAD;
  const omegaAscending = body.longAscendingNode_Deg * DEG_RAD;
  const sinI = Math.sin(i);
  return {
    x: sinI * Math.sin(omegaAscending),
    y: -sinI * Math.cos(omegaAscending),
    z: Math.cos(i),
  };
}

function bodyMeanLongitudeAtTime_Rad(body: SpaceBody, t_s: number): number {
  const omegaAscending = body.longAscendingNode_Deg * DEG_RAD;
  const argPeriapsis = body.argPeriapsis_Deg * DEG_RAD;
  const meanAnomalyAtEpoch = body.meanAnomalyAtEpoch_Deg * DEG_RAD;
  const a_m = body.semiMajorAxis_AU * AU_M;
  const epochUnix_s = J2000_UNIX_S + (body.epoch_floatJYears - 2000) * SECONDS_PER_YEAR;
  const n = Math.sqrt(GM_SUN_M3S2 / Math.abs(a_m * a_m * a_m));
  const meanAnomaly = meanAnomalyAtEpoch + n * (t_s - epochUnix_s);
  return normalizeAngleRad(omegaAscending + argPeriapsis + meanAnomaly);
}

function buildHeliocentricOrbitModel(
  body: SpaceBody,
  startJY: number,
  startTime_s: number,
): OrbitModel {
  return {
    semiMajorAxis_m: body.semiMajorAxis_AU * AU_M,
    normalVector: bodyNormalVector(body),
    meanLongitudeAtTime_Rad: (t_s) => bodyMeanLongitudeAtTime_Rad(body, t_s),
    stateAtTime: (t_s) => {
      const tJY = startJY + daysToJY((t_s - startTime_s) / SECONDS_PER_DAY);
      return toSIState(bodyStateAt(body, tJY));
    },
  };
}

function buildLocalCircularOrbitModel(
  radius_m: number,
  mu_m3s2: number,
  epoch_s: number,
): OrbitModel {
  const n = Math.sqrt(mu_m3s2 / (radius_m * radius_m * radius_m));
  return {
    semiMajorAxis_m: radius_m,
    normalVector: { x: 0, y: 0, z: 1 },
    meanLongitudeAtTime_Rad: (t_s) => normalizeAngleRad(n * (t_s - epoch_s)),
    stateAtTime: (t_s) => circularStateAtTime(radius_m, mu_m3s2, epoch_s, t_s),
  };
}

function getBestHohmannTiming(
  startOrbit: OrbitModel,
  endOrbit: OrbitModel,
  now_s: number,
  barycenterMu_m3s2: number,
  hardCap_s: number,
): HohmannTiming {
  const startRadius_m = startOrbit.semiMajorAxis_m;
  const endRadius_m = endOrbit.semiMajorAxis_m;

  const startMeanNow = startOrbit.meanLongitudeAtTime_Rad(now_s);
  const startRate = clampRadiansPI(startOrbit.meanLongitudeAtTime_Rad(now_s + 1) - startMeanNow);
  const endMeanNow = endOrbit.meanLongitudeAtTime_Rad(now_s);
  const endRate = clampRadiansPI(endOrbit.meanLongitudeAtTime_Rad(now_s + 1) - endMeanNow);
  const relativeRate = endRate - startRate;

  const transferDuration_s = hohmannDuration_s(startRadius_m, endRadius_m, barycenterMu_m3s2);
  const projectedEnd = endMeanNow + endRate * transferDuration_s;
  let phaseOffset = clampRadiansTwoPI(startMeanNow + Math.PI - projectedEnd);
  if (relativeRate < 0) phaseOffset -= TWO_PI;
  const phaseOffsetDuration_s = phaseOffset / relativeRate;
  const baseDuration_s = transferDuration_s;
  const candidateArrivalOffset_s = baseDuration_s + phaseOffsetDuration_s;

  if (!Number.isFinite(candidateArrivalOffset_s) || candidateArrivalOffset_s > hardCap_s) {
    return {
      initialHohmannArrivalTime_s: now_s + 2 * hardCap_s,
      transferDuration_s: 0,
      synodicPeriod_s: 0,
      firstHohmannAfterInitial: 0,
      lastHohmannAfterInitial: 0,
    };
  }

  const initialHohmannArrivalTime_s = now_s + candidateArrivalOffset_s;
  if (vecApproxEqual(startOrbit.normalVector, endOrbit.normalVector)) {
    return {
      initialHohmannArrivalTime_s,
      transferDuration_s,
      synodicPeriod_s: 0,
      firstHohmannAfterInitial: 0,
      lastHohmannAfterInitial: 0,
    };
  }

  const innerToOuter = startRadius_m < endRadius_m;
  const sampledOrbit = innerToOuter ? endOrbit : startOrbit;
  const referenceNormal = innerToOuter ? startOrbit.normalVector : endOrbit.normalVector;
  const sampledStartTime_s = innerToOuter
    ? initialHohmannArrivalTime_s
    : initialHohmannArrivalTime_s - baseDuration_s;

  const sampledStartPos = sampledOrbit.stateAtTime(sampledStartTime_s).pos;
  const initialAlignment = Math.abs(vecDot(sampledStartPos, referenceNormal));
  let bestAlignment = initialAlignment;
  let foundLower = false;
  let firstHohmannAfterInitial = -1;
  let lastHohmannAfterInitial = -1;

  const startPeriod_s = orbitalPeriod_s(startRadius_m, barycenterMu_m3s2);
  const endPeriod_s = orbitalPeriod_s(endRadius_m, barycenterMu_m3s2);
  const synodicPeriod_s = 1 / Math.abs(1 / startPeriod_s - 1 / endPeriod_s);
  const hardCapTime_s = now_s + hardCap_s;

  for (let idx = 1; idx <= 1000; idx++) {
    if (synodicPeriod_s > 31_556_924) break;
    const t_s = sampledStartTime_s + idx * synodicPeriod_s;
    if (t_s > hardCapTime_s) break;

    const samplePos = sampledOrbit.stateAtTime(t_s).pos;
    const alignment = Math.abs(vecDot(samplePos, referenceNormal));
    if (alignment < bestAlignment) {
      foundLower = true;
      if (alignment < initialAlignment) {
        if (firstHohmannAfterInitial < 1) firstHohmannAfterInitial = idx;
        lastHohmannAfterInitial = idx;
      }
    } else if (foundLower) {
      break;
    }
    bestAlignment = alignment;
  }

  return {
    initialHohmannArrivalTime_s,
    transferDuration_s,
    synodicPeriod_s,
    firstHohmannAfterInitial,
    lastHohmannAfterInitial,
  };
}

function getHohmannTimings(
  timing: HohmannTiming,
  sampleSizeMultiplier: number,
): HohmannWindow[] {
  const windows: HohmannWindow[] = [];
  if (timing.firstHohmannAfterInitial <= 0 || timing.lastHohmannAfterInitial <= 0) {
    return windows;
  }

  const sampleCount = Math.ceil(10 * sampleSizeMultiplier);
  if (sampleCount <= 0) return windows;

  const step = Math.max(
    1,
    Math.floor((timing.lastHohmannAfterInitial - timing.firstHohmannAfterInitial) / sampleCount),
  );
  let index = Math.max(
    timing.lastHohmannAfterInitial - sampleCount * step,
    timing.firstHohmannAfterInitial,
  );

  while (index <= timing.lastHohmannAfterInitial) {
    const arrivalTime_s = timing.initialHohmannArrivalTime_s + timing.synodicPeriod_s * index;
    const launchTime_s = arrivalTime_s - timing.transferDuration_s;
    windows.push({ launchTime_s, arrivalTime_s });
    index += step;
  }
  return windows;
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
  const latestAllowedTime_s = startTime_s + TRANSFER_DURATION_HARD_CAP_S;

  const originOrbitModel = useLocalCircularModel
    ? buildLocalCircularOrbitModel(originRadius_m, barycenterMu_m3s2, startTime_s)
    : buildHeliocentricOrbitModel(originHelioBody, startJY, startTime_s);
  const destinationOrbitModel = useLocalCircularModel
    ? buildLocalCircularOrbitModel(destinationRadius_m, barycenterMu_m3s2, startTime_s)
    : buildHeliocentricOrbitModel(destHelioBody, startJY, startTime_s);

  const hohmannTransferDuration_s = hohmannDuration_s(
    originRadius_m,
    destinationRadius_m,
    barycenterMu_m3s2,
  );
  const synodicPeriodEstimate_s = synodicPeriod_s(
    originRadius_m,
    destinationRadius_m,
    barycenterMu_m3s2,
  );

  const hohmannTiming = getBestHohmannTiming(
    originOrbitModel,
    destinationOrbitModel,
    startTime_s,
    barycenterMu_m3s2,
    TRANSFER_DURATION_HARD_CAP_S,
  );
  const additionalHohmannWindows = getHohmannTimings(hohmannTiming, 1);

  const initialHohmannLaunch_s =
    hohmannTiming.initialHohmannArrivalTime_s - hohmannTiming.transferDuration_s;
  const launchAnchors_s = [
    initialHohmannLaunch_s,
    ...additionalHohmannWindows.map((window) => window.launchTime_s),
  ].filter((t_s) => Number.isFinite(t_s) && t_s >= startTime_s && t_s <= latestAllowedTime_s);
  if (launchAnchors_s.length === 0) {
    launchAnchors_s.push(startTime_s);
  }

  let launchStart_s = Math.min(...launchAnchors_s);
  let launchEnd_s = Math.max(...launchAnchors_s);
  if (!(launchEnd_s > launchStart_s)) {
    const fallbackLaunchSpan_s = Number.isFinite(hohmannTiming.synodicPeriod_s) &&
      hohmannTiming.synodicPeriod_s > 0
      ? hohmannTiming.synodicPeriod_s
      : Number.isFinite(synodicPeriodEstimate_s) && synodicPeriodEstimate_s > 0
        ? synodicPeriodEstimate_s
        : Math.max(SECONDS_PER_DAY, hohmannTransferDuration_s);
    launchEnd_s = Math.min(latestAllowedTime_s, launchStart_s + fallbackLaunchSpan_s);
  }
  if (!(launchEnd_s > launchStart_s)) {
    launchEnd_s = launchStart_s + SECONDS_PER_DAY;
  }
  const launchStep_s = N > 1 ? (launchEnd_s - launchStart_s) / (N - 1) : 0;

  const transitMinFloor_s = isSunBarycenter ? 5 * SECONDS_PER_DAY : 3_600;
  const transitStepFloor_s = isSunBarycenter ? SECONDS_PER_DAY : 1_800;
  const transitCenter_s = hohmannTiming.transferDuration_s > 0
    ? hohmannTiming.transferDuration_s
    : hohmannTransferDuration_s;
  let minTransit_s = Math.max(transitMinFloor_s, transitCenter_s * 0.5);
  let maxTransit_s = Math.min(TRANSFER_DURATION_HARD_CAP_S, transitCenter_s * 1.5);
  if (!(maxTransit_s > minTransit_s)) {
    maxTransit_s = Math.min(
      TRANSFER_DURATION_HARD_CAP_S,
      minTransit_s + transitStepFloor_s * Math.max(1, N - 1),
    );
  }
  if (!(maxTransit_s > minTransit_s)) {
    maxTransit_s = minTransit_s + transitStepFloor_s;
  }
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

      const sourceState_m = originOrbitModel.stateAtTime(launchTime_s);
      const destinationState_m = destinationOrbitModel.stateAtTime(arrivalTime_s);

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
