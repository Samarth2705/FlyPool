// Which MongoDB database a connection string points at, and which database a
// Vercel deployment is allowed to use. Production and Vercel Preview
// deployments must never share data: a preview (any branch, any commit) may
// only open a database whose name contains "preview", and production may never
// open one. Used by config/env.js at startup and by scripts/initPreviewDb.js.
// Nothing here ever returns or prints the credentials in the string.

// "mongodb+srv://user:pw@cluster.example.net/flypool?retryWrites=true" -> "flypool".
// No database in the path means MongoDB's default database, "test".
// Returns null if the text is not a mongodb:// or mongodb+srv:// string.
export function databaseNameFromUri(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/[^/?#]*(?:\/([^?#]*))?/i.exec(String(uri ?? '').trim());
  if (!match) return null;
  try {
    return decodeURIComponent(match[1] || '') || 'test';
  } catch {
    return null;
  }
}

export const isPreviewDatabaseName = (name) => /preview/i.test(name ?? '');

// vercelEnv: the VERCEL_ENV Vercel sets ("production", "preview", "development";
// unset when not on Vercel). Returns a problem message, or null if allowed.
export function databaseMismatch(vercelEnv, databaseName) {
  const previewDatabase = isPreviewDatabaseName(databaseName);
  if (vercelEnv === 'preview' && !previewDatabase) {
    return (
      `Vercel Preview deployments must use the separate preview database, but MONGODB_URI points at ` +
      `database "${databaseName}". Set a Preview-only MONGODB_URI whose database name contains "preview" ` +
      '(e.g. .../flypool_preview?...). Refusing to start so preview code cannot touch production data.'
    );
  }
  if (vercelEnv === 'production' && previewDatabase) {
    return `Production must not use the preview database "${databaseName}". Check the Production MONGODB_URI.`;
  }
  return null;
}
