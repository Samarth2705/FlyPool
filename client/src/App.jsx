// All page routes live here.
// Pages inside <ProtectedRoute> need a logged-in user.
import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './context/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';

import AuthLayout from './components/auth/AuthLayout';
import AuthPage from './pages/AuthPage';
import StatusPage from './pages/StatusPage';
import TripDetailsPage from './pages/TripDetailsPage';
import VerifyFlightPage from './pages/VerifyFlightPage';
import MatchesPage from './pages/MatchesPage';
import RideDetailsPage from './pages/RideDetailsPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Login / register is the landing page. AuthLayout holds the
              animation panel; `key` gives each mode a fresh, empty form. */}
          <Route element={<AuthLayout />}>
            <Route path="/" element={<AuthPage key="login" mode="login" />} />
            <Route path="/login" element={<AuthPage key="login" mode="login" />} />
            <Route path="/register" element={<AuthPage key="register" mode="register" />} />
          </Route>

          {/* Development check: API, database and login status */}
          <Route path="/status" element={<StatusPage />} />

          {/* Logged-in pages, in the order a passenger visits them */}
          <Route element={<ProtectedRoute />}>
            <Route path="/trip/new" element={<TripDetailsPage />} />
            <Route path="/trip/:tripId/verify" element={<VerifyFlightPage />} />
            <Route path="/trip/:tripId/matches" element={<MatchesPage />} />
            <Route path="/rides/:rideId" element={<RideDetailsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
