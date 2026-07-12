// listing fields come straight from req.body, so treat them as untrusted input.
// anything that isn't actually a string gets treated as blank rather than crashing
// the rule on a bad .toLowerCase() call.
function toText(value) {
  return typeof value === 'string' ? value : '';
}

// same idea as toText but for numbers. Number('') is 0 in JS, which would make a
// blank field look like a real zero, so blank/missing values need to bail out first.
function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// phrases sellers use to technically disclose a knockoff while still catching your eye
// with branded-looking photos and titles. "generic" in the title is the classic version
// of this, it's a single word that gets a seller off the hook for a misleading listing.
const HEDGE_PHRASES = [
  'generic',
  'replica',
  'unbranded',
  'no branding',
  'compatible with',
  'compatible for',
  'inspired by',
  'in the style of',
  'style of',
  'similar to',
];

function findHedgePhrases(text) {
  const lower = toText(text).toLowerCase();
  return HEDGE_PHRASES.filter((phrase) => lower.includes(phrase));
}

function checkHedgeLanguage(listing) {
  const titleHits = findHedgePhrases(listing.title);
  const descriptionHits = findHedgePhrases(listing.description);

  if (titleHits.length === 0 && descriptionHits.length === 0) return null;

  // a hedge word sitting in the title is the bigger tell, since that's what the seller
  // is relying on to say the listing was "disclosed" if a buyer complains later
  const severity = titleHits.length > 0 ? 'high' : 'medium';
  const foundIn = titleHits.length > 0 ? titleHits : descriptionHits;
  const location = titleHits.length > 0 ? 'title' : 'description';

  return {
    id: 'hedge-language',
    severity,
    message: `${location} contains hedging language ("${foundIn.join('", "')}") that can disclaim branding without actually saying the item isn't the real product`,
  };
}

// phrases that describe how an item gets to the buyer without saying anything about
// its actual condition or whether it's sitting in NZ ready to go. on their own these
// are normal, they're a red flag when they show up with nothing else to back them
const SOURCING_PHRASES = [
  'overseas warehouse',
  'international warehouse',
  'direct import',
  'direct from factory',
  'ships from overseas',
  'shipped from overseas',
  'shipped internationally',
  'dropship',
  'drop ship',
];

const CONDITION_WORDS = [
  'brand new',
  'new in box',
  'like new',
  'used',
  'second hand',
  'pre-owned',
  'refurbished',
  'condition',
];

const LOCAL_STOCK_WORDS = [
  'nz stock',
  'new zealand stock',
  'local stock',
  'ships from nz',
  'ready to ship',
  'in stock now',
];

function checkVagueSourcing(listing) {
  const combined = `${toText(listing.title)} ${toText(listing.description)}`.toLowerCase();
  const sourcingHits = SOURCING_PHRASES.filter((phrase) => combined.includes(phrase));

  if (sourcingHits.length === 0) return null;

  const mentionsCondition = CONDITION_WORDS.some((word) => combined.includes(word));
  const mentionsLocalStock = LOCAL_STOCK_WORDS.some((word) => combined.includes(word));

  const missing = [];
  if (!mentionsCondition) missing.push('condition');
  if (!mentionsLocalStock) missing.push('local stock');

  // sourcing language on its own is only worth a medium flag, it's the combination
  // with nothing said about condition or where the item actually is that makes it worse
  const severity = missing.length === 2 ? 'high' : 'medium';
  const missingNote = missing.length > 0 ? `, with no mention of ${missing.join(' or ')}` : '';

  return {
    id: 'vague-sourcing',
    severity,
    message: `listing uses vague sourcing language ("${sourcingHits.join('", "')}")${missingNote}`,
  };
}

// thresholds are rough judgement calls, not anything Trade Me publishes.
// a $300 item is expensive enough that a buyer should expect a track record behind it,
// and 60 days covers the window where an account could've been spun up just for one sale
const HIGH_VALUE_THRESHOLD = 300;
const LOW_REVIEW_COUNT = 10;
const RECENT_ACCOUNT_DAYS = 60;

function checkSellerFeedback(listing) {
  const feedback = listing.sellerFeedback;
  if (!feedback || typeof feedback !== 'object' || Array.isArray(feedback)) return null;

  const price = toNumber(listing.price);
  const reviewCount = toNumber(feedback.reviewCount);
  const flags = [];

  if (price !== null && price >= HIGH_VALUE_THRESHOLD && reviewCount !== null && reviewCount < LOW_REVIEW_COUNT) {
    flags.push(`only ${reviewCount} review${reviewCount === 1 ? '' : 's'} on a $${price} item`);
  }

  const memberSinceRaw = feedback.memberSince;
  if (typeof memberSinceRaw === 'string' || typeof memberSinceRaw === 'number') {
    const joinedDate = new Date(memberSinceRaw);
    if (!Number.isNaN(joinedDate.getTime())) {
      const daysSinceJoining = (Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceJoining >= 0 && daysSinceJoining < RECENT_ACCOUNT_DAYS) {
        const days = Math.floor(daysSinceJoining);
        flags.push(`seller account is only ${days} day${days === 1 ? '' : 's'} old`);
      }
    }
  }

  if (flags.length === 0) return null;

  return {
    id: 'seller-feedback',
    severity: flags.length > 1 ? 'high' : 'medium',
    message: `seller feedback looks thin for this listing: ${flags.join('; ')}`,
  };
}

// signs a description was never actually written for this specific item, it's a
// template with the details never filled in. all bounded so there's no ReDoS risk
// from running these against whatever a user pastes in.
const PLACEHOLDER_PATTERNS = [
  /\[[^\]\n]{1,60}\]/,
  /\{\{[^}\n]{1,60}\}\}/,
  /\blorem ipsum\b/i,
  /\b(insert|enter|add)\s+(product|item|title|description|name)\s*(here)?\b/i,
  /\byour\s+(product|item)\s+(name|title)\s+here\b/i,
  /\bxxxx+\b/i,
];

function findPlaceholderArtifacts(text) {
  const hits = [];
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = text.match(pattern);
    if (match) hits.push(match[0].trim());
  }
  return hits;
}

// marketing filler that could describe almost any item on the site. one or two of
// these on their own is normal seller-speak, a description made up of nothing else
// is a sign nobody wrote anything specific to this particular listing
const BOILERPLATE_PHRASES = [
  '100% authentic',
  'high quality material',
  'satisfaction guaranteed',
  'fast shipping',
  'great condition',
  'must have item',
  'best price guaranteed',
  'premium quality',
  'as advertised',
];

function countBoilerplatePhrases(text) {
  const lower = text.toLowerCase();
  return BOILERPLATE_PHRASES.filter((phrase) => lower.includes(phrase)).length;
}

function checkTemplatedDescription(listing) {
  const description = toText(listing.description);
  if (!description) return null;

  const placeholderHits = findPlaceholderArtifacts(description);
  // a leftover double space is often what's left when a template's product-name
  // placeholder gets deleted without anyone tidying up the gap
  const doubleSpaceCount = (description.match(/ {2,}/g) || []).length;
  const boilerplateCount = countBoilerplatePhrases(description);

  const signals = [];

  if (placeholderHits.length > 0) {
    signals.push(`leftover placeholder text ("${placeholderHits.join('", "')}")`);
  }

  if (doubleSpaceCount >= 2) {
    signals.push('repeated double spaces, often left behind when a product name is swapped out of a template');
  }

  // three or more of these stacked together with nothing else is a stronger tell than
  // any single phrase, most real listings mix in at least one specific detail
  if (boilerplateCount >= 3) {
    signals.push('reads like generic marketing boilerplate with no specific detail about this item, no size, model, quantity, or anything else that pins it to this listing');
  }

  if (signals.length === 0) return null;

  return {
    id: 'templated-description',
    severity: placeholderHits.length > 0 ? 'high' : 'medium',
    message: `description looks templated: ${signals.join('; ')}`,
  };
}

const rules = [checkHedgeLanguage, checkVagueSourcing, checkSellerFeedback, checkTemplatedDescription];

function runChecks(listing) {
  return rules
    .map((rule) => rule(listing))
    .filter((result) => result !== null);
}

// folds the pattern rule severities and, if it ran, Haiku's concern_level into one
// overall level. Haiku's "low"/"none" don't push the level up on their own, they're
// only there to add detail when the rules already have something or found nothing at all
function computeRiskLevel(triggered, haikuConcernLevel) {
  const severities = triggered.map((result) => result.severity);
  if (haikuConcernLevel === 'high') severities.push('high');
  if (haikuConcernLevel === 'medium') severities.push('medium');

  if (severities.includes('high')) return 'high';
  if (severities.includes('medium')) return 'medium';
  return 'low';
}

module.exports = { runChecks, computeRiskLevel };
