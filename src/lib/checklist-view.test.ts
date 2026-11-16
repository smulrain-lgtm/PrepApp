import { describe, expect, it } from 'vitest';
import seedJson from '../seed/seed.json';
import { groupChecklist, isCheckDue, nextCheckDue, targetBasis, targetText } from './checklist-view';
import { snapshotFromDocs } from './model/snapshot';
import type { AnyDoc, ChecklistItem } from './model/types';
import { telHref } from './photo';

const snap = snapshotFromDocs(seedJson as AnyDoc[]);
const line = (name: string) => snap.checklistItems.find((l) => l.name === name)!;
const s = snap.settings;

describe('checklist view', () => {
  it('shows scaled targets with how they were worked out', () => {
    expect(targetText(line('Drinking & cooking water'), s)).toBe('42 L');
    expect(targetBasis(line('Drinking & cooking water'), s)).toBe('(3 × 4 L + 2 L for pets) × 3 days');
    expect(targetText(line('Backpacking meals – lunch & dinner'), s)).toBe('18 meals');
    expect(targetBasis(line('Backpacking meals – lunch & dinner'), s)).toBe('2 × 3 people × 3 days');
    expect(targetText(line('Dog food & treats (both dogs)'), s)).toBe('600 g dry food');
    expect(targetText(line('Cash – coins and small notes'), s)).toBe('£200');
    expect(targetText(line('Gas canisters'), s)).toBe('4 × 230 g canisters');
    expect(targetBasis(line('Gas canisters'), s)).toBe('');
  });

  it('works out when a recurring check is due', () => {
    const solar = line('Portable solar panels');
    expect(isCheckDue(solar, '2026-11-16')).toBe(true); // never checked
    const checked: ChecklistItem = { ...solar, lastChecked: '2026-11-16' };
    expect(nextCheckDue(checked)).toBe('2027-02-15');
    expect(isCheckDue(checked, '2027-02-14')).toBe(false);
    expect(isCheckDue(checked, '2027-02-15')).toBe(true);
    expect(isCheckDue(line('Whistle'), '2026-11-16')).toBe(false); // no interval
  });

  it('groups lines by section and filters by status', () => {
    const all = groupChecklist(snap.checklistSections, snap.checklistItems, 'all', '2026-11-16');
    expect(all).toHaveLength(9);
    expect(all[0].section.name).toBe('Water');
    expect(all.reduce((n, g) => n + g.lines.length, 0)).toBe(68);
    const have = groupChecklist(snap.checklistSections, snap.checklistItems, 'have', '2026-11-16');
    expect(have.reduce((n, g) => n + g.lines.length, 0)).toBe(10);
    const due = groupChecklist(snap.checklistSections, snap.checklistItems, 'due', '2026-11-16');
    expect(due.reduce((n, g) => n + g.lines.length, 0)).toBe(5);
  });

  it('makes phone links', () => {
    expect(telHref('0800 111 999')).toBe('tel:0800111999');
    expect(telHref('+44 7700 900123', 'sms')).toBe('sms:+447700900123');
  });
});
