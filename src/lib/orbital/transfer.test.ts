import { describe, it, expect } from "vitest";
import type { SpaceBody, Orbit } from "@/types/orbital";
import { bodyStateAt } from "./kepler";
import { solveLambert } from "./lambert";
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

function bodyStateSIAtUnix(body: SpaceBody, time_s: number) {
  return toSIState(bodyStateAt(body, dateToJY(new Date(time_s * 1000))));
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
    hybridRemap: {
      sourceStateAtTime: (time_s) => bodyStateSIAtUnix(EARTH, time_s),
      destinationStateAtTime: (time_s) => bodyStateSIAtUnix(MARS, time_s),
    },
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
 * These samples are used as strict parity checks. The transfer solver
 * now runs a hybrid remap path (when contextual ephemeris callbacks are
 * provided) before solving Lambert/Torch, so these values should match.
 */
const GAME_SOLUTIONS = {
  /** High-dV early transfers (first shown in game list) */
  earlyWindow: [
    { dV_kps: 24.6, launch: "2028-04-24T01:41:00Z", arrival: "2028-12-10T17:39:00Z" },
    { dV_kps: 23.4, launch: "2028-05-06T18:15:00Z", arrival: "2028-12-30T21:01:00Z" },
    { dV_kps: 22.0, launch: "2028-05-19T12:24:00Z", arrival: "2029-01-20T11:30:00Z" },
    { dV_kps: 20.7, launch: "2028-06-02T12:21:00Z", arrival: "2029-02-10T13:20:00Z" },
  ],
  /** Mid-window transfers */
  midWindow: [
    { dV_kps: 14.4, launch: "2028-08-13T20:41:00Z", arrival: "2029-05-10T19:42:00Z" },
    { dV_kps: 12.1, launch: "2028-12-01T22:40:00Z", arrival: "2029-06-03T10:26:00Z" },
    { dV_kps: 7.7, launch: "2028-12-09T07:55:00Z", arrival: "2029-07-22T07:14:00Z" },
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
      // Mars eccentricity is 0.093; velocity ranges ~22–26.5 km/s
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
      for (let i = 1; i < dvs.length; i++) {
        expect(dvs[i]!).toBeLessThan(dvs[i - 1]!);
      }
    });

    it("finds near-Hohmann minimum (~6.5 km/s) at ~250d transit from Nov 2028", () => {
      // The transit time sweep from Nov 19 2028 shows a clear dV minimum
      // at ~250 days transit — this is the Hohmann-like sweet spot.
      const launchDate = "2028-11-19T23:24:00Z";
      const earthState = bodyStateSI(EARTH, launchDate);
      const launchTime_s = Date.parse(launchDate) / 1000;

      let minDV = Number.POSITIVE_INFINITY;
      let minDays = 0;
      for (let days = 200; days <= 300; days += 5) {
        const arrivalDate = new Date((launchTime_s + days * 86400) * 1000).toISOString();
        const marsState = bodyStateSI(MARS, arrivalDate);
        const result = solveLambert(days * 86400, earthState, marsState, GM_SUN_M3S2, false);
        if (result && result.totalDV < minDV) {
          minDV = result.totalDV;
          minDays = days;
        }
      }

      expect(minDV / 1000).toBeGreaterThan(5.5);
      expect(minDV / 1000).toBeLessThan(7.5);
      expect(minDays).toBeGreaterThanOrEqual(240);
      expect(minDays).toBeLessThanOrEqual(270);
    });
  });

  describe("game dV parity panel", () => {
    const GAME_DV_TOLERANCE_KPS = 0.1;
    const panel = [
      ...GAME_SOLUTIONS.earlyWindow.map((sol) => ({ panel: "earlyWindow", ...sol })),
      ...GAME_SOLUTIONS.midWindow.map((sol) => ({ panel: "midWindow", ...sol })),
      ...GAME_SOLUTIONS.optimal.map((sol) => ({ panel: "optimal", ...sol })),
    ];

    it.each(panel)(
      "$panel launch $launch -> dV matches game value $dV_kps kps (+/- 0.1)",
      (sol) => {
        const result = solveLambertAtDates(sol.launch, sol.arrival);
        expect(result.result.outcome).toBe(TransferOutcome.Success);

        const computedDV_kps = result.totalDV_mps / 1000;
        const delta_kps = Math.abs(computedDV_kps - sol.dV_kps);
        expect(delta_kps).toBeLessThanOrEqual(GAME_DV_TOLERANCE_KPS);
      },
    );
  });

  describe("porkchop grid integration", () => {
    function makeGrid() {
      return computePorkchopGrid(
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
    }

    it("produces a grid with successful cells", () => {
      const result = makeGrid();
      expect(result.optimal).not.toBeNull();
      const successCount = result.grid.flat().filter((c) => c !== null).length;
      expect(successCount).toBeGreaterThan(50);
    });

    it("optimal dV ≈ 6 km/s (near-Hohmann minimum)", () => {
      const result = makeGrid();
      expect(result.optimal).not.toBeNull();
      expect(result.optimal!.totalDV).toBeCloseTo(6.0, 0);
    });

    it("optimal launch is late 2028", () => {
      const result = makeGrid();
      expect(result.optimal).not.toBeNull();
      const launchDate = new Date(result.optimal!.launchDay * 86400 * 1000);
      expect(launchDate.getUTCFullYear()).toBe(2028);
      // Game finds optimal at Nov 19; grid resolution (~16d steps) lands
      // on a nearby date in Nov-Dec 2028
      expect(launchDate.getUTCMonth()).toBeGreaterThanOrEqual(10); // Nov or Dec
    });

    it("optimal transit is near-Hohmann (~260 days)", () => {
      const result = makeGrid();
      expect(result.optimal).not.toBeNull();
      // Hohmann Earth-Mars is ~259 days; grid optimal should be similar
      expect(result.optimal!.transitDays).toBeGreaterThan(240);
      expect(result.optimal!.transitDays).toBeLessThan(280);
    });

    it("probe mode returns a launch-arrival line instead of a 2D grid", () => {
      const result = computePorkchopGrid(
        {
          originOrbit: "LowEarthOrbit1",
          destinationOrbit: "LowMarsOrbit",
          gameDate: "2028-01-01",
          gridResolution: 50,
          launchAcceleration_mg: ACCELERATION_MG,
          maxDeltaV_kms: MAX_DV_KMS,
          probeMode: true,
          probeHighThrust: false,
        },
        [EARTH, MARS],
        [LEO1, LMO],
      );

      expect(result.chartType).toBe("probeLine");
      expect(result.grid.length).toBe(0);
      expect((result.probeSeries?.length ?? 0)).toBeGreaterThan(0);

      const first = result.probeSeries![0]!;
      const last = result.probeSeries![result.probeSeries!.length - 1]!;
      expect(last.launchDay).toBeGreaterThan(first.launchDay);
      expect(last.arrivalDay).toBeGreaterThan(first.arrivalDay);
    });

  });
});
