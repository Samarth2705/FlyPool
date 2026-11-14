// All page routes live here.
// Pages inside <ProtectedRoute> need a logged-in user.
//
// The login / register screen is part of the main bundle (it's the landing
// page). Every other page is its own chunk, downloaded when first opened or
// prefetched in idle time (see pages/loaders.js).
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './context/AuthProvider';
import { ThemeProvider } from './context/ThemeProvider';
import ProtectedRoute from './components/ProtectedRoute';
import Spinner from './components/ui/Spinner';

import AuthLayout from './components/auth/AuthLayout';
import AuthPage from './pages/AuthPage';
import * as pages from './pages/loaders';

const StatusPage = lazy(pages.loadStatus);
const TripDetailsPage = lazy(pages.loadTripDetails);
const VerifyFlightPage = lazy(pages.loadVerifyFlight);
const MatchesPage = lazy(pages.loadMatches);
const BookingSummaryPage = lazy(pages.loadBookingSummary);
const ProfilePage = lazy(pages.loadProfile);
const MyTripsPage = lazy(pages.loadMyTrips);
const SettingsPage = lazy(pages.loadSettings);
const NotFoundPage = lazy(pages.loadNotFound);

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          {/* Shown only while a page's code is downloading (first visit, before prefetch) */}
          <Suspense fallback={<Spinner fullScreen />}>
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
                <Route path="/trip/:tripId/edit" element={<TripDetailsPage key="edit" />} />
                <Route path="/trip/:tripId/verify" element={<VerifyFlightPage />} />
                <Route path="/trip/:tripId/matches" element={<MatchesPage />} />
                <Route path="/trip/:tripId/summary" element={<BookingSummaryPage />} />

                {/* Account pages (from the profile menu) */}
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/trips" element={<MyTripsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
