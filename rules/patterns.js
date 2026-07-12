// listing fields come straight from req.body, so treat them as untrusted input.
// anything that isn't actually a string gets treated as blank rather than crashing
// the rule on a bad .toLowerCase() call.
function toText(value) {
  return typeof value === 'string' ? value : '';
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

const rules = [checkHedgeLanguage, checkVagueSourcing];

function runChecks(listing) {
  return rules
    .map((rule) => rule(listing))
    .filter((result) => result !== null);
}

module.exports = { runChecks };
