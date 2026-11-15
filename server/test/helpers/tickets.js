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

// ---- FlyPool DEMO boarding passes ------------------------------------------------
// Synthetic, clearly marked "DEMO - NOT VALID FOR TRAVEL", for testing the
// reading of a designed pass: two columns (pass + stub), a coloured header,
// small labels printed ABOVE their values, a diagonal watermark and a QR code.
// Not an airline layout; no PNR, seat, gate or terminal; the QR holds plain DEMO
// text, never an airline boarding-pass barcode (BCBP).
export const DEMO_PASS = { airline: 'IndiGo', flightNumber: '6E 9100', date: '2027-01-15', departure: '12:00 PM', from: ['DEL', 'Delhi'], to: ['BOM', 'Mumbai'] };

export function demoQrText(pass) {
  return [
    'FLYPOOL DEMO BOARDING PASS',
    'DEMO ONLY - NOT VALID FOR TRAVEL',
    `Demo ID: FLYPOOL-DEMO-TEST-${pass.name.replace(/\W+/g, '').toUpperCase()}`,
    `Passenger: ${pass.name}`,
    `Flight: ${pass.flightNumber}`,
    `From: ${pass.from[1]} (${pass.from[0]})`,
    `To: ${pass.to[1]} (${pass.to[0]})`,
    `Date: ${ticketDate(pass.date)}`,
  ].join('\n');
}

// A QR code (PNG) of any text
export async function qrCode(text, scale = 8) {
  const out = await writeBarcode(text, { format: 'QRCode', scale });
  if (out.error) throw new Error(out.error);
  return Buffer.from(await out.image.arrayBuffer());
}

// The DEMO pass as an image (PNG, or JPEG with format: 'jpeg'), 1840 x 760 px
export async function demoBoardingPassImage(details, { format = 'png' } = {}) {
  const p = { ...DEMO_PASS, ...details };
  const t = (x, y, size, text, { weight = 400, fill = '#0f1f3d', anchor = 'start' } = {}) =>
    `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(text)}</text>`;
  const label = (x, y, text) => t(x, y, 24, text.toUpperCase(), { weight: 700, fill: '#5b6b8a' });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1840" height="760">
    <rect width="1840" height="760" fill="#ffffff"/>
    <rect x="1320" y="0" width="520" height="760" fill="#eef4ff"/>
    <rect x="0" y="0" width="1840" height="128" fill="#0b3d91"/>
    <line x1="1320" y1="0" x2="1320" y2="760" stroke="#9fb5dc" stroke-width="4" stroke-dasharray="12 10"/>
    <text x="920" y="430" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="900" fill="#c62828" fill-opacity="0.17" text-anchor="middle" transform="rotate(-11 920 430)">DEMO - NOT VALID FOR TRAVEL</text>
    ${t(52, 84, 48, p.airline, { weight: 700, fill: '#ffffff' })}
    ${t(660, 80, 28, 'BOARDING PASS', { weight: 700, fill: '#ffffff', anchor: 'middle' })}
    <rect x="1130" y="44" width="130" height="48" rx="10" fill="#ffffff"/>${t(1195, 80, 26, 'DEMO', { weight: 800, fill: '#b3261e', anchor: 'middle' })}
    ${t(1580, 80, 28, 'DEMO PASS', { weight: 700, fill: '#ffffff', anchor: 'middle' })}
    ${label(52, 200, 'Passenger')}
    ${t(52, 262, 52, p.name.toUpperCase(), { weight: 700 })}
    ${t(52, 400, 88, p.from[0], { weight: 800, fill: '#0b3d91' })}${t(52, 450, 28, p.from[1], { fill: '#5b6b8a' })}
    ${t(720, 400, 88, p.to[0], { weight: 800, fill: '#0b3d91' })}${t(720, 450, 28, p.to[1], { fill: '#5b6b8a' })}
    ${t(52, 500, 24, `From ${p.from[1]} (${p.from[0]}) to ${p.to[1]} (${p.to[0]})`, { fill: '#5b6b8a' })}
    ${label(52, 590, 'Airline')}${label(370, 590, 'Flight')}${label(690, 590, 'Date')}${label(1010, 590, 'Departure')}
    ${t(52, 640, 36, p.airline)}${t(370, 640, 36, p.flightNumber)}${t(690, 640, 36, ticketDate(p.date))}${t(1010, 640, 36, p.departure)}
    ${t(52, 724, 21, 'DEMO document for testing. Not issued by any airline. Not valid for travel or check-in.', { fill: '#5b6b8a' })}
    ${t(1580, 200, 30, p.name.toUpperCase(), { weight: 700, anchor: 'middle' })}
    ${t(1580, 252, 28, `${p.flightNumber}  ${p.from[0]} - ${p.to[0]}`, { anchor: 'middle' })}
  </svg>`;
  const qr = await sharp(await qrCode(demoQrText(p))).resize(300, 300, { kernel: 'nearest' }).png().toBuffer();
  const image = sharp(await sharp(Buffer.from(svg)).png().toBuffer()).composite([{ input: qr, left: 1430, top: 300 }]);
  return format === 'jpeg' ? image.jpeg({ quality: 85 }).toBuffer() : image.png().toBuffer();
}

// The DEMO pass as a text PDF: one line per printed item, labels above values
export function demoBoardingPassPdf(details) {
  const p = { ...DEMO_PASS, ...details };
  return ticketPdf([
    'FlyPool DEMO boarding pass - not valid for travel',
    'DEMO - NOT VALID FOR TRAVEL',
    p.airline,
    'BOARDING PASS DEMO',
    'PASSENGER',
    p.name.toUpperCase(),
    p.from[0],
    p.from[1],
    p.to[0],
    p.to[1],
    `From ${p.from[1]} (${p.from[0]}) to ${p.to[1]} (${p.to[0]}) - ${p.from[0]} -> ${p.to[0]}`,
    'AIRLINE',
    p.airline,
    'FLIGHT',
    p.flightNumber,
    'DATE',
    ticketDate(p.date),
    'DEPARTURE',
    p.departure,
    'DEMO document for testing. Not issued by any airline. Not valid for travel or check-in.',
  ]);
}
