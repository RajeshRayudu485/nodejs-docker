/**
 * CineBook — movie ticket booking
 * Single-file Node.js app (no external dependencies).
 *
 * Run:   node index.js
 * Open:  http://localhost
 *
 * Port 80 needs root on Linux/macOS:  sudo node index.js
 * (If 80 is taken or blocked, it automatically falls back to 3000.)
 */

'use strict';

const http = require('http');

const PORT = Number(process.env.PORT) || 80;
const FALLBACK_PORT = 3000;
const MAX_SEATS_PER_BOOKING = 10;

/* ------------------------------------------------------------------ *
 *  DATA  (in-memory — swap for a DB whenever you like)
 * ------------------------------------------------------------------ */

const ROWS = ['A', 'B', 'C', 'D', 'E'];
const SEATS_PER_ROW = 12;
const TOTAL_SEATS = ROWS.length * SEATS_PER_ROW; // 60

/** Deterministic pseudo-random so seat maps are stable per show. */
function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Build a seat map: { A1: 'available' | 'booked', ... } */
function buildSeats(bookedCount, seed) {
  const seats = {};
  ROWS.forEach(function (row) {
    for (let i = 1; i <= SEATS_PER_ROW; i++) seats[row + i] = 'available';
  });

  const ids = Object.keys(seats);
  const rand = makeRandom(seed);
  const count = Math.min(bookedCount, ids.length);

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rand() * ids.length);
    seats[ids[idx]] = 'booked';
    ids.splice(idx, 1);
  }
  return seats;
}

/** Show factory keeps ids globally unique across every movie. */
function makeShow(movieId, n, time, screen, price, booked, seed) {
  return {
    id: movieId + '-s' + n,
    time: time,
    screen: screen,
    price: price,
    seats: buildSeats(booked, seed)
  };
}

const MOVIES = [
  {
    id: 'm1',
    title: 'Neon Horizon',
    emoji: '\uD83D\uDE80',
    genre: 'Sci-Fi \u2022 Action',
    duration: 142,
    rating: 8.7,
    accent: '#7c5cff',
    shows: [
      makeShow('m1', 1, '10:30 AM', 'Screen 1', 180, 22, 101),
      makeShow('m1', 2, '01:45 PM', 'Screen 1', 180, 8, 102),
      makeShow('m1', 3, '06:15 PM', 'Screen 2', 220, 41, 103),
      makeShow('m1', 4, '09:50 PM', 'Screen 2', 220, 55, 104)
    ]
  },
  {
    id: 'm2',
    title: 'Midnight in Bandra',
    emoji: '\uD83C\uDF03',
    genre: 'Romance \u2022 Drama',
    duration: 128,
    rating: 7.9,
    accent: '#ff5c8a',
    shows: [
      makeShow('m2', 1, '11:00 AM', 'Screen 3', 150, 12, 201),
      makeShow('m2', 2, '03:30 PM', 'Screen 3', 150, 30, 202),
      makeShow('m2', 3, '08:00 PM', 'Screen 1', 200, 60, 203),
      makeShow('m2', 4, '10:45 PM', 'Screen 3', 170, 5, 204)
    ]
  },
  {
    id: 'm3',
    title: 'The Last Chaiwala',
    emoji: '\u2615',
    genre: 'Comedy \u2022 Family',
    duration: 116,
    rating: 8.2,
    accent: '#ffb020',
    shows: [
      makeShow('m3', 1, '09:45 AM', 'Screen 2', 140, 4, 301),
      makeShow('m3', 2, '12:30 PM', 'Screen 4', 140, 19, 302),
      makeShow('m3', 3, '05:00 PM', 'Screen 4', 190, 27, 303),
      makeShow('m3', 4, '09:15 PM', 'Screen 4', 190, 47, 304)
    ]
  },
  {
    id: 'm4',
    title: 'Shadow Protocol',
    emoji: '\uD83D\uDD75\uFE0F',
    genre: 'Thriller \u2022 Mystery',
    duration: 134,
    rating: 8.5,
    accent: '#3ddc97',
    shows: [
      makeShow('m4', 1, '10:00 AM', 'Screen 5', 200, 15, 401),
      makeShow('m4', 2, '01:15 PM', 'Screen 5', 200, 36, 402),
      makeShow('m4', 3, '07:30 PM', 'Screen 5', 240, 52, 403),
      makeShow('m4', 4, '11:00 PM', 'Screen 5', 240, 9, 404)
    ]
  }
];

const issuedBookingIds = new Set();

/* ------------------------------------------------------------------ *
 *  HELPERS
 * ------------------------------------------------------------------ */

function countAvailable(show) {
  let n = 0;
  for (const id in show.seats) {
    if (show.seats[id] === 'available') n++;
  }
  return n;
}

function findShow(showId) {
  for (const movie of MOVIES) {
    for (const show of movie.shows) {
      if (show.id === showId) return { movie: movie, show: show };
    }
  }
  return null;
}

function listMovies() {
  return MOVIES.map(function (m) {
    return {
      id: m.id,
      title: m.title,
      emoji: m.emoji,
      genre: m.genre,
      duration: m.duration,
      rating: m.rating,
      accent: m.accent,
      shows: m.shows.map(function (s) {
        return {
          id: s.id,
          time: s.time,
          screen: s.screen,
          price: s.price,
          total: TOTAL_SEATS,
          available: countAvailable(s)
        };
      })
    };
  });
}

function newBookingId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id;
  do {
    id = 'CB-';
    for (let i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (issuedBookingIds.has(id));
  issuedBookingIds.add(id);
  return id;
}

/* ------------------------------------------------------------------ *
 *  HTTP PLUMBING
 * ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store'
  });
  res.end(html);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let raw = '';
    let size = 0;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', function () {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ *
 *  API HANDLERS
 * ------------------------------------------------------------------ */

function handleGetShow(res, showId) {
  const found = findShow(showId);
  if (!found) return sendJson(res, 404, { error: 'Show not found' });

  sendJson(res, 200, {
    id: found.show.id,
    time: found.show.time,
    screen: found.show.screen,
    price: found.show.price,
    seats: found.show.seats
  });
}

function handleBook(req, res) {
  readBody(req)
    .then(function (body) {
      const showId = body && body.showId;
      const seats = body && body.seats;

      if (!showId || typeof showId !== 'string') {
        return sendJson(res, 400, { error: 'showId is required' });
      }
      if (!Array.isArray(seats) || seats.length === 0) {
        return sendJson(res, 400, { error: 'Pick at least one seat' });
      }
      if (seats.length > MAX_SEATS_PER_BOOKING) {
        return sendJson(res, 400, {
          error: 'Maximum ' + MAX_SEATS_PER_BOOKING + ' seats per booking'
        });
      }

      const found = findShow(showId);
      if (!found) return sendJson(res, 404, { error: 'Show not found' });

      // Normalise + de-duplicate
      const wanted = Array.from(new Set(seats.map(String)));

      // Validate every seat before mutating anything
      for (const id of wanted) {
        if (!Object.prototype.hasOwnProperty.call(found.show.seats, id)) {
          return sendJson(res, 400, { error: 'Seat ' + id + ' does not exist' });
        }
        if (found.show.seats[id] !== 'available') {
          return sendJson(res, 409, { error: 'Seat ' + id + ' was just taken' });
        }
      }

      // Commit
      wanted.forEach(function (id) {
        found.show.seats[id] = 'booked';
      });

      const booking = {
        id: newBookingId(),
        movie: found.movie.title,
        time: found.show.time,
        screen: found.show.screen,
        seats: wanted,
        amount: wanted.length * found.show.price,
        createdAt: new Date().toISOString()
      };

      console.log(
        '[booked] ' + booking.id + ' | ' + booking.movie + ' | ' +
        booking.time + ' | ' + booking.seats.join(', ') + ' | Rs.' + booking.amount
      );

      sendJson(res, 201, { ok: true, booking: booking });
    })
    .catch(function (err) {
      sendJson(res, 400, { error: err.message || 'Bad request' });
    });
}

/* ------------------------------------------------------------------ *
 *  ROUTER
 * ------------------------------------------------------------------ */

const server = http.createServer(function (req, res) {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (e) {
    return sendJson(res, 400, { error: 'Bad URL' });
  }

  // Home page
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return sendHtml(res, PAGE);
  }

  // Favicon (keeps the console quiet)
  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }

  // GET /api/movies
  if (req.method === 'GET' && pathname === '/api/movies') {
    return sendJson(res, 200, listMovies());
  }

  // GET /api/shows/:id
  if (req.method === 'GET' && pathname.indexOf('/api/shows/') === 0) {
    const showId = decodeURIComponent(pathname.slice('/api/shows/'.length));
    return handleGetShow(res, showId);
  }

  // POST /api/book
  if (req.method === 'POST' && pathname === '/api/book') {
    return handleBook(req, res);
  }

  // Health check
  if (pathname === '/health') {
    return sendJson(res, 200, { ok: true, uptime: process.uptime() });
  }

  sendJson(res, 404, { error: 'Not found' });
});

/* ------------------------------------------------------------------ *
 *  LISTEN (with graceful port fallback)
 * ------------------------------------------------------------------ */

function listen(port, isFallback) {
  server.once('error', function (err) {
    if (!isFallback && (err.code === 'EACCES' || err.code === 'EADDRINUSE')) {
      console.warn(
        '\n  Could not bind port ' + port + ' (' + err.code + ').' +
        '\n  Tip: sudo node index.js  — or use PORT=3000' +
        '\n  Falling back to port ' + FALLBACK_PORT + '...\n'
      );
      setTimeout(function () { listen(FALLBACK_PORT, true); }, 100);
      return;
    }
    console.error('Server error:', err.message);
    process.exit(1);
  });

  server.listen(port, function () {
    const actual = server.address().port;
    console.log('');
    console.log('  \uD83C\uDFAC  CineBook is running');
    console.log('  \u2192  http://localhost' + (actual === 80 ? '' : ':' + actual));
    console.log('');
    console.log('  API:  GET  /api/movies');
    console.log('        GET  /api/shows/:showId');
    console.log('        POST /api/book   { showId, seats: [] }');
    console.log('');
  });
}

listen(PORT, false);

/* ------------------------------------------------------------------ *
 *  FRONT-END (served from memory)
 * ------------------------------------------------------------------ */

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0a0c16">
<title>CineBook — Movie Tickets</title>
<style>
  :root{
    --bg:#0a0c16;
    --card:#151932;
    --card-2:#1b2040;
    --line:rgba(255,255,255,.09);
    --text:#eef1f8;
    --muted:#8e97b5;
    --accent:#7c5cff;
    --green:#3ddc97;
    --red:#ff5c7a;
    --radius:18px;
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html{scroll-behavior:smooth}
  body{
    margin:0;min-height:100vh;padding-bottom:140px;
    color:var(--text);
    font-family:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",sans-serif;
    background:
      radial-gradient(1100px 520px at 12% -12%, #1e2144 0%, transparent 62%),
      radial-gradient(900px 480px at 102% -6%, #2a1b46 0%, transparent 58%),
      var(--bg);
  }
  .hidden{display:none !important}
  .muted{color:var(--muted)}

  .topbar{
    position:sticky;top:0;z-index:40;
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:14px 18px;
    background:rgba(10,12,22,.72);
    backdrop-filter:blur(14px);
    -webkit-backdrop-filter:blur(14px);
    border-bottom:1px solid var(--line);
  }
  .brand{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:800;letter-spacing:-.2px}
  .brand .logo{
    display:grid;place-items:center;width:36px;height:36px;border-radius:11px;font-size:18px;
    background:linear-gradient(135deg,var(--accent),#4dabf7);
    box-shadow:0 8px 22px -10px var(--accent);
  }
  .brand span{color:var(--accent)}
  .tag{
    font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
    color:var(--green);border:1px solid rgba(61,220,151,.35);
    background:rgba(61,220,151,.08);padding:6px 12px;border-radius:999px;white-space:nowrap;
  }
  .tag::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;
    background:var(--green);margin-right:7px;vertical-align:middle;animation:pulse 1.6s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}

  .wrap{max-width:1180px;margin:0 auto;padding:26px 18px 0}
  .step{margin-bottom:38px;scroll-margin-top:82px}
  .step-title{
    display:flex;align-items:center;gap:11px;
    font-size:15px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
    color:var(--muted);margin:0 0 18px;
  }
  .step-title .num{
    display:grid;place-items:center;width:26px;height:26px;border-radius:9px;
    font-size:12px;font-weight:800;color:#fff;
    background:linear-gradient(135deg,var(--accent),#4dabf7);
  }

  .movies{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:16px}
  .movie{
    display:flex;gap:15px;align-items:center;cursor:pointer;
    padding:16px;border-radius:var(--radius);
    background:linear-gradient(160deg,var(--card),var(--card-2));
    border:1px solid var(--line);
    transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
    animation:rise .42s backwards;
  }
  @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  .movie:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.2);
    box-shadow:0 18px 34px -22px #000}
  .movie.active{
    border-color:var(--accent);
    box-shadow:0 0 0 1px var(--accent),0 18px 40px -24px var(--accent);
  }
  .poster{
    flex:0 0 66px;height:66px;border-radius:15px;display:grid;place-items:center;
    font-size:30px;background:rgba(255,255,255,.06);
    border:1px solid var(--line);
  }
  .movie .body{min-width:0;flex:1}
  .movie h3{margin:0 0 4px;font-size:15.5px;font-weight:700;letter-spacing:-.2px}
  .movie .meta{margin:0 0 9px;font-size:12.5px;color:var(--muted);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .badges{display:flex;flex-wrap:wrap;gap:6px}
  .badge{
    font-size:11px;font-weight:700;padding:4px 9px;border-radius:8px;
    background:rgba(255,255,255,.07);color:#cfd5ea;
  }
  .badge.rating{background:rgba(255,196,0,.13);color:#ffc400}
  .badge.ghost{background:transparent;border:1px solid var(--line);color:var(--muted)}

  .shows{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px}
  .show{
    display:flex;flex-direction:column;gap:5px;text-align:left;cursor:pointer;
    padding:15px;border-radius:15px;font-family:inherit;color:var(--text);
    background:var(--card);border:1px solid var(--line);
    transition:transform .16s,border-color .16s,background .16s;
  }
  .show:hover:not(:disabled){transform:translateY(-2px);border-color:rgba(255,255,255,.22)}
  .show.active{border-color:var(--accent);background:linear-gradient(160deg,#1d2145,#242a55);
    box-shadow:0 0 0 1px var(--accent)}
  .show:disabled{opacity:.4;cursor:not-allowed}
  .show-time{font-size:16px;font-weight:800;letter-spacing:-.3px}
  .show-screen{font-size:11.5px;color:var(--muted)}
  .show-seats{font-size:11.5px;font-weight:700;color:var(--green)}
  .show-seats.low{color:#ffc400}
  .show-seats.full{color:var(--red)}
  .show-price{font-size:12.5px;font-weight:800;color:var(--accent);margin-top:2px}

  .screen-wrap{display:flex;justify-content:center;margin-bottom:26px}
  .screen{
    width:min(620px,86%);height:38px;border-radius:8px;
    display:grid;place-items:center;
    font-size:10px;font-weight:800;letter-spacing:.5em;text-transform:uppercase;
    color:#cdd3ff;
    background:linear-gradient(180deg,rgba(124,92,255,.6),rgba(124,92,255,.03));
    box-shadow:0 0 48px rgba(124,92,255,.35);
    transform:perspective(340px) rotateX(-7deg);
  }
  .seatmap{
    display:flex;flex-direction:column;gap:9px;
    padding:20px 18px;border-radius:var(--radius);
    background:var(--card);border:1px solid var(--line);
    overflow-x:auto;
  }
  .row{display:flex;align-items:center;gap:10px;min-width:470px}
  .rowlabel{width:14px;text-align:center;font-size:11px;font-weight:800;color:var(--muted)}
  .seats{flex:1;display:grid;grid-template-columns:repeat(12,1fr);gap:7px}
  .seat{
    aspect-ratio:1/1;padding:0;cursor:pointer;font-family:inherit;
    font-size:10.5px;font-weight:700;color:var(--muted);
    border-radius:8px 8px 4px 4px;
    border:1px solid rgba(255,255,255,.17);
    background:rgba(255,255,255,.045);
    transition:transform .13s,background .13s,border-color .13s,color .13s;
  }
  .seat:hover:not(:disabled){transform:translateY(-3px);border-color:var(--accent);color:var(--text)}
  .seat.selected{
    background:var(--accent);border-color:var(--accent);color:#fff;
    box-shadow:0 8px 18px -8px var(--accent);
  }
  .seat.booked{
    cursor:not-allowed;color:rgba(255,255,255,.14);
    background:rgba(255,255,255,.025);border-color:transparent;
  }
  .legend{display:flex;flex-wrap:wrap;gap:20px;margin-top:18px;
    font-size:12.5px;color:var(--muted);justify-content:center}
  .legend i{display:inline-block;width:14px;height:14px;border-radius:5px;
    margin-right:7px;vertical-align:-2px;border:1px solid rgba(255,255,255,.17);
    background:rgba(255,255,255,.045)}
  .legend .l-sel i{background:var(--accent);border-color:var(--accent)}
  .legend .l-book i{background:rgba(255,255,255,.025);border-color:transparent}

  .bar{
    position:fixed;left:0;right:0;bottom:0;z-index:60;
    background:rgba(13,16,32,.92);
    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
    border-top:1px solid var(--line);
    animation:slideUp .28s ease;
  }
  @keyframes slideUp{from{transform:translateY(100%)}to{transform:none}}
  .bar-inner{
    max-width:1180px;margin:0 auto;padding:13px 18px;
    display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
  }
  .bar-info{min-width:0;flex:1}
  .bar-title{font-size:14px;font-weight:700}
  .bar-sub{font-size:12px;color:var(--muted);margin-top:3px;max-width:60ch;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar-right{display:flex;align-items:center;gap:18px;margin-left:auto}
  .bar-total{font-size:20px;font-weight:800;letter-spacing:-.5px}
  .btn{
    border:0;border-radius:13px;padding:13px 26px;cursor:pointer;font-family:inherit;
    font-size:14px;font-weight:800;color:#fff;letter-spacing:.2px;
    background:linear-gradient(135deg,var(--accent),#4dabf7);
    transition:transform .16s,box-shadow .16s,opacity .16s;
  }
  .btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 14px 26px -12px var(--accent)}
  .btn:disabled{opacity:.4;cursor:not-allowed}

  .overlay{
    position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:20px;
    background:rgba(5,7,14,.72);backdrop-filter:blur(6px);
    animation:fade .2s ease;
  }
  @keyframes fade{from{opacity:0}to{opacity:1}}
  .ticket{
    width:min(400px,100%);border-radius:22px;overflow:hidden;
    background:linear-gradient(165deg,#1a1f3e,#141830);
    border:1px solid rgba(255,255,255,.13);
    box-shadow:0 40px 80px -30px #000;
    animation:pop .28s cubic-bezier(.2,1.3,.5,1);
  }
  @keyframes pop{from{transform:scale(.9);opacity:0}to{transform:none}}
  .ticket-top{
    padding:26px 22px 20px;text-align:center;
    background:linear-gradient(135deg,rgba(61,220,151,.16),rgba(124,92,255,.16));
    border-bottom:1px dashed rgba(255,255,255,.16);
  }
  .ticket-top .tick{font-size:38px;line-height:1}
  .ticket-top h3{margin:10px 0 6px;font-size:19px}
  .ticket-top p{margin:0;font-size:12.5px}
  .ticket-body{padding:18px 22px 6px}
  .trow{display:flex;justify-content:space-between;gap:14px;padding:11px 0;
    font-size:13.5px;border-bottom:1px solid var(--line)}
  .trow:last-child{border-bottom:0}
  .trow span{color:var(--muted)}
  .ticket .btn{display:block;width:calc(100% - 44px);margin:14px 22px 22px}

  .toast{
    position:fixed;left:50%;bottom:130px;z-index:95;
    transform:translate(-50%,16px);opacity:0;pointer-events:none;
    padding:12px 20px;border-radius:13px;font-size:13.5px;font-weight:600;
    background:#1e2340;border:1px solid var(--line);
    box-shadow:0 20px 40px -20px #000;
    transition:opacity .25s,transform .25s;
  }
  .toast.show{opacity:1;transform:translate(-50%,0)}
  .toast.err{border-color:var(--red);color:#ffd7de}

  @media (max-width:760px){
    .wrap{padding:20px 14px 0}
    .step{margin-bottom:30px}
    .movies{grid-template-columns:1fr}
    .shows{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
    .bar-sub{max-width:34ch}
    .bar-total{font-size:17px}
    .btn{padding:12px 20px;font-size:13.5px}
    .seatmap{padding:16px 12px}
    .seat{font-size:9.5px}
    .tag{display:none}
    .toast{bottom:150px;width:calc(100% - 28px);text-align:center}
  }
  @media (max-width:420px){
    .poster{flex-basis:56px;height:56px;font-size:25px}
    .show-time{font-size:15px}
    .bar-inner{padding:11px 14px;gap:10px}
  }
</style>
</head>
<body>

<header class="topbar">
  <div class="brand"><span class="logo">\uD83C\uDFAC</span>Cine<span>Book</span></div>
  <div class="tag">Live seat availability</div>
</header>

<main class="wrap">

  <section class="step" id="step-movie">
    <h2 class="step-title"><span class="num">1</span> Choose a movie</h2>
    <div class="movies" id="movies"></div>
  </section>

  <section class="step hidden" id="step-show">
    <h2 class="step-title"><span class="num">2</span> Pick a showtime</h2>
    <div class="shows" id="shows"></div>
  </section>

  <section class="step hidden" id="step-seats">
    <h2 class="step-title"><span class="num">3</span> Select your seats</h2>
    <div class="screen-wrap"><div class="screen">Screen</div></div>
    <div class="seatmap" id="seatmap"></div>
    <div class="legend">
      <span><i></i>Available</span>
      <span class="l-sel"><i></i>Selected</span>
      <span class="l-book"><i></i>Booked</span>
    </div>
  </section>

</main>

<div class="bar hidden" id="bar">
  <div class="bar-inner">
    <div class="bar-info">
      <div class="bar-title" id="barTitle">&mdash;</div>
      <div class="bar-sub" id="barSub">No seats selected yet</div>
    </div>
    <div class="bar-right">
      <div class="bar-total" id="barTotal">\u20B90</div>
      <button class="btn" id="bookBtn" disabled>Book tickets</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  var MAX = 10;
  var state = { movies: [], movie: null, show: null, selected: new Set() };

  function money(n) { return "\u20B9" + Number(n).toLocaleString("en-IN"); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function seatNum(id) { return parseInt(id.slice(1), 10); }

  function sortSeats(a, b) {
    return a.charAt(0).localeCompare(b.charAt(0)) || seatNum(a) - seatNum(b);
  }

  function toast(msg, isErr) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("err", !!isErr);
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }

  /* ---------- movies ---------- */

  function loadMovies() {
    fetch("/api/movies")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.movies = data;
        renderMovies();
      })
      .catch(function () { toast("Could not load movies", true); });
  }

  function renderMovies() {
    var wrap = $("#movies");
    wrap.innerHTML = "";

    state.movies.forEach(function (m, i) {
      var minPrice = Math.min.apply(null, m.shows.map(function (s) { return s.price; }));

      var card = document.createElement("article");
      card.className = "movie";
      card.style.animationDelay = (i * 55) + "ms";
      card.innerHTML =
        '<div class="poster">' + m.emoji + '</div>' +
        '<div class="body">' +
          '<h3>' + esc(m.title) + '</h3>' +
          '<p class="meta">' + esc(m.genre) + ' \u2022 ' + m.duration + ' min</p>' +
          '<div class="badges">' +
            '<span class="badge rating">\u2605 ' + m.rating + '</span>' +
            '<span class="badge ghost">' + m.shows.length + ' shows</span>' +
            '<span class="badge ghost">from ' + money(minPrice) + '</span>' +
          '</div>' +
        '</div>';

      card.addEventListener("click", function () { selectMovie(m, card); });
      wrap.appendChild(card);
    });
  }

  function selectMovie(movie, card) {
    state.movie = movie;
    state.show = null;
    state.selected.clear();

    Array.prototype.forEach.call(document.querySelectorAll(".movie"), function (c) {
      c.classList.remove("active");
    });
    card.classList.add("active");

    document.documentElement.style.setProperty("--accent", movie.accent);

    renderShows();
    $("#step-show").classList.remove("hidden");
    $("#step-seats").classList.add("hidden");
    updateBar();

    $("#step-show").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- showtimes ---------- */

  function renderShows() {
    var wrap = $("#shows");
    wrap.innerHTML = "";

    state.movie.shows.forEach(function (s) {
      var cls = "show-seats";
      if (s.available === 0) cls += " full";
      else if (s.available <= 12) cls += " low";

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "show";
      btn.dataset.id = s.id;
      btn.disabled = s.available === 0;
      btn.innerHTML =
        '<span class="show-time">' + esc(s.time) + '</span>' +
        '<span class="show-screen">' + esc(s.screen) + '</span>' +
        '<span class="' + cls + '">' +
          (s.available === 0 ? 'Housefull' : s.available + ' / ' + s.total + ' seats') +
        '</span>' +
        '<span class="show-price">' + money(s.price) + ' per seat</span>';

      btn.addEventListener("click", function () { selectShow(s, btn); });
      wrap.appendChild(btn);
    });
  }

  function selectShow(show, btn) {
    Array.prototype.forEach.call(document.querySelectorAll(".show"), function (b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");

    fetch("/api/shows/" + encodeURIComponent(show.id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.show = data;
        state.selected.clear();
        renderSeatmap();
        $("#step-seats").classList.remove("hidden");
        updateBar();
        $("#step-seats").scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(function () { toast("Could not load seats", true); });
  }

  /* ---------- seat map ---------- */

  function renderSeatmap() {
    var wrap = $("#seatmap");
    wrap.innerHTML = "";
    wrap.style.setProperty("--accent", state.movie.accent);

    var byRow = {};
    Object.keys(state.show.seats).forEach(function (id) {
      var r = id.charAt(0);
      if (!byRow[r]) byRow[r] = [];
      byRow[r].push({ id: id, status: state.show.seats[id] });
    });

    Object.keys(byRow).sort().forEach(function (rowName) {
      byRow[rowName].sort(function (a, b) { return seatNum(a.id) - seatNum(b.id); });

      var row = document.createElement("div");
      row.className = "row";

      var left = document.createElement("span");
      left.className = "rowlabel";
      left.textContent = rowName;
      row.appendChild(left);

      var seats = document.createElement("div");
      seats.className = "seats";

      byRow[rowName].forEach(function (s) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "seat " + s.status;
        b.dataset.seat = s.id;
        b.textContent = seatNum(s.id);
        b.title = s.id + " \u2022 " + s.status;

        if (s.status === "available") {
          b.addEventListener("click", function () { toggleSeat(s.id, b); });
        } else {
          b.disabled = true;
        }
        seats.appendChild(b);
      });

      row.appendChild(seats);

      var right = document.createElement("span");
      right.className = "rowlabel";
      right.textContent = rowName;
      row.appendChild(right);

      wrap.appendChild(row);
    });
  }

  function toggleSeat(id, btn) {
    if (state.selected.has(id)) {
      state.selected.delete(id);
      btn.classList.remove("selected");
    } else {
      if (state.selected.size >= MAX) {
        toast("You can book up to " + MAX + " seats at once", true);
        return;
      }
      state.selected.add(id);
      btn.classList.add("selected");
    }
    updateBar();
  }

  /* ---------- sticky bar ---------- */

  function updateBar() {
    var bar = $("#bar");
    if (!state.show) { bar.classList.add("hidden"); return; }

    bar.classList.remove("hidden");

    var seats = Array.from(state.selected).sort(sortSeats);
    var total = seats.length * state.show.price;

    $("#barTitle").textContent =
      state.movie.title + " \u2022 " + state.show.time + " \u2022 " + state.show.screen;

    $("#barSub").textContent = seats.length
      ? seats.length + " seat" + (seats.length > 1 ? "s" : "") + ": " + seats.join(", ")
      : "No seats selected yet";

    $("#barTotal").textContent = money(total);
    $("#bookBtn").disabled = seats.length === 0;
  }

  /* ---------- booking ---------- */

  function book() {
    var btn = $("#bookBtn");
    var seats = Array.from(state.selected).sort(sortSeats);
    if (!seats.length) return;

    btn.disabled = true;
    btn.textContent = "Booking\u2026";

    fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showId: state.show.id, seats: seats })
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || "Booking failed");
          return data;
        });
      })
      .then(function (data) {
        state.selected.clear();
        showTicket(data.booking);
        return refresh();
      })
      .catch(function (err) { toast(err.message, true); })
      .finally(function () {
        btn.textContent = "Book tickets";
        btn.disabled = state.selected.size === 0;
      });
  }

  function refresh() {
    var showId = state.show.id;

    return fetch("/api/shows/" + encodeURIComponent(showId))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.show = data;
        renderSeatmap();
        updateBar();
      })
      .then(function () { return fetch("/api/movies"); })
      .then(function (r) { return r.json(); })
      .then(function (movies) {
        state.movies = movies;
        state.movie = movies.filter(function (m) {
          return m.id === state.movie.id;
        })[0] || state.movie;

        renderShows();
        Array.prototype.forEach.call(document.querySelectorAll(".show"), function (b) {
          if (b.dataset.id === showId) b.classList.add("active");
        });
      });
  }

  /* ---------- ticket modal ---------- */

  function showTicket(b) {
    var overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML =
      '<div class="ticket">' +
        '<div class="ticket-top">' +
          '<div class="tick">\uD83C\uDF9F\uFE0F</div>' +
          '<h3>Booking confirmed</h3>' +
          '<p class="muted">' + esc(b.movie) + ' \u2022 ' + esc(b.time) +
            ' \u2022 ' + esc(b.screen) + '</p>' +
        '</div>' +
        '<div class="ticket-body">' +
          '<div class="trow"><span>Booking ID</span><b>' + esc(b.id) + '</b></div>' +
          '<div class="trow"><span>Seats (' + b.seats.length + ')</span><b>' +
            esc(b.seats.join(", ")) + '</b></div>' +
          '<div class="trow"><span>Total paid</span><b>' + money(b.amount) + '</b></div>' +
        '</div>' +
        '<button class="btn" id="closeTicket">Done</button>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector("#closeTicket").addEventListener("click", function () {
      overlay.remove();
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  /* ---------- init ---------- */

  $("#bookBtn").addEventListener("click", book);
  loadMovies();
})();
</script>
</body>
</html>
`;
