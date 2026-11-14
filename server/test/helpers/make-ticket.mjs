// Command-line wrapper around tickets.js for the mobile app's tests (Jest
// can't load sharp's native module): prints the requested test image as base64.
//   node make-ticket.mjs '{"kind":"ticket","lines":["..."],"format":"jpeg"}'
//   kinds: ticket (lines, format, barcodeText?), phonePhoto (lines), blank (colour, format), photo
import * as T from './tickets.js';

const opts = JSON.parse(process.argv[2] ?? '{}');
let bytes;
if (opts.kind === 'blank') bytes = await T.blankImage(opts.colour ?? '#000000', opts.format ?? 'jpeg');
else if (opts.kind === 'photo') bytes = await T.photoImage();
else if (opts.kind === 'phonePhoto') bytes = await T.phonePhotoOf(await T.ticketImage(opts.lines, { format: 'jpeg' }));
else bytes = await T.ticketImage(opts.lines, { format: opts.format ?? 'png', barcodeText: opts.barcodeText ?? null });
process.stdout.write(Buffer.from(bytes).toString('base64'));
