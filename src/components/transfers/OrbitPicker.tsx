import { useMemo } from "react";
import type { SpaceBody, Orbit } from "@/types/orbital";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface OrbitPickerProps {
  value: string | null;
  onChange: (orbitName: string) => void;
  bodies: SpaceBody[];
  orbits: Orbit[];
  label: string;
}

interface BodyGroup {
  label: string;
  bodies: {
    name: string;
    friendlyName: string;
    orbits: Orbit[];
  }[];
}

const INNER_PLANETS = ["Mercury", "Venus", "Earth", "Mars"];
const OUTER_PLANETS = ["Jupiter", "Saturn", "Uranus", "Neptune"];
const NOTABLE_MOONS = [
  "Luna", "Io", "Europa", "Ganymede", "Callisto",
  "Titan", "Enceladus", "Triton", "Mimas", "Dione",
  "Rhea", "Iapetus", "Tethys", "Miranda", "Ariel",
  "Umbriel", "Titania", "Oberon", "Charon",
];
const NOTABLE_DWARFS = ["Ceres", "Pluto", "Haumea", "Makemake", "Quaoar"];

function isLagrangeBarycenter(name: string): boolean {
  return /L[1-5]$/.test(name);
}

/** Parse Lagrange barycenter name into group label + point label */
function parseLagrange(barycenter: string): { group: string; point: string } {
  const match = barycenter.match(/^(.+?)(L[1-5])$/);
  if (!match) return { group: barycenter, point: barycenter };

  let group = match[1] ?? barycenter;
  const point = match[2] ?? barycenter;

  // Insert separators: "SunEarth" → "Sun-Earth", "EarthLuna" → "Earth-Luna"
  group = group
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/^Sun/, "Sun-")
    .replace(/^--/, "-");
  if (group.startsWith("-")) group = group.slice(1);

  return { group, point };
}

export function OrbitPicker({
  value,
  onChange,
  bodies,
  orbits,
  label,
}: OrbitPickerProps) {
  const selectedOrbit = orbits.find((o) => o.name === value);

  const groups = useMemo(() => {
    const result: BodyGroup[] = [];

    // Helper: get orbits for a body (direct orbits around that body)
    const getBodyOrbits = (bodyName: string) =>
      orbits.filter((o) => o.barycenter === bodyName);

    // Inner planets
    const innerBodies = INNER_PLANETS
      .map((name) => {
        const body = bodies.find((b) => b.name === name);
        const bodyOrbits = getBodyOrbits(name);
        return body && bodyOrbits.length > 0
          ? { name: body.name, friendlyName: body.friendlyName, orbits: bodyOrbits }
          : null;
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
    if (innerBodies.length > 0) {
      result.push({ label: "Inner Planets", bodies: innerBodies });
    }

    // Outer planets
    const outerBodies = OUTER_PLANETS
      .map((name) => {
        const body = bodies.find((b) => b.name === name);
        const bodyOrbits = getBodyOrbits(name);
        return body && bodyOrbits.length > 0
          ? { name: body.name, friendlyName: body.friendlyName, orbits: bodyOrbits }
          : null;
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
    if (outerBodies.length > 0) {
      result.push({ label: "Outer Planets", bodies: outerBodies });
    }

    // Major moons
    const moonBodies = NOTABLE_MOONS
      .map((name) => {
        const body = bodies.find((b) => b.name === name);
        const bodyOrbits = getBodyOrbits(name);
        return body && bodyOrbits.length > 0
          ? { name: body.name, friendlyName: body.friendlyName, orbits: bodyOrbits }
          : null;
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
    if (moonBodies.length > 0) {
      result.push({ label: "Major Moons", bodies: moonBodies });
    }

    // Lagrange points — group by system
    const lagrangeOrbits = orbits.filter((o) => isLagrangeBarycenter(o.barycenter));
    const lagrangeGroups = new Map<string, Orbit[]>();
    for (const orbit of lagrangeOrbits) {
      const { group } = parseLagrange(orbit.barycenter);
      const existing = lagrangeGroups.get(group) ?? [];
      existing.push(orbit);
      lagrangeGroups.set(group, existing);
    }
    if (lagrangeGroups.size > 0) {
      const lagrangeBodies = Array.from(lagrangeGroups.entries()).map(
        ([group, groupOrbits]) => ({
          name: group,
          friendlyName: group,
          orbits: groupOrbits,
        }),
      );
      result.push({ label: "Lagrange Points", bodies: lagrangeBodies });
    }

    // Dwarf planets
    const dwarfBodies = NOTABLE_DWARFS
      .map((name) => {
        const body = bodies.find((b) => b.name === name);
        const bodyOrbits = getBodyOrbits(name);
        return body && bodyOrbits.length > 0
          ? { name: body.name, friendlyName: body.friendlyName, orbits: bodyOrbits }
          : null;
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);

    // Add other dwarf planets not in the notable list
    const otherDwarfs = bodies
      .filter(
        (b) =>
          b.objectType === "DwarfPlanet" &&
          !NOTABLE_DWARFS.includes(b.name) &&
          getBodyOrbits(b.name).length > 0,
      )
      .map((b) => ({
        name: b.name,
        friendlyName: b.friendlyName,
        orbits: getBodyOrbits(b.name),
      }));

    const allDwarfs = [...dwarfBodies, ...otherDwarfs];
    if (allDwarfs.length > 0) {
      result.push({ label: "Dwarf Planets", bodies: allDwarfs });
    }

    return result;
  }, [bodies, orbits]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between truncate font-body text-xs"
        >
          <span className="truncate">
            {selectedOrbit ? selectedOrbit.friendlyName : label}
          </span>
          <span className="text-[var(--color-ash)]">▾</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="max-h-80 w-72 overflow-y-auto"
        align="start"
      >
        {groups.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="font-display text-xs tracking-wide text-[var(--color-cyan)] uppercase">
              {group.label}
            </DropdownMenuLabel>
            {group.bodies.map((body) =>
              body.orbits.length === 1 ? (
                <DropdownMenuItem
                  key={body.orbits[0]!.name}
                  onSelect={() => onChange(body.orbits[0]!.name)}
                  className="text-xs"
                >
                  {body.orbits[0]!.friendlyName}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuSub key={body.name}>
                  <DropdownMenuSubTrigger className="text-xs">
                    {body.friendlyName}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                    {body.orbits.map((orbit) => (
                      <DropdownMenuItem
                        key={orbit.name}
                        onSelect={() => onChange(orbit.name)}
                        className="text-xs"
                      >
                        {orbit.friendlyName}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ),
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
