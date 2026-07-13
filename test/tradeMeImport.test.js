// validateListingUrl is the SSRF guard for the import feature, no listing
// should ever get past it unless it's an actual https trademe.co.nz listing
// link, so it gets tested directly rather than only through the full browser flow
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateListingUrl } = require('../services/tradeMeImport');

test('accepts a real marketplace listing url', () => {
  const result = validateListingUrl('https://www.trademe.co.nz/a/marketplace/gaming/nintendo-ds/consoles/listing/6022361636');
  assert.equal(result.error, undefined);
  assert.ok(result.url);
});

test('accepts the bare trademe.co.nz host too', () => {
  const result = validateListingUrl('https://trademe.co.nz/a/marketplace/gaming/consoles/listing/123');
  assert.equal(result.error, undefined);
});

test('rejects a different domain entirely', () => {
  const result = validateListingUrl('https://evil.com/a/marketplace/x/listing/123');
  assert.match(result.error, /trademe\.co\.nz/);
});

test('rejects a lookalike domain', () => {
  const result = validateListingUrl('https://eviltrademe.co.nz/a/marketplace/x/listing/123');
  assert.match(result.error, /trademe\.co\.nz/);
});

test('rejects a subdomain trying to smuggle a different host in the path', () => {
  const result = validateListingUrl('https://www.trademe.co.nz.evil.com/a/marketplace/x/listing/123');
  assert.match(result.error, /trademe\.co\.nz/);
});

test('rejects http, only https is allowed', () => {
  const result = validateListingUrl('http://www.trademe.co.nz/a/marketplace/x/listing/123');
  assert.match(result.error, /https/);
});

test('rejects a non-listing path', () => {
  const result = validateListingUrl('https://www.trademe.co.nz/a/marketplace/search');
  assert.match(result.error, /listing/);
});

test('rejects a raw ip address', () => {
  const result = validateListingUrl('https://169.254.169.254/latest/meta-data/');
  assert.match(result.error, /trademe\.co\.nz/);
});

test('rejects a completely malformed url', () => {
  const result = validateListingUrl('not a url at all');
  assert.match(result.error, /valid URL/);
});
