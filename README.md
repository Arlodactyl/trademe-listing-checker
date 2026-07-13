# Trade Me Listing Checker

A small tool for NZ buyers to sanity-check a Trade Me listing before they bid or buy. Paste in the title, description, price, category, and (optionally) the seller's feedback stats, and it flags patterns commonly associated with counterfeit goods or scam listings.

It works in two stages. A free, local pattern-matching pass runs first and catches the obvious stuff: language that hedges around brand names ("compatible with", "inspired by", "generic"), vague sourcing ("overseas warehouse", "direct import" with no mention of condition or local stock), thin or templated descriptions, and seller feedback that doesn't match the price of the item (new account, low review count, high-value listing). If the pattern rules come back inconclusive, the listing text is sent to Claude Haiku with a narrow, factual prompt asking it to point out anything specific and grounded in the text, with no speculation beyond what's actually written.

The result is a risk level (low / medium / high), which rules triggered and why, and Haiku's notes when it was called in.

## Why

I bought a supplement online where the listing used real brand product photos but the title just said "Generic." It turned out to be a random knockoff powder, not the actual product. When I tried to dispute it, I found out the seller was covered because the word "Generic" was technically disclosed in the title, even though the photos were misleading. That's the loophole: sellers can use branded images to catch your eye, then bury a disclaimer word in the title so they're legally in the clear if you complain.

This tool exists to catch that kind of thing before you buy, not after. The point isn't just spotting scams, it's spotting the loopholes sellers use to stay technically honest while still being misleading, a single disclosed word protecting a seller even when the overall listing is designed to deceive. That's why the pattern rules weigh the gap between what's shown and what's said (branded photos next to a hedge-word title, a product name buried in the description that doesn't match the images, price far below what the real item usually costs), not just a keyword search for "scam."

Trade Me doesn't do this kind of check itself, and most of these tells are pattern-based enough that they don't need an LLM call at all. Keeping the pattern matching local and free, and only reaching for Haiku on ambiguous cases, keeps the tool cheap to run and fast for the common case.

## Stack

Node.js and Express on the backend, a plain HTML/CSS/JS frontend, no framework. The Anthropic API key lives in `.env` and is never touched by the frontend.

## Not intended for public deployment

This is a portfolio project, not a live service. It defaults to binding to `127.0.0.1`, so running it locally never exposes it to anything outside your own machine, on purpose. `/api/check` can trigger a paid Anthropic API call, and an endpoint like that being reachable from the internet with no one watching it is how a demo project turns into a surprise bill.

There's rate limiting on that endpoint as a second layer of defense, and the Haiku call only fires when the free pattern rules haven't already found something conclusive, but neither of those is a substitute for just not exposing it. If you genuinely want to run this somewhere reachable, you'd need to set `HOST` to something other than `127.0.0.1` and think through rate limits, spending caps on the Anthropic account, and probably some form of access control first.

## Running it locally

```
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm start
```

Then open `http://localhost:3000`.

Run the test suite with `npm test`. It only covers `rules/patterns.js` for now, those are plain functions with no network calls, so they're the cheapest thing in the app to test and the part most likely to regress as more rules get added.

## Project layout

```
server.js                    Express app: routing, rate limiting, request logging
rules/patterns.js            the pattern-matching rules, plus how to add a new one
services/checkListing.js     runs the rules, decides whether to call Haiku, combines a risk level
services/haiku.js            the Claude Haiku call itself, isolated so the model/prompt/schema live in one place
public/                      frontend (index.html, style.css, script.js)
test/patterns.test.js        unit tests for the pattern rules
```

`services/checkListing.js` is deliberately the only place that knows how a risk level gets decided. The route handler in `server.js` just validates the request and calls it, so the same logic could be reused from a CLI or a test without dragging Express along with it.

## Status

The pattern rules and the Haiku fallback are both wired in, with unit tests covering the rules. The frontend is still a placeholder, the results screen hasn't been designed yet.
