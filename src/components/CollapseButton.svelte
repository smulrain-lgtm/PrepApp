<script lang="ts">
  /** The chevron beside a group heading that shows or hides the group. */
  let {
    open,
    label,
    controls,
    onclick,
  }: { open: boolean; label: string; controls: string; onclick: () => void } = $props();
</script>

<button
  type="button"
  class="collapse"
  aria-expanded={open}
  aria-controls={controls}
  aria-label="{open ? 'Hide' : 'Show'} {label}"
  {onclick}
>
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" class:closed={!open}>
    <path
      d="M6 9l6 6 6-6"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</button>

<style>
  .collapse {
    flex: none;
    width: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-2);
  }

  svg {
    transition: transform 0.15s;
  }

  svg.closed {
    transform: rotate(-90deg);
  }
</style>
