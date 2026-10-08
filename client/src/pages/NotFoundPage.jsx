import { Link } from 'react-router';
import PageContainer from '../components/layout/PageContainer';

export default function NotFoundPage() {
  return (
    <PageContainer title="Page not found" subtitle="That page doesn't exist.">
      <Link to="/" className="font-medium text-sky-600 hover:underline">
        Go to the home page
      </Link>
    </PageContainer>
  );
}
