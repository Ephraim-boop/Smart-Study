import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertIcon, CameraIcon, XIcon } from '../components/icons';

/**
 * In-page camera capture using getUserMedia. The student sees a live preview
 * and snaps a still, which is turned into a JPEG File and handed to onCapture.
 *
 * Requires a secure context (https or localhost). If the camera is denied or
 * unavailable, an error is shown so the parent can fall back to a file picker.
 */
export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not supported in this browser. Use "Choose a photo" instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setReady(true);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Camera permission was denied. Allow camera access or use "Choose a photo".');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('No camera was found on this device. Use "Choose a photo" instead.');
      } else {
        setError('Could not start the camera. Use "Choose a photo" instead.');
      }
    }
  }, [facing]);

  // (Re)start the stream when facing mode changes; stop on unmount.
  useEffect(() => {
    void start();
    return stop;
  }, [start, stop]);

  function handleClose() {
    stop();
    onClose();
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Could not capture the image.');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Capture failed. Please try again.');
          return;
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const file = new File([blob], `camera-${stamp}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
      },
      'image/jpeg',
      0.92,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-black/70 p-2 sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="flex items-center gap-2 font-semibold text-brand-navy">
            <CameraIcon width={18} height={18} className="text-blue-600" /> Take a picture
          </h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close camera"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <XIcon width={18} height={18} />
          </button>
        </div>

        <div className="relative aspect-[4/3] bg-slate-900">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-200">
              <AlertIcon width={28} height={28} className="text-amber-400" />
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-3 sm:justify-between sm:gap-3 sm:px-4 sm:py-4">
          <button
            type="button"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Flip camera
          </button>
          <button
            type="button"
            onClick={capture}
            disabled={!ready}
            className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 sm:px-6"
          >
            Capture
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
