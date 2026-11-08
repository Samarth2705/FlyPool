// The boarding pass / e-ticket for flight verification: choosing it (file or
// camera), getting it within the server's rules, and reading it for upload.
//
// Server rules (server/src/services/flightVerification.service.js):
//   JSON { mimeType, dataBase64 }, mimeType one of image/jpeg, image/png,
//   image/webp, application/pdf, at most 3 MB once decoded, and the bytes
//   must really be that type (checked from the file's first bytes).
//
// What happens here:
//   PDF            used as is - never re-encoded. Over 3 MB: refused.
//   JPG/PNG/WebP   used as is when small. Large ones (over 1.5 MB or longer
//                  than 2048 px) are scaled down and saved as JPEG, at lower
//                  quality if needed, until they fit. Still too big: refused.
//   HEIC/HEIF      (iPhone photos) always converted to JPEG the same way.
//   anything else  refused.
// Nothing oversized is ever sent "hoping for the best".
//
// Privacy: files are read only at the moment of sending (readTicketBase64),
// and the base64 text lives only in that request. Copies this app made (the
// picker's cache copy, camera photos, converted images) are deleted by
// discardTicket. Files outside the app's cache are never touched.
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, documentType } from '../shared/documents';

export { MAX_DOCUMENT_BYTES };

const HEIC_TYPES = ['image/heic', 'image/heif'];
const PICKER_TYPES = [...ALLOWED_DOCUMENT_TYPES, ...HEIC_TYPES];

// Images bigger than this are made smaller before upload (saves mobile data;
// a phone photo is usually 2-6 MB and 4000 px wide)
const COMPRESS_ABOVE_BYTES = 1.5 * 1024 * 1024;
const MAX_SIDE_PX = 2048;
// Tried in order until the image fits in MAX_DOCUMENT_BYTES
const COMPRESSION_STEPS = [
  { side: 2048, quality: 0.8 },
  { side: 1600, quality: 0.7 },
  { side: 1280, quality: 0.6 },
];

// A problem the passenger can fix (shown under the document field)
export class TicketError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

const MESSAGES = {
  type: 'Please choose a JPG, PNG, WebP or PDF file.',
  empty: 'That file is empty. Please choose another one.',
  pdfTooLarge: 'That PDF is larger than 3 MB. Please choose a smaller file, or take a photo of your ticket instead.',
  imageTooLarge:
    'This image is still larger than 3 MB after making it smaller. Please take a new photo or choose a smaller file.',
  unreadable: 'The file could not be read. Please choose it again.',
};

function extensionOf(name = '') {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function isHeic({ mimeType, name }) {
  return HEIC_TYPES.includes(mimeType?.toLowerCase()) || ['heic', 'heif'].includes(extensionOf(name));
}

function withExtension(name, extension) {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base || 'ticket'}.${extension}`;
}

function fileSize(uri) {
  try {
    const file = new File(uri);
    return file.exists ? file.size : null;
  } catch {
    return null;
  }
}

// Only copies this app made live in its cache directory
function isAppCacheFile(uri) {
  const cache = Paths.cache?.uri;
  return Boolean(uri && cache && uri.startsWith(cache));
}

// Deletes the app's own temporary copy of a document (never throws)
export function discardTicket(ticket) {
  const uris = new Set([ticket?.uri, ticket?.originalUri].filter(Boolean));
  for (const uri of uris) {
    if (!isAppCacheFile(uri)) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Already gone - the system also clears the cache on its own
    }
  }
}

// Scale down + re-encode as JPEG until it fits. Returns { uri, size, width, height }.
async function compressImage(uri) {
  let previous = null;
  for (const step of COMPRESSION_STEPS) {
    // Decoding with a size limit keeps a 12-megapixel photo out of memory
    const image = await ImageManipulator.manipulate(uri, { maxWidth: step.side, maxHeight: step.side }).renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: step.quality });
    if (previous) discardTicket({ uri: previous });
    const size = fileSize(saved.uri);
    if (size !== null && size > 0 && size <= MAX_DOCUMENT_BYTES) {
      return { uri: saved.uri, size, width: saved.width, height: saved.height };
    }
    previous = saved.uri;
  }
  if (previous) discardTicket({ uri: previous });
  throw new TicketError('TOO_LARGE', MESSAGES.imageTooLarge);
}

// A picked / captured file -> a ticket ready to send, or a TicketError.
// asset: { uri, name, mimeType?, size?, width?, height? }
// Returns { uri, name, mimeType, size, kind: 'pdf' | 'image', width?, height?,
//           originalUri?, compressed: boolean }
export async function prepareTicket(asset, { source }) {
  const name = asset.name || (source === 'camera' ? 'Boarding pass photo.jpg' : 'Ticket');
  const heic = isHeic({ mimeType: asset.mimeType, name });
  const mimeType = heic ? null : documentType({ type: asset.mimeType ?? '', name });
  const discardOriginal = () => discardTicket({ uri: asset.uri });

  if (!heic && !mimeType) {
    discardOriginal();
    throw new TicketError('TYPE', MESSAGES.type);
  }

  const size = asset.size ?? fileSize(asset.uri);
  if (size === null) {
    discardOriginal();
    throw new TicketError('UNREADABLE', MESSAGES.unreadable);
  }
  if (size === 0) {
    discardOriginal();
    throw new TicketError('EMPTY', MESSAGES.empty);
  }

  if (mimeType === 'application/pdf') {
    if (size > MAX_DOCUMENT_BYTES) {
      discardOriginal();
      throw new TicketError('TOO_LARGE', MESSAGES.pdfTooLarge);
    }
    return { uri: asset.uri, name, mimeType, size, kind: 'pdf', compressed: false };
  }

  const longestSide = Math.max(asset.width ?? 0, asset.height ?? 0);
  const needsWork = heic || size > COMPRESS_ABOVE_BYTES || longestSide > MAX_SIDE_PX;
  if (!needsWork) {
    return { uri: asset.uri, name, mimeType, size, kind: 'image', width: asset.width, height: asset.height, compressed: false };
  }

  let result;
  try {
    result = await compressImage(asset.uri);
  } catch (error) {
    discardOriginal();
    if (error instanceof TicketError) throw error;
    throw new TicketError('UNREADABLE', heic ? 'This photo format couldn’t be converted. Please choose a JPG or PNG.' : MESSAGES.unreadable);
  }
  discardOriginal(); // only the smaller copy is kept
  return {
    uri: result.uri,
    name: withExtension(name, 'jpg'),
    mimeType: 'image/jpeg',
    size: result.size,
    kind: 'image',
    width: result.width,
    height: result.height,
    compressed: true,
    originalSize: size,
  };
}

// "Upload ticket": the system file picker (PDF or image). null if cancelled.
export async function pickTicketFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: PICKER_TYPES,
    multiple: false,
    copyToCacheDirectory: true, // a readable file:// copy, deleted by discardTicket
  });
  if (result.canceled || !result.assets?.length) return null;
  const [asset] = result.assets;
  return prepareTicket({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size }, { source: 'file' });
}

// "Take a photo": the camera, after asking for permission. null if cancelled.
// A refused permission throws TicketError CAMERA_DENIED (canAskAgain: false
// means the passenger has to allow it in Settings).
export async function takeTicketPhoto() {
  let permission = await ImagePicker.getCameraPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await ImagePicker.requestCameraPermissionsAsync();
  }
  if (!permission.granted) {
    throw new TicketError(
      'CAMERA_DENIED',
      permission.canAskAgain
        ? 'FlyPool needs the camera to photograph your ticket. You can also upload a file instead.'
        : 'Camera access is turned off for FlyPool. Allow it in Settings, or upload a file instead.',
      { canAskAgain: permission.canAskAgain },
    );
  }

  const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: false, exif: false });
  if (result.canceled || !result.assets?.length) return null;
  const [asset] = result.assets;
  return prepareTicket(
    {
      uri: asset.uri,
      name: asset.fileName || 'Boarding pass photo.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize,
      width: asset.width,
      height: asset.height,
    },
    { source: 'camera' },
  );
}

// Reads the ticket for upload: { mimeType, dataBase64 }. Call only when
// sending, and don't keep the result. Checks the size once more.
export async function readTicketBase64(ticket) {
  let dataBase64;
  try {
    // (line breaks removed: some native encoders wrap lines, the server's
    // base64 check doesn't allow them)
    dataBase64 = (await new File(ticket.uri).base64()).replace(/\s+/g, '');
  } catch {
    throw new TicketError('UNREADABLE', MESSAGES.unreadable);
  }
  const padding = dataBase64.endsWith('==') ? 2 : dataBase64.endsWith('=') ? 1 : 0;
  const bytes = (dataBase64.length * 3) / 4 - padding;
  if (bytes === 0) throw new TicketError('EMPTY', MESSAGES.empty);
  if (bytes > MAX_DOCUMENT_BYTES) {
    throw new TicketError('TOO_LARGE', ticket.kind === 'pdf' ? MESSAGES.pdfTooLarge : MESSAGES.imageTooLarge);
  }
  return { mimeType: ticket.mimeType, dataBase64 };
}
