import type { SpaceBody, Orbit, TransferInputs, PorkchopResult } from "@/types/orbital";
import { computePorkchopGrid } from "@/lib/orbital/porkchop";

export interface PorkchopWorkerInput {
  inputs: TransferInputs;
  bodies: SpaceBody[];
  orbits: Orbit[];
}

self.onmessage = (e: MessageEvent<PorkchopWorkerInput>) => {
  const { inputs, bodies, orbits } = e.data;
  const result: PorkchopResult = computePorkchopGrid(inputs, bodies, orbits);
  self.postMessage(result);
};
