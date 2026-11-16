<script lang="ts">
  import Notes from './Notes.svelte';
  import { clearPin, lock, pinState, setPin, unlock, validPin } from '../../lib/pin.svelte';
  import { store } from '../../lib/store.svelte';

  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 15_000);
    return () => clearInterval(timer);
  });
  const unlocked = $derived(pinState.unlockedUntil > now);

  let pin = $state('');
  let confirmPin = $state('');
  let error = $state('');

  async function create(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    if (!validPin(pin)) return (error = 'Use 4 to 8 digits.');
    if (pin !== confirmPin) return (error = 'The two PINs do not match.');
    await setPin(pin);
    now = Date.now();
    pin = confirmPin = '';
    store.notify('PIN set. The medical list is unlocked for 5 minutes.');
  }

  async function enter(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    if (await unlock(pin)) {
      now = Date.now();
      pin = '';
    } else {
      error = 'Wrong PIN.';
      pin = '';
    }
  }

  function forgot() {
    if (
      !confirm(
        'Remove the PIN on this device? The medical list stays; you will set a new PIN to open it. ' +
          'The PIN is a soft lock against a casual look, not encryption.',
      )
    )
      return;
    clearPin();
    pin = confirmPin = error = '';
  }
</script>

{#if !pinState.hasPin}
  <form class="card gate" onsubmit={create}>
    <p>Set a PIN for this device to protect the medical list from a casual look.</p>
    <label>
      <span>New PIN (4–8 digits)</span>
      <input type="password" inputmode="numeric" autocomplete="new-password" bind:value={pin} />
    </label>
    <label>
      <span>Repeat the PIN</span>
      <input type="password" inputmode="numeric" autocomplete="new-password" bind:value={confirmPin} />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="primary" type="submit">Set PIN</button>
  </form>
{:else if !unlocked}
  <form class="card gate" onsubmit={enter}>
    <p>Enter the PIN to see the medical list.</p>
    <label>
      <span>PIN</span>
      <input type="password" inputmode="numeric" autocomplete="current-password" bind:value={pin} />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="primary" type="submit">Unlock</button>
    <button type="button" class="link" onclick={forgot}>Forgot the PIN?</button>
  </form>
{:else}
  <div class="bar">
    <span class="muted">Unlocked. Locks after 5 minutes or when the app is closed.</span>
    <button onclick={lock}>Lock now</button>
  </div>
  <Notes section="medical" />
  <p class="muted small">
    The medical list is left out of the printed sheet and the CSV export. It is included in JSON backups.
  </p>
{/if}

<style>
  .gate {
    display: grid;
    gap: 0.75rem;
    max-width: 420px;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  input {
    min-height: 44px;
    padding: 0 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-size: 1.2rem;
    letter-spacing: 0.3em;
  }

  .error {
    color: var(--bad);
    margin: 0;
  }

  .link {
    border: 0;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    justify-self: start;
    padding: 0;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .small {
    font-size: 0.85rem;
  }
</style>
