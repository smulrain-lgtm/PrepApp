<script lang="ts">
  import { GUIDES } from '../../lib/guides';
  import { telHref } from '../../lib/photo';
</script>

<p class="muted">
  Short reminders that work offline. In an emergency, follow instructions from the emergency services and your
  utility companies.
</p>

{#each GUIDES as g (g.id)}
  <details class="card">
    <summary>{g.title}</summary>
    {#if g.call.length}
      <div class="calls">
        {#each g.call as c (c.phone)}
          <a href={telHref(c.phone)}>📞 {c.label}: {c.phone}</a>
        {/each}
      </div>
    {/if}
    <ol>
      {#each g.steps as step, i (i)}<li>{step}</li>{/each}
    </ol>
  </details>
{/each}

<style>
  details {
    margin-bottom: 0.6rem;
  }

  summary {
    font-weight: 700;
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .calls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }

  .calls a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 0.9rem;
    border-radius: 10px;
    background: var(--accent);
    color: var(--accent-contrast);
    text-decoration: none;
    font-weight: 600;
  }

  ol {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
    display: grid;
    gap: 0.4rem;
  }
</style>
