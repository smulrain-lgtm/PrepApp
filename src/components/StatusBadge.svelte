<script lang="ts">
  import { STATUS_LABEL, type ItemStatus } from '../lib/inventory-view';

  let { status }: { status: ItemStatus } = $props();

  const ICON: Record<ItemStatus, string> = {
    expired: '✕',
    use_soon: '!',
    ok: '✓',
    no_date: '?',
    empty: '–',
  };
</script>

<span class="badge {status}"><span aria-hidden="true">{ICON[status]}</span> {STATUS_LABEL[status]}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
    background: var(--surface-2);
    color: var(--text-2);
  }

  .ok {
    background: var(--good-bg);
    color: var(--good);
  }

  .use_soon {
    background: var(--warn-bg);
    color: var(--warn);
  }

  .expired {
    background: var(--bad-bg);
    color: var(--bad);
  }
</style>
