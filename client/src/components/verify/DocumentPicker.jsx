// Boarding pass / e-ticket picker for Page 3: "Take a photo" or "Upload a file",
// then a preview with Replace / Remove.
//
// value:    the chosen File, or null
// onChange: called with a File (or null when removed)
// error:    message from the page (e.g. "Add your boarding pass")
// disabled: true while the document is being sent (it can't be changed then)
//
// The file stays in the browser until the page sends it for verification.
import { useEffect, useRef, useState } from 'react';
import CameraCapture from './CameraCapture';
import { AlertIcon, CameraIcon, CheckCircleIcon, UploadIcon, FileIcon } from '../ui/icons';
import { checkDocumentFile, documentType, formatFileSize, DOCUMENT_ACCEPT } from '../../utils/documents';

const canUseCamera = () => Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;

const choiceButton =
  'flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-6 text-center transition hover:border-brand-500 hover:bg-brand-50/60 focus-visible:ring-4 focus-visible:ring-brand-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:hover:border-brand-400 dark:hover:bg-brand-950/30 dark:focus-visible:ring-brand-900';

const fileAction =
  'rounded py-1 font-medium hover:underline focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none disabled:opacity-50';

export default function DocumentPicker({ value, onChange, error, disabled = false }) {
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
    ? 'border-rose-500 dark:border-rose-500'
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
        <div
          id="document-picker"
          tabIndex={-1}
          className="flex items-center gap-4 rounded-lg border border-emerald-300 bg-emerald-50/50 p-3 focus:outline-none dark:border-emerald-800 dark:bg-emerald-950/20"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Preview of your boarding pass" className="h-20 w-20 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-white text-brand-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-brand-300 dark:ring-slate-700">
              <FileIcon className="h-8 w-8" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircleIcon className="h-4 w-4" />
              Ready to verify
            </p>
            <p className="mt-0.5 truncate font-medium text-slate-900 dark:text-white">{value.name}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {documentType(value) === 'application/pdf' ? 'PDF' : 'Image'} · {formatFileSize(value.size)}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
              <button
                type="button"
                disabled={disabled}
                onClick={() => uploadRef.current?.click()}
                className={`${fileAction} text-brand-700 dark:text-brand-300`}
              >
                Replace
              </button>
              <button type="button" disabled={disabled} onClick={openCamera} className={`${fileAction} text-brand-700 dark:text-brand-300`}>
                Retake photo
              </button>
              <button
                type="button"
                onClick={() => {
                  showPreview(null);
                  onChange(null);
                  setFileError('');
                }}
                disabled={disabled}
                className={`${fileAction} text-rose-700 dark:text-rose-400`}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            id="document-picker"
            type="button"
            disabled={disabled}
            onClick={openCamera}
            aria-describedby={shownError ? 'document-error' : undefined}
            className={`${choiceButton} ${borderColour}`}
          >
            <CameraIcon className="h-7 w-7 text-brand-600 dark:text-brand-300" />
            <span className="font-semibold text-slate-900 dark:text-slate-100">Take a photo</span>
            <span className="text-xs text-slate-600 dark:text-slate-400">Of a printed or on-screen pass</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-describedby={shownError ? 'document-error' : undefined}
            onClick={() => {
              setFileError('');
              uploadRef.current?.click();
            }}
            className={`${choiceButton} ${borderColour}`}
          >
            <UploadIcon className="h-7 w-7 text-brand-600 dark:text-brand-300" />
            <span className="font-semibold text-slate-900 dark:text-slate-100">Upload a file</span>
            <span className="text-xs text-slate-600 dark:text-slate-400">JPG, PNG, WebP or PDF · max 3 MB</span>
          </button>
        </div>
      )}

      {shownError && (
        <p id="document-error" role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-rose-700 dark:text-rose-400">
          <AlertIcon className="mt-px h-4 w-4 shrink-0" />
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
