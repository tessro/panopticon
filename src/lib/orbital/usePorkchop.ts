import { useState, useEffect, useRef, useCallback } from "react";
import type { SpaceBody, Orbit, TransferInputs, PorkchopResult } from "@/types/orbital";
import type { PorkchopWorkerInput } from "@/workers/porkchop.worker";

interface PorkchopState {
  result: PorkchopResult | null;
  isComputing: boolean;
  compute: () => void;
}

export function usePorkchop(
  inputs: TransferInputs | null,
  bodies: SpaceBody[] | null,
  orbits: Orbit[] | null,
): PorkchopState {
  const [result, setResult] = useState<PorkchopResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const compute = useCallback(() => {
    if (!inputs || !bodies || !orbits) return;

    // Terminate previous worker if still running
    workerRef.current?.terminate();

    setIsComputing(true);
    setResult(null);

    const worker = new Worker(
      new URL("@/workers/porkchop.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (e: MessageEvent<PorkchopResult>) => {
      setResult(e.data);
      setIsComputing(false);
    };

    worker.onerror = () => {
      setIsComputing(false);
    };

    workerRef.current = worker;

    const message: PorkchopWorkerInput = { inputs, bodies, orbits };
    worker.postMessage(message);
  }, [inputs, bodies, orbits]);

  return { result, isComputing, compute };
}
