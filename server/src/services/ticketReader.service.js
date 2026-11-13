// Reads an uploaded boarding pass / e-ticket: is it a readable document, and
// what does it say? Everything happens in memory - the file and the text read
// from it are never written to disk, the database or the logs.
//
//   Images (JPG/PNG/WebP): fully decoded (a corrupted or truncated file is
//     refused), too-small and blank images (all black, all white, one colour)
//     are reported as unreadable. Then boarding-pass barcodes (PDF417, Aztec,
//     QR, Data Matrix) are decoded and the text is read with OCR.
//   PDFs: opened and their text extracted. Scanned PDFs with no text layer
//     are reported as unreadable (upload a photo/screenshot instead).
//
// Free, local libraries only: sharp (images), zxing-wasm (barcodes),
// tesseract.js (OCR, English model bundled - no downloads) and unpdf (PDF).
// Reading text does NOT prove a ticket is genuine; see flightVerification.service.js.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { extractText, getDocumentProxy } from 'unpdf';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

const require = createRequire(import.meta.url);

// Data files the libraries load by path at runtime. They are written as
// new URL('<relative path>', import.meta.url) because that is the form
// Vercel's file tracing (@vercel/nft) follows: it deploys these files with the
// function - otherwise OCR has no language data on the server. (Both packages
// are direct dependencies, so npm puts them in server/node_modules; the
// require.resolve fallback covers any other layout.)
function dataFile(url, packagePath) {
  const file = fileURLToPath(url);
  return fs.existsSync(file) ? file : require.resolve(packagePath);
}
const ENG_TRAINEDDATA = dataFile(
  new URL('../../node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', import.meta.url),
  '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
);
const ZXING_READER_WASM = dataFile(
  new URL('../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm', import.meta.url),
  'zxing-wasm/reader/zxing_reader.wasm',
);

// The barcode engine comes from the local file. (By default zxing-wasm
// downloads it from the jsDelivr CDN on first use.) Read on first use, so a
// problem only skips barcodes - the printed text is still read.
let barcodeEngineReady = false;
function prepareBarcodeEngine() {
  if (barcodeEngineReady) return;
  prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(ZXING_READER_WASM) } });
  barcodeEngineReady = true;
}

const MIN_IMAGE_SIDE = 200; // px: smaller can't hold a readable ticket
const MAX_IMAGE_PIXELS = 40_000_000; // refuses "decompression bombs"
const BLANK_STDEV = 6; // brightness spread (0-255) below this = blank / one colour
const OCR_WIDTH = 1600; // px: images are scaled to this width for OCR (wider: much slower on photos, no better on tickets)
const QUICK_OCR_WIDTH = 800; // px: first, cheap pass - is there readable text at all?
const MIN_QUICK_CONFIDENCE = 40; // documents score 80-95 here, photos with no text about 15-20
const DARK_MEAN = 110; // average brightness below this = light text on dark (dark mode): inverted for OCR
const MAX_PDF_PAGES = 10;
const MIN_TEXT_CHARS = 20; // letters/digits needed to count as "has text"

sharp.cache(false); // never keep uploaded images in sharp's memory cache

const invalid = (message) => new AppError(400, 'INVALID_DOCUMENT', message, [{ field: 'document', message }]);

// ---- timings: one log line per document - sizes and milliseconds only, never
// the document or any text read from it (operators need to see where time goes)
const logTimings = !env.isTest;
const since = (start) => Math.round(performance.now() - start);

// ---- OCR worker: started on first use, shared, stopped when idle -----------
let workerPromise = null;
let idleTimer = null;
const IDLE_MS = 60_000;

function ocrWorker(trace) {
  if (!workerPromise) {
    const started = performance.now();
    if (trace) trace.workerStart = 'starting';
    workerPromise = createWorker('eng', 1, {
      langPath: path.dirname(ENG_TRAINEDDATA),
      gzip: true,
      cacheMethod: 'none', // nothing written to disk
    })
      .then(async (worker) => {
        // Don't re-read every unclear line inverted: on photos that doubles the time.
        // Dark-mode documents are inverted before OCR instead (readImage).
        await worker.setParameters({ tessedit_do_invert: '0' });
        if (trace) trace.workerStart = since(started);
        return worker;
      })
      .catch((err) => {
        workerPromise = null;
        throw err;
      });
  }
  return workerPromise;
}

async function ocr(png, trace, stage) {
  clearTimeout(idleTimer);
  const started = performance.now();
  if (trace) trace.stage = stage;
  const worker = await ocrWorker(trace);
  try {
    const { data } = await worker.recognize(png);
    if (trace) trace[stage] = since(started);
    return { text: data.text ?? '', confidence: Math.round(data.confidence ?? 0) };
  } finally {
    idleTimer = setTimeout(stopTicketReader, IDLE_MS);
    idleTimer.unref();
  }
}

// Stops the OCR worker (tests and server shutdown)
export async function stopTicketReader() {
  clearTimeout(idleTimer);
  const pending = workerPromise;
  workerPromise = null;
  if (pending) await (await pending.catch(() => null))?.terminate();
}

// ---- images --------------------------------------------------------------------
const SHARP_FORMAT = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };

async function readImage(bytes, mimeType, trace = {}) {
  const input = () => sharp(bytes, { failOn: 'truncated', limitInputPixels: MAX_IMAGE_PIXELS });
  let meta;
  let grey;
  let started = performance.now();
  trace.stage = 'decode';
  try {
    meta = await input().metadata();
    if (meta.format !== SHARP_FORMAT[mimeType]) throw new Error('format mismatch');
    // Full decode (catches corrupted / truncated data), upright, greyscale
    grey = await input().rotate().greyscale().resize({ width: OCR_WIDTH, withoutEnlargement: true }).png().toBuffer();
  } catch {
    throw invalid('This image is damaged or not a real JPG, PNG or WebP file. Please choose it again.');
  }

  const width = meta.autoOrient?.width ?? meta.width;
  const height = meta.autoOrient?.height ?? meta.height;
  trace.size = `${width}x${height}`;
  trace.decode = since(started);
  if (Math.min(width, height) < MIN_IMAGE_SIDE) return { readable: false, problem: 'too_small' };

  const { channels } = await sharp(grey).stats();
  if (channels[0].stdev < BLANK_STDEV) return { readable: false, problem: 'blank' };
  const dark = channels[0].mean < DARK_MEAN;

  // Boarding-pass barcodes first (structured data), then the printed text
  let barcodes = [];
  started = performance.now();
  trace.stage = 'barcode';
  try {
    prepareBarcodeEngine();
    const results = await readBarcodes(new Uint8Array(grey), {
      formats: ['PDF417', 'Aztec', 'QRCode', 'DataMatrix'],
      tryHarder: true,
      maxNumberOfSymbols: 4,
    });
    barcodes = results.filter((r) => r.isValid && r.text).map((r) => r.text);
  } catch {
    // no barcode reader result - the text alone is used
  }
  trace.barcode = since(started);
  trace.barcodes = barcodes.length;

  // For OCR: scaled, dark mode inverted, camera grain removed (a 3px median
  // keeps text strokes but makes noisy photos about twice as fast), contrast stretched
  const prepare = (width) => {
    let image = sharp(grey).resize({ width, withoutEnlargement: width < OCR_WIDTH });
    if (dark) image = image.negate({ alpha: false });
    return image.median(3).normalise().png().toBuffer();
  };
  // A quick pass on a small copy first: an image with no readable text (a
  // photo) stops here instead of spending ~10 s of OCR on its texture.
  const quick = await ocr(await prepare(QUICK_OCR_WIDTH), trace, 'ocrQuick');
  trace.quickConfidence = quick.confidence;
  const { text, confidence } = quick.confidence >= MIN_QUICK_CONFIDENCE ? await ocr(await prepare(OCR_WIDTH), trace, 'ocrFull') : quick;
  return { readable: true, source: barcodes.length ? 'barcode+ocr' : 'ocr', text, barcodes, confidence };
}

// ---- PDFs ------------------------------------------------------------------------
async function readPdf(bytes) {
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0, isEvalSupported: false, stopAtErrors: true });
  } catch (err) {
    if (err?.name === 'PasswordException') return { readable: false, problem: 'pdf_protected' };
    throw invalid('This PDF is damaged and can’t be opened. Please choose it again.');
  }
  try {
    if (doc.numPages > MAX_PDF_PAGES) return { readable: false, problem: 'pdf_too_long' };
    const { text } = await extractText(doc, { mergePages: true });
    if ((text.match(/[A-Za-z0-9]/g) ?? []).length < MIN_TEXT_CHARS) return { readable: false, problem: 'no_text' };
    return { readable: true, source: 'pdf_text', text, barcodes: [], confidence: null };
  } catch {
    throw invalid('This PDF is damaged and can’t be read. Please choose it again.');
  } finally {
    await Promise.resolve(doc.destroy?.()).catch(() => {});
  }
}

// { kind: 'image'|'pdf', mimeType, bytes } ->
//   { readable: false, problem } | { readable: true, source, text, barcodes, confidence }
// Throws 400 INVALID_DOCUMENT for corrupted files, 503 if reading takes too long.
export async function readTicketDocument({ kind, mimeType, bytes }) {
  const trace = { kind, kb: Math.round(bytes.length / 1024), stage: 'start' };
  const started = performance.now();
  let outcome = 'error';
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      outcome = `timeout during ${trace.stage}`;
      // Stop the OCR still working on this image, so the next upload isn't stuck behind it
      stopTicketReader().catch(() => {});
      reject(new AppError(503, 'DOCUMENT_READ_TIMEOUT', 'Reading your document took too long. Please try again, or upload a clearer, smaller image.'));
    }, env.documentReadTimeoutMs);
  });
  try {
    const result = await Promise.race([kind === 'pdf' ? readPdf(bytes) : readImage(bytes, mimeType, trace), timeout]);
    outcome = result.readable ? `read (${result.source})` : `unreadable (${result.problem})`;
    return result;
  } finally {
    clearTimeout(timer);
    if (logTimings) {
      const { stage, ...facts } = trace;
      const parts = Object.entries(facts).map(([k, v]) => `${k}=${typeof v === 'number' && !['kb', 'barcodes', 'quickConfidence'].includes(k) ? `${v}ms` : v}`);
      console.log(`[ticket-reader] ${outcome} in ${since(started)}ms: ${parts.join(' ')}`);
    }
  }
}
