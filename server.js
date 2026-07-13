require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { checkListing } = require('./services/checkListing');
const { importListing } = require('./services/tradeMeImport');
const haiku = require('./services/haiku');

// a genuinely unexpected error (not an Express route rejection, something
// truly uncaught, a timer callback, an event handler) would otherwise crash
// the whole process and take every other in-flight request down with it.
// log it and keep running instead, one bad request shouldn't kill the server
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

const app = express();
const port = process.env.PORT || 3000;

// this is a portfolio project, not a live service, so it binds to localhost only
// unless someone deliberately opts into exposing it. that keeps a paid API call
// from ever being reachable by anyone but you without a conscious decision to change it
const host = process.env.HOST || '127.0.0.1';

// a listing is never going to be more than a few KB of text, so cap the body well
// below that to make large-payload requests cheap to reject
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// nothing fancy, just enough visibility to see what's hitting the server and how
// long it took, which matters once a route is calling out to an external API
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// bounds how often any one IP can trigger a check, which matters because a check
// can end up calling the paid Haiku API. generous enough for someone testing a
// handful of listings, tight enough that a spam loop doesn't run up a bill.
// this counter lives in memory, so it only works as intended while this runs as
// a single process, if this ever ran as multiple instances behind a load balancer
// each one would count separately and the effective limit would multiply
const checkLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many checks from this address, try again later' },
});

app.post('/api/check', checkLimiter, async (req, res) => {
  const listing = req.body;

  // req.body can be anything a client sends, guard against arrays/null/non-objects
  // before the rules start reading properties off it
  if (!listing || typeof listing !== 'object' || Array.isArray(listing)) {
    return res.status(400).json({ error: 'listing must be a JSON object' });
  }

  const result = await checkListing(listing);
  res.json(result);
});

// each import launches a real headless browser, which is far more expensive than
// a normal request, so this gets a much tighter limit than /api/check
const importLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many imports from this address, try again later' },
});

app.post('/api/import', importLimiter, async (req, res) => {
  const url = req.body?.url;

  if (typeof url !== 'string' || !url) {
    return res.status(400).json({ error: 'a listing url is required' });
  }

  const result = await importListing(url);

  if (result.error) {
    return res.status(422).json({ error: result.error });
  }

  res.json(result);
});

// keep error details out of the response and log them server-side instead.
// entity.too.large and entity.parse.failed come from express.json() rejecting a
// bad request body, anything else reaching here is an actual bug, not the
// client's fault, so it gets a 500 rather than being lumped in as a 400
app.use((err, req, res, next) => {
  console.error(err);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'listing is too large' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'could not parse request body as JSON' });
  }
  res.status(500).json({ error: 'something went wrong processing that request' });
});

app.listen(port, host, () => {
  console.log(`Trade Me Listing Checker running on http://${host}:${port}`);
  if (!haiku.isConfigured()) {
    console.warn('ANTHROPIC_API_KEY is not set, the Haiku fallback will be skipped on every check');
  }
});
