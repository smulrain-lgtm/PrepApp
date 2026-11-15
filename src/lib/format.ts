import { METRIC_INFO } from './model/constants';
import type { Metric } from './model/types';

const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/** 0, 0.4, 1.4, 12 — one decimal below 10, whole numbers above. */
export function formatDays(days: number | null): string {
  if (days === null) return '–';
  if (days >= 10) return nf0.format(days);
  return nf1.format(Math.floor(days * 10) / 10);
}

export function formatNumber(n: number): string {
  return Math.abs(n) >= 100 ? nf0.format(n) : nf1.format(n);
}

/** 8,300 kcal · 42 L · 600 g (≥ 1,000 g shown as kg). */
export function formatAmount(metric: Metric, amount: number): string {
  const unit = METRIC_INFO.find((m) => m.id === metric)?.unit ?? '';
  if (metric === 'pet_food_g' || metric === 'fuel_g') {
    return amount >= 1000 ? `${nf1.format(amount / 1000)} kg` : `${nf0.format(amount)} g`;
  }
  if (metric === 'med_days' || metric === 'light_days') return `${formatDays(amount)} days`;
  return `${formatNumber(amount)} ${unit}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
