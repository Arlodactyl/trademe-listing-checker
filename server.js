require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/check', (req, res) => {
  // patterns.js and the Haiku fallback get wired up here next
  res.json({ received: req.body });
});

app.listen(port, () => {
  console.log(`Trade Me Listing Checker running on http://localhost:${port}`);
});
