/**
 * Function Booking — Backend API (Express + MongoDB/Mongoose).
 *
 * A shared JSON API for venue-specific Function Booking frontends. Each
 * request selects a server-controlled venue profile using X-Property-Code.
 *
 * Storage: MongoDB via Mongoose (connection from backend/.env → MONGODB_URI).
 * Auth: a frontend admin logs in; only then can the booking endpoints be used.
 *
 * Known venue profiles use fixed user and notification allowlists.
 */

const path = require('path');
const http = require('http');
// Prefer IPv4 for outbound connections. Some hosts (e.g. Render's free tier)
// have no outbound IPv6 route, so resolving the SMTP host to an IPv6 address
// first causes ENETUNREACH. This forces IPv4-first DNS resolution.
require('dns').setDefaultResultOrder('ipv4first');
// Load environment variables from backend/.env
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
// connect-mongo v6 is ESM-first; under CommonJS the class is the default export.
const MongoStore = require('connect-mongo').default || require('connect-mongo');
const cors = require('cors');
const mongoose = require('mongoose');
const { sendBookingEmail } = require('./mailer');
const { renderBookingPdf } = require('./pdf');
const { PROPERTY_PROFILES, getPropertyProfile } = require('./property');

const PORT = process.env.PORT || 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const FRONTEND_ORIGINS = new Set(
  (process.env.FRONTEND_ORIGINS || FRONTEND_ORIGIN)
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
);

const SECRET_KEY = process.env.SECRET_KEY || 'change-me-in-production';
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/amravti_fp';

// Option lists (also used by the frontend via /api/options). propertyName is
// sent along so the frontend header/title match this deployment's outlet.
const OPTIONS = {
  functionTypes: ['Social', 'Corporate'],
  venues: ['Hall', 'Lawn'],
  timeSlots: [
    'Breakfast (08:00 - 12:00)',
    'Lunch (12:00 - 15:00)',
    'Hi-Tea (16:00 - 18:00)',
    'Dinner (19:00 - 00:00)',
  ],
  menus: ['Veg', 'Non-Veg', 'Veg + Non-Veg', 'Jain'],
  paymentModes: ['Cash', 'Card', 'UPI'],
  otherCharges: ['Alcohol', 'DJ', 'AV', 'Other Charges'],
};

const FIELDS = [
  'reservation_no',
  'date', 'time', 'function_type', 'venue', 'mg', 'expected_pax',
  'time_slot', 'menu',
  'party_name', 'company_name', 'gst_no', 'pan_no', 'address',
  'contact_person', 'telephone', 'email', 'seating_arrangement', 'add_on_rooms',
  'rate', 'hall_rent', 'mode_of_payment', 'advance_amt', 'transaction_details',
  'board_to_read', 'other_charges', 'details_amount',
  'billing_instruction', 'housekeeping', 'fnb', 'kitchen',
];

const REQUIRED = [
  'date', 'function_type', 'venue', 'time_slot', 'menu',
  'party_name', 'telephone', 'rate',
];

// --- Mongoose models --------------------------------------------------------

const adminSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password_hash: { type: String, required: true },
});
const Admin = mongoose.model('Admin', adminSchema);

// Atomic counter for the sequential booking series number.
const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 },
});
const Counter = mongoose.model('Counter', counterSchema);

async function nextSeq(name) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

// Zero-padded series number, starting at 001 (001, 002, … 999, 1000, …).
function seriesNo(n) {
  return String(n).padStart(3, '0');
}

const bookingSchema = new mongoose.Schema({
  property_code: { type: String, required: true, index: true },
  seq: { type: Number, unique: true, index: true }, // public numeric id
  series_no: String,
  reservation_no: String,
  submitted_by: { type: String, required: true },
  date: String, time: String, function_type: String, venue: String,
  mg: String, expected_pax: String, time_slot: String, menu: String,
  party_name: String, company_name: String, gst_no: String, pan_no: String,
  address: String, contact_person: String, telephone: String, email: String,
  seating_arrangement: String, add_on_rooms: String,
  rate: String, hall_rent: String, mode_of_payment: String, advance_amt: String,
  transaction_details: String, board_to_read: String, other_charges: String,
  details_amount: String, billing_instruction: String, housekeeping: String,
  fnb: String, kitchen: String,
  created_at: { type: Date, default: Date.now },
});

// Expose `id` = seq and hide Mongo internals in JSON responses.
bookingSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret.seq;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
const Booking = mongoose.model('Booking', bookingSchema);

// --- App setup --------------------------------------------------------------

const app = express();

// Allow the frontend to call this API with the session cookie. Accept the
// configured origin, local dev, and any *.vercel.app URL (Vercel gives each
// deploy/preview a different subdomain, so a single fixed origin isn't enough).
const corsOrigin = (origin, cb) => {
  if (
    !origin || // same-origin or non-browser (curl, health checks)
    FRONTEND_ORIGINS.has(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /\.vercel\.app$/.test(origin)
  ) {
    return cb(null, true);
  }
  cb(new Error('Not allowed by CORS: ' + origin));
};
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
// In production the frontend (Vercel) and backend (Render) are different
// sites, so the session cookie must be SameSite=None + Secure to be sent on
// cross-site API calls. Render terminates TLS at a proxy, so trust it.
const IS_PROD = process.env.NODE_ENV === 'production';
if (IS_PROD) app.set('trust proxy', 1);
app.use(
  session({
    secret: SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    // Persist sessions in MongoDB so they survive server restarts/redeploys
    // (Render's free tier restarts often; an in-memory store loses logins).
    store: MongoStore.create({
      mongoUrl: MONGODB_URI,
      ttl: 8 * 60 * 60, // seconds — matches the cookie maxAge
    }),
    cookie: {
      httpOnly: true,
      sameSite: IS_PROD ? 'none' : 'lax',
      secure: IS_PROD,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

// Every frontend identifies its venue. Never trust a property name or email
// list from the browser; the header only selects one of the server-side
// profiles defined in property.js.
app.use('/api', (req, res, next) => {
  const propertyCode = String(req.get('X-Property-Code') || '').trim().toLowerCase();
  const propertyProfile = getPropertyProfile(propertyCode);
  if (!propertyProfile) {
    return res.status(400).json({ error: 'Missing or invalid venue configuration.' });
  }
  req.propertyCode = propertyCode;
  req.propertyProfile = propertyProfile;
  next();
});

function sessionIsAuthorized(req) {
  const username = String(req.session.adminUsername || '').toLowerCase();
  return Boolean(
    username &&
    req.propertyProfile.allowedUsers[username] &&
    req.session.propertyCode === req.propertyCode
  );
}

function authRequired(req, res, next) {
  if (!sessionIsAuthorized(req)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Wrap async route handlers so rejections become 500s instead of crashes.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Start listening, retrying briefly if the port is momentarily still in use
// (e.g. a --watch restart before the old process fully released it).
function listenWithRetry(server, port, onListen, retries = 20, delayMs = 250) {
  const attempt = (left) => {
    const onError = (err) => {
      if (err.code === 'EADDRINUSE' && left > 0) {
        console.log(`Port ${port} busy — retrying in ${delayMs}ms (${left} left)…`);
        setTimeout(() => attempt(left - 1), delayMs);
      } else {
        console.error(`Failed to bind port ${port}: ${err.message}`);
        process.exit(1);
      }
    };
    server.once('error', onError);
    server.listen(port, () => {
      server.removeListener('error', onError);
      onListen();
    });
  };
  attempt(retries);
}

// --- Auth API ---------------------------------------------------------------

app.post(
  '/api/login',
  wrap(async (req, res) => {
    const username = (req.body.username || '').trim().toLowerCase();
    const password = req.body.password || '';

    // The active venue's allowlist is authoritative. An account left in the
    // database from another venue can never use this deployment.
    const expectedPassword = req.propertyProfile.allowedUsers[username];
    if (!expectedPassword || password !== expectedPassword) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.adminUsername = username;
    req.session.propertyCode = req.propertyCode;
    return res.json({ ok: true, username });
  })
);

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (sessionIsAuthorized(req)) {
    return res.json({ loggedIn: true, username: req.session.adminUsername });
  }
  res.json({ loggedIn: false });
});

app.get('/api/options', (req, res) => {
  res.json({ ...OPTIONS, propertyName: req.propertyProfile.displayName });
});

// --- Bookings API -----------------------------------------------------------

app.get(
  '/api/bookings',
  authRequired,
  wrap(async (req, res) => {
    const rows = await Booking.find({ property_code: req.propertyCode })
      .sort({ seq: -1 })
      .select(
        'seq series_no reservation_no submitted_by date time function_type venue party_name telephone created_at'
      );
    res.json(rows.map((r) => r.toJSON()));
  })
);

app.get(
  '/api/bookings/:id',
  authRequired,
  wrap(async (req, res) => {
    const booking = await Booking.findOne({
      seq: Number(req.params.id),
      property_code: req.propertyCode,
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking.toJSON());
  })
);

// Extract + validate booking fields from a request body. Shared by create
// and update. `checkPastDate` is only enforced on create (an edit may touch a
// booking whose date has already passed).
function parseBookingBody(body, { checkPastDate }) {
  const data = {};
  for (const key of FIELDS) {
    if (key === 'other_charges') continue;
    data[key] = String(body[key] || '').trim();
  }
  const otherCharges = Array.isArray(body.other_charges)
    ? body.other_charges
    : body.other_charges
    ? [body.other_charges]
    : [];

  const errors = {};
  for (const key of REQUIRED) {
    if (!data[key]) errors[key] = 'This field is required.';
  }
  if (data.email && (!data.email.includes('@') || !data.email.includes('.'))) {
    errors.email = 'Enter a valid email address.';
  }
  if (data.date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const picked = new Date(data.date + 'T00:00:00');
    if (isNaN(picked.getTime())) {
      errors.date = 'Enter a valid date.';
    } else if (checkPastDate && picked < today) {
      errors.date = 'Date cannot be in the past.';
    }
  }
  return { data, otherCharges, errors };
}

app.post(
  '/api/bookings',
  authRequired,
  wrap(async (req, res) => {
    const { data, otherCharges, errors } = parseBookingBody(req.body || {}, {
      checkPastDate: true,
    });
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    const seq = await nextSeq('bookingSeq');
    const booking = await Booking.create({
      ...data,
      property_code: req.propertyCode,
      other_charges: otherCharges.join(', '),
      submitted_by: req.session.adminUsername,
      seq,
      series_no: seriesNo(seq),
      created_at: new Date(),
    });

    // Email the booking PDF to the internal distribution list. Fire-and-forget:
    // a mail failure must not fail the booking, which is already saved.
    sendBookingEmail(booking.toJSON());

    res.status(201).json({ id: booking.seq, series_no: booking.series_no });
  })
);

app.put(
  '/api/bookings/:id',
  authRequired,
  wrap(async (req, res) => {
    const booking = await Booking.findOne({
      seq: Number(req.params.id),
      property_code: req.propertyCode,
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const { data, otherCharges, errors } = parseBookingBody(req.body || {}, {
      checkPastDate: false,
    });
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    Object.assign(booking, data, { other_charges: otherCharges.join(', ') });
    await booking.save();

    res.json({ id: booking.seq, series_no: booking.series_no });
  })
);

// Download the booking as a single-page A4 PDF (same layout that is emailed).
app.get(
  '/api/bookings/:id/pdf',
  authRequired,
  wrap(async (req, res) => {
    const booking = await Booking.findOne({
      seq: Number(req.params.id),
      property_code: req.propertyCode,
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const b = booking.toJSON();
    const pdf = await renderBookingPdf({
      ...b,
      property_name: req.propertyProfile.displayName,
    });
    const series = b.series_no || String(b.seq).padStart(3, '0');
    const fileName = `Booking-${series}-${(b.party_name || 'party')
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 40)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  })
);

// Re-send the PDF email for an existing booking (e.g. if the first send failed).
app.post(
  '/api/bookings/:id/resend',
  authRequired,
  wrap(async (req, res) => {
    const booking = await Booking.findOne({
      seq: Number(req.params.id),
      property_code: req.propertyCode,
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const result = await sendBookingEmail(booking.toJSON());
    if (result.sent) {
      return res.json({ ok: true, recipients: result.recipients });
    }
    res.status(502).json({ ok: false, error: result.reason || 'Email failed' });
  })
);

// Health check / root.
app.get('/', (req, res) => {
  res.json({
    service: 'function-booking-api',
    venues: Object.keys(PROPERTY_PROFILES),
    ok: true,
  });
});

// --- Startup ----------------------------------------------------------------

async function main() {
  const profilesWithoutUsers = Object.entries(PROPERTY_PROFILES)
    .filter(([, profile]) => Object.keys(profile.allowedUsers).length === 0)
    .map(([code]) => code);
  if (profilesWithoutUsers.length) {
    throw new Error(
      `Missing allowed-user environment configuration for: ${profilesWithoutUsers.join(', ')}`
    );
  }

  await mongoose.connect(MONGODB_URI);
  console.log('✓ MongoDB connected');

  // Existing records predate venue scoping and belong to the original
  // Amravati deployment. Tag them once so they remain visible only there.
  await Booking.updateMany(
    { property_code: { $exists: false } },
    { $set: { property_code: 'centre_point_amravati' } }
  );

  const server = http.createServer(app);
  listenWithRetry(server, PORT, () => {
    console.log(`✓ Server running → port ${PORT} (http://localhost:${PORT})`);
    console.log(`  Venue profiles: ${Object.keys(PROPERTY_PROFILES).join(', ')}`);
    console.log(`  Allowing frontend origins: ${[...FRONTEND_ORIGINS].join(', ')}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
