<script lang="ts">
  import Sheet from '../components/Sheet.svelte';
  import { cleanBarcode, isValidBarcode, lookupBarcode, type LookupResult } from '../lib/barcode';

  let {
    open,
    onclose,
    onresult,
    known,
  }: {
    open: boolean;
    onclose: () => void;
    /**
     * A barcode was read. `lookup` is null when it was not looked up (`known`
     * said the code is already on an item); otherwise the Open Food Facts answer.
     */
    onresult: (code: string, lookup: LookupResult | null) => void;
    /** Return true to skip the lookup (e.g. the code is already on an item). */
    known?: (code: string) => boolean;
  } = $props();

  let video = $state<HTMLVideoElement | null>(null);
  let typed = $state('');
  let message = $state('');
  let busy = $state(false);
  /** starting: asking for the camera · on: scanning · off: no camera (type the number). */
  let camera = $state<'starting' | 'on' | 'off'>('off');
  let stopCamera: (() => void) | null = null;
  let handled = false;

  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

  $effect(() => {
    if (!open) {
      stop();
      return;
    }
    typed = '';
    message = '';
    busy = false;
    handled = false;
    if (video) void start(video);
    return () => stop();
  });

  function stop() {
    stopCamera?.();
    stopCamera = null;
    camera = 'off';
  }

  async function start(el: HTMLVideoElement) {
    if (!navigator.mediaDevices?.getUserMedia) {
      message = 'This device cannot use the camera here. Type the number under the barcode instead.';
      return;
    }
    camera = 'starting';
    message = 'Starting the camera…';
    try {
      const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (Native && (await Native.getSupportedFormats()).includes('ean_13')) await startNative(el, Native);
      else await startZxing(el);
      if (!open || handled) return stop();
      camera = 'on';
      message = 'Point the camera at the barcode.';
    } catch (error) {
      stop();
      const name = (error as Error).name;
      message =
        name === 'NotAllowedError'
          ? 'Camera access was refused. Allow it in Settings → Safari → Camera (or the browser’s site settings), or type the number below.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No camera found. Type the number under the barcode instead.'
            : `The camera could not start (${(error as Error).message}). Type the number instead.`;
    }
  }

  interface BarcodeDetectorCtor {
    new (options: { formats: string[] }): {
      detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
    };
    getSupportedFormats(): Promise<string[]>;
  }

  /** Chrome / Android: the browser's own barcode reader. */
  async function startNative(el: HTMLVideoElement, Native: BarcodeDetectorCtor) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    el.srcObject = stream;
    await el.play();
    const detector = new Native({ formats: FORMATS });
    let running = true;
    const loop = async () => {
      if (!running) return;
      try {
        if (el.readyState >= 2) {
          const [hit] = await detector.detect(el);
          if (hit) found(hit.rawValue);
        }
      } catch {
        // a frame that cannot be read: try the next one
      }
      if (running) setTimeout(loop, 200);
    };
    void loop();
    stopCamera = () => {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
      el.srcObject = null;
    };
  }

  /** iPhone / iPad Safari: no built-in reader, so a scanning library (loaded only when needed). */
  async function startZxing(el: HTMLVideoElement) {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- library options, not state
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
    const controls = await reader.decodeFromConstraints(
      { video: { facingMode: 'environment' }, audio: false },
      el,
      (result) => {
        if (result) found(result.getText());
      },
    );
    stopCamera = () => controls.stop();
  }

  function found(raw: string) {
    if (handled) return;
    const code = cleanBarcode(raw);
    if (!isValidBarcode(code)) return; // a misread: keep scanning
    handled = true;
    navigator.vibrate?.(50);
    stop();
    void finish(code);
  }

  async function finish(code: string) {
    if (known?.(code)) {
      onresult(code, null);
      return;
    }
    busy = true;
    message = `Looking up ${code}…`;
    const result = await lookupBarcode(code);
    busy = false;
    onresult(code, result);
  }

  function submitTyped(event: SubmitEvent) {
    event.preventDefault();
    const code = cleanBarcode(typed);
    if (code.length < 8) {
      message = 'Type all the digits under the barcode (usually 13).';
      return;
    }
    if (
      !isValidBarcode(code) &&
      !confirm(`${code} does not look like a complete barcode. Look it up anyway?`)
    )
      return;
    handled = true;
    stop();
    void finish(code);
  }
</script>

<Sheet {open} title="Scan a barcode" {onclose}>
  <div class="viewer" class:on={camera !== 'off'}>
    <video bind:this={video} playsinline muted autoplay aria-label="Camera view"></video>
    {#if camera === 'on'}<div class="aim" aria-hidden="true"></div>{/if}
  </div>
  <p class="message" role="status" aria-live="polite">{message}</p>

  <form class="typed" onsubmit={submitTyped}>
    <label>
      <span>Or type the barcode number</span>
      <input
        bind:value={typed}
        inputmode="numeric"
        autocomplete="off"
        placeholder="e.g. 5000157024671"
        data-testid="barcode-input"
      />
    </label>
    <button class="primary" type="submit" disabled={busy}>Look up</button>
  </form>
  <p class="muted small">
    Product details come from Open Food Facts, a free shared database, so looking up needs the internet. If a
    product is not found you can fill in the details yourself.
  </p>
</Sheet>

<style>
  .viewer {
    position: relative;
    display: none;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
    aspect-ratio: 4 / 3;
  }

  .viewer.on {
    display: block;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .aim {
    position: absolute;
    inset: 30% 12%;
    border: 3px solid rgb(255 255 255 / 85%);
    border-radius: 10px;
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 30%);
  }

  .message {
    min-height: 1.5rem;
    margin: 0.6rem 0;
  }

  .typed {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.6rem;
  }

  .typed label {
    flex: 1 1 14rem;
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  input {
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-weight: 400;
  }

  .small {
    font-size: 0.85rem;
  }
</style>
