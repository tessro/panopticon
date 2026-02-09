import { useMemo, useState, useCallback } from "react";
import { ParentSize } from "@visx/responsive";
import { scaleTime } from "@visx/scale";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { interpolateTurbo } from "d3-scale-chromatic";
import type { PorkchopResult, PorkchopCell } from "@/types/orbital";
import { PorkchopTooltip } from "./PorkchopTooltip";

interface PorkchopPlotProps {
  result: PorkchopResult;
}

const MARGIN = { top: 20, right: 20, bottom: 60, left: 80 };

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

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const { grid, minDV, maxDV, optimal } = result;

  // Compute date ranges and per-cell pixel sizes from the grid
  const { launchRange, arrivalRange, cellWidth, cellHeight } = useMemo(() => {
    let minLaunch = Infinity;
    let maxLaunch = -Infinity;
    let minArrival = Infinity;
    let maxArrival = -Infinity;

    for (const row of grid) {
      for (const cell of row) {
        if (!cell) continue;
        if (cell.launchDay < minLaunch) minLaunch = cell.launchDay;
        if (cell.launchDay > maxLaunch) maxLaunch = cell.launchDay;
        if (cell.arrivalDay < minArrival) minArrival = cell.arrivalDay;
        if (cell.arrivalDay > maxArrival) maxArrival = cell.arrivalDay;
      }
    }

    const nRows = grid.length;
    const nCols = grid[0]?.length ?? 0;

    // Pad ranges by half a cell so rects are centred on their date values
    const launchPad = nRows > 1 ? (maxLaunch - minLaunch) / (nRows - 1) / 2 : 1;
    const arrivalPad = nCols > 1 ? (maxArrival - minArrival) / (nCols - 1) / 2 : 1;

    return {
      launchRange: [minLaunch - launchPad, maxLaunch + launchPad] as const,
      arrivalRange: [minArrival - arrivalPad, maxArrival + arrivalPad] as const,
      cellWidth: nRows > 1 ? innerWidth / nRows : innerWidth,
      cellHeight: nCols > 1 ? innerHeight / nCols : innerHeight,
    };
  }, [grid, innerWidth, innerHeight]);

  const xScale = useMemo(
    () =>
      scaleTime({
        domain: [dayToDate(launchRange[0]), dayToDate(launchRange[1])],
        range: [0, innerWidth],
      }),
    [launchRange, innerWidth],
  );

  const yScale = useMemo(
    () =>
      scaleTime({
        domain: [dayToDate(arrivalRange[0]), dayToDate(arrivalRange[1])],
        range: [innerHeight, 0],
      }),
    [arrivalRange, innerHeight],
  );

  // Color scale: map dV to color using d3-scale-chromatic turbo
  const dvToColor = useMemo(() => {
    // Use log scale for better visual separation
    const logMin = Math.log(Math.max(minDV, 0.1));
    const logMax = Math.log(Math.max(maxDV, minDV + 1));
    const range = logMax - logMin || 1;

    return (dv: number) => {
      const t = (Math.log(Math.max(dv, 0.1)) - logMin) / range;
      return interpolateTurbo(Math.max(0, Math.min(1, t)));
    };
  }, [minDV, maxDV]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>, cell: PorkchopCell) => {
      setHoveredCell(cell);
      setMousePos({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  if (grid.length === 0 || !isFinite(launchRange[0])) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-display text-sm text-[var(--color-steel)]">
          No valid transfers found
        </span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <svg width={width} height={height}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          {/* Grid cells */}
          {grid.map((row, i) =>
            row.map((cell, j) => {
              if (!cell) return null;
              const cx = xScale(dayToDate(cell.launchDay));
              const cy = yScale(dayToDate(cell.arrivalDay));
              return (
                <rect
                  key={`${i}-${j}`}
                  x={cx - cellWidth / 2}
                  y={cy - cellHeight / 2}
                  width={Math.ceil(cellWidth) + 1}
                  height={Math.ceil(cellHeight) + 1}
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
            top={innerHeight}
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
            background: `linear-gradient(to right, ${dvToColor(minDV)}, ${dvToColor((minDV + maxDV) / 2)}, ${dvToColor(maxDV)})`,
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
