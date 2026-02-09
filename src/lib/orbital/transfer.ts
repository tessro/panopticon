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

function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function normalizeAngleRad(theta: number): number {
  const twoPi = 2 * Math.PI;
  let wrapped = theta % twoPi;
  if (wrapped < 0) wrapped += twoPi;
  return wrapped;
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
      const denominator = 1 - result.value / result.value2;
      if (denominator === 0) return null;
      return fleetAcceleration_mps2 / denominator;
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
  if ((prograde?.totalDV ?? Number.POSITIVE_INFINITY) <= (retrograde?.totalDV ?? Number.POSITIVE_INFINITY)) {
    return { primary: prograde, secondary: retrograde };
  }
  return { primary: retrograde, secondary: prograde };
}

export function solveTwoBurnLambertTransfer(
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
        Math.max(transferOrbit.periapsis_m, input.barycenterMeanRadius_m),
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
