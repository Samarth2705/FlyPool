// Identity check - a MANUAL demo check: the passenger uploads a photo or PDF
// of an ID, a person reviews it, and the status becomes Verified or Rejected.
// The file is deleted once reviewed and is never shown to other passengers;
// they only see "ID checked". Nothing is confirmed with any authority.
// GET /api/identity, POST /api/identity/submit
import { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import { submitIdentity } from '../../api/profile.api';
import { DOCUMENT_ACCEPT, checkDocumentFile, documentType, readFileAsBase64 } from '../../utils/documents';
import { ID_TYPES } from '../../utils/profiles';

const STATUS = {
  not_started: { label: 'Not verified', tone: 'neutral' },
  pending: { label: 'Pending review', tone: 'warning' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral' },
};

const REASONS = { document_unreadable: 'the document couldn’t be read', name_mismatch: 'the name didn’t match your account' };

export default function IdentityCard({ identity, onChanged }) {
  const [method, setMethod] = useState(ID_TYPES[0].value);
  const [file, setFile] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const status = STATUS[identity.status] ?? STATUS.not_started;
  const canUpload = identity.available && identity.manual && identity.canStart;

  function pick(event) {
    const chosen = event.target.files?.[0] ?? null;
    setError(chosen ? (checkDocumentFile(chosen) ?? '') : '');
    setFile(chosen && !checkDocumentFile(chosen) ? chosen : null);
  }

  async function send(event) {
    event.preventDefault();
    if (!file || !agreed || sending) return;
    setSending(true);
    setError('');
    try {
      const next = await submitIdentity({ method, document: { mimeType: documentType(file), dataBase64: await readFileAsBase64(file) } });
      setFile(null);
      setAgreed(false);
      onChanged(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card as="section" padding="lg" aria-labelledby="identity-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="identity-heading" className="font-semibold text-slate-900 dark:text-white">
          Identity check
        </h2>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        A <strong>manual check (demo)</strong>: a FlyPool team member looks at the ID you upload. It is not an official
        verification. Your document is deleted once it has been reviewed and is never shown to other passengers - they only
        see “ID checked”.
      </p>

      {!identity.available && <Alert tone="neutral" className="mt-4">Identity checks are switched off right now.</Alert>}
      {identity.status === 'pending' && (
        <Alert tone="info" className="mt-4" title="Waiting for review">
          We’ll update this status once your ID has been looked at.
        </Alert>
      )}
      {identity.status === 'verified' && (
        <Alert tone="success" className="mt-4" title="ID checked">
          Other passengers see “ID checked” next to your name.
        </Alert>
      )}
      {identity.status === 'rejected' && (
        <Alert tone="warning" className="mt-4" title="Not accepted">
          Your ID wasn’t accepted{REASONS[identity.rejectedReason] ? ` - ${REASONS[identity.rejectedReason]}` : ''}. You can upload it again.
        </Alert>
      )}

      {canUpload && (
        <form onSubmit={send} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Document type</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {ID_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Photo or PDF of the ID (max 3 MB)</span>
            <input
              type="file"
              accept={DOCUMENT_ACCEPT}
              onChange={pick}
              className="mt-1.5 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-slate-200"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              Tip: for an Aadhaar card you may cover all but the last 4 digits of the number.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
            <span>I agree that a FlyPool team member may look at this document to check my identity, and that it is deleted afterwards.</span>
          </label>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" loading={sending} loadingText="Uploading…" disabled={!file || !agreed} fullWidth={false}>
            Submit for review
          </Button>
        </form>
      )}
    </Card>
  );
}
