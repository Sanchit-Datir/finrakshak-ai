import { Camera, ImagePlus, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Notice } from '../ui/States.js';

type CamState = 'starting' | 'live' | 'error';

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError')
    return 'Camera permission was denied. Allow camera access in your browser settings, or use "Choose photo" below.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No camera was found on this device. Use "Choose photo" or upload files instead.';
  if (!window.isSecureContext)
    return 'The camera needs a secure (HTTPS) connection. Use "Choose photo" or upload files instead.';
  return 'The camera could not be started. Use "Choose photo" or upload files instead.';
}

function stamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Captures document photos with the device camera; falls back to the native photo picker. */
export function CameraCapture({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (files: File[]) => void;
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CamState>('starting');
  const [error, setError] = useState('');
  const [count, setCount] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const stop = (): void => {
      streamRef.current?.getTracks().forEach((t) => {
        t.stop();
      });
      streamRef.current = null;
    };
    const start = async (): Promise<void> => {
      try {
        if (
          !('mediaDevices' in navigator) ||
          typeof navigator.mediaDevices.getUserMedia !== 'function'
        )
          throw new DOMException('unsupported', 'NotFoundError');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => {
            t.stop();
          });
          return;
        }
        streamRef.current = stream;
        if (videoRef.current !== null) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setState('live');
      } catch (e) {
        if (!cancelled) {
          setError(cameraError(e));
          setState('error');
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, attempt]);

  const capture = (): void => {
    const v = videoRef.current;
    if (v === null || v.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob === null) return;
        onCapture([new File([blob], `camera_${stamp()}.jpg`, { type: 'image/jpeg' })]);
        setCount((c) => c + 1);
      },
      'image/jpeg',
      0.92,
    );
  };

  const close = (): void => {
    setCount(0);
    setState('starting');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Scan with camera"
      description="Place the page on a flat, well-lit surface and fill the frame."
      wide
      footer={
        <>
          <input
            ref={fallbackRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length > 0) {
                onCapture(files);
                setCount((c) => c + files.length);
              }
              e.target.value = '';
            }}
          />
          <Button icon={ImagePlus} onClick={() => fallbackRef.current?.click()}>
            Choose photo
          </Button>
          <Button onClick={close}>{count > 0 ? 'Done' : 'Cancel'}</Button>
          <Button variant="primary" icon={Camera} onClick={capture} disabled={state !== 'live'}>
            {count > 0 ? 'Capture another page' : 'Capture page'}
          </Button>
        </>
      }
    >
      {state === 'error' ? (
        <div className="space-y-3">
          <Notice tone="warn" title="Camera unavailable">
            {error}
          </Notice>
          <Button
            size="sm"
            icon={RefreshCw}
            onClick={() => {
              setState('starting');
              setAttempt((a) => a + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-[4/3] w-full object-contain"
            aria-label="Camera preview"
          />
          {state === 'starting' && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
              Starting camera…
            </p>
          )}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-6 rounded-lg border-2 border-dashed border-white/50"
          />
        </div>
      )}
      {count > 0 && (
        <p className="text-ok mt-3 text-sm font-medium" role="status">
          {count} page(s) captured and added to the document list.
        </p>
      )}
    </Dialog>
  );
}
