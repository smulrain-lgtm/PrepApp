<script lang="ts">
  let {
    checked,
    label,
    description = '',
    onchange,
  }: {
    checked: boolean;
    label: string;
    description?: string;
    onchange: (checked: boolean) => void;
  } = $props();
</script>

<label class="toggle">
  <span class="text">
    <span class="label">{label}</span>
    {#if description}<span class="muted desc">{description}</span>{/if}
  </span>
  <input type="checkbox" role="switch" {checked} onchange={(e) => onchange(e.currentTarget.checked)} />
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
</label>

<style>
  .toggle {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 44px;
    cursor: pointer;
    position: relative;
  }

  .text {
    flex: 1;
    display: grid;
  }

  .label {
    font-weight: 600;
  }

  .desc {
    font-size: 0.875rem;
  }

  input {
    position: absolute;
    opacity: 0;
    width: 51px;
    height: 31px;
    right: 0;
    margin: 0;
    cursor: pointer;
  }

  .track {
    flex: none;
    width: 51px;
    height: 31px;
    border-radius: 999px;
    background: var(--border);
    position: relative;
    transition: background 0.15s;
  }

  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 27px;
    height: 27px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
    transition: transform 0.15s;
  }

  input:checked + .track {
    background: var(--good);
  }

  input:checked + .track .thumb {
    transform: translateX(20px);
  }

  input:focus-visible + .track {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
