// Map Valhalla maneuver type enum -> Material Symbols icon name.
// Reference: Valhalla DirectionsLeg.Maneuver.Type.
const ICONS = {
  0: 'navigation',          // None
  1: 'my_location',         // Start
  2: 'my_location',         // StartRight
  3: 'my_location',         // StartLeft
  4: 'place',               // Destination
  5: 'place',               // DestinationRight
  6: 'place',               // DestinationLeft
  7: 'straight',            // Becomes
  8: 'straight',            // Continue
  9: 'turn_slight_right',   // SlightRight
  10: 'turn_right',         // Right
  11: 'turn_sharp_right',   // SharpRight
  12: 'u_turn_left',        // UturnRight (drive-right convention)
  13: 'u_turn_left',        // UturnLeft
  14: 'turn_sharp_left',    // SharpLeft
  15: 'turn_left',          // Left
  16: 'turn_slight_left',   // SlightLeft
  17: 'straight',           // RampStraight
  18: 'ramp_right',         // RampRight
  19: 'ramp_left',          // RampLeft
  20: 'ramp_right',         // ExitRight
  21: 'ramp_left',          // ExitLeft
  22: 'straight',           // StayStraight
  23: 'fork_right',         // StayRight
  24: 'fork_left',          // StayLeft
  25: 'merge',              // Merge
  26: 'roundabout_right',   // RoundaboutEnter
  27: 'roundabout_right',   // RoundaboutExit
  28: 'directions_boat',    // FerryEnter
  29: 'directions_boat',    // FerryExit
  37: 'merge',              // MergeRight
  38: 'merge',              // MergeLeft
};

export function maneuverIcon(type) {
  return ICONS[type] || 'navigation';
}

// Is this the final arrival maneuver?
export function isDestination(type) {
  return type === 4 || type === 5 || type === 6;
}
