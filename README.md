# Trade Me Listing Checker

A small tool for NZ buyers to sanity-check a Trade Me listing before they bid or buy. Paste in the title, description, price, category, and (optionally) the seller's feedback stats, and it flags patterns commonly associated with counterfeit goods or scam listings.

It works in two stages. A free, local pattern-matching pass runs first and catches the obvious stuff: language that hedges around brand names ("compatible with", "inspired by", "generic"), vague sourcing ("overseas warehouse", "direct import" with no mention of condition or local stock), thin or templated descriptions, and seller feedback that doesn't match the price of the item (new account, low review count, high-value listing). If the pattern rules come back inconclusive, the listing text is sent to Claude Haiku with a narrow, factual prompt asking it to point out anything specific and grounded in the text — no speculation beyond what's actually written.

The result is a risk level (low / medium / high), which rules triggered and why, and Haiku's notes when it was called in.

## Why

Trade Me doesn't do this kind of check itself, and the tells for a dodgy listing are pattern-based enough that most of them don't need an LLM call at all. Keeping the pattern matching local and free, and only reaching for Haiku on ambiguous cases, keeps the tool cheap to run and fast for the common case.

## Stack

Node.js and Express on the backend, a plain HTML/CSS/JS frontend, no framework. The Anthropic API key lives in `.env` and is never touched by the frontend.

## Running it locally

```
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm start
```

Then open `http://localhost:3000`.

## Project layout

```
server.js          Express app, handles the /api/check endpoint
rules/patterns.js   the pattern-matching rules
public/             frontend (index.html, style.css, script.js)
```

## Status

Early stages — the server and frontend shell are up, the pattern rules are being built out one at a time, and the Haiku fallback isn't wired in yet.
