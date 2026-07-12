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
  const lower = text.toLowerCase();
  return HEDGE_PHRASES.filter((phrase) => lower.includes(phrase));
}

function checkHedgeLanguage(listing) {
  const titleHits = findHedgePhrases(listing.title || '');
  const descriptionHits = findHedgePhrases(listing.description || '');

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

const rules = [checkHedgeLanguage];

function runChecks(listing) {
  return rules
    .map((rule) => rule(listing))
    .filter((result) => result !== null);
}

module.exports = { runChecks };
