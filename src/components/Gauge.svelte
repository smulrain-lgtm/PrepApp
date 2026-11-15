<script lang="ts">
  import type { Band } from '../lib/readiness';
  import { formatDays } from '../lib/format';

  let { days, target, fraction, band }: { days: number; target: number; fraction: number; band: Band } =
    $props();

  const BAND_WORD: Record<Band, string> = { red: 'Not ready', amber: 'Partly ready', green: 'Ready' };
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const dash = $derived(circumference * Math.max(0, Math.min(1, fraction)));
</script>

<div
  class="gauge {band}"
  role="img"
  aria-label="Readiness {formatDays(days)} of {target} days. {BAND_WORD[band]}."
>
  <svg viewBox="0 0 120 120" width="160" height="160" aria-hidden="true">
    <circle cx="60" cy="60" {r} fill="none" stroke="var(--surface-2)" stroke-width="12" />
    {#if dash > 0}<circle
        class="arc"
        cx="60"
        cy="60"
        {r}
        fill="none"
        stroke-width="12"
        stroke-linecap="round"
        stroke-dasharray="{dash} {circumference}"
        transform="rotate(-90 60 60)"
      />{/if}
  </svg>
  <div class="centre" aria-hidden="true">
    <span class="days">{formatDays(days)}</span>
    <span class="of">of {target} days</span>
  </div>
  <span class="word" aria-hidden="true">{BAND_WORD[band]}</span>
</div>

<style>
  .gauge {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 0.25rem;
  }

  .centre {
    position: absolute;
    top: 0;
    height: 160px;
    display: grid;
    place-content: center;
    text-align: center;
  }

  .days {
    font-size: 2.4rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .of {
    color: var(--text-2);
    font-size: 0.9rem;
  }

  .word {
    font-weight: 700;
    padding: 2px 12px;
    border-radius: 999px;
  }

  .red .arc {
    stroke: var(--bad);
  }
  .amber .arc {
    stroke: var(--warn);
  }
  .green .arc {
    stroke: var(--good);
  }
  .red .word {
    background: var(--bad-bg);
    color: var(--bad);
  }
  .amber .word {
    background: var(--warn-bg);
    color: var(--warn);
  }
  .green .word {
    background: var(--good-bg);
    color: var(--good);
  }
</style>
