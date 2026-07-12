require('dotenv').config();
const express = require('express');
const path = require('path');
const patterns = require('./rules/patterns');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/check', (req, res) => {
  const triggered = patterns.runChecks(req.body);
  res.json({ triggered });
});

app.listen(port, () => {
  console.log(`Trade Me Listing Checker running on http://localhost:${port}`);
});
