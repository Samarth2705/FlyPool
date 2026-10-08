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

Open http://localhost:5173. The home page shows whether the API and database are connected.

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

## Deployment note

If the frontend and backend are later hosted on **different domains**, the auth cookie must use `sameSite: "none"` and `secure: true` (HTTPS), and `CLIENT_ORIGIN` must be set to the frontend's URL.

## Roadmap

- [x] Phase 1 — Project setup, health check, JWT/cookie foundation, page shells and routes
- [ ] Phase 2 — Authentication (register, login, logout)
- [ ] Phase 3 — Models + demo seed data (Mumbai)
- [ ] Phase 4 — Trip details, flight verification, drop location
- [ ] Phase 5 — Geo utilities, fare calculation, matching (with unit tests)
- [ ] Phase 6 — Shared ride matching page
- [ ] Phase 7 — Ride details / confirmation
- [ ] Phase 8 — Polish, integration tests, demo script
