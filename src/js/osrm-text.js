// Synthesize German turn instructions + maneuver icons from OSRM step
// maneuvers (type + modifier), since OSRM returns structured data, not prose.

const MODIFIER_ICON = {
  'uturn': 'u_turn_left',
  'sharp right': 'turn_sharp_right',
  'right': 'turn_right',
  'slight right': 'turn_slight_right',
  'straight': 'straight',
  'slight left': 'turn_slight_left',
  'left': 'turn_left',
  'sharp left': 'turn_sharp_left',
};

export function osrmIcon(type, modifier) {
  switch (type) {
    case 'depart': return 'my_location';
    case 'arrive': return 'place';
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn': return 'roundabout_right';
    case 'merge': return 'merge';
    case 'on ramp': return modifier?.includes('left') ? 'ramp_left' : 'ramp_right';
    case 'off ramp': return modifier?.includes('left') ? 'ramp_left' : 'ramp_right';
    case 'fork': return modifier?.includes('left') ? 'fork_left' : 'fork_right';
    case 'end of road':
    case 'turn':
    case 'continue':
    case 'new name':
      return MODIFIER_ICON[modifier] || 'straight';
    default:
      return MODIFIER_ICON[modifier] || 'navigation';
  }
}

const MODIFIER_TEXT = {
  'uturn': 'Wenden',
  'sharp right': 'scharf rechts abbiegen',
  'right': 'rechts abbiegen',
  'slight right': 'leicht rechts halten',
  'straight': 'geradeaus weiterfahren',
  'slight left': 'leicht links halten',
  'left': 'links abbiegen',
  'sharp left': 'scharf links abbiegen',
};

export function osrmInstruction(type, modifier, name, exit) {
  const onto = name ? ` auf ${name}` : '';
  switch (type) {
    case 'depart':
      return name ? `Auf ${name} starten` : 'Losfahren';
    case 'arrive':
      return modifier === 'left'
        ? 'Ziel auf der linken Seite erreicht'
        : modifier === 'right'
        ? 'Ziel auf der rechten Seite erreicht'
        : 'Ziel erreicht';
    case 'roundabout':
    case 'rotary':
      return exit
        ? `Im Kreisverkehr die ${exit}. Ausfahrt nehmen${onto}`
        : `In den Kreisverkehr einfahren${onto}`;
    case 'merge':
      return `Einfädeln${onto}`;
    case 'on ramp':
      return `Auf die Auffahrt${onto}`;
    case 'off ramp':
      return `Abfahrt nehmen${onto}`;
    case 'fork':
      return `${modifier?.includes('left') ? 'Links' : 'Rechts'} halten${onto}`;
    case 'end of road':
      return `${(MODIFIER_TEXT[modifier] || 'weiterfahren').replace(/^./, (c) => c.toUpperCase())}${onto}`;
    case 'new name':
    case 'continue':
      return name ? `Weiter auf ${name}` : 'Weiterfahren';
    case 'turn':
    default: {
      const verb = MODIFIER_TEXT[modifier] || 'weiterfahren';
      const cap = verb.replace(/^./, (c) => c.toUpperCase());
      return name && modifier && modifier !== 'straight' ? `${cap}${onto}` : cap;
    }
  }
}
