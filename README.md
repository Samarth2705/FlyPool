# FlyPool ✈️🚕

Airport cab pooling. Passengers arriving on the same flight find other verified passengers heading in a similar direction, share a cab and split the estimated fare.

> College / portfolio prototype. Flight verification, cab prices and bookings are **simulated** — no airline, Uber/Ola or payment APIs are used.

## Tech stack

| Part | Tools |
|---|---|
| Frontend (`client/`) | React, Vite, React Router, Tailwind CSS, Axios, Framer Motion |
| Backend (`server/`) | Node.js, Express 5, REST, JWT in httpOnly cookies, bcrypt |
| Database | MongoDB Atlas + Mongoose |

## Project structure

```
FlyPool/
├── client/                  React app (http://localhost:5173)
│   └── src/
│       ├── api/             all HTTP calls (Axios), one file per feature
│       ├── animations/      shared Framer Motion variants
│       ├── components/      reusable UI (ui/, layout/, ProtectedRoute)
│       ├── context/         AuthProvider (who is logged in)
│       ├── hooks/           useAuth()
│       ├── pages/           one file per page
│       └── App.jsx          all routes
└── server/                  Express API (http://localhost:5000/api)
    └── src/
        ├── config/          env variables, database connection
        ├── routes/          URL -> controller (routes/index.js mounts them all)
        ├── controllers/     read the request, call services, send the response
        ├── services/        business logic (matching, fares, ...)
        ├── models/          Mongoose schemas
        ├── validators/      request validation schemas
        ├── middleware/      requireAuth, notFound, errorHandler
        ├── utils/           AppError, jwt, authCookie
        ├── seed/            demo data script
        ├── app.js           Express app setup
        └── server.js        entry point (connect DB, then listen)
```

Every API response has the same shape:

```json
{ "success": true,  "data": { } }
{ "success": false, "error": { "code": "SOME_CODE", "message": "Readable message" } }
```

### Auth API

The login token is a JWT stored in an httpOnly cookie, so the browser sends it automatically and JavaScript can never read it.

| Method | URL | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | `name`, `email`, `phone` (Indian mobile), `password` (8+ chars) | Creates the account and logs in |
| POST | `/api/auth/login` | `email`, `password` | |
| POST | `/api/auth/logout` | – | Clears the cookie |
| GET | `/api/auth/me` | – | The logged-in user, or 401 |

Register and login are limited to 20 attempts per IP every 15 minutes.

### Trips API (login required)

| Method | URL | Body | Notes |
|---|---|---|---|
| POST | `/api/trips` | `pickupLocation`, `pickupTerminal` (`T1`/`T2`, required for the airport), `destination`, `travelDate` (`YYYY-MM-DD`), `expectedArrivalTime` (`HH:mm`, Mumbai time), `passengerCount` (1–6), `luggageCount` (0–10, optional), `openToPooling` (optional), `clientRequestId` (optional UUID) | Saves Page 2. The owner comes from the login cookie. Re-sending the same `clientRequestId` returns the same trip (200) instead of a duplicate |

Trip statuses: `awaiting_verification` → `flight_verified` → `ride_selected` (a ride request - shared or solo - not a booking), or `cancelled`. Only the server moves a trip forward; passengers can only cancel. There is no `booking_confirmed` yet because FlyPool can't confirm real bookings.
| GET | `/api/trips?when=upcoming\|past\|all` | – | The logged-in passenger's own trips, newest first |
| GET | `/api/trips/current` | – | The trip to resume after login (`{ trip, nextStep }`, both `null` if none) |
| GET | `/api/trips/:tripId` | – | Only the trip's owner can read it (others get 404) |
| PATCH | `/api/trips/:tripId` | Trip-detail fields, **or** `{ "status": "cancelled" }` | Details can change only before the flight is verified. Owner, status, verification, pool and fare fields can't be set |
| POST | `/api/trips/:tripId/verification` | `airline`, `flightNumber`, `scheduledArrivalTime`, `document` (`mimeType`, `dataBase64`; JPG/PNG/WebP/PDF, max 5 MB) | Page 3. **Demo verification** (see below) |
| GET | `/api/trips/:tripId/matches` | – | Page 4: compatible travellers (no personal details), shared rides you can join per vehicle, solo estimates. Verified trips only. Never creates anything |
| PUT | `/api/trips/:tripId/ride` | `mode` (`shared`/`solo`), `vehicleType` (`sedan`/`suv`), `poolId` (optional) | Page 4 → 5. Shared + `poolId` joins that shared ride, shared without it starts one, solo leaves any open shared ride. Re-sending the same choice changes nothing. **A ride request - not a booking, no driver** |
| GET | `/api/trips/:tripId/ride` | – | The saved ride choice (Page 5) |

### Flight verification (Page 3) - what is real

- **Document check - real.** The file is decoded in memory, its size is checked and its type is confirmed from its first bytes. It is never saved, logged or given a URL; only its kind and size are stored.
- **Reading details from the document (OCR) - not connected.**
- **Flight check - depends on `FLIGHT_VERIFICATION_MODE`:**
  - `demo` (default in development): **not a real flight lookup.** It reads the flight number (IATA "6E 2134" or ICAO "IGO2134"), requires the airline code to be one we know and to belong to the airline entered, and the date not to be in the past. Unknown airline codes fail. Results are stored with `method: "demo"` and shown as "demo verification".
  - `off` (default in production): verification is refused with a clear "not available" error - nothing is marked verified.
  - A failed attempt is recorded but **does not change the trip**; the passenger can correct the details and retry (max 10 attempts per 15 minutes).
  - To connect a real flight-data provider: implement a verifier with the same input/output as `demoVerifier`, register it with `registerFlightVerifier()` in `server/src/services/flightVerification.service.js` and set `FLIGHT_VERIFICATION_MODE` to its name. Timeouts (`VERIFICATION_TIMEOUT_MS`), errors and malformed responses already return a clear 503 without touching the trip.

### Shared rides, vehicles and matching (Page 4)

A **shared ride** is one `Pool` record (`server/src/models/Pool.js`) = **one cab**: vehicle type and capacity, pickup terminal, the member trips (each trip points back with `poolId`), seats/bags taken, the fare estimate and a status (`open`; `confirmed`/`completed` are reserved for a future booking feature; `cancelled` when everyone left). Each trip stores `rideMode` (`shared`/`solo`) and `vehicleType` (`sedan`/`suv`). Joining, leaving and switching run in MongoDB transactions (`server/src/services/ride.service.js`), so a cab can never take more people or bags than its vehicle allows, even when two people try to take the last seat at once, and a trip can only be in one pool (unique index). Members of a `confirmed` pool can't leave or switch without a cancellation flow.

Matching (`server/src/services/matching.service.js`) uses real trip and pool records: same airport terminal, landing within 60 minutes of each other (optionally the same flight: `MATCHING.requireSameFlight`), destinations compared as areas ("Lokhandwala, Andheri West" = Andheri West) with a limited detour, both verified and open to sharing. Solo travellers are never shown to others. Vehicle capacity (Sedan 4 people / 3 bags, SUV 6 / 5) is in `server/src/config/pricing.js`.

**Migration:** `npm run migrate:pools` (in `server/`, safe to re-run) converts trips saved before shared rides existed: solo choices are kept, earlier per-passenger "pool" choices are reset so the passenger chooses again (they were never shared).

Fares are **provisional estimates** from the rules in `server/src/config/pricing.js` (no taxi-fare API): straight-line distance × 1.4 via each drop-off area, sedan/SUV rates, rounded to ₹10, split equally per person (companions included) so the shares add up exactly. The assumptions are shown next to every estimate. Area locations are approximate (`server/src/data/mumbaiAreas.js`).

**Sample travellers for development:** `npm run seed:demo -- --date 2026-10-12 --time 18:30 --flight 6E2134 --terminal T2` (in `server/`) creates clearly labelled sample travellers around that flight, including a sample shared Sedan and SUV to join; `npm run seed:demo -- --remove` deletes them. They are never matched when `NODE_ENV=production`.

**Tests:** `npm test` in `server/` runs the fare and matching unit tests.

## Getting started

**Requirements:** Node.js 20+ and a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env      # then fill in MONGODB_URI and JWT_SECRET (see below)
npm run dev
```

Check it works: open http://localhost:5000/api/health

### 2. Frontend (in a second terminal)

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173 to see the login / register page. http://localhost:5173/status is a development page that shows whether the API and database are connected.

During development, Vite forwards every `/api` request to the Express server (see `client/vite.config.js`), so the browser treats both as one site and the auth cookie works without CORS issues.

### MongoDB Atlas setup

1. Create a free cluster.
2. **Database Access** → add a database user with a password.
3. **Network Access** → add your current IP address.
4. **Connect → Drivers** → copy the connection string into `MONGODB_URI` in `server/.env`, replacing `<username>`, `<password>`, and adding the database name `flypool` before the `?`.

### Environment variables

`.env.example` files list the variable **names only** and are committed. The real `.env` files hold your values and are ignored by git — never commit them.

| File | Required | Notes |
|---|---|---|
| `server/.env` | `MONGODB_URI`, `JWT_SECRET` | Everything else has a default (see `server/src/config/env.js`) |
| `client/.env` | nothing | Optional; `VITE_API_BASE_URL` defaults to `/api` |

Generate a `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Testing

In `server/`:

| Command | What it runs |
|---|---|
| `npm run test:unit` | Fare, matching and flight-number rules (no database) |
| `npm run test:integration` | The real API against a **throwaway in-memory MongoDB replica set** (`mongodb-memory-server`) - never your Atlas data. Covers signup/login, trips, verification failures and retries, two users sharing one pool, capacity races, solo rides, cancellation rules and access control. The first run downloads a MongoDB binary (~600 MB, cached afterwards) |
| `npm test` | Both |
| `npm run check:data` | **Read-only** consistency check of users, trips and pools in the database in `MONGODB_URI` (reports record ids only) |

In `client/`: `npm run lint` and `npm run build`.

## Deployment

Nothing here is deployed automatically. Checklist:

**Backend (`server/`)** - Node 20+, `npm ci --omit=dev`, `npm start`. Health check: `GET /api/health` (reports whether the database is connected).

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Atlas connection string (a dedicated database user with read/write on the `flypool` database only). Atlas must be a replica set - shared rides use transactions |
| `JWT_SECRET` | New random 48+ byte secret (not the development one) |
| `CLIENT_ORIGIN` | The app's URL, e.g. `https://flypool.example` (**required**) |
| `COOKIE_SECURE` | `true` (**required**; serve over HTTPS) |
| `COOKIE_SAME_SITE` | `lax` if app and API share a site (recommended: serve the API under the same domain, e.g. `/api`), `none` if they are on different sites |
| `TRUST_PROXY` | Number of proxies in front of the API (usually `1` on a PaaS) |
| `FLIGHT_VERIFICATION_MODE` | Leave unset (`off`) until a real provider exists; `demo` only for a clearly-labelled demo |

The server refuses to start in production without `CLIENT_ORIGIN` and `COOKIE_SECURE=true`. It logs one line per request (no bodies or cookies) and shuts down gracefully on `SIGTERM`.

**Frontend (`client/`)** - `npm ci && npm run build`, then host `client/dist` as a static site with a fallback to `index.html` (client-side routes). If the API is on another origin, build with `VITE_API_BASE_URL=https://api.example/api`. Note: `index.html` contains a small inline script (theme without flash); if your host sets a strict Content-Security-Policy, allow it with a hash.

**Database**
- Atlas Network Access: allow only the backend's outbound IPs (not `0.0.0.0/0`).
- Enable Atlas backups (or `mongodump`) and take a backup before any migration.
- Indexes are created automatically on startup (Mongoose `autoIndex`); check them in Atlas after the first deploy.
- Migrations: back up, run `npm run migrate:pools` (safe to re-run), then `npm run check:data`.

**Not part of FlyPool yet:** real flight-data verification, OCR, booking confirmation, driver dispatch, payments and live tracking.

## Roadmap

- [x] Phase 1 — Project setup, health check, JWT/cookie foundation, page shells and routes
- [x] Phase 2 — Authentication (register, login, logout)
- [x] Phase 3 — Models + demo seed data (Mumbai)
- [x] Phase 4 — Trip details (Page 2), flight verification (Page 3, demo verification)
- [x] Phase 5 — Geo utilities, fare calculation, matching (with unit tests)
- [x] Phase 6 — Shared ride matching page (Page 4)
- [ ] Phase 7 — Booking summary ✅ (Page 5) / booking confirmation (not built yet)
- [ ] Phase 8 — Polish, integration tests, demo script
