const { chromium } = require('playwright');

// only ever fetch actual marketplace listing pages on trademe.co.nz itself, never
// an arbitrary URL someone pastes in. this is both an SSRF guard (no internal
// addresses, no other domains) and a scope limit, this exists to import one
// listing at a time, not to act as a general purpose page fetcher
const ALLOWED_HOSTS = new Set(['www.trademe.co.nz', 'trademe.co.nz']);
const LISTING_PATH_PATTERN = /^\/a\/marketplace\/.+\/listing\/\d+$/;

function validateListingUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { error: 'that does not look like a valid URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { error: 'listing URL must use https' };
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return { error: 'only trademe.co.nz listing links are supported' };
  }
  if (!LISTING_PATH_PATTERN.test(parsed.pathname)) {
    return { error: 'that does not look like a marketplace listing link' };
  }

  return { url: parsed.toString() };
}

const NAVIGATION_TIMEOUT_MS = 20000;

// pulled out of the browser context below since it runs inside page.evaluate,
// which only has access to the page's own DOM, not anything from this module
function extractListingFromPage() {
  function textOf(selector) {
    return document.querySelector(selector)?.textContent?.trim() || '';
  }

  const title = textOf('h1');
  const description = textOf('.tm-marketplace-listing-body__item-description');

  // the price panel's class depends on listing type (auction vs buy now), so
  // anchor on the label text instead of a class name that might not be there.
  // the label itself sits in a narrow wrapper with no price in it, walk up a
  // few ancestors until one of them actually contains a dollar amount
  let price;
  const priceLabel = Array.from(document.querySelectorAll('*')).find(
    (el) => el.children.length === 0 && /^(starting price|buy now|current bid|reserve met)$/i.test(el.textContent.trim()),
  );
  if (priceLabel) {
    let container = priceLabel.parentElement;
    for (let i = 0; i < 4 && container; i += 1) {
      const match = container.textContent.match(/\$[\d,]+\.\d{2}/);
      if (match) {
        price = Number(match[0].replace(/[$,]/g, ''));
        break;
      }
      container = container.parentElement;
    }
  }

  // breadcrumb is Home > Marketplace > <category path>, drop the first two
  const breadcrumbLinks = Array.from(document.querySelectorAll('.tm-breadcrumbs a')).map((el) => el.textContent.trim());
  const category = breadcrumbLinks.slice(2).join(' > ') || undefined;

  const feedbackText = textOf('.member-summary-box__profile-feedback');
  const percentMatch = feedbackText.match(/([\d.]+)%/);
  const percentPositive = percentMatch ? Number(percentMatch[1]) : undefined;

  const reviewCountText = textOf('.member-summary-box__feedback-score-button');
  const reviewCount = reviewCountText ? Number(reviewCountText) : undefined;

  const sellerDetailsText = textOf('.seller-details');
  const memberSinceMatch = sellerDetailsText.match(/Member since\s+([A-Za-z]+,\s*)?(.+?)(View seller|$)/);
  let memberSince;
  if (memberSinceMatch) {
    const parsedDate = new Date(memberSinceMatch[2].trim());
    // toISOString() converts to UTC first, which can shift the date backwards a
    // day for a NZ date parsed in local time, read the local fields instead
    if (!Number.isNaN(parsedDate.getTime())) {
      const year = parsedDate.getFullYear();
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const day = String(parsedDate.getDate()).padStart(2, '0');
      memberSince = `${year}-${month}-${day}`;
    }
  }

  return {
    title: title || undefined,
    description: description || undefined,
    price,
    category,
    sellerFeedback:
      percentPositive !== undefined || reviewCount !== undefined || memberSince
        ? { percentPositive, reviewCount, memberSince }
        : undefined,
  };
}

// Trade Me's listing pages are a client rendered Angular app, the raw HTML has
// nothing useful in it, so this actually renders the page in a real (headless)
// browser and reads the DOM after Angular has populated it. built and tested
// against marketplace auction listings, other listing types (Buy Now, Motors,
// Property, Jobs) use different markup and may not extract as cleanly
async function importListing(rawUrl) {
  const validation = validateListingUrl(rawUrl);
  if (validation.error) return { error: validation.error };

  // browser launch used to sit outside this try block, which meant a launch
  // failure (a broken chromium install, no resources available) skipped our
  // friendly error message entirely and surfaced as a raw 500 further up
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(validation.url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

    // our validation only checked the URL we were given, trade me itself could
    // still redirect somewhere else (an expired listing, a login wall). refuse
    // to read a page that ended up somewhere our allowlist wouldn't have accepted
    const landedOn = new URL(page.url());
    if (!ALLOWED_HOSTS.has(landedOn.hostname) || !LISTING_PATH_PATTERN.test(landedOn.pathname)) {
      return { error: 'that link redirected somewhere this app will not follow' };
    }

    // the description panel exists in the DOM before Angular has actually filled
    // it in, so waiting for the element alone is a race, it can resolve while
    // still empty. wait for its text content specifically instead
    await page.waitForFunction(
      () => (document.querySelector('.tm-marketplace-listing-body__item-description')?.textContent || '').trim().length > 0,
      { timeout: NAVIGATION_TIMEOUT_MS },
    );

    return await page.evaluate(extractListingFromPage);
  } catch (err) {
    console.error('Trade Me import failed:', err.message);
    return { error: 'could not read that listing, it may have changed format or no longer exist' };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { importListing, validateListingUrl };
