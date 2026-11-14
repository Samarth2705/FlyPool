// Test tickets for flight verification. The server READS the document (OCR,
// PDF text, boarding-pass barcodes) and checks it against the trip, so every
// test that verifies a flight uploads a ticket showing that passenger's name,
// flight and date - generated here, never a real ticket.
//   PDFs: built in plain JavaScript.
//   Images: rendered by the server's test helper (sharp) in a child process.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import nodeAxios from 'axios/dist/node/axios.cjs';
import api from '../src/api/client';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ticketDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

// The lines printed on the ticket (null leaves a line out)
export function ticketLines({ name = 'Asha Verma', airline = 'IndiGo', flightNumber = '6E 2134', date, to = 'BOM Mumbai T2' }) {
  return [
    `${airline} E-TICKET / BOARDING PASS`,
    name && `Passenger: ${name.toUpperCase()}`,
    flightNumber && `Flight: ${flightNumber}`,
    date && `Date: ${ticketDate(date)}`,
    'From: DEL Delhi',
    to && `To: ${to}`,
    'PNR: X7K2QZ   Seat: 14C   Gate: 22',
  ].filter(Boolean);
}

// A minimal valid PDF with the lines as real text
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

// An image made by server/test/helpers/make-ticket.mjs (kinds: ticket, phonePhoto, blank, photo)
const MAKE_TICKET = path.join(__dirname, '..', '..', 'server', 'test', 'helpers', 'make-ticket.mjs');
export function testImage(opts) {
  const out = execFileSync(process.execPath, [MAKE_TICKET, JSON.stringify(opts)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return Buffer.from(out, 'base64');
}
export const ticketImage = (details, format = 'png') => testImage({ kind: 'ticket', lines: ticketLines(details), format });

// The account's name, as the server has it (outside the app's own client)
const server = nodeAxios.create({ baseURL: api.defaults.baseURL, httpAgent: new (require('node:http').Agent)({ keepAlive: false }) });
async function accountName(token) {
  return (await server.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })).data.data.user.name;
}

// The document for POST /trips/:id/verification: a PDF e-ticket matching the trip
export async function ticketFor(token, trip, { airline = 'IndiGo', flightNumber = '6E 2134' } = {}) {
  const name = await accountName(token);
  const pdf = ticketPdf(ticketLines({ name, airline, flightNumber, date: trip.travelDate }));
  return { mimeType: 'application/pdf', dataBase64: pdf.toString('base64') };
}
