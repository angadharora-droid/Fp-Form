# Amravti FP — Centre Point Amravti Function Booking Form

A full-stack booking app built with **Node.js (Express)** + **MongoDB
(Mongoose)**, modelled on the form at
<https://pablotheartcafe.com/centre-point-nagpur/>.

A **frontend admin login** protects the form: the admin logs in first, and only
then does the **Function Booking Form (FP form)** open. The login is a separate
page — the booking form itself contains **no** "Submitted By / Password" section.
Bookings are validated server-side, stored in MongoDB, and each has a
print-friendly A4 view you can save as a PDF. Every booking gets an
auto-generated series number (`001`, `002`, …) and a timestamp.

## Features

- **Admin login** (session-based, passwords hashed with bcrypt)
- The FP form only opens **after** a successful admin login
- Full booking form with sections: Function Prospectus, Party Details, Billing,
  Additional Services, Instructions
- Server-side validation with inline error messages
- Bookings persisted to **MongoDB** via Mongoose
- Auto-incrementing series number (`001`+) via an atomic Mongo counter
- `/submissions` — list of all bookings (login-protected)
- `/booking/:id` — view a booking; `/booking/:id/print` — A4 print / save as PDF
- Logout

## Project structure

**Two separate servers**: a backend JSON API and a frontend static server. They
run on different ports; the frontend calls the API cross-origin, and the backend
enables **CORS with credentials** so the login session cookie still works.

- **Backend API** → `http://localhost:3001` (Express + Mongoose + MongoDB)
- **Frontend UI** → `http://localhost:5173` (static server for the SPA)

Each folder has its own `package.json`, so you `cd` in and run just that server.
The root `package.json` can also run both at once.

```
Amravti fp/
├── backend/
│   ├── package.json        # cd backend && npm run dev → API only
│   ├── server.js           # Express JSON API (auth, bookings, Mongoose models, CORS)
│   ├── .env                # config: PORT, MONGODB_URI, FRONTEND_ORIGIN (gitignored)
│   └── .env.example
├── frontend/
│   ├── package.json        # cd frontend && npm run dev → UI only
│   ├── server.js           # static server for the UI (port 5173)
│   ├── index.html          # SPA shell
│   ├── app.js              # UI + API_BASE pointing at the backend
│   └── style.css
├── package.json            # root: installs deps; can run BOTH via concurrently
├── free-ports.sh           # frees a given port before start (auto via pre* hooks)
└── start-mongo.sh          # start a local MongoDB instance
```

### API endpoints

| Method | Path                | Auth | Purpose                        |
|--------|---------------------|------|--------------------------------|
| POST   | `/api/login`        | —    | Log in (username + password)   |
| POST   | `/api/logout`       | ✓    | Log out                        |
| GET    | `/api/me`           | —    | Current login state            |
| GET    | `/api/options`      | —    | Dropdown option lists          |
| GET    | `/api/bookings`     | ✓    | List bookings                  |
| GET    | `/api/bookings/:id` | ✓    | One booking                    |
| POST   | `/api/bookings`     | ✓    | Create a booking (validated)   |

## Setup & run

First, once:

```bash
npm install
./start-mongo.sh &     # start local MongoDB (leave running)
```

### Default: two terminals (one per server)

Each folder is its own runnable unit. Open **two terminals**:

```bash
# Terminal 1 — backend API (:3001)
cd backend
npm run dev

# Terminal 2 — frontend UI (:5173)
cd frontend
npm run dev
```

Each starts **only** its own server and frees **only** its own port first, so
they never kill each other. Use `npm start` instead of `npm run dev` to run
without file-watching.

Then open the **frontend** in your browser:

**http://localhost:5173**  ·  log in with `admin` / `admin123`

> Use `localhost` (not `127.0.0.1`) so the frontend and API are treated as the
> same site and the login cookie is sent.

### Alternative: both in one terminal

From the project root:

```bash
npm run dev     # runs backend + frontend together via concurrently
```

## Default admin login

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin123` |

Override before the first run:

```bash
ADMIN_USERNAME=youradmin ADMIN_PASSWORD=yourpass npm start
```

## How it works

1. Visiting `/` (or any protected page) while logged out redirects to `/login`.
2. After logging in, you land on the FP booking form at `/form`.
3. Submitting a valid booking saves it and shows the booking with a
   "Download PDF (A4)" option.
4. `/submissions` lists all bookings.
5. `/logout` clears the session and returns to the login page.

## Configuration (`backend/.env`)

Config is loaded from `backend/.env` via `dotenv`. Copy the example and edit:

```bash
cp backend/.env.example backend/.env
```

| Variable         | Default                                   | Purpose                        |
|------------------|-------------------------------------------|--------------------------------|
| `PORT`           | `3001`                                    | Backend API port               |
| `FRONTEND_ORIGIN`| `http://localhost:5173`                   | Allowed CORS origin (frontend) |
| `SECRET_KEY`     | `change-me-in-production`                  | Session signing secret         |
| `ADMIN_USERNAME` | `admin`                                   | Seeded admin (first run)       |
| `ADMIN_PASSWORD` | `admin123`                                | Seeded admin password          |
| `MONGODB_URI`    | `mongodb://127.0.0.1:27017/amravti_fp`    | Local MongoDB connection       |
| `MONGODB_DB`     | `amravti_fp`                              | MongoDB database name          |

`.env` is gitignored; `.env.example` is committed as a template.

## MongoDB (local)

A local MongoDB 8.x install is available and can be started with:

```bash
./start-mongo.sh          # serves mongodb://127.0.0.1:27017, data in ./.mongodb-data
```

The backend connects to `MONGODB_URI` (from `.env`) on startup and stores all
bookings and admins there. Collections created: `admins`, `bookings`,
`counters` (the atomic series-number counter). Inspect with `mongosh`:

```bash
mongosh amravti_fp --eval 'db.bookings.find().pretty()'
```

## Notes

- **Two ports**: backend API on **3001**, frontend UI on **5173**. Change the
  API port with `PORT` in `backend/.env` (also update `FRONTEND_ORIGIN` and the
  `API_BASE` constant in `frontend/app.js` if you change ports). The frontend
  port can be set with `FRONTEND_PORT`.
- CORS: the backend only accepts credentialed requests from `FRONTEND_ORIGIN`.
- **No more `EADDRINUSE`**: `npm start` / `npm run dev` auto-run `free-ports.sh`
  first (via `prestart` / `predev`), which kills any leftover process on 3001 or
  5173. Run it manually anytime with `npm run free-ports`.
- The default admin is created automatically on first run if the `admins`
  collection is empty.
- Bookings use a numeric `seq` as their public id (URL `/booking/1`), plus a
  zero-padded `series_no` (`001`).
- Set `SECRET_KEY` and change the admin password before deploying to production.
