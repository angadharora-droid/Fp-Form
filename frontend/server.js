/**
 * Function Booking — Frontend static server.
 *
 * Serves the UI (index.html, app.js, style.css) as a standalone server,
 * separate from the backend API. The UI calls the backend API cross-origin
 * (see API_BASE in app.js); the backend enables CORS for this origin.
 */

const path = require('path');
const http = require('http');
const express = require('express');

const PORT = process.env.FRONTEND_PORT || 5173;

const app = express();
app.use(express.static(__dirname));

// SPA fallback: any non-file route returns index.html (for hash routing this
// is mostly a safety net).
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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

const server = http.createServer(app);
listenWithRetry(server, PORT, () => {
  console.log(`Function Booking frontend running at http://localhost:${PORT}`);
});
