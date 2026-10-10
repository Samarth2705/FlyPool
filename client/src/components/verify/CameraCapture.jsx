// Full-screen dialog that shows the device camera and takes one photo.
// The camera is only switched on while this dialog is open (the browser asks
// for permission the first time), and is switched off again when it closes.
//
// Usage: {open && <CameraCapture onCapture={(file) => ...} onClose={...} onUseUpload={...} />}
import { useEffect, useRef, useState } from 'react';
import { CameraIcon } from '../ui/icons';

function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. You can allow it in your browser settings, or upload a photo or PDF instead.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. Please upload a photo or PDF instead.';
    case 'NotReadableError':
      return 'The camera is being used by another app. Close it and try again, or upload a file instead.';
    default:
      return "The camera couldn't be started. Please upload a photo or PDF instead.";
  }
}

export default function CameraCapture({ onCapture, onClose, onUseUpload }) {
  const videoRef = useRef(null);
  const captureRef = useRef(null);
  const [status, setStatus] = useState('starting'); // starting | live | error
  const [error, setError] = useState('');

  // Start the camera (back camera on phones) and stop it when the dialog closes
  useEffect(() => {
    let stream = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        videoRef.current.srcObject = s;
        setStatus('live');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(cameraErrorMessage(err));
        setStatus('error');
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Esc closes the dialog
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (status === 'live') captureRef.current?.focus();
  }, [status]);

  function takePhoto() {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => blob && onCapture(new File([blob], 'boarding-pass-photo.jpg', { type: 'image/jpeg' })),
      'image/jpeg',
      0.9,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-title"
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl dark:bg-slate-900"
      >
        <h2 id="camera-title" className="font-semibold text-slate-900 dark:text-white">
          Take a photo of your boarding pass
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Fit the whole pass or e-ticket in the frame, in good light.
        </p>

        <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-xl bg-slate-900">
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
          {status === 'starting' && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">Starting camera…</p>
          )}
          {status === 'error' && (
            <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-200">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-sky-100 focus-visible:outline-none dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-sky-900"
          >
            Cancel
          </button>
          {status === 'error' ? (
            <button
              type="button"
              onClick={onUseUpload}
              className="rounded-xl bg-sky-600 px-4 py-2.5 font-semibold text-white hover:bg-sky-700 focus-visible:ring-4 focus-visible:ring-sky-300 focus-visible:outline-none"
            >
              Upload a file instead
            </button>
          ) : (
            <button
              ref={captureRef}
              type="button"
              onClick={takePhoto}
              disabled={status !== 'live'}
              className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 font-semibold text-white hover:bg-sky-700 focus-visible:ring-4 focus-visible:ring-sky-300 focus-visible:outline-none disabled:opacity-50"
            >
              <CameraIcon className="h-5 w-5" />
              Take photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
