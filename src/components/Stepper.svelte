<script lang="ts">
  let {
    value,
    min = 0,
    max = 999,
    step = 1,
    label,
    unit = '',
    onchange,
  }: {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    label: string;
    unit?: string;
    onchange: (value: number) => void;
  } = $props();

  function set(next: number) {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped !== value) onchange(clamped);
  }
</script>

<div class="stepper" role="group" aria-label={label}>
  <button
    type="button"
    aria-label="Decrease {label}"
    disabled={value <= min}
    onclick={() => set(value - step)}
  >
    −
  </button>
  <output aria-live="polite">{value}{unit ? ` ${unit}` : ''}</output>
  <button
    type="button"
    aria-label="Increase {label}"
    disabled={value >= max}
    onclick={() => set(value + step)}
  >
    +
  </button>
</div>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    overflow: hidden;
  }

  button {
    border: 0;
    border-radius: 0;
    width: 44px;
    padding: 0;
    font-size: 1.3rem;
    background: none;
  }

  output {
    min-width: 3.5rem;
    text-align: center;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
</style>
