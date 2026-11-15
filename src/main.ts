import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { startPwa } from './lib/pwa.svelte';

startPwa();

// Ask the browser not to evict local data under storage pressure.
// Safari may ignore this, but it costs nothing to ask.
void navigator.storage?.persist?.().catch(() => undefined);

const app = mount(App, { target: document.getElementById('app')! });

export default app;
