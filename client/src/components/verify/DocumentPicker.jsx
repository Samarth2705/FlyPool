// Boarding pass / e-ticket picker for Page 3: "Take a photo" or "Upload a file",
// then a preview with Replace / Remove.
//
// value:    the chosen File, or null
// onChange: called with a File (or null when removed)
// error:    message from the page (e.g. "Add your boarding pass")
//
// The file stays in the browser until the page sends it for verification.
import { useEffect, useRef, useState } from 'react';
import CameraCapture from './CameraCapture';
import { CameraIcon, UploadIcon, FileIcon } from '../ui/icons';
import { checkDocumentFile, documentType, formatFileSize, DOCUMENT_ACCEPT } from '../../utils/documents';

const canUseCamera = () => Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;

const choiceButton =
  'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition hover:border-sky-400 hover:bg-sky-50/60 focus-visible:ring-4 focus-visible:ring-sky-100 focus-visible:outline-none dark:hover:border-sky-500 dark:hover:bg-sky-950/30 dark:focus-visible:ring-sky-900';

export default function DocumentPicker({ value, onChange, error }) {
  const uploadRef = useRef(null);
  const cameraInputRef = useRef(null); // phone camera fallback
  const [cameraOpen, setCameraOpen] = useState(false);
  const [fileError, setFileError] = useState('');

  // Image preview: a temporary local URL, released when replaced or on leaving the page
  const previewRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  useEffect(() => () => previewRef.current && URL.revokeObjectURL(previewRef.current), []);

  function showPreview(file) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file && documentType(file) !== 'application/pdf' ? URL.createObjectURL(file) : null;
    setPreviewUrl(previewRef.current);
  }

  function acceptFile(file) {
    if (!file) return;
    const problem = checkDocumentFile(file);
    setFileError(problem ?? '');
    if (problem) return;
    showPreview(file);
    onChange(file);
  }

  function openCamera() {
    setFileError('');
    if (canUseCamera()) setCameraOpen(true);
    else cameraInputRef.current?.click(); // lets phones open their camera app
  }

  const shownError = fileError || error;
  const borderColour = shownError
    ? 'border-rose-300 dark:border-rose-800'
    : 'border-slate-300 dark:border-slate-700';

  return (
    <div>
      {/* Hidden inputs; the buttons below open them */}
      <input
        ref={uploadRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          acceptFile(e.target.files?.[0]);
          e.target.value = ''; // allow choosing the same file again
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          acceptFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {value ? (
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
          {previewUrl ? (
            <img src={previewUrl} alt="Preview of your boarding pass" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
              <FileIcon className="h-8 w-8" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-900 dark:text-white">{value.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {documentType(value) === 'application/pdf' ? 'PDF' : 'Image'} · {formatFileSize(value.size)}
            </p>
            <div className="mt-1.5 flex gap-4 text-sm font-medium">
              <button type="button" onClick={() => uploadRef.current?.click()} className="py-1 text-sky-700 hover:underline dark:text-sky-400">
                Replace
              </button>
              <button type="button" onClick={openCamera} className="py-1 text-sky-700 hover:underline dark:text-sky-400">
                Retake photo
              </button>
              <button
                type="button"
                onClick={() => {
                  showPreview(null);
                  onChange(null);
                  setFileError('');
                }}
                className="py-1 text-rose-600 hover:underline dark:text-rose-400"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={openCamera} className={`${choiceButton} ${borderColour}`}>
            <CameraIcon className="h-7 w-7 text-sky-600 dark:text-sky-400" />
            <span className="font-semibold text-slate-800 dark:text-slate-100">Take a photo</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Use your camera</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFileError('');
              uploadRef.current?.click();
            }}
            className={`${choiceButton} ${borderColour}`}
          >
            <UploadIcon className="h-7 w-7 text-sky-600 dark:text-sky-400" />
            <span className="font-semibold text-slate-800 dark:text-slate-100">Upload a file</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">JPG, PNG, WebP or PDF · max 3 MB</span>
          </button>
        </div>
      )}

      {shownError && (
        <p id="document-error" role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
          {shownError}
        </p>
      )}

      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => {
            setCameraOpen(false);
            acceptFile(file);
          }}
          onClose={() => setCameraOpen(false)}
          onUseUpload={() => {
            setCameraOpen(false);
            uploadRef.current?.click();
          }}
        />
      )}
    </div>
  );
}
