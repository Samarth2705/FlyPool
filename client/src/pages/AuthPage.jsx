// Page 1: Login / Register. `mode` is "login" or "register".
// Placeholder - the forms are built in phase 2.
import { Link } from 'react-router';
import PageContainer from '../components/layout/PageContainer';

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';

  return (
    <PageContainer
      title={isLogin ? 'Log in' : 'Create an account'}
      subtitle="Form coming in phase 2."
    >
      <p className="text-sm text-slate-500">
        {isLogin ? 'New to FlyPool? ' : 'Already have an account? '}
        <Link to={isLogin ? '/register' : '/login'} className="font-medium text-sky-600 hover:underline">
          {isLogin ? 'Register' : 'Log in'}
        </Link>
      </p>
    </PageContainer>
  );
}
