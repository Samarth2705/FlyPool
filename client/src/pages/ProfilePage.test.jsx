// My Profile: what other passengers see (name, age, optional gender) and the
// manual (demo) identity check - Pending / Verified / Rejected.
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import ProfilePage from './ProfilePage';
import * as api from '../api/profile.api';
import { profileLine } from '../utils/profiles';

vi.mock('../api/profile.api', () => ({ getProfile: vi.fn(), updateProfile: vi.fn(), submitIdentity: vi.fn() }));
vi.mock('../components/layout/AppLayout', () => ({ default: ({ children }) => <main>{children}</main> }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { name: 'Asha Verma', email: 'asha@example.com', phone: '+919000000001' } }) }));

const identity = (status, extra = {}) => ({ status, available: true, manual: true, canStart: ['not_started', 'rejected'].includes(status), methods: [], ...extra });
const profile = (overrides = {}) => ({
  name: 'Asha Verma',
  dateOfBirth: null,
  age: null,
  gender: null,
  profileSharing: { shareProfile: false, showGender: false },
  identity: identity('not_started'),
  ...overrides,
});
const renderPage = () =>
  render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());

test('shows how other passengers see you; saving date of birth and gender (shown only if chosen)', async () => {
  api.getProfile.mockResolvedValue(profile());
  api.updateProfile.mockResolvedValue(profile({ dateOfBirth: '1996-04-02', age: 30, gender: 'female', profileSharing: { shareProfile: false, showGender: true } }));
  renderPage();
  expect(await screen.findByTestId('profile-preview')).toHaveTextContent('Shown as: Asha V.');
  await userEvent.type(screen.getByLabelText(/Date of birth/), '1996-04-02');
  await userEvent.selectOptions(screen.getByLabelText(/Gender/), 'female');
  await userEvent.click(screen.getByRole('switch', { name: /Show my gender/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(api.updateProfile).toHaveBeenCalledWith({ dateOfBirth: '1996-04-02', gender: 'female', profileSharing: { showGender: true } });
  expect(await screen.findByTestId('profile-preview')).toHaveTextContent('Shown as: Asha V. · 30 · Female');
});

test('identity: upload an ID (with consent) -> Pending review; labelled as a manual demo check', async () => {
  api.getProfile.mockResolvedValue(profile());
  api.submitIdentity.mockResolvedValue(identity('pending'));
  renderPage();
  expect(await screen.findByText('Not verified')).toBeInTheDocument();
  expect(screen.getByText(/manual check \(demo\)/)).toBeInTheDocument();
  expect(screen.getByText(/It is not an official/)).toBeInTheDocument();
  const submit = screen.getByRole('button', { name: 'Submit for review' });
  expect(submit).toBeDisabled(); // needs a file and consent
  await userEvent.selectOptions(screen.getByLabelText('Document type'), 'passport');
  await userEvent.upload(screen.getByLabelText(/Photo or PDF of the ID/), new File(['%PDF-1.4 synthetic'], 'id.pdf', { type: 'application/pdf' }));
  expect(submit).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(submit);
  expect(await screen.findByText('Pending review')).toBeInTheDocument(); // (the file is read first, then sent)
  expect(api.submitIdentity).toHaveBeenCalledTimes(1);
  expect(api.submitIdentity).toHaveBeenCalledWith({ method: 'passport', document: { mimeType: 'application/pdf', dataBase64: expect.any(String) } });
  expect(screen.queryByRole('button', { name: 'Submit for review' })).not.toBeInTheDocument();
});

test.each([
  ['verified', 'Verified', /see “ID checked” next to your name/, false],
  ['rejected', 'Rejected', /wasn’t accepted - the document couldn’t be read/, true],
])('identity status %s is shown clearly', async (status, label, message, canUpload) => {
  api.getProfile.mockResolvedValue(profile({ identity: identity(status, { rejectedReason: 'document_unreadable' }) }));
  renderPage();
  expect(await screen.findByText(label)).toBeInTheDocument();
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(Boolean(screen.queryByRole('button', { name: 'Submit for review' }))).toBe(canUpload);
});

test('a file that is not an ID image/PDF is refused before upload', async () => {
  api.getProfile.mockResolvedValue(profile());
  renderPage();
  await screen.findByText('Not verified');
  await userEvent.upload(screen.getByLabelText(/Photo or PDF of the ID/), new File(['x'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false });
  expect(screen.getByText('Please choose a JPG, PNG, WebP or PDF file.')).toBeInTheDocument();
  expect(api.submitIdentity).not.toHaveBeenCalled();
});

test('profileLine: name and age always, gender only when sent', () => {
  expect(profileLine({ shared: true, name: 'Ravi K.', age: 41, gender: null })).toBe('Ravi K. · 41');
  expect(profileLine({ shared: true, name: 'Ravi K.', age: null, gender: 'male' })).toBe('Ravi K. · Male');
  expect(profileLine(undefined, 'Traveller 2')).toBe('Traveller 2');
});
