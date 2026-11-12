import { encodeWav, MAX_SECONDS } from '@/core/speech/pronunciation';

/**
 * Enregistrement du micro (webm/opus, mp4…) → WAV 16 kHz mono 16 bits, le format de l'évaluation de prononciation.
 * null s'il est trop long ou illisible.
 */
export async function toWav16k(blob: Blob): Promise<ArrayBuffer | null> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx || typeof OfflineAudioContext === 'undefined') return null;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration > MAX_SECONDS || decoded.duration < 0.3) return null;
    const rate = 16_000;
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), rate);
  } catch {
    return null;
  } finally {
    void ctx.close().catch(() => undefined);
  }
}
