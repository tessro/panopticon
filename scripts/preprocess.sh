#!/usr/bin/env bash
set -euo pipefail

GAME_DATA="/mnt/c/Program Files (x86)/Steam/steamapps/common/Terra Invicta/TerraInvicta_Data/StreamingAssets/Templates"
RAW_DIR="data/raw"
OUT_DIR="public/data"

mkdir -p "$RAW_DIR" "$OUT_DIR"

# Copy raw files
for f in TICouncilorTypeTemplate TIMissionTemplate TIFactionTemplate TITraitTemplate TIFactionIdeologyTemplate TISpaceBodyTemplate TIOrbitTemplate; do
  cp "$GAME_DATA/$f.json" "$RAW_DIR/$f.json"
done

echo "Raw data copied."

# Councilor types
jq '[.[] | select(.dataName != "Alien") | {
  name: .dataName,
  friendlyName: .friendlyName,
  primaryStat: .keyStat[0],
  secondaryStat: (if .keyStat[1] == "None" then null else .keyStat[1] end),
  affinities: (.affinities // []),
  antiAffinities: (.antiAffinities // []),
  missions: .missionNames,
  weight: .weight,
  stats: {
    persuasion: { base: .basePersuasion, rand: .randPersuasion },
    investigation: { base: .baseInvestigation, rand: .randInvestigation },
    espionage: { base: .baseEspionage, rand: .randEspionage },
    command: { base: .baseCommand, rand: .randCommand },
    administration: { base: .baseAdministration, rand: .randAdministration },
    science: { base: .baseScience, rand: .randScience }
  }
}]' "$RAW_DIR/TICouncilorTypeTemplate.json" > "$OUT_DIR/councilor-types.json"

echo "Processed councilor types."

# Missions
jq '[.[] | select(.disable == false) | {
  name: .dataName,
  friendlyName: .friendlyName,
  attackStat: (if .resolutionMethod.attackingModifiers then
    [.resolutionMethod.attackingModifiers[] |
    select(."$type" == "TIMissionModifier_CouncilorAttackStat") |
    .attackerAttribute][0] // null
  else null end),
  resourceType: (.cost.resourceType // null),
  sortOrder: .sortOrder
}]' "$RAW_DIR/TIMissionTemplate.json" > "$OUT_DIR/missions.json"

echo "Processed missions."

# Factions
jq '[.[] | select(.activePlayerAllowed == true) | {
  name: .dataName,
  friendlyName: .friendlyName,
  ideology: .ideologyName,
  color: .color,
  backgroundColor: .backgroundColor
}]' "$RAW_DIR/TIFactionTemplate.json" > "$OUT_DIR/factions.json"

echo "Processed factions."

# Traits (Government and Criminal chances)
jq '[.[] | select(.dataName == "Government" or .dataName == "Criminal") | {
  name: .dataName,
  classChance: [.classChance[] | { class: .councilorClass, chance: (.chance // 0) }]
}]' "$RAW_DIR/TITraitTemplate.json" > "$OUT_DIR/traits.json"

echo "Processed traits."

# Space bodies (planets, dwarf planets, major moons with orbital elements)
jq '[.[] | select(
  .semiMajorAxis_AU != null and .eccentricity != null and
  (.objectType == "Planet" or .objectType == "DwarfPlanet" or .objectType == "PlanetaryMoon" or .objectType == "Star")
) | {
  name: .dataName,
  friendlyName: .friendlyName,
  objectType: .objectType,
  barycenter: (.barycenterName // null),
  semiMajorAxis_AU: .semiMajorAxis_AU,
  semiMajorAxis_km: (if .semiMajorAxis_AU > 0 then (.semiMajorAxis_AU * 149597870.7) else 0 end),
  eccentricity: .eccentricity,
  inclination_Deg: (.inclination_Deg // 0),
  longAscendingNode_Deg: (.longAscendingNode_Deg // 0),
  argPeriapsis_Deg: (.argPeriapsis_Deg // 0),
  meanAnomalyAtEpoch_Deg: (.meanAnomalyAtEpoch_Deg // 0),
  epoch_floatJYears: (.epoch_floatJYears // 2000),
  mass_kg: (.mass_kg // 0),
  equatorialRadius_km: (.equatorialRadius_km // 0)
}]' "$RAW_DIR/TISpaceBodyTemplate.json" > "$OUT_DIR/space-bodies.json"

echo "Processed space bodies."

# Orbits (filter to planets, dwarf planets, moons, and Lagrange points)
jq --argjson majorBodies "$(jq '[.[] | select(
  .objectType == "Planet" or .objectType == "DwarfPlanet" or .objectType == "PlanetaryMoon"
) | .dataName]' "$RAW_DIR/TISpaceBodyTemplate.json")" \
'[.[] | select(
  (.barycenterName as $b | $majorBodies | index($b)) or
  (.barycenterName | test("L[1-5]$"))
) | {
  name: .dataName,
  friendlyName: (."friendly name" // .friendlyName // .dataName),
  barycenter: .barycenterName,
  orbitIndex: .orbitIndex,
  altitude_km: (.altitude_km // null),
  semiMajorAxis_km: (.semiMajorAxis_km // null),
  eccentricity: .eccentricity,
  interfaceOrbit: (.interfaceOrbit // false),
  mass: (.mass // null)
}]' "$RAW_DIR/TIOrbitTemplate.json" > "$OUT_DIR/orbits.json"

echo "Processed orbits."
echo "Done!"
