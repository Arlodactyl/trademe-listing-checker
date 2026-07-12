require('dotenv').config();
const express = require('express');
const path = require('path');
const patterns = require('./rules/patterns');

const app = express();
const port = process.env.PORT || 3000;

// a listing is never going to be more than a few KB of text, so cap the body well
// below that to make large-payload requests cheap to reject
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/check', (req, res) => {
  const listing = req.body;

  // req.body can be anything a client sends, guard against arrays/null/non-objects
  // before rules start reading properties off it
  if (!listing || typeof listing !== 'object' || Array.isArray(listing)) {
    return res.status(400).json({ error: 'listing must be a JSON object' });
  }

  const triggered = patterns.runChecks(listing);
  res.json({ triggered });
});

// keep error details out of the response, log server-side and send a generic message
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.type === 'entity.too.large' ? 413 : 400;
  res.status(status).json({ error: 'could not process request' });
});

app.listen(port, () => {
  console.log(`Trade Me Listing Checker running on http://localhost:${port}`);
});
