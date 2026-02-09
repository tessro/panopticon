#!/usr/bin/env bash
set -euo pipefail

GAME_MANAGED="/mnt/c/Program Files (x86)/Steam/steamapps/common/Terra Invicta/TerraInvicta_Data/Managed"
ILDASM="/mnt/c/Program Files (x86)/Microsoft SDKs/Windows/v10.0A/bin/NETFX 4.8 Tools/ildasm.exe"
RAW_DIR="data/raw"
DLL="Assembly-CSharp.dll"

mkdir -p "$RAW_DIR"

if [[ ! -f "$ILDASM" ]]; then
  echo "Error: ildasm.exe not found at $ILDASM" >&2
  exit 1
fi

if [[ ! -f "$GAME_MANAGED/$DLL" ]]; then
  echo "Error: $DLL not found at $GAME_MANAGED/$DLL" >&2
  exit 1
fi

cp "$GAME_MANAGED/$DLL" "$RAW_DIR/$DLL"
echo "Copied $DLL."

"$ILDASM" "$RAW_DIR/$DLL" /out="$RAW_DIR/Assembly-CSharp.il" /utf8
echo "Disassembled to $RAW_DIR/Assembly-CSharp.il"
