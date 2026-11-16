import { describe, expect, it } from 'vitest';
import { changeNote, type SeenReadiness } from './change-note';

const base: SeenReadiness = {
  date: '2026-11-15',
  days: 2.4,
  people: 3,
  pets: 2,
  rule: 'exclude',
  expiredUnits: 18,
};

describe('change note', () => {
  it('says nothing the first time, or when the figure holds or rises', () => {
    expect(changeNote(null, base)).toBeNull();
    expect(changeNote(base, { ...base, days: 2.4 })).toBeNull();
    expect(changeNote(base, { ...base, days: 3 })).toBeNull();
  });

  it('explains packs passing their date', () => {
    expect(changeNote(base, { ...base, days: 2.1, expiredUnits: 20, date: '2026-12-02' })).toBe(
      'Down from 2.4 to 2.1 days: 2 packs passed the best-before date.',
    );
  });

  it('explains a bigger household, listing several reasons', () => {
    expect(changeNote(base, { ...base, days: 1.4, people: 5, expiredUnits: 19 })).toBe(
      'Down from 2.4 to 1.4 days: the household grew from 3 to 5 and 1 pack passed the best-before date.',
    );
  });

  it('falls back to stock being used', () => {
    expect(changeNote(base, { ...base, days: 2.2 })).toBe(
      'Down from 2.4 to 2.2 days: stock was used or removed.',
    );
  });
});
