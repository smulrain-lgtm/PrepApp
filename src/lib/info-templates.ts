/**
 * Starting slots for the emergency information screens. A slot becomes an
 * infoNote record the first time it is saved, so devices that were set up
 * before Stage 3 get them too (no seed change needed).
 */
import type { InfoSection } from './model/types';

export interface Slot {
  /** Fixed record id, so the same slot on two devices is the same record. */
  id: string;
  title: string;
  hint: string;
  photo?: boolean;
}

export const SECTION_INFO: Record<InfoSection, { title: string; intro: string }> = {
  plan: {
    title: 'Household plan',
    intro: 'Where to meet, who to call, who does what. Talk it through with everyone.',
  },
  shutoffs: {
    title: 'Shut-offs',
    intro: 'Where to turn off water, gas and electricity. Add a photo so anyone can find them in the dark.',
  },
  documents: {
    title: 'Documents index',
    intro: 'Where the paper copies are kept and which grab bag holds what.',
  },
  grabbag: {
    title: 'Grab bags',
    intro: 'One list per person, for leaving home in a hurry.',
  },
  medical: {
    title: 'Medical list',
    intro: 'Medicines and doses, allergies, blood group and GP for each person. Protected by the app PIN.',
  },
};

export const SLOTS: Partial<Record<InfoSection, Slot[]>> = {
  plan: [
    {
      id: 'info:plan:meet-near',
      title: 'Meeting point near home',
      hint: 'e.g. the corner of the street, by the post box',
    },
    {
      id: 'info:plan:meet-far',
      title: 'Meeting point further away',
      hint: 'If the area is closed off: a relative, a church, a car park',
    },
    {
      id: 'info:plan:out-of-area',
      title: 'Out-of-area contact',
      hint: 'Someone outside the area everyone calls to check in',
    },
    { id: 'info:plan:children', title: 'Who collects the children', hint: 'And the backup if they cannot' },
    {
      id: 'info:plan:dogs',
      title: 'Who collects the dogs',
      hint: 'Leads, food and the vet’s number go with them',
    },
    {
      id: 'info:plan:who-does-what',
      title: 'Who does what',
      hint: 'Shut-offs, grab bags, checking on neighbours',
    },
  ],
  shutoffs: [
    {
      id: 'info:shutoffs:water',
      title: 'Water stopcock',
      hint: 'Usually under the kitchen sink. Turn clockwise to close.',
      photo: true,
    },
    {
      id: 'info:shutoffs:gas',
      title: 'Gas meter and valve',
      hint: 'Lever across the pipe = off.',
      photo: true,
    },
    {
      id: 'info:shutoffs:electric',
      title: 'Fuse board (consumer unit)',
      hint: 'Main switch turns everything off.',
      photo: true,
    },
  ],
  documents: [
    {
      id: 'info:documents:where',
      title: 'Where the copies are kept',
      hint: 'Waterproof wallet: insurance, IDs, medical info',
    },
    {
      id: 'info:documents:bags',
      title: 'What each grab bag holds',
      hint: 'Which documents, cash and chargers are in which bag',
    },
  ],
};

export const GRAB_BAG_TEMPLATE = [
  'Water (1 L) and snacks',
  'Medicines (5 days) and copy of prescriptions',
  'Torch and spare batteries',
  'Phone charger and power bank',
  'Change of clothes and waterproof',
  'Cash and copies of documents',
  'Whistle, foil blanket, dust mask',
].join('\n');

export const MEDICAL_TEMPLATE = [
  'Medicines and doses:',
  'Allergies:',
  'Blood group:',
  'GP and surgery number:',
  'Other conditions:',
].join('\n');
