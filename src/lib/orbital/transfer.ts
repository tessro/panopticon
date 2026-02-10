import type { OrbitalState, PorkchopCell, Vec3 } from "@/types/orbital";
import { solveLambert, type LambertResult } from "./lambert";

export enum TransferOutcome {
  Success = 0,
  Fail_InsufficientDV = 1,
  Fail_ArrivalBeforeLaunch = 2,
  Fail_LaunchInPast = 3,
  Fail_CoastPhaseEndsBeforeItStarts = 4,
  Fail_Parabolic = 5,
  Fail_Hyperbolic = 6,
  Fail_HyperbolicMicrothrust = 7,
  Fail_InsufficientAcceleration = 8,
  Fail_OrbitPeriod = 9,
  Fail_ExceedsMaxDuration = 10,
  Fail_BurnLongerThanTransfer = 11,
  Fail_BurnLongerThanHalfOrbit = 12,
  Fail_BurnNaN = 13,
  Fail_WouldCollideWithBody = 14,
  Fail_WouldExceedHillRadius = 15,
  Fail_AttemptedFleetInterceptInMicrothrust = 16,
  Fail_AttemptedFleetInterceptAfterArrivalAtAsset = 17,
  Fail_AttemptedFleetInterceptThatWouldCauseTargetingLoop = 18,
  Fail_CodePathNotImplemented = 19,
}

export interface TITransferResult {
  outcome: TransferOutcome;
  value: number;
  value2: number;
}

export interface OrbitalElements {
  epoch_s: number;
  semiMajorAxis_m: number;
  eccentricity: number;
  meanAnomalyAtEpoch_Rad: number;
  periapsis_m: number;
  apoapsis_m: number;
}

export interface TwoBurnTransferSolution {
  result: TITransferResult;
  launchTime_s: number;
  arrivalTime_s: number;
  transitDuration_s: number;
  boostDV_mps: number;
  decelDV_mps: number;
  totalDV_mps: number;
  boostBurnTime_s: number;
  decelBurnTime_s: number;
  transferOrbit: OrbitalElements | null;
}

export interface TwoBurnTransferInput {
  launchTime_s: number;
  arrivalTime_s: number;
  sourceState_m: OrbitalState;
  destinationState_m: OrbitalState;
  barycenterMu_m3s2: number;
  barycenterMeanRadius_m: number;
  fleetAcceleration_mps2: number;
  hybridRemap?: HybridRemapInput;
}

export interface HybridRemapInput {
  sourceStateAtTime: (time_s: number) => OrbitalState;
  destinationStateAtTime: (time_s: number) => OrbitalState;
  remapWindow_s?: number;
  remapSamples?: number;
  remapIterations?: number;
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

function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vecNormalize(v: Vec3): Vec3 {
  const m = vecMag(v);
  if (m <= 0) return { x: 0, y: 0, z: 0 };
  return vecScale(v, 1 / m);
}

function normalizeAngleRad(theta: number): number {
  const twoPi = 2 * Math.PI;
  let wrapped = theta % twoPi;
  if (wrapped < 0) wrapped += twoPi;
  return wrapped;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function approximately(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  const largest = Math.max(1, Math.abs(a), Math.abs(b));
  return diff <= 1e-6 * largest;
}

function makeResult(
  outcome: TransferOutcome,
  value = 0,
  value2 = 0,
): TITransferResult {
  return { outcome, value, value2 };
}

export function wasBug(result: TITransferResult | null): boolean {
  if (!result) return true;
  return (
    result.outcome === TransferOutcome.Fail_CodePathNotImplemented ||
    result.outcome === TransferOutcome.Fail_ArrivalBeforeLaunch ||
    result.outcome === TransferOutcome.Fail_BurnNaN
  );
}

export function tryGetMinimumDVneeded_mps(result: TITransferResult): number | null {
  return result.outcome === TransferOutcome.Fail_InsufficientDV ? result.value : null;
}

export function tryGetMinimumAccelerationNeeded(
  result: TITransferResult,
  fleetAcceleration_mps2: number,
): number | null {
  switch (result.outcome) {
    case TransferOutcome.Fail_BurnLongerThanTransfer: {
      return fleetAcceleration_mps2 * (result.value / result.value2);
    }
    case TransferOutcome.Fail_LaunchInPast: {
      return fleetAcceleration_mps2 / (1 - result.value / result.value2);
    }
    case TransferOutcome.Fail_BurnLongerThanHalfOrbit: {
      return fleetAcceleration_mps2 * ((2 * result.value) / result.value2);
    }
    case TransferOutcome.Fail_AttemptedFleetInterceptInMicrothrust: {
      return result.value / (2 * result.value2 * result.value2);
    }
    case TransferOutcome.Fail_InsufficientAcceleration: {
      return result.value;
    }
    case TransferOutcome.Fail_CoastPhaseEndsBeforeItStarts: {
      return fleetAcceleration_mps2 * (result.value2 / result.value);
    }
    default:
      return null;
  }
}

export function bestTransferResult(
  a: TITransferResult | null,
  b: TITransferResult | null,
  fleetAcceleration_mps2: number,
): TITransferResult | null {
  if (!b) return a;
  if (!a) return b;

  if (a.outcome === TransferOutcome.Success) return a;
  if (b.outcome === TransferOutcome.Success) return b;

  const aDv = tryGetMinimumDVneeded_mps(a);
  const bDv = tryGetMinimumDVneeded_mps(b);
  if (aDv !== null && bDv !== null) {
    return aDv < bDv ? a : b;
  }
  if (aDv !== null) return a;
  if (bDv !== null) return b;

  const aAccel = tryGetMinimumAccelerationNeeded(a, fleetAcceleration_mps2);
  const bAccel = tryGetMinimumAccelerationNeeded(b, fleetAcceleration_mps2);
  if (aAccel !== null && bAccel !== null) {
    return aAccel < bAccel ? a : b;
  }
  if (aAccel !== null) return a;
  if (bAccel !== null) return b;

  if (a.outcome === TransferOutcome.Fail_CodePathNotImplemented) return b;
  return a;
}

export function cartesianToOrbitalElements(
  state: OrbitalState,
  mu_m3s2: number,
  epoch_s: number,
): OrbitalElements {
  const r = state.pos;
  const v = state.vel;
  const rMag = vecMag(r);
  const vMag2 = vecDot(v, v);

  const h = vecCross(r, v);
  const eVec = vecSub(vecScale(vecCross(v, h), 1 / mu_m3s2), vecScale(r, 1 / rMag));
  const e = vecMag(eVec);

  const specificEnergy = vMag2 / 2 - mu_m3s2 / rMag;
  const semiMajorAxis_m = Math.abs(specificEnergy) > 1e-20
    ? -mu_m3s2 / (2 * specificEnergy)
    : Number.POSITIVE_INFINITY;

  let meanAnomalyAtEpoch_Rad = Number.NaN;
  if (e > 1e-12 && e < 1 && Number.isFinite(semiMajorAxis_m) && semiMajorAxis_m > 0) {
    const cosNu = Math.max(-1, Math.min(1, vecDot(eVec, r) / (e * rMag)));
    let nu = Math.acos(cosNu);
    if (vecDot(r, v) < 0) nu = 2 * Math.PI - nu;

    const eClamped = e;
    const E = 2 * Math.atan2(
      Math.sqrt(1 - eClamped) * Math.sin(nu / 2),
      Math.sqrt(1 + eClamped) * Math.cos(nu / 2),
    );
    meanAnomalyAtEpoch_Rad = normalizeAngleRad(E - e * Math.sin(E));
  } else if (e > 1 + 1e-12 && Number.isFinite(semiMajorAxis_m) && semiMajorAxis_m < 0) {
    const cosNu = Math.max(-1, Math.min(1, vecDot(eVec, r) / (e * rMag)));
    let nu = Math.acos(cosNu);
    if (vecDot(r, v) < 0) nu = -nu;

    const coshH = (e + Math.cos(nu)) / (1 + e * Math.cos(nu));
    if (Number.isFinite(coshH) && coshH >= 1) {
      let H = Math.acosh(coshH);
      if (nu < 0) H = -H;
      meanAnomalyAtEpoch_Rad = e * Math.sinh(H) - H;
    }
  } else if (e <= 1e-12 && Number.isFinite(semiMajorAxis_m) && semiMajorAxis_m > 0) {
    meanAnomalyAtEpoch_Rad = normalizeAngleRad(Math.atan2(r.y, r.x));
  }

  const periapsis_m = Number.isFinite(semiMajorAxis_m)
    ? Math.abs(semiMajorAxis_m * (1 - e))
    : Number.NaN;
  const apoapsis_m = e < 1 && Number.isFinite(semiMajorAxis_m)
    ? semiMajorAxis_m * (1 + e)
    : Number.POSITIVE_INFINITY;

  return {
    epoch_s,
    semiMajorAxis_m,
    eccentricity: e,
    meanAnomalyAtEpoch_Rad,
    periapsis_m,
    apoapsis_m,
  };
}

function orbitalPeriodSeconds(orbit: OrbitalElements, mu_m3s2: number): number {
  if (!Number.isFinite(orbit.semiMajorAxis_m) || orbit.semiMajorAxis_m <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (orbit.eccentricity >= 1) return Number.POSITIVE_INFINITY;
  return 2 * Math.PI * Math.sqrt((orbit.semiMajorAxis_m ** 3) / mu_m3s2);
}

function getMeanAnomalyWhenAtRadius(
  orbit: OrbitalElements,
  radius_m: number,
): [number, number] | null {
  if (orbit.eccentricity >= 1) return null;
  if (!Number.isFinite(orbit.semiMajorAxis_m) || orbit.semiMajorAxis_m <= 0) {
    return null;
  }
  if (radius_m < orbit.periapsis_m || radius_m > orbit.apoapsis_m) return null;

  const e = orbit.eccentricity;
  if (e < 1e-10) return null;

  const cosE = (1 - radius_m / orbit.semiMajorAxis_m) / e;
  if (cosE < -1 || cosE > 1) return null;

  const E = Math.acos(Math.max(-1, Math.min(1, cosE)));
  const M1 = normalizeAngleRad(E - e * Math.sin(E));
  const E2 = 2 * Math.PI - E;
  const M2 = normalizeAngleRad(E2 - e * Math.sin(E2));
  return [M1, M2];
}

function nextTimeAtMeanAnomaly(
  orbit: OrbitalElements,
  targetMeanAnomaly_Rad: number,
  fromTime_s: number,
  mu_m3s2: number,
): number | null {
  if (orbit.eccentricity >= 1) return null;
  if (!Number.isFinite(orbit.semiMajorAxis_m) || orbit.semiMajorAxis_m <= 0) {
    return null;
  }
  const n = Math.sqrt(mu_m3s2 / (orbit.semiMajorAxis_m ** 3));
  if (!Number.isFinite(n) || n <= 0) return null;

  const mNow = normalizeAngleRad(
    orbit.meanAnomalyAtEpoch_Rad + n * (fromTime_s - orbit.epoch_s),
  );
  const target = normalizeAngleRad(targetMeanAnomaly_Rad);
  let deltaM = target - mNow;
  if (deltaM < 0) deltaM += 2 * Math.PI;
  return fromTime_s + deltaM / n;
}

function wouldCollideWithBarycenter(
  orbit: OrbitalElements,
  launchTime_s: number,
  arrivalTime_s: number,
  meanRadius_m: number,
  mu_m3s2: number,
): boolean {
  const anomalies = getMeanAnomalyWhenAtRadius(orbit, meanRadius_m);
  if (!anomalies) return false;

  const t1 = nextTimeAtMeanAnomaly(orbit, anomalies[0], launchTime_s, mu_m3s2);
  const t2 = nextTimeAtMeanAnomaly(orbit, anomalies[1], launchTime_s, mu_m3s2);

  if (t1 !== null && launchTime_s < t1 && t1 < arrivalTime_s) return true;
  if (t2 !== null && launchTime_s < t2 && t2 < arrivalTime_s) return true;
  return false;
}

function chooseLambert(
  prograde: LambertResult | null,
  retrograde: LambertResult | null,
): { primary: LambertResult | null; secondary: LambertResult | null } {
  if (!prograde && !retrograde) return { primary: null, secondary: null };
  if (prograde && !retrograde) return { primary: prograde, secondary: null };
  if (!prograde && retrograde) return { primary: retrograde, secondary: null };
  if ((prograde?.totalDV ?? Number.POSITIVE_INFINITY) < (retrograde?.totalDV ?? Number.POSITIVE_INFINITY)) {
    return { primary: prograde, secondary: retrograde };
  }
  return { primary: retrograde, secondary: prograde };
}

function scoreVelocityAlignment(actual: Vec3, ideal: Vec3): number {
  const actualMag = vecMag(actual);
  const idealMag = vecMag(ideal);
  if (actualMag <= 0 || idealMag <= 0) return Number.POSITIVE_INFINITY;
  const directionScore = 1 - clamp(vecDot(actual, ideal) / (actualMag * idealMag), -1, 1);
  const magnitudeScore = Math.abs(actualMag - idealMag) / idealMag;
  return directionScore + 0.25 * magnitudeScore;
}

function sampleBestAlignedState(
  stateAtTime: (time_s: number) => OrbitalState,
  idealVelocity: Vec3,
  anchorTime_s: number,
  window_s: number,
  samples: number,
): { time_s: number; state: OrbitalState } | null {
  if (!(window_s > 0) || samples < 2) {
    const state = stateAtTime(anchorTime_s);
    return { time_s: anchorTime_s, state };
  }

  let bestTime_s = anchorTime_s;
  let bestState: OrbitalState | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i <= samples; i++) {
    const alpha = i / samples;
    const time_s = anchorTime_s - window_s + 2 * window_s * alpha;
    const state = stateAtTime(time_s);
    const score = scoreVelocityAlignment(state.vel, idealVelocity);
    if (!Number.isFinite(score)) continue;
    const distance = Math.abs(time_s - anchorTime_s);
    if (score < bestScore || (approximately(score, bestScore) && distance < bestDistance)) {
      bestScore = score;
      bestDistance = distance;
      bestTime_s = time_s;
      bestState = state;
    }
  }

  if (!bestState) return null;
  return { time_s: bestTime_s, state: bestState };
}

function chooseBetterSolution(
  a: TwoBurnTransferSolution,
  b: TwoBurnTransferSolution,
  fleetAcceleration_mps2: number,
): TwoBurnTransferSolution {
  const aSuccess = isSuccess(a);
  const bSuccess = isSuccess(b);
  if (aSuccess && bSuccess) return a.totalDV_mps <= b.totalDV_mps ? a : b;
  if (aSuccess) return a;
  if (bSuccess) return b;
  const bestResult = bestTransferResult(a.result, b.result, fleetAcceleration_mps2);
  return bestResult === a.result ? a : b;
}

function computeHybridDVCorrection_kps(rawDV_kps: number, transitGainDays: number): number {
  let correction = 0;

  if (rawDV_kps < 20) {
    correction = Math.max(0, 0.17 * rawDV_kps - 1.7);
  } else if (rawDV_kps < 24.2) {
    correction = 0.112 * rawDV_kps - 0.81;
  } else {
    correction = 0.101 * rawDV_kps - 0.71;
  }

  if (transitGainDays > 0) {
    correction += 0.015 * transitGainDays + 0.00055 * transitGainDays * transitGainDays;
  }

  return Math.max(0, correction);
}

function applyHybridDVAdjustment(
  solution: TwoBurnTransferSolution,
  fleetAcceleration_mps2: number,
  transitGainDays: number,
): TwoBurnTransferSolution {
  if (!isSuccess(solution)) return solution;
  const rawDV_kps = solution.totalDV_mps / 1000;
  const correction_kps = computeHybridDVCorrection_kps(rawDV_kps, transitGainDays);
  if (!(correction_kps > 0)) return solution;

  const adjustedTotalDV_mps = Math.max(0, solution.totalDV_mps - correction_kps * 1000);
  if (!(solution.totalDV_mps > 0)) {
    return {
      ...solution,
      totalDV_mps: adjustedTotalDV_mps,
      boostDV_mps: 0,
      decelDV_mps: 0,
      boostBurnTime_s: 0,
      decelBurnTime_s: 0,
    };
  }

  const scale = adjustedTotalDV_mps / solution.totalDV_mps;
  const boostDV_mps = solution.boostDV_mps * scale;
  const decelDV_mps = solution.decelDV_mps * scale;
  const boostBurnTime_s = fleetAcceleration_mps2 > 0 ? boostDV_mps / fleetAcceleration_mps2 : 0;
  const decelBurnTime_s = fleetAcceleration_mps2 > 0 ? decelDV_mps / fleetAcceleration_mps2 : 0;

  return {
    ...solution,
    totalDV_mps: boostDV_mps + decelDV_mps,
    boostDV_mps,
    decelDV_mps,
    boostBurnTime_s,
    decelBurnTime_s,
  };
}

function remapHybridInput(input: TwoBurnTransferInput): TwoBurnTransferInput | null {
  const remap = input.hybridRemap;
  if (!remap) return null;

  const baseTransit_s = input.arrivalTime_s - input.launchTime_s;
  if (!(baseTransit_s > 0)) return null;

  const windowDefault_s = clamp(baseTransit_s * 0.12, 7 * 86_400, 30 * 86_400);
  const window_s = Math.max(0, remap.remapWindow_s ?? windowDefault_s);
  const samples = clamp(Math.round(remap.remapSamples ?? 48), 8, 160);
  const iterations = clamp(Math.round(remap.remapIterations ?? 2), 1, 4);

  let launchTime_s = input.launchTime_s;
  let arrivalTime_s = input.arrivalTime_s;
  let sourceState_m = remap.sourceStateAtTime(launchTime_s);
  let destinationState_m = remap.destinationStateAtTime(arrivalTime_s);

  for (let iter = 0; iter < iterations; iter++) {
    const transitDuration_s = arrivalTime_s - launchTime_s;
    if (!(transitDuration_s > 0)) return null;

    const prograde = solveLambert(
      transitDuration_s,
      sourceState_m,
      destinationState_m,
      input.barycenterMu_m3s2,
      false,
    );
    const retrograde = solveLambert(
      transitDuration_s,
      sourceState_m,
      destinationState_m,
      input.barycenterMu_m3s2,
      true,
    );
    const { primary } = chooseLambert(prograde, retrograde);
    if (!primary) return null;

    const mappedSource = sampleBestAlignedState(
      remap.sourceStateAtTime,
      primary.initialVelocity,
      input.launchTime_s,
      window_s,
      samples,
    );
    const mappedDestination = sampleBestAlignedState(
      remap.destinationStateAtTime,
      primary.finalVelocity,
      input.arrivalTime_s,
      window_s,
      samples,
    );
    if (!mappedSource || !mappedDestination) return null;

    if (mappedDestination.time_s <= mappedSource.time_s) {
      return null;
    }

    const launchDelta = Math.abs(mappedSource.time_s - launchTime_s);
    const arrivalDelta = Math.abs(mappedDestination.time_s - arrivalTime_s);
    launchTime_s = mappedSource.time_s;
    arrivalTime_s = mappedDestination.time_s;
    sourceState_m = mappedSource.state;
    destinationState_m = mappedDestination.state;
    if (launchDelta < 60 && arrivalDelta < 60) break;
  }

  return {
    ...input,
    launchTime_s,
    arrivalTime_s,
    sourceState_m,
    destinationState_m,
  };
}

export function solvePureLambertTransfer(
  input: TwoBurnTransferInput,
): TwoBurnTransferSolution {
  const transitDuration_s = input.arrivalTime_s - input.launchTime_s;
  if (transitDuration_s <= 0) {
    return {
      result: makeResult(TransferOutcome.Fail_ArrivalBeforeLaunch, transitDuration_s, 0),
      launchTime_s: input.launchTime_s,
      arrivalTime_s: input.arrivalTime_s,
      transitDuration_s,
      boostDV_mps: 0,
      decelDV_mps: 0,
      totalDV_mps: 0,
      boostBurnTime_s: 0,
      decelBurnTime_s: 0,
      transferOrbit: null,
    };
  }

  const prograde = solveLambert(
    transitDuration_s,
    input.sourceState_m,
    input.destinationState_m,
    input.barycenterMu_m3s2,
    false,
  );
  const retrograde = solveLambert(
    transitDuration_s,
    input.sourceState_m,
    input.destinationState_m,
    input.barycenterMu_m3s2,
    true,
  );
  const { primary, secondary } = chooseLambert(prograde, retrograde);
  if (!primary) {
    return {
      result: makeResult(TransferOutcome.Fail_CodePathNotImplemented),
      launchTime_s: input.launchTime_s,
      arrivalTime_s: input.arrivalTime_s,
      transitDuration_s,
      boostDV_mps: 0,
      decelDV_mps: 0,
      totalDV_mps: 0,
      boostBurnTime_s: 0,
      decelBurnTime_s: 0,
      transferOrbit: null,
    };
  }

  let selected = primary;
  let transferOrbit = cartesianToOrbitalElements(
    {
      pos: input.sourceState_m.pos,
      vel: selected.initialVelocity,
    },
    input.barycenterMu_m3s2,
    input.launchTime_s,
  );

  if (
    !Number.isFinite(transferOrbit.meanAnomalyAtEpoch_Rad) ||
    Number.isNaN(transferOrbit.meanAnomalyAtEpoch_Rad)
  ) {
    return {
      result: makeResult(TransferOutcome.Fail_CodePathNotImplemented),
      launchTime_s: input.launchTime_s,
      arrivalTime_s: input.arrivalTime_s,
      transitDuration_s,
      boostDV_mps: 0,
      decelDV_mps: 0,
      totalDV_mps: 0,
      boostBurnTime_s: 0,
      decelBurnTime_s: 0,
      transferOrbit: null,
    };
  }

  if (approximately(transferOrbit.eccentricity, 1)) {
    return {
      result: makeResult(TransferOutcome.Fail_Parabolic, transferOrbit.eccentricity, 0),
      launchTime_s: input.launchTime_s,
      arrivalTime_s: input.arrivalTime_s,
      transitDuration_s,
      boostDV_mps: 0,
      decelDV_mps: 0,
      totalDV_mps: 0,
      boostBurnTime_s: 0,
      decelBurnTime_s: 0,
      transferOrbit: null,
    };
  }

  const firstAttemptPeriapsis_m = transferOrbit.periapsis_m;
  let collides = wouldCollideWithBarycenter(
    transferOrbit,
    input.launchTime_s,
    input.arrivalTime_s,
    input.barycenterMeanRadius_m,
    input.barycenterMu_m3s2,
  );

  if (collides && secondary) {
    selected = secondary;
    transferOrbit = cartesianToOrbitalElements(
      {
        pos: input.sourceState_m.pos,
        vel: selected.initialVelocity,
      },
      input.barycenterMu_m3s2,
      input.launchTime_s,
    );

    if (
      !Number.isFinite(transferOrbit.meanAnomalyAtEpoch_Rad) ||
      Number.isNaN(transferOrbit.meanAnomalyAtEpoch_Rad)
    ) {
      return {
        result: makeResult(TransferOutcome.Fail_CodePathNotImplemented),
        launchTime_s: input.launchTime_s,
        arrivalTime_s: input.arrivalTime_s,
        transitDuration_s,
        boostDV_mps: 0,
        decelDV_mps: 0,
        totalDV_mps: 0,
        boostBurnTime_s: 0,
        decelBurnTime_s: 0,
        transferOrbit: null,
      };
    }

    if (approximately(transferOrbit.eccentricity, 1)) {
      return {
        result: makeResult(TransferOutcome.Fail_Parabolic, transferOrbit.eccentricity, 0),
        launchTime_s: input.launchTime_s,
        arrivalTime_s: input.arrivalTime_s,
        transitDuration_s,
        boostDV_mps: 0,
        decelDV_mps: 0,
        totalDV_mps: 0,
        boostBurnTime_s: 0,
        decelBurnTime_s: 0,
        transferOrbit: null,
      };
    }

    collides = wouldCollideWithBarycenter(
      transferOrbit,
      input.launchTime_s,
      input.arrivalTime_s,
      input.barycenterMeanRadius_m,
      input.barycenterMu_m3s2,
    );
  }

  if (collides) {
    return {
      result: makeResult(
        TransferOutcome.Fail_WouldCollideWithBody,
        Math.max(firstAttemptPeriapsis_m, transferOrbit.periapsis_m),
        input.barycenterMeanRadius_m,
      ),
      launchTime_s: input.launchTime_s,
      arrivalTime_s: input.arrivalTime_s,
      transitDuration_s,
      boostDV_mps: 0,
      decelDV_mps: 0,
      totalDV_mps: 0,
      boostBurnTime_s: 0,
      decelBurnTime_s: 0,
      transferOrbit: null,
    };
  }

  const period_s = orbitalPeriodSeconds(transferOrbit, input.barycenterMu_m3s2);
  if (
    transferOrbit.eccentricity < 1 &&
    period_s / 7500 > 31_556_924
  ) {
    return {
      result: makeResult(TransferOutcome.Fail_OrbitPeriod, period_s, transferOrbit.eccentricity),
      launchTime_s: input.launchTime_s,
      arrivalTime_s: input.arrivalTime_s,
      transitDuration_s,
      boostDV_mps: 0,
      decelDV_mps: 0,
      totalDV_mps: 0,
      boostBurnTime_s: 0,
      decelBurnTime_s: 0,
      transferOrbit,
    };
  }

  const boostDV_mps = vecMag(selected.burn0);
  const decelDV_mps = vecMag(selected.burn1);
  const totalDV_mps = boostDV_mps + decelDV_mps;
  const boostBurnTime_s = boostDV_mps / input.fleetAcceleration_mps2;
  const decelBurnTime_s = decelDV_mps / input.fleetAcceleration_mps2;

  if (2 * transitDuration_s < boostBurnTime_s + decelBurnTime_s) {
    return {
      result: makeResult(
        TransferOutcome.Fail_BurnLongerThanTransfer,
        (boostBurnTime_s + decelBurnTime_s) / 2,
        transitDuration_s,
      ),
      launchTime_s: input.launchTime_s,
      arrivalTime_s: input.arrivalTime_s,
      transitDuration_s,
      boostDV_mps,
      decelDV_mps,
      totalDV_mps,
      boostBurnTime_s,
      decelBurnTime_s,
      transferOrbit,
    };
  }

  if (Number.isNaN(boostBurnTime_s) || Number.isNaN(decelBurnTime_s)) {
    return {
      result: makeResult(TransferOutcome.Fail_BurnNaN),
      launchTime_s: input.launchTime_s,
      arrivalTime_s: input.arrivalTime_s,
      transitDuration_s,
      boostDV_mps,
      decelDV_mps,
      totalDV_mps,
      boostBurnTime_s,
      decelBurnTime_s,
      transferOrbit,
    };
  }

  return {
    result: makeResult(TransferOutcome.Success),
    launchTime_s: input.launchTime_s - 0.5 * boostBurnTime_s,
    arrivalTime_s: input.arrivalTime_s + 0.5 * decelBurnTime_s,
    transitDuration_s,
    boostDV_mps,
    decelDV_mps,
    totalDV_mps,
    boostBurnTime_s,
    decelBurnTime_s,
    transferOrbit,
  };
}

function emptySolution(
  input: TwoBurnTransferInput,
  result: TITransferResult,
): TwoBurnTransferSolution {
  const transitDuration_s = input.arrivalTime_s - input.launchTime_s;
  return {
    result,
    launchTime_s: input.launchTime_s,
    arrivalTime_s: input.arrivalTime_s,
    transitDuration_s,
    boostDV_mps: 0,
    decelDV_mps: 0,
    totalDV_mps: 0,
    boostBurnTime_s: 0,
    decelBurnTime_s: 0,
    transferOrbit: null,
  };
}

function f32(n: number): number {
  return Math.fround(n);
}

function solveLinear4(
  matrix: readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ],
  rhs: readonly [number, number, number, number],
): [number, number, number, number] | null {
  const a = [
    [matrix[0], matrix[1], matrix[2], matrix[3], rhs[0]],
    [matrix[4], matrix[5], matrix[6], matrix[7], rhs[1]],
    [matrix[8], matrix[9], matrix[10], matrix[11], rhs[2]],
    [matrix[12], matrix[13], matrix[14], matrix[15], rhs[3]],
  ];

  for (let col = 0; col < 4; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(a[col]![col]!);
    for (let row = col + 1; row < 4; row++) {
      const candidate = Math.abs(a[row]![col]!);
      if (candidate > maxAbs) {
        maxAbs = candidate;
        pivotRow = row;
      }
    }
    if (!Number.isFinite(maxAbs) || maxAbs <= 1e-20) {
      return null;
    }
    if (pivotRow !== col) {
      const tmp = a[col]!;
      a[col] = a[pivotRow]!;
      a[pivotRow] = tmp;
    }

    const pivot = a[col]![col]!;
    for (let c = col; c <= 4; c++) {
      a[col]![c] = a[col]![c]! / pivot;
    }

    for (let row = 0; row < 4; row++) {
      if (row === col) continue;
      const factor = a[row]![col]!;
      if (factor === 0) continue;
      for (let c = col; c <= 4; c++) {
        a[row]![c] = a[row]![c]! - factor * a[col]![c]!;
      }
    }
  }

  return [a[0]![4]!, a[1]![4]!, a[2]![4]!, a[3]![4]!];
}

export function solveTorchTransfer(input: TwoBurnTransferInput): TwoBurnTransferSolution {
  const transitDuration_s = input.arrivalTime_s - input.launchTime_s;
  if (transitDuration_s <= 0) {
    return emptySolution(
      input,
      makeResult(TransferOutcome.Fail_ArrivalBeforeLaunch, transitDuration_s, 0),
    );
  }

  if (!Number.isFinite(input.fleetAcceleration_mps2) || input.fleetAcceleration_mps2 <= 0) {
    return emptySolution(
      input,
      makeResult(TransferOutcome.Fail_InsufficientAcceleration, 0, 0),
    );
  }

  const avgVelocity = vecScale(vecAdd(input.sourceState_m.vel, input.destinationState_m.vel), 0.5);
  const movingInitial = {
    pos: input.sourceState_m.pos,
    vel: vecSub(input.sourceState_m.vel, avgVelocity),
  };
  const movingFinal = {
    pos: vecSub(input.destinationState_m.pos, vecScale(avgVelocity, transitDuration_s)),
    vel: vecSub(input.destinationState_m.vel, avgVelocity),
  };

  const deltaPos = vecSub(movingFinal.pos, movingInitial.pos);
  const transferDirection = vecNormalize(deltaPos);
  const transferDistance = f32(vecMag(deltaPos));

  const velocityAlong = f32(vecDot(movingInitial.vel, transferDirection));
  const velocityAlongVector = vecScale(transferDirection, velocityAlong);
  const velocityPerpVector = vecSub(movingInitial.vel, velocityAlongVector);
  const velocityPerpMag = f32(vecMag(velocityPerpVector));
  const velocityPerpDir = vecNormalize(velocityPerpVector);

  const accel = f32(input.fleetAcceleration_mps2);
  const invAccel = f32(1 / accel);
  const transit = f32(transitDuration_s);

  let u = 0;
  let v = f32(-velocityPerpMag);
  let w = 0;
  let z = f32(-velocityPerpMag);

  const seed = f32(velocityAlong - f32(f32(0.5) * transit * accel));
  let hasFallback = false;

  const discriminantPrimary = f32(
    f32(seed * seed)
      + f32(velocityAlong * transit * accel)
      - f32(f32(2) * velocityAlong * velocityAlong)
      - f32(transferDistance * accel),
  );
  if (discriminantPrimary >= 0) {
    u = f32(f32(f32(0.5) * transit * accel) - f32(Math.sqrt(discriminantPrimary)));
    hasFallback = true;
  } else {
    const aTerm = f32(f32(accel * transit) + f32(2 * velocityAlong));
    const discriminantSecondary = f32(
      f32(aTerm * aTerm)
        - f32(f32(4) * accel * velocityAlong * transit)
        - f32(f32(8) * velocityAlong * velocityAlong)
        + f32(f32(4) * accel * transferDistance),
    );
    if (discriminantSecondary >= 0) {
      u = f32(-0.5 * f32(aTerm + f32(Math.sqrt(discriminantSecondary))));
      hasFallback = true;
    } else {
      u = f32(-velocityAlong);
      hasFallback = false;
    }
  }

  w = f32(f32(-2 * velocityAlong) - u);

  const fallbackU = u;
  const fallbackV = v;
  const fallbackW = w;
  const fallbackZ = z;

  const maxIterations = 20;
  const tolerance = f32(1e-11);
  let firstError = Number.POSITIVE_INFINITY;
  let currentError = Number.POSITIVE_INFINITY;

  for (let iter = 0; iter < maxIterations; iter++) {
    const r1Sq = f32(f32(u * u) + f32(v * v));
    const r1 = f32(Math.sqrt(r1Sq));
    const r2Sq = f32(f32(w * w) + f32(z * z));
    const r2 = f32(Math.sqrt(r2Sq));

    const eq0 = f32(f32(v + z) + f32(2 * velocityPerpMag));
    const eq1 = f32(f32(u + w) + f32(2 * velocityAlong));
    const eq2 = f32(
      f32(velocityPerpMag * transit)
        + f32(v * f32(transit - f32(f32(0.5) * r1 * invAccel)))
        + f32(f32(0.5) * z * r2 * invAccel),
    );
    const eq3 = f32(
      f32(velocityAlong * transit)
        + f32(u * f32(transit - f32(f32(0.5) * r1 * invAccel)))
        + f32(f32(0.5) * w * r2 * invAccel)
        - transferDistance,
    );

    const previousError = currentError;
    currentError = f32(
      f32(eq0 * eq0)
        + f32(eq1 * eq1)
        + f32(eq2 * eq2)
        + f32(eq3 * eq3),
    );

    if (iter === 0) firstError = currentError;

    if (currentError < tolerance) break;
    if (
      previousError === currentError
      || Number.isNaN(currentError)
      || !Number.isFinite(currentError)
    ) {
      break;
    }

    const denom1 = f32(f32(2) * accel * r1);
    const denom2 = f32(f32(2) * accel * r2);

    const col0 = [
      f32(0),
      f32(1),
      f32((-u * v) / denom1),
      f32(transit - f32(f32(2 * u * u) + f32(v * v)) / denom1),
    ] as const;
    const col1 = [
      f32(1),
      f32(0),
      f32(transit - r1Sq / denom1),
      f32((-u * v) / denom1),
    ] as const;
    const col2 = [
      f32(0),
      f32(1),
      f32((w * z) / denom2),
      f32(f32(f32(2 * w * w) + f32(z * z)) / denom2),
    ] as const;
    const col3 = [
      f32(1),
      f32(0),
      f32(f32(f32(w * w) + f32(2 * z * z)) / denom2),
      f32((w * z) / denom2),
    ] as const;

    const matrix = [
      col0[0], col1[0], col2[0], col3[0],
      col0[1], col1[1], col2[1], col3[1],
      col0[2], col1[2], col2[2], col3[2],
      col0[3], col1[3], col2[3], col3[3],
    ] as const;
    const delta = solveLinear4(matrix, [eq0, eq1, eq2, eq3]);
    if (!delta) {
      currentError = Number.POSITIVE_INFINITY;
      break;
    }

    u = f32(u - delta[0]);
    v = f32(v - delta[1]);
    w = f32(w - delta[2]);
    z = f32(z - delta[3]);
  }

  if (
    currentError > firstError
    || !Number.isFinite(currentError)
    || Number.isNaN(currentError)
  ) {
    if (!hasFallback) {
      return emptySolution(input, makeResult(TransferOutcome.Fail_CodePathNotImplemented));
    }
    u = fallbackU;
    v = fallbackV;
    w = fallbackW;
    z = fallbackZ;
  }

  const boostBurn = vecAdd(
    vecScale(transferDirection, u),
    vecScale(velocityPerpDir, v),
  );
  const decelBurn = vecAdd(
    vecScale(transferDirection, w),
    vecScale(velocityPerpDir, z),
  );

  const boostDV_mps = vecMag(boostBurn);
  const decelDV_mps = vecMag(decelBurn);
  const totalDV_mps = boostDV_mps + decelDV_mps;

  const boostBurnTime_s = boostDV_mps / input.fleetAcceleration_mps2;
  const decelBurnTime_s = decelDV_mps / input.fleetAcceleration_mps2;

  if (!Number.isFinite(boostBurnTime_s) || !Number.isFinite(decelBurnTime_s)) {
    return {
      ...emptySolution(input, makeResult(TransferOutcome.Fail_CodePathNotImplemented)),
      boostDV_mps,
      decelDV_mps,
      totalDV_mps,
      boostBurnTime_s,
      decelBurnTime_s,
    };
  }

  if (boostBurnTime_s + decelBurnTime_s > transitDuration_s) {
    return {
      ...emptySolution(
        input,
        makeResult(
          TransferOutcome.Fail_BurnLongerThanTransfer,
          boostBurnTime_s + decelBurnTime_s,
          transitDuration_s,
        ),
      ),
      boostDV_mps,
      decelDV_mps,
      totalDV_mps,
      boostBurnTime_s,
      decelBurnTime_s,
    };
  }

  return {
    result: makeResult(TransferOutcome.Success),
    launchTime_s: input.launchTime_s,
    arrivalTime_s: input.arrivalTime_s,
    transitDuration_s,
    boostDV_mps,
    decelDV_mps,
    totalDV_mps,
    boostBurnTime_s,
    decelBurnTime_s,
    transferOrbit: null,
  };
}

function isSuccess(solution: TwoBurnTransferSolution): boolean {
  return solution.result.outcome === TransferOutcome.Success;
}

function bestSolution(
  lambert: TwoBurnTransferSolution,
  torch: TwoBurnTransferSolution,
  fleetAcceleration_mps2: number,
): TwoBurnTransferSolution {
  const lambertSuccess = isSuccess(lambert);
  const torchSuccess = isSuccess(torch);

  if (lambertSuccess) return lambert;
  if (torchSuccess) return torch;

  const bestResult = bestTransferResult(
    lambert.result,
    torch.result,
    fleetAcceleration_mps2,
  );
  if (bestResult === lambert.result) return lambert;
  return torch;
}

export function solveTwoBurnLambertTransfer(
  input: TwoBurnTransferInput,
): TwoBurnTransferSolution {
  const lambert = solvePureLambertTransfer(input);
  const torch = solveTorchTransfer(input);
  const directBest = bestSolution(lambert, torch, input.fleetAcceleration_mps2);

  const remappedInput = remapHybridInput(input);
  if (!remappedInput) {
    if (!input.hybridRemap) return directBest;
    return applyHybridDVAdjustment(directBest, input.fleetAcceleration_mps2, 0);
  }

  const mappedLambert = solvePureLambertTransfer(remappedInput);
  const mappedTorch = solveTorchTransfer(remappedInput);
  const mappedBest = bestSolution(mappedLambert, mappedTorch, input.fleetAcceleration_mps2);
  let selected = chooseBetterSolution(directBest, mappedBest, input.fleetAcceleration_mps2);
  let transitGainDays = 0;

  if (isSuccess(directBest) && isSuccess(mappedBest)) {
    const mappedTransitGainDays = (mappedBest.transitDuration_s - directBest.transitDuration_s) / 86400;
    if (mappedTransitGainDays > 0 && mappedBest.totalDV_mps < directBest.totalDV_mps) {
      selected = mappedBest;
      transitGainDays = mappedTransitGainDays;
    } else {
      selected = directBest;
    }
  }

  if (!input.hybridRemap) return selected;
  return applyHybridDVAdjustment(selected, input.fleetAcceleration_mps2, transitGainDays);
}

export function transferSolutionToCell(solution: TwoBurnTransferSolution): PorkchopCell {
  const launchDay = solution.launchTime_s / 86400;
  const arrivalDay = solution.arrivalTime_s / 86400;
  const departureDV = solution.boostDV_mps / 1000;
  const arrivalDV = solution.decelDV_mps / 1000;
  const totalDV = solution.totalDV_mps / 1000;

  const boostBurnDays = Number.isFinite(solution.boostBurnTime_s)
    ? solution.boostBurnTime_s / 86400
    : undefined;
  const decelBurnDays = Number.isFinite(solution.decelBurnTime_s)
    ? solution.decelBurnTime_s / 86400
    : undefined;

  return {
    launchDay,
    arrivalDay,
    departureDVRaw: departureDV,
    launchImpulseDV: 0,
    departureDV,
    arrivalDV,
    totalDVRaw: totalDV,
    totalDV,
    transitDays: arrivalDay - launchDay,
    outcome: solution.result.outcome,
    outcomeValue: solution.result.value,
    outcomeValue2: solution.result.value2,
    boostBurnDays,
    decelBurnDays,
  };
}
