/**
 * The share loop: capture ~10 s of the living movement as a WebM.
 *
 * The SVG mutates every frame, so each captured frame re-serialises the
 * live DOM, rasterises it through an <img>, and paints it onto a square
 * canvas whose captureStream() feeds a MediaRecorder. The song (or mic)
 * audio track is muxed in when available. Zero backend — the blob goes
 * straight to a download.
 *
 * Serialise→decode costs ~10–30 ms per frame, so the recording runs at
 * whatever rate the machine sustains; captureStream timestamps frames as
 * they arrive, which keeps the result smooth even if capture dips below
 * the display's frame rate.
 */
export interface RecordOptions {
  seconds?: number;
  size?: number;
  audioTrack?: MediaStreamTrack | null;
  onProgress?: (secondsLeft: number) => void;
}

function pickMime(): string {
  for (const m of [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export async function recordLoop(svg: SVGSVGElement, opts: RecordOptions = {}): Promise<Blob> {
  const seconds = opts.seconds ?? 10;
  const size = opts.size ?? 1080;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(30);
  if (opts.audioTrack) stream.addTrack(opts.audioTrack);

  const mime = pickMime();
  const recorder = new MediaRecorder(stream, {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const serializer = new XMLSerializer();
  async function paintFrame(): Promise<void> {
    // Force explicit raster dimensions or the SVG decodes at its default
    // intrinsic size and scales up blurry.
    const str = serializer
      .serializeToString(svg)
      .replace('<svg ', `<svg width="${size}" height="${size}" `);
    const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('svg rasterise failed'));
        img.src = url;
      });
      ctx.fillStyle = '#060608';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  recorder.start();
  const t0 = performance.now();
  try {
    let elapsed = 0;
    while (elapsed < seconds) {
      await paintFrame();
      elapsed = (performance.now() - t0) / 1000;
      opts.onProgress?.(Math.max(0, seconds - elapsed));
      // Yield so the movement's own rAF keeps animating between captures.
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    recorder.stop();
  }
  await stopped;
  return new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
