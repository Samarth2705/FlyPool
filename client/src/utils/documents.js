// Boarding pass / e-ticket file checks (Page 3). The server checks the
// real file contents again; these give instant feedback.

export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024; // 3 MB, same as the server

const TYPES_BY_EXTENSION = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
export const ALLOWED_DOCUMENT_TYPES = [...new Set(Object.values(TYPES_BY_EXTENSION))];
export const DOCUMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';

// The file's type, falling back to its extension (some phones leave it empty)
export function documentType(file) {
  if (ALLOWED_DOCUMENT_TYPES.includes(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return TYPES_BY_EXTENSION[extension] ?? null;
}

// Returns an error message, or null when the file is fine
export function checkDocumentFile(file) {
  if (!documentType(file)) return 'Please choose a JPG, PNG, WebP or PDF file.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_DOCUMENT_BYTES) return 'That file is larger than 3 MB. Please choose a smaller file.';
  return null;
}

// "248 KB" / "1.4 MB"
export function formatFileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Reads a file as base64 (without the "data:...;base64," prefix) for upload
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('The file could not be read. Please choose it again.'));
    reader.readAsDataURL(file);
  });
}
