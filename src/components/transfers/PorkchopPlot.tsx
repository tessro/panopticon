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
          <PlotContent result={result} width={width} height={height} />
        ) : null
      }
    </ParentSize>
  );
}
