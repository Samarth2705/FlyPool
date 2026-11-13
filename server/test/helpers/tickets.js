// Test documents for flight verification, generated on the fly so each test
// can make a ticket that matches (or deliberately contradicts) its own trip.
// Nothing here is a real ticket: the details are whatever the test passes in.
import sharp from 'sharp';
import { writeBarcode } from 'zxing-wasm/full';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-12-20" -> "20 Dec 2026"
export const ticketDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

// The lines printed on a typical e-ticket. Pass null to leave a line out.
export function ticketLines({ name = 'Test Passenger', airline = 'IndiGo', flightNumber = '6E 2134', date = '2026-12-20', from = 'DEL Delhi', to = 'BOM Mumbai T2' } = {}) {
  return [
    `${airline} E-TICKET / BOARDING PASS`,
    name && `Passenger: ${name}`,
    flightNumber && `Flight: ${flightNumber}`,
    date && `Date: ${ticketDate(date)}`,
    from && `From: ${from}`,
    to && `To: ${to}`,
    'PNR: X7K2QZ   Seat: 14C   Gate: 22',
  ].filter(Boolean);
}

// A minimal, valid one-page PDF with the lines as real text (Helvetica)
export function ticketPdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = `BT /F1 14 Tf 50 780 Td 20 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const escapeXml = (s) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The lines rendered as an image (black text on white, like a screenshot)
export async function ticketImage(lines, { format = 'png', width = 1200, barcodeText = null } = {}) {
  const height = 120 + lines.length * 64 + (barcodeText ? 320 : 0);
  const text = lines
    .map((l, i) => `<text x="40" y="${90 + i * 64}" font-family="Arial, Helvetica, sans-serif" font-size="36">${escapeXml(l)}</text>`)
    .join('');
  let image = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/>${text}</svg>`));
  if (barcodeText) {
    const code = await boardingPassBarcode(barcodeText);
    image = sharp(await image.png().toBuffer()).composite([{ input: code, left: 40, top: height - 300 }]);
  }
  return format === 'jpeg' ? image.jpeg({ quality: 90 }).toBuffer() : image.png().toBuffer();
}

// An IATA BCBP string (Resolution 792, one leg)
export function bcbp({ surname = 'PASSENGER', given = 'TEST', pnr = 'X7K2QZ', from = 'DEL', to = 'BOM', carrier = '6E', flight = '2134', julian = 354 }) {
  const name = `${surname}/${given}`.padEnd(20).slice(0, 20);
  return `M1${name}E${pnr.padEnd(7)}${from}${to}${carrier.padEnd(3)}${flight.padStart(4, '0').padEnd(5)}${String(julian).padStart(3, '0')}Y014C0012 100`;
}

// A PDF417 boarding-pass barcode as a PNG
export async function boardingPassBarcode(text) {
  const out = await writeBarcode(text, { format: 'PDF417', scale: 3 });
  if (out.error) throw new Error(out.error);
  const png = Buffer.from(await out.image.arrayBuffer());
  return sharp(png).resize({ width: 900, height: 260, fit: 'inside' }).png().toBuffer();
}

// One flat colour, e.g. a completely black or white "photo"
export const blankImage = (background, format = 'jpeg', size = 1200) =>
  sharp({ create: { width: size, height: Math.round(size * 0.75), channels: 3, background } })[format]().toBuffer();

// An unrelated "photograph": sky gradient, sun, hills and sensor noise - no text
export async function photoImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a90d9"/><stop offset="1" stop-color="#cfe6ff"/></linearGradient></defs>
    <rect width="1200" height="900" fill="url(#sky)"/>
    <circle cx="930" cy="200" r="90" fill="#ffd65a"/>
    <path d="M0 620 Q 250 470 520 600 T 1200 560 V 900 H 0 Z" fill="#3f8f3a"/>
    <path d="M0 720 Q 300 640 640 740 T 1200 700 V 900 H 0 Z" fill="#2f6e2c"/>
  </svg>`;
  const noise = await sharp({ create: { width: 1200, height: 900, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 30 } } })
    .png()
    .toBuffer();
  return sharp(Buffer.from(svg)).composite([{ input: noise, blend: 'soft-light' }]).jpeg({ quality: 88 }).toBuffer();
}

// A phone camera photo of a printed ticket: the page smaller in a large frame,
// on a brown table, slightly blurred, greyish paper, sensor noise
export async function phonePhotoOf(ticket) {
  const page = await sharp(ticket).resize(1800).blur(1).linear(0.8, 20).toBuffer();
  const noise = await sharp({ create: { width: 3000, height: 2250, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 22 } } })
    .png()
    .toBuffer();
  return sharp({ create: { width: 3000, height: 2250, channels: 3, background: '#6b5a48' } })
    .composite([{ input: page, left: 600, top: 700 }, { input: noise, blend: 'soft-light' }])
    .jpeg({ quality: 82 })
    .toBuffer();
}

// Light text on a dark background (an airline app in dark mode)
export const darkModeOf = (ticket) => sharp(ticket).negate({ alpha: false }).png().toBuffer();

// As the apps send it
export const asDocument = (bytes, mimeType) => ({ mimeType, dataBase64: Buffer.from(bytes).toString('base64') });
