import { describe, it, expect } from "vitest";
import type { SpaceBody, Orbit } from "@/types/orbital";
import { bodyStateAt } from "./kepler";
import { solveTwoBurnLambertTransfer, TransferOutcome } from "./transfer";
import { computePorkchopGrid } from "./porkchop";
import { AU_KM, GM_SUN_KM, DAYS_PER_YEAR, STANDARD_GRAVITY_MPS2, dateToJY } from "./constants";

// --- Unit conversion constants (same as porkchop.ts internals) ---
const AU_M = AU_KM * 1000;
const GM_SUN_M3S2 = GM_SUN_KM * 1e9;
const SUN_MEAN_RADIUS_M = 695_700_000;

// --- Body & orbit fixtures (from game data files) ---

const EARTH: SpaceBody = {
  name: "Earth",
  friendlyName: "Earth",
  objectType: "Planet",
  barycenter: "Sol",
  semiMajorAxis_AU: 1.00000102,
  semiMajorAxis_km: 149598023.2898281,
  eccentricity: 0.0167086,
  inclination_Deg: 5e-05,
  longAscendingNode_Deg: 348.7394,
  argPeriapsis_Deg: 114.20783,
  meanAnomalyAtEpoch_Deg: 358.617,
  epoch_floatJYears: 2000,
  mass_kg: 5.972e24,
  equatorialRadius_km: 6378.137,
};

const MARS: SpaceBody = {
  name: "Mars",
  friendlyName: "Mars",
  objectType: "Planet",
  barycenter: "Sol",
  semiMajorAxis_AU: 1.523679,
  semiMajorAxis_km: 227939134.0303053,
  eccentricity: 0.093412,
  inclination_Deg: 1.85061,
  longAscendingNode_Deg: 49.57854,
  argPeriapsis_Deg: 286.537,
  meanAnomalyAtEpoch_Deg: 19.3564,
  epoch_floatJYears: 2000,
  mass_kg: 6.4171e23,
  equatorialRadius_km: 3396.2,
};

const LEO1: Orbit = {
  name: "LowEarthOrbit1",
  friendlyName: "Low Earth Orbit 1",
  barycenter: "Earth",
  orbitIndex: "Earth1",
  altitude_km: 500,
  semiMajorAxis_km: null,
  eccentricity: 0,
  interfaceOrbit: true,
  mass: 6e24,
};

const LMO: Orbit = {
  name: "LowMarsOrbit",
  friendlyName: "Low Mars Orbit",
  barycenter: "Mars",
  orbitIndex: "Mars1",
  altitude_km: 500,
  semiMajorAxis_km: null,
  eccentricity: 0,
  interfaceOrbit: true,
  mass: 6.4e23,
};

// --- Helpers ---

function vecMag(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function toSIState(state: { pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number } }) {
  const posScale = AU_M;
  const velScale = AU_M / (DAYS_PER_YEAR * 86400);
  return {
    pos: { x: state.pos.x * posScale, y: state.pos.y * posScale, z: state.pos.z * posScale },
    vel: { x: state.vel.x * velScale, y: state.vel.y * velScale, z: state.vel.z * velScale },
  };
}

function bodyStateSI(body: SpaceBody, dateStr: string) {
  return toSIState(bodyStateAt(body, dateToJY(new Date(dateStr))));
}

function solveLambertAtDates(launchDate: string, arrivalDate: string) {
  const launchTime_s = Date.parse(launchDate) / 1000;
  const arrivalTime_s = Date.parse(arrivalDate) / 1000;

  return solveTwoBurnLambertTransfer({
    launchTime_s,
    arrivalTime_s,
    sourceState_m: bodyStateSI(EARTH, launchDate),
    destinationState_m: bodyStateSI(MARS, arrivalDate),
    barycenterMu_m3s2: GM_SUN_M3S2,
    barycenterMeanRadius_m: SUN_MEAN_RADIUS_M,
    fleetAcceleration_mps2: FLEET_ACCEL_MPS2,
  });
}

// --- Transfer parameters ---

const ACCELERATION_MG = 3000;
const MAX_DV_KMS = 25;
const FLEET_ACCEL_MPS2 = (ACCELERATION_MG * STANDARD_GRAVITY_MPS2) / 1000;

/**
 * In-game solutions for LEO1 → LMO, 3000 milligees, 25 kps budget.
 * Game date: 01 January 2028 00:00.
 *
 * Transit = time_to_arrival - loiter (game measures both from game date).
 * The launch/arrival timestamps are the burn-adjusted times shown by the game.
 */
const GAME_SOLUTIONS = {
  /** High-dV early transfers (first shown in game list) */
  earlyWindow: [
    { dV_kps: 24.6, launch: "2028-04-24T01:41:00Z", arrival: "2028-12-10T17:39:00Z" },
    { dV_kps: 23.4, launch: "2028-05-06T18:15:00Z", arrival: "2028-12-30T21:01:00Z" },
    { dV_kps: 22.0, launch: "2028-05-19T12:24:00Z", arrival: "2029-01-20T11:30:00Z" },
    { dV_kps: 20.7, launch: "2028-06-02T12:21:00Z", arrival: "2029-02-10T13:20:00Z" },
  ],
  /** Near-Hohmann optimal transfers (best dV) */
  optimal: [
    { dV_kps: 6.0, launch: "2028-11-19T23:24:00Z", arrival: "2029-09-11T10:36:00Z" },
    { dV_kps: 6.0, launch: "2028-11-22T18:54:00Z", arrival: "2029-09-17T18:15:00Z" },
  ],
};

// --- Tests ---

describe("Earth → Mars transfer (LEO1 → LMO, 3000mg, 25 kps)", () => {
  describe("body state sanity checks", () => {
    it("Earth orbital velocity is ~30 km/s", () => {
      const state = bodyStateSI(EARTH, "2028-01-01T00:00:00Z");
      const v_kps = vecMag(state.vel) / 1000;
      expect(v_kps).toBeGreaterThan(29);
      expect(v_kps).toBeLessThan(31);
    });

    it("Mars orbital velocity is ~24 km/s", () => {
      const state = bodyStateSI(MARS, "2028-01-01T00:00:00Z");
      const v_kps = vecMag(state.vel) / 1000;
      // Mars eccentricity is 0.093; velocity ranges from ~22 km/s (aphelion) to ~26.5 km/s (perihelion)
      expect(v_kps).toBeGreaterThan(21);
      expect(v_kps).toBeLessThan(27);
    });

    it("Earth orbital radius is ~1 AU", () => {
      const state = bodyStateSI(EARTH, "2028-01-01T00:00:00Z");
      const r_AU = vecMag(state.pos) / AU_M;
      expect(r_AU).toBeGreaterThan(0.98);
      expect(r_AU).toBeLessThan(1.02);
    });
  });

  describe("Lambert solver produces valid transfers", () => {
    it("all game-date transfers solve successfully", () => {
      for (const sol of [...GAME_SOLUTIONS.earlyWindow, ...GAME_SOLUTIONS.optimal]) {
        const result = solveLambertAtDates(sol.launch, sol.arrival);
        expect(result.result.outcome, `failed for launch ${sol.launch}`).toBe(TransferOutcome.Success);
      }
    });

    it("early-window solutions have dV decreasing as transit time increases", () => {
      const dvs = GAME_SOLUTIONS.earlyWindow.map((sol) => {
        const result = solveLambertAtDates(sol.launch, sol.arrival);
        return result.totalDV_mps / 1000;
      });
      // dV should decrease as launch date gets later (closer to Hohmann timing)
      for (let i = 1; i < dvs.length; i++) {
        expect(dvs[i]!).toBeLessThan(dvs[i - 1]!);
      }
    });
  });

  describe("individual Lambert dV vs in-game values", () => {
    for (const sol of GAME_SOLUTIONS.earlyWindow) {
      it(`dV ≈ ${sol.dV_kps} km/s (launch ${sol.launch.slice(0, 10)})`, () => {
        const result = solveLambertAtDates(sol.launch, sol.arrival);
        expect(result.result.outcome).toBe(TransferOutcome.Success);
        expect(result.totalDV_mps / 1000).toBeCloseTo(sol.dV_kps, 0);
      });
    }

    for (const sol of GAME_SOLUTIONS.optimal) {
      it(`dV ≈ ${sol.dV_kps} km/s (launch ${sol.launch.slice(0, 10)})`, () => {
        const result = solveLambertAtDates(sol.launch, sol.arrival);
        expect(result.result.outcome).toBe(TransferOutcome.Success);
        expect(result.totalDV_mps / 1000).toBeCloseTo(sol.dV_kps, 0);
      });
    }
  });

  describe("porkchop grid integration", () => {
    it("produces a grid with successful cells", () => {
      const result = computePorkchopGrid(
        {
          originOrbit: "LowEarthOrbit1",
          destinationOrbit: "LowMarsOrbit",
          gameDate: "2028-01-01",
          gridResolution: 50,
          launchAcceleration_mg: ACCELERATION_MG,
          maxDeltaV_kms: MAX_DV_KMS,
        },
        [EARTH, MARS],
        [LEO1, LMO],
      );

      expect(result.optimal).not.toBeNull();
      const successCount = result.grid.flat().filter((c) => c !== null).length;
      expect(successCount).toBeGreaterThan(50);
    });

    it("optimal dV ≈ 6 km/s (game's near-Hohmann minimum)", () => {
      const result = computePorkchopGrid(
        {
          originOrbit: "LowEarthOrbit1",
          destinationOrbit: "LowMarsOrbit",
          gameDate: "2028-01-01",
          gridResolution: 50,
          launchAcceleration_mg: ACCELERATION_MG,
          maxDeltaV_kms: MAX_DV_KMS,
        },
        [EARTH, MARS],
        [LEO1, LMO],
      );

      expect(result.optimal).not.toBeNull();
      expect(result.optimal!.totalDV).toBeCloseTo(6.0, 0);
    });

    it("optimal launch is November 2028", () => {
      const result = computePorkchopGrid(
        {
          originOrbit: "LowEarthOrbit1",
          destinationOrbit: "LowMarsOrbit",
          gameDate: "2028-01-01",
          gridResolution: 50,
          launchAcceleration_mg: ACCELERATION_MG,
          maxDeltaV_kms: MAX_DV_KMS,
        },
        [EARTH, MARS],
        [LEO1, LMO],
      );

      expect(result.optimal).not.toBeNull();
      const launchDate = new Date(result.optimal!.launchDay * 86400 * 1000);
      expect(launchDate.getUTCFullYear()).toBe(2028);
      expect(launchDate.getUTCMonth()).toBe(10); // November (0-indexed)
    });
  });
});
