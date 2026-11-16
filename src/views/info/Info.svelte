<script lang="ts">
  import Contacts from './Contacts.svelte';
  import Guides from './Guides.svelte';
  import Medical from './Medical.svelte';
  import Notes from './Notes.svelte';
  import PrintSheet from './PrintSheet.svelte';
  import { SECTION_INFO } from '../../lib/info-templates';
  import type { InfoSection } from '../../lib/model/types';

  let { params }: { params: URLSearchParams } = $props();

  type Page = 'contacts' | InfoSection | 'guides' | 'print';

  const PAGES: { id: Page; title: string; intro: string }[] = [
    { id: 'contacts', title: 'Contacts', intro: 'Tap to call or text. UK emergency numbers are already in.' },
    { id: 'plan', ...SECTION_INFO.plan },
    { id: 'shutoffs', ...SECTION_INFO.shutoffs },
    { id: 'grabbag', ...SECTION_INFO.grabbag },
    { id: 'documents', ...SECTION_INFO.documents },
    { id: 'medical', ...SECTION_INFO.medical },
    {
      id: 'guides',
      title: 'Quick guides',
      intro: 'Gas leak, CO, power cut, flooding, water, stoves indoors.',
    },
    { id: 'print', title: 'Print / Save as PDF', intro: 'One page with contacts, the plan and shut-offs.' },
  ];

  const pageId = $derived(params.get('s') as Page | null);
  const page = $derived(PAGES.find((p) => p.id === pageId));
</script>

{#if !page}
  <h1>Emergency info</h1>
  <ul class="menu">
    {#each PAGES as p (p.id)}
      <li>
        <a class="card" href="#/info?s={p.id}">
          <span class="title"
            >{p.title}{#if p.id === 'medical'}<span aria-label="PIN protected"> 🔒</span>{/if}</span
          >
          <span class="muted">{p.intro}</span>
        </a>
      </li>
    {/each}
  </ul>
{:else}
  <a class="back" href="#/info">‹ Emergency info</a>
  <h1 class:no-print={page.id === 'print'}>{page.title}</h1>
  {#if page.id === 'contacts'}
    <Contacts />
  {:else if page.id === 'guides'}
    <Guides />
  {:else if page.id === 'print'}
    <PrintSheet />
  {:else if page.id === 'medical'}
    <Medical />
  {:else}
    <Notes section={page.id} intro={page.intro} />
  {/if}
{/if}

<style>
  .menu {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }

  .menu a {
    display: grid;
    gap: 0.2rem;
    color: inherit;
    text-decoration: none;
  }

  .title {
    font-weight: 700;
  }

  .back {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }

  @media (min-width: 744px) {
    .menu {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
