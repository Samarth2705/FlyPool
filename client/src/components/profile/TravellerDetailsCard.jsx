// What compatible passengers see about you: short name and age always, gender
// only if you choose to show it. Date of birth stays private (only your age is
// shown). PATCH /api/profile
import { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Switch from '../ui/Switch';
import TextField from '../ui/TextField';
import { updateProfile } from '../../api/profile.api';
import { GENDER_LABELS, profileLine, shortName } from '../../utils/profiles';

export default function TravellerDetailsCard({ profile, onSaved }) {
  const [form, setForm] = useState({
    dateOfBirth: profile.dateOfBirth ?? '',
    gender: profile.gender ?? '',
    showGender: Boolean(profile.profileSharing?.showGender),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  };

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const next = await updateProfile({
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        profileSharing: { showGender: Boolean(form.gender) && form.showGender },
      });
      onSaved(next);
      setSaved(true);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  // As saved on the server (updates after Save)
  const preview = profileLine({
    shared: true,
    name: shortName(profile.name),
    age: profile.age,
    gender: profile.profileSharing?.showGender ? profile.gender : null,
  });

  return (
    <Card as="section" padding="lg" aria-labelledby="traveller-details-heading">
      <h2 id="traveller-details-heading" className="font-semibold text-slate-900 dark:text-white">
        What other passengers see
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Compatible passengers see your first name, last initial and age - never your date of birth, email, phone or
        documents. Gender is shown only if you choose to.
      </p>
      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900 dark:bg-slate-800/60 dark:text-white" data-testid="profile-preview">
        Shown as: {preview}
      </p>

      <form onSubmit={save} className="mt-4 space-y-4">
        <TextField
          label="Date of birth"
          name="dateOfBirth"
          type="date"
          optional
          value={form.dateOfBirth}
          onChange={(e) => set('dateOfBirth', e.target.value)}
          hint="Only your age is shown. You must be 18 or over."
          error={error?.details?.find((d) => d.field === 'dateOfBirth')?.message}
        />
        <label className="block">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Gender <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
          </span>
          <select
            name="gender"
            value={form.gender}
            onChange={(e) => set('gender', e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">Prefer not to say</option>
            {Object.entries(GENDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {form.gender && (
          <Switch
            label="Show my gender to other passengers"
            description="Off: other passengers don't see your gender."
            checked={form.showGender}
            onChange={(v) => set('showGender', v)}
          />
        )}
        {error && !error.details?.length && <Alert tone="error">{error.message}</Alert>}
        {saved && <Alert tone="success">Saved.</Alert>}
        <Button type="submit" loading={saving} loadingText="Saving…" fullWidth={false}>
          Save
        </Button>
      </form>
    </Card>
  );
}
