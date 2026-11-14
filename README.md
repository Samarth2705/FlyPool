# ✈️ FlyPool — Smart Airport Cab Pooling

**Share your flight. Share your ride. Split the fare.**

FlyPool helps passengers arriving at Mumbai Airport (BOM) find other verified travellers heading the same way, share a cab (Sedan or SUV) or ride alone, and split the fare fairly. It has an Android/iOS app (React Native + Expo), a website (React + Vite) and a shared REST API (Node.js + Express + MongoDB Atlas).

**Project Type:** Academic / Portfolio Project
**Status:** Working prototype — flight checks and payments run in **demo mode** (see [Known limitations](#-known-limitations))

| | URL |
| --- | --- |
| Website | https://fly-pool-eta.vercel.app |
| API (used by the website and the mobile app) | https://fly-pool-eta.vercel.app/api |
| API health check | https://fly-pool-eta.vercel.app/api/health |

---

## ✨ Features

| Area | What it does |
| --- | --- |
| Accounts | Register and log in (name, email, +91 mobile number, password). Passwords are bcrypt-hashed. The website uses an HttpOnly cookie; the app uses a 30-day bearer token kept in the phone's secure storage (Keychain / Keystore). Logout revokes the token on the server. |
| Trip planning | Pickup (Terminal 1 / 2 or another point), destination, travel date, landing time, passengers, bags, open to sharing. Saving twice never creates a duplicate trip. |
| Flight verification | Upload or photograph a boarding pass / e-ticket (image or PDF) and enter the flight number. **Demo mode:** FlyPool checks the details itself — it is *not* a confirmation from the airline. |
| Compatible travellers | Real, verified travellers on nearby flights going the same way, best match first. Others are shown by area, group size, flight and arrival time only — never names or contact details. |
| Ride selection | Shared ride (start one or join one) or Travel Alone, Sedan or SUV, with seat and bag limits and a server-calculated fare estimate with breakdown. |
| Booking | Review summary, confirm, and get a booking reference (`FP-XXXXXXXX`). |
| Ride management | Cancel a booking (with an optional reason) or leave a shared ride while keeping the trip; history is kept. |
| Notifications | In-app notifications (matches, people joining or leaving, bookings, cancellations). Push notifications are built in but switched off until credentials are configured. |
| Group chat | Text chat for passengers with a confirmed booking in the same shared ride. |
| Payments & fare splitting | Each passenger pays their own share, worked out by the server; payment opens once everyone in the ride has booked. **Demo mode only — no money is collected.** Payment history in the app. |
| My Trips, Profile, Settings | Upcoming and past trips, account details, light / dark / system theme. |

## 🛠️ Technology stack

| Layer | Technologies |
| --- | --- |
| Mobile app | React Native 0.88, Expo SDK 58, Expo Router, expo-secure-store, expo-notifications, axios |
| Website | React, Vite, Tailwind CSS, React Router |
| API | Node.js, Express 5, Mongoose 9, zod validation, helmet, express-rate-limit, JWT |
| Database | MongoDB Atlas |
| Hosting | Vercel (website and API, two projects), Expo EAS (mobile builds) |
| Tests | node:test + mongodb-memory-server (API), Jest + React Native Testing Library against a real in-memory API (mobile) |

## 🏗️ System architecture

```text
 ┌─────────────────────┐        ┌──────────────────────────┐
 │  Mobile app (Expo)  │        │  Website (React + Vite)  │
 │  Android / iOS      │        │  fly-pool-eta.vercel.app │
 │  Bearer token       │        │  HttpOnly cookie         │
 └──────────┬──────────┘        └────────────┬─────────────┘
            │  HTTPS  https://fly-pool-eta.vercel.app/api/*  │
            └──────────────────────┬─────────────────────────┘
                                   ▼
             Vercel rewrite (website project → API project)
                                   ▼
                 ┌──────────────────────────────────┐
                 │  REST API (Express on Vercel)     │
                 │  auth · trips · verification ·    │
                 │  matching · rides · bookings ·    │
                 │  notifications · chat · payments  │
                 └────────────────┬─────────────────┘
                                  ▼
                 ┌──────────────────────────────────┐
                 │  MongoDB Atlas                    │
                 └──────────────────────────────────┘
```

The server is the single source of truth: it checks every request's session, only returns the user's own data, and calculates every fare and payment amount itself.

## 📱 Mobile app

Source: [`mobile/`](mobile/). Android package: **`com.flypool.mobile`**.

### Setup

```bash
cd mobile
npm install
cp .env.example .env    # EXPO_PUBLIC_API_URL=https://fly-pool-eta.vercel.app/api
npx expo start
```

`EXPO_PUBLIC_*` values are built into the app — never put secrets there. EAS builds take the API URL from [`mobile/eas.json`](mobile/eas.json) (`.env` is git-ignored and is not uploaded to EAS).

### EAS build profiles ([`mobile/eas.json`](mobile/eas.json))

| Profile | Output | Use |
| --- | --- | --- |
| `development` | APK with the Expo dev client | Development and debugging (`npx expo start --dev-client`) |
| `preview` | APK, internal distribution | Install directly on Android phones for testing |
| `production` | AAB (Android App Bundle) | Google Play Console upload; version code increases automatically |

### One-time EAS setup

```bash
npm install -g eas-cli
eas login              # your Expo account
cd mobile
eas init               # creates the EAS project and adds its projectId to app.json
```

### Build an APK (preview)

```bash
cd mobile
eas build --platform android --profile preview
```

When it finishes, EAS prints a link and a QR code. Open the link on the Android phone, download the APK and install it (allow "Install unknown apps" for the browser when Android asks).

### Build an AAB (production, for Google Play)

```bash
cd mobile
eas build --platform android --profile production
```

The first Android build asks EAS to generate and store the upload keystore (keep it in EAS; do not commit keystores). Download the `.aab` from the build page and upload it in Google Play Console manually, or use `eas submit --platform android --profile production` once a Play service account key is set up.

### Checks

```bash
cd mobile
npm run lint
npx expo-doctor
npx expo install --check
npm run test:api       # terminal 1: real API on an in-memory MongoDB (never Atlas)
npx jest -i            # terminal 2: iOS + Android test projects
```

## 🔑 Environment variables (names only)

**API (`server/`, set in the Vercel API project):** `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_MOBILE_EXPIRES_IN`, `CLIENT_ORIGIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `TRUST_PROXY`, `FLIGHT_VERIFICATION_MODE`, `VERIFICATION_TIMEOUT_MS`, `PAYMENT_MODE`, `PAYMENT_WEBHOOK_SECRET`, `DOCUMENT_READ_TIMEOUT_MS`, `IDENTITY_PROVIDER`, `IDENTITY_WEBHOOK_SECRET`, `EXPO_PUSH_ENABLED`, `EXPO_ACCESS_TOKEN`, `LOG_REQUESTS`, `PORT` — see [`server/.env.example`](server/.env.example).

**Website (`client/`):** `VITE_API_BASE_URL` (optional; production uses the `/api` rewrite in [`client/vercel.json`](client/vercel.json)).

**Mobile app (`mobile/`):** `EXPO_PUBLIC_API_URL`.

## ⚠️ Known limitations

* **Flight verification is a demo check**, not airline confirmation. No airline API is connected.
* **Payments are simulated** (`PAYMENT_MODE=demo`): no card, UPI or bank details are taken and no money moves. No real payment provider is connected, and refunds are not processed.
* **Push notifications are off** until an EAS projectId, Firebase Cloud Messaging (Android) / APNs (iOS) credentials and `EXPO_PUSH_ENABLED=true` are configured. In-app notifications work without them.
* **Chat uses polling** (every few seconds) because the API runs on serverless functions.
* **Rate limits are per server instance** on Vercel, so they are looser than configured.
* Only **Mumbai Airport (BOM)** pickups and a fixed list of Mumbai areas are supported.
* There is no QR / barcode scanning; tickets are verified from an uploaded image or PDF.
* The iOS app is configured (`com.flypool.mobile`) but has not been built or tested.

---

*FlyPool — Making shared airport travel simpler, smarter, and more affordable.*
