import { useMemo, useState, useCallback } from "react";
import { ParentSize } from "@visx/responsive";
import { scaleUtc } from "@visx/scale";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { interpolateTurbo } from "d3-scale-chromatic";
import type { PorkchopResult, PorkchopCell } from "@/types/orbital";
import { PorkchopTooltip } from "./PorkchopTooltip";

interface PorkchopPlotProps {
  result: PorkchopResult;
}

const MARGIN = { top: 20, right: 20, bottom: 60, left: 96 };
const Y_AXIS_LABEL_OFFSET_PX = 52;

function transferOutcomeLabel(outcome: number | null | undefined): string | null {
  if (outcome == null) return null;
  const labels: Record<number, string> = {
    1: "Insufficient ΔV",
    2: "Arrival Before Launch",
    3: "Launch In Past",
    5: "Parabolic Transfer",
    6: "Hyperbolic Transfer",
    8: "Insufficient Acceleration",
    9: "Orbit Period Too Long",
    11: "Burn Longer Than Transfer",
    13: "Burn NaN",
    14: "Would Collide With Body",
    19: "Solver Code Path",
  };
  return labels[outcome] ?? `Failure ${outcome}`;
}

function dayToDate(day: number): Date {
  return new Date(day * 86400000);
}

const PROBE_HIGH_THRUST_COLOR = "#f59e0b";
const PROBE_HIGH_THRUST_DIM_COLOR = "#b45309";

function ProbeLineContent({
  result,
  width,
  height,
}: {
  result: PorkchopResult;
  width: number;
  height: number;
}) {
  const [hoveredCell, setHoveredCell] = useState<PorkchopCell | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const availableWidth = width - MARGIN.left - MARGIN.right;
  const availableHeight = height - MARGIN.top - MARGIN.bottom;
  const plotSize = Math.min(availableWidth, availableHeight);
  const plotOffsetX = MARGIN.left + Math.max(0, (availableWidth - plotSize) / 2);
  const plotOffsetY = MARGIN.top + Math.max(0, (availableHeight - plotSize) / 2);

  const defaultPoints = useMemo(
    () =>
      (result.probeSeries ?? [])
        .slice()
        .sort((a, b) => a.launchDay - b.launchDay),
    [result.probeSeries],
  );

  const highThrustPoints = useMemo(
    () =>
      (result.probeSeriesHighThrust ?? [])
        .slice()
        .sort((a, b) => a.launchDay - b.launchDay),
    [result.probeSeriesHighThrust],
  );

  const optimal = result.optimal;
  const optimalHT = result.optimalHighThrust;

  const ranges = useMemo(() => {
    const allPoints = [...defaultPoints, ...highThrustPoints];
    if (allPoints.length === 0) return null;
    const minLaunch = Math.min(...allPoints.map((p) => p.launchDay));
    const maxLaunch = Math.max(...allPoints.map((p) => p.launchDay));
    const minArrival = Math.min(...allPoints.map((p) => p.arrivalDay));
    const maxArrival = Math.max(...allPoints.map((p) => p.arrivalDay));
    const launchPad =
      Math.max((maxLaunch - minLaunch) / 40, result.launchStepDays > 0 ? result.launchStepDays : 1);
    const arrivalPad = Math.max((maxArrival - minArrival) / 40, 1);

    return {
      launchMin: minLaunch - launchPad,
      launchMax: maxLaunch + launchPad,
      arrivalMin: minArrival - arrivalPad,
      arrivalMax: maxArrival + arrivalPad,
    };
  }, [defaultPoints, highThrustPoints, result.launchStepDays]);

  const xScale = useMemo(
    () =>
      scaleUtc({
        domain: [dayToDate(ranges?.launchMin ?? 0), dayToDate(ranges?.launchMax ?? 1)],
        range: [0, plotSize],
      }),
    [ranges, plotSize],
  );

  const yScale = useMemo(
    () =>
      scaleUtc({
        domain: [dayToDate(ranges?.arrivalMin ?? 0), dayToDate(ranges?.arrivalMax ?? 1)],
        range: [plotSize, 0],
      }),
    [ranges, plotSize],
  );

  const defaultLinePoints = useMemo(
    () =>
      defaultPoints
        .map((point) => `${xScale(dayToDate(point.launchDay))},${yScale(dayToDate(point.arrivalDay))}`)
        .join(" "),
    [defaultPoints, xScale, yScale],
  );

  const highThrustLinePoints = useMemo(
    () =>
      highThrustPoints
        .map((point) => `${xScale(dayToDate(point.launchDay))},${yScale(dayToDate(point.arrivalDay))}`)
        .join(" "),
    [highThrustPoints, xScale, yScale],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGCircleElement>, cell: PorkchopCell) => {
      setHoveredCell(cell);
      setMousePos({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  if (!ranges || plotSize <= 0 || (defaultPoints.length === 0 && highThrustPoints.length === 0)) {
    const failure = transferOutcomeLabel(result.bestFailureOutcome);
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <span className="font-display block text-sm text-[var(--color-steel)]">
            No valid transfers found
          </span>
          {failure && (
            <span className="font-body mt-1 block text-xs text-[var(--color-ash)]">
              Most likely failure: {failure}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <svg width={width} height={height}>
        <Group left={plotOffsetX} top={plotOffsetY}>
          {defaultLinePoints && (
            <polyline
              points={defaultLinePoints}
              fill="none"
              stroke="var(--color-cyan)"
              strokeWidth={2}
              opacity={0.9}
            />
          )}

          {defaultPoints.map((point) => (
            <circle
              key={`d-${point.launchDay}-${point.arrivalDay}`}
              cx={xScale(dayToDate(point.launchDay))}
              cy={yScale(dayToDate(point.arrivalDay))}
              r={3}
              fill="var(--color-fog)"
              stroke="var(--color-cyan-dim)"
              strokeWidth={1}
              onMouseMove={(e) => handleMouseMove(e, point)}
              onMouseLeave={handleMouseLeave}
            />
          ))}

          {highThrustLinePoints && (
            <polyline
              points={highThrustLinePoints}
              fill="none"
              stroke={PROBE_HIGH_THRUST_COLOR}
              strokeWidth={2}
              opacity={0.9}
            />
          )}

          {highThrustPoints.map((point) => (
            <circle
              key={`ht-${point.launchDay}-${point.arrivalDay}`}
              cx={xScale(dayToDate(point.launchDay))}
              cy={yScale(dayToDate(point.arrivalDay))}
              r={3}
              fill="#fef3c7"
              stroke={PROBE_HIGH_THRUST_DIM_COLOR}
              strokeWidth={1}
              onMouseMove={(e) => handleMouseMove(e, point)}
              onMouseLeave={handleMouseLeave}
            />
          ))}

          {optimal && (
            <circle
              cx={xScale(dayToDate(optimal.launchDay))}
              cy={yScale(dayToDate(optimal.arrivalDay))}
              r={6}
              fill="none"
              stroke="var(--color-cyan)"
              strokeWidth={2}
            />
          )}
          {optimalHT && (
            <circle
              cx={xScale(dayToDate(optimalHT.launchDay))}
              cy={yScale(dayToDate(optimalHT.arrivalDay))}
              r={6}
              fill="none"
              stroke={PROBE_HIGH_THRUST_COLOR}
              strokeWidth={2}
            />
          )}

          <AxisBottom
            top={plotSize}
            scale={xScale}
            numTicks={6}
            tickLabelProps={{
              fill: "var(--color-ash)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              textAnchor: "middle",
            }}
            stroke="var(--color-slate)"
            tickStroke="var(--color-steel)"
            label="Launch Date"
            labelProps={{
              fill: "var(--color-fog)",
              fontSize: 11,
              fontFamily: "var(--font-display)",
              textAnchor: "middle",
              letterSpacing: "0.05em",
            }}
          />
          <AxisLeft
            scale={yScale}
            numTicks={6}
            labelOffset={Y_AXIS_LABEL_OFFSET_PX}
            tickLabelProps={{
              fill: "var(--color-ash)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              textAnchor: "end",
            }}
            stroke="var(--color-slate)"
            tickStroke="var(--color-steel)"
            label="Arrival Date"
            labelProps={{
              fill: "var(--color-fog)",
              fontSize: 11,
              fontFamily: "var(--font-display)",
              textAnchor: "middle",
              letterSpacing: "0.05em",
            }}
          />
        </Group>
      </svg>

      {/* Legend */}
      <div className="absolute right-6 top-6 flex flex-col gap-1.5 rounded border border-[var(--color-slate)] bg-[var(--color-abyss)]/80 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-4 rounded-full bg-[var(--color-cyan)]" />
          <span className="font-display text-[10px] tracking-wide text-[var(--color-ash)] uppercase">
            Default
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: PROBE_HIGH_THRUST_COLOR }} />
          <span className="font-display text-[10px] tracking-wide text-[var(--color-ash)] uppercase">
            High Thrust
          </span>
        </div>
      </div>

      {hoveredCell && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: mousePos.x + 12, top: mousePos.y - 12 }}
        >
          <PorkchopTooltip cell={hoveredCell} />
        </div>
      )}
    </div>
  );
}

function PlotContent({
  result,
  width,
  height,
}: {
  result: PorkchopResult;
  width: number;
  height: number;
}) {
  const [hoveredCell, setHoveredCell] = useState<PorkchopCell | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const availableWidth = width - MARGIN.left - MARGIN.right;
  const availableHeight = height - MARGIN.top - MARGIN.bottom;
  const plotSize = Math.min(availableWidth, availableHeight);
  const plotOffsetX = MARGIN.left + Math.max(0, (availableWidth - plotSize) / 2);
  const plotOffsetY = MARGIN.top + Math.max(0, (availableHeight - plotSize) / 2);

  const { grid, minDV, maxDV, optimal } = result;
  const nRows = grid.length;
  const nCols = grid[0]?.length ?? 0;

  const {
    launchRange,
    arrivalRange,
    launchStepDays,
    transitStepDays,
    hasAnyValidCell,
    hasGeometry,
  } = useMemo(() => {
    const validLaunchStep = result.launchStepDays > 0 ? result.launchStepDays : 1;
    const validTransitStep = result.transitStepDays > 0 ? result.transitStepDays : 1;

    const minLaunch = result.launchStartDay - validLaunchStep / 2;
    const maxLaunch =
      result.launchStartDay + (Math.max(nRows, 1) - 1) * validLaunchStep + validLaunchStep / 2;

    const minTransit = result.minTransitDays - validTransitStep / 2;
    const maxTransit =
      result.minTransitDays +
      (Math.max(nCols, 1) - 1) * validTransitStep +
      validTransitStep / 2;

    const hasAnyCell = grid.some((row) => row.some((cell) => cell !== null));
    const geometryOk =
      nRows > 0 &&
      nCols > 0 &&
      Number.isFinite(minLaunch) &&
      Number.isFinite(maxLaunch) &&
      Number.isFinite(minTransit) &&
      Number.isFinite(maxTransit);

    return {
      launchRange: [minLaunch, maxLaunch] as const,
      arrivalRange: [minLaunch + minTransit, maxLaunch + maxTransit] as const,
      launchStepDays: validLaunchStep,
      transitStepDays: validTransitStep,
      hasAnyValidCell: hasAnyCell,
      hasGeometry: geometryOk,
    };
  }, [grid, nCols, nRows, result]);

  const xScale = useMemo(
    () =>
      scaleUtc({
        domain: [dayToDate(launchRange[0]), dayToDate(launchRange[1])],
        range: [0, plotSize],
      }),
    [launchRange, plotSize],
  );

  const yScale = useMemo(
    () =>
      scaleUtc({
        domain: [dayToDate(arrivalRange[0]), dayToDate(arrivalRange[1])],
        range: [plotSize, 0],
      }),
    [arrivalRange, plotSize],
  );

  // Color scale: map dV to color using d3-scale-chromatic turbo
  const { dvToColor, legendGradient } = useMemo(() => {
    // Use log scale for better visual separation
    const logMin = Math.log(Math.max(minDV, 0.1));
    const logMax = Math.log(Math.max(maxDV, minDV + 1));
    const range = logMax - logMin || 1;

    const colorForDV = (dv: number) => {
      const t = (Math.log(Math.max(dv, 0.1)) - logMin) / range;
      return interpolateTurbo(Math.max(0, Math.min(1, t)));
    };

    const stopCount = 16;
    const stops: string[] = [];
    for (let i = 0; i <= stopCount; i++) {
      const t = i / stopCount;
      const dv = Math.exp(logMin + t * range);
      stops.push(`${colorForDV(dv)} ${(t * 100).toFixed(1)}%`);
    }

    return {
      dvToColor: colorForDV,
      legendGradient: `linear-gradient(to right, ${stops.join(", ")})`,
    };
  }, [minDV, maxDV]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGPolygonElement>, cell: PorkchopCell) => {
      setHoveredCell(cell);
      setMousePos({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  if (!hasGeometry || !hasAnyValidCell || plotSize <= 0) {
    const failure = transferOutcomeLabel(result.bestFailureOutcome);
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <span className="font-display block text-sm text-[var(--color-steel)]">
            No valid transfers found
          </span>
          {failure && (
            <span className="font-body mt-1 block text-xs text-[var(--color-ash)]">
              Most likely failure: {failure}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <svg width={width} height={height}>
        <Group left={plotOffsetX} top={plotOffsetY}>
          {/* Grid cells */}
          {grid.map((row, i) =>
            row.map((cell, j) => {
              if (!cell) return null;
              const launch = result.launchStartDay + i * launchStepDays;
              const transit = result.minTransitDays + j * transitStepDays;

              const launchMin = launch - launchStepDays / 2;
              const launchMax = launch + launchStepDays / 2;
              const transitMin = transit - transitStepDays / 2;
              const transitMax = transit + transitStepDays / 2;

              const p1x = xScale(dayToDate(launchMin));
              const p1y = yScale(dayToDate(launchMin + transitMin));
              const p2x = xScale(dayToDate(launchMax));
              const p2y = yScale(dayToDate(launchMax + transitMin));
              const p3x = xScale(dayToDate(launchMax));
              const p3y = yScale(dayToDate(launchMax + transitMax));
              const p4x = xScale(dayToDate(launchMin));
              const p4y = yScale(dayToDate(launchMin + transitMax));

              return (
                <polygon
                  key={`${i}-${j}`}
                  points={`${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}`}
                  fill={dvToColor(cell.totalDV)}
                  opacity={0.85}
                  onMouseMove={(e) => handleMouseMove(e, cell)}
                  onMouseLeave={handleMouseLeave}
                />
              );
            }),
          )}

          {/* Optimal point marker */}
          {optimal && (
            <circle
              cx={xScale(dayToDate(optimal.launchDay))}
              cy={yScale(dayToDate(optimal.arrivalDay))}
              r={6}
              fill="none"
              stroke="var(--color-cyan)"
              strokeWidth={2}
            />
          )}

          {/* Axes */}
          <AxisBottom
            top={plotSize}
            scale={xScale}
            numTicks={6}
            tickLabelProps={{
              fill: "var(--color-ash)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              textAnchor: "middle",
            }}
            stroke="var(--color-slate)"
            tickStroke="var(--color-steel)"
            label="Launch Date"
            labelProps={{
              fill: "var(--color-fog)",
              fontSize: 11,
              fontFamily: "var(--font-display)",
              textAnchor: "middle",
              letterSpacing: "0.05em",
            }}
          />
          <AxisLeft
            scale={yScale}
            numTicks={6}
            labelOffset={Y_AXIS_LABEL_OFFSET_PX}
            tickLabelProps={{
              fill: "var(--color-ash)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              textAnchor: "end",
            }}
            stroke="var(--color-slate)"
            tickStroke="var(--color-steel)"
            label="Arrival Date"
            labelProps={{
              fill: "var(--color-fog)",
              fontSize: 11,
              fontFamily: "var(--font-display)",
              textAnchor: "middle",
              letterSpacing: "0.05em",
            }}
          />
        </Group>
      </svg>

      {/* Color legend */}
      <div className="absolute right-6 top-6 flex items-center gap-2">
        <span className="font-mono text-[10px] text-[var(--color-ash)]">
          {minDV.toFixed(1)}
        </span>
        <div
          className="h-3 w-24 rounded-sm"
          style={{
            background: legendGradient,
          }}
        />
        <span className="font-mono text-[10px] text-[var(--color-ash)]">
          {maxDV.toFixed(1)} km/s
        </span>
      </div>

      {/* Tooltip */}
      {hoveredCell && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: mousePos.x + 12, top: mousePos.y - 12 }}
        >
          <PorkchopTooltip cell={hoveredCell} />
        </div>
      )}
    </div>
  );
}

export function PorkchopPlot({ result }: PorkchopPlotProps) {
  return (
    <ParentSize className="h-full w-full">
      {({ width, height }) =>
        width > 0 && height > 0 ? (
          result.chartType === "probeLine" ? (
            <ProbeLineContent result={result} width={width} height={height} />
          ) : (
            <PlotContent result={result} width={width} height={height} />
          )
        ) : null
      }
    </ParentSize>
  );
}
