import { LinkButton } from '../components/ui/Button';
import PageContainer from '../components/layout/PageContainer';

export default function NotFoundPage() {
  return (
    <PageContainer title="Page not found" subtitle="That page doesn't exist, or the link has changed.">
      <div className="flex flex-wrap gap-3">
        <LinkButton to="/trips">Go to My Trips</LinkButton>
        <LinkButton to="/trip/new" variant="secondary">
          Plan a ride
        </LinkButton>
      </div>
    </PageContainer>
  );
}
