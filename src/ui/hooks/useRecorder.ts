import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'unsupported' | 'denied';

/**
 * Enregistrement au micro (MediaRecorder) pour le shadowing : l'enregistrement reste en mémoire, le temps de le
 * réécouter ; il n'est ni envoyé ni gardé (libéré au suivant et en quittant la page).
 */
export function useRecorder() {
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  const [state, setState] = useState<RecorderState>(supported ? 'idle' : 'unsupported');
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const current = useRef<string | null>(null);

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const clear = useCallback(() => {
    if (current.current) URL.revokeObjectURL(current.current);
    current.current = null;
    setUrl(null);
    setBlob(null);
  }, []);

  const start = useCallback(async () => {
    if (!supported || recorder.current) return;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState('denied');
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream.current);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      release();
      recorder.current = null;
      if (current.current) URL.revokeObjectURL(current.current);
      const recorded = new Blob(chunks, { type: r.mimeType || 'audio/webm' });
      current.current = URL.createObjectURL(recorded);
      setBlob(recorded);
      setUrl(current.current);
      setState('idle');
    };
    recorder.current = r;
    r.start();
    setState('recording');
  }, [supported, release]);

  const stop = useCallback(() => recorder.current?.state === 'recording' && recorder.current.stop(), []);

  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      release();
      if (current.current) URL.revokeObjectURL(current.current);
    },
    [release],
  );

  return { state, url, blob, start, stop, clear };
}
