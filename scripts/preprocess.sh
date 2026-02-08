#!/usr/bin/env bash
set -euo pipefail

GAME_DATA="/mnt/c/Program Files (x86)/Steam/steamapps/common/Terra Invicta/TerraInvicta_Data/StreamingAssets/Templates"
RAW_DIR="data/raw"
OUT_DIR="public/data"

mkdir -p "$RAW_DIR" "$OUT_DIR"

# Copy raw files
for f in TICouncilorTypeTemplate TIMissionTemplate TIFactionTemplate TITraitTemplate TIFactionIdeologyTemplate; do
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
echo "Done!"
