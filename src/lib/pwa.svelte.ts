import { registerSW } from 'virtual:pwa-register';

/** Reactive state for the service worker: offline readiness and pending updates. */
export const pwa = $state({
  offlineReady: false,
  updateAvailable: false,
});

let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

export function startPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onOfflineReady() {
      pwa.offlineReady = true;
    },
    onNeedRefresh() {
      pwa.updateAvailable = true;
    },
  });

  // A page controlled by an active service worker was served from the precache,
  // so it will also launch with no network.
  const markIfControlled = () => {
    if (navigator.serviceWorker.controller) pwa.offlineReady = true;
  };
  markIfControlled();
  navigator.serviceWorker.addEventListener('controllerchange', markIfControlled);
  void navigator.serviceWorker.ready.then(markIfControlled);
}

export function applyUpdate(): void {
  void updateSW?.(true);
}
