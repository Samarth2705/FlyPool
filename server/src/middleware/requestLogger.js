// One log line per API request: "POST /api/trips 201 84ms".
// Only method, path (without the query string), status and time - never
// bodies, cookies or headers, so no passwords, tokens or documents are logged.
export function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const path = req.originalUrl.split('?')[0];
    console.log(`${req.method} ${path} ${res.statusCode} ${Math.round(ms)}ms`);
  });
  next();
}
