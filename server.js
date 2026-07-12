require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const patterns = require('./rules/patterns');
const haiku = require('./services/haiku');

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

// bounds how often any one IP can trigger a check, which matters because a check
// can end up calling the paid Haiku API. generous enough for someone testing a
// handful of listings, tight enough that a spam loop doesn't run up a bill
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
  // before rules start reading properties off it
  if (!listing || typeof listing !== 'object' || Array.isArray(listing)) {
    return res.status(400).json({ error: 'listing must be a JSON object' });
  }

  const triggered = patterns.runChecks(listing);

  // a high severity hit from the free rules is already a confident result, no need
  // to spend a Haiku call on it. anything less than that is where the rules are
  // guessing, and that's exactly the case Haiku is there for
  const hasHighSeverity = triggered.some((result) => result.severity === 'high');
  const haikuResult = hasHighSeverity ? null : await haiku.assessListing(listing);

  res.json({
    riskLevel: patterns.computeRiskLevel(triggered, haikuResult?.concernLevel),
    triggered,
    haiku: haikuResult,
  });
});

// keep error details out of the response, log server-side and send a generic message
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.type === 'entity.too.large' ? 413 : 400;
  res.status(status).json({ error: 'could not process request' });
});

app.listen(port, host, () => {
  console.log(`Trade Me Listing Checker running on http://${host}:${port}`);
});
