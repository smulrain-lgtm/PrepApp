/**
 * Short offline quick guides. General UK guidance only: in an emergency,
 * follow instructions from the emergency services and your utility companies.
 */

export interface Guide {
  id: string;
  title: string;
  /** Numbers to call, shown first. */
  call: { label: string; phone: string }[];
  steps: string[];
}

export const GUIDES: Guide[] = [
  {
    id: 'gas-leak',
    title: 'Smell of gas or suspected gas leak',
    call: [{ label: 'National Gas emergency', phone: '0800 111 999' }],
    steps: [
      'Do not use any electrical switches, doorbells or phones inside the house, and no flames or smoking.',
      'Open doors and windows.',
      'Turn the gas off at the meter if you can do so safely (lever across the pipe).',
      'Get everyone, including pets, out of the house.',
      'Call the gas emergency number from outside, and follow their advice.',
    ],
  },
  {
    id: 'carbon-monoxide',
    title: 'Carbon monoxide (CO) alarm or symptoms',
    call: [
      { label: 'Emergency services', phone: '999' },
      { label: 'National Gas emergency', phone: '0800 111 999' },
    ],
    steps: [
      'Symptoms: headache, dizziness, nausea, tiredness, confusion. They ease outside.',
      'Turn off stoves, heaters and lamps if safe; open windows and doors.',
      'Get everyone out into fresh air.',
      'Call 999 if anyone feels unwell; call the gas emergency number about the appliance.',
      'Do not use the appliance again until it has been checked.',
    ],
  },
  {
    id: 'stoves-indoors',
    title: 'Stoves, heaters and paraffin lamps indoors',
    call: [],
    steps: [
      'Never use a camping gas stove, barbecue or generator indoors or in the garage with the door shut: they give off carbon monoxide.',
      'Only use heaters and lamps made for indoor use, and follow their instructions.',
      'Keep a window open for ventilation and a battery CO alarm in the same room.',
      'Keep them away from curtains and bedding, and never leave them burning while asleep.',
      'Store paraffin in an approved container, outside the living space and away from gas canisters.',
    ],
  },
  {
    id: 'power-cut',
    title: 'Power cut',
    call: [{ label: 'Power cut line', phone: '105' }],
    steps: [
      'Check whether neighbours are affected, then call 105 to report it and get updates.',
      'Use torches and lanterns rather than candles.',
      'Switch off appliances that could start up unattended when the power returns; leave one light on.',
      'Keep fridge and freezer doors closed: a full freezer keeps food frozen for about 48 hours.',
      'Check on vulnerable neighbours. Keep phones charged from power banks.',
    ],
  },
  {
    id: 'flooding',
    title: 'Flooding',
    call: [
      { label: 'Floodline', phone: '0345 988 1188' },
      { label: 'Emergency services', phone: '999' },
    ],
    steps: [
      'Check flood warnings with Floodline. If told to leave, take your grab bags and go.',
      'Turn off gas, water and electricity at the mains if it is safe to do so.',
      'Move people, pets, documents and valuables upstairs.',
      'Do not walk or drive through flood water: 15 cm of fast water can knock you over, 30 cm can move a car.',
      'Flood water is often dirty. Wash hands and anything it touches.',
    ],
  },
  {
    id: 'water',
    title: 'No water or unsafe tap water',
    call: [],
    steps: [
      'Follow your water supplier’s instructions (boil notice, do-not-drink notice, or bottled water stations).',
      'Under a boil notice: bring tap water to a rolling boil, let it cool, then use it for drinking, cooking and teeth.',
      'Use stored water first for drinking; keep it for people and pets before washing.',
      'Use the water filter and purification tablets as the instructions say, if supply is cut for longer.',
      'Use the emergency toilet kit if toilets cannot be flushed.',
    ],
  },
];
