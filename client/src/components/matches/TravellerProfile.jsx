// Another passenger's name · age · gender (as the server sends it) with their
// identity-check status. Nothing else about them is ever shown.
//   <TravellerProfile profile={member.profile} fallback="Traveller 1" />
import Badge from '../ui/Badge';
import { profileLine } from '../../utils/profiles';

export default function TravellerProfile({ profile, fallback = 'Traveller', className = '' }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <span className="font-semibold text-slate-900 dark:text-white" data-testid="traveller-name">
        {profileLine(profile, fallback)}
      </span>
      {profile?.shared && (
        <Badge tone={profile.identity === 'verified' ? 'success' : 'neutral'}>{profile.identity === 'verified' ? 'ID checked' : 'ID not checked'}</Badge>
      )}
    </span>
  );
}
