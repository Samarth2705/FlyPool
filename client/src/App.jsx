// All page routes live here.
// Pages inside <ProtectedRoute> need a logged-in user.
import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './context/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';

import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
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
          {/* Public pages */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />

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
