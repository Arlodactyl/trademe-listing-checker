const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5';

// keep it short and factual, this is a fallback for cases the free rules couldn't
// call confidently, not a general chatbot. no speculation beyond the listing text.
const SYSTEM_PROMPT = `You are reviewing a single Trade Me (a New Zealand online marketplace) listing for signs of counterfeit goods or a scam. Base your assessment only on the text given below, the title, description, price, category, and seller feedback if provided. Do not assume anything that isn't stated. Do not guess at the seller's intent beyond what the wording actually supports. Keep any notes short, specific, and tied to exact phrases or facts from the listing. If nothing in the text is concerning, say so plainly and set concern_level to "none".`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    concern_level: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
    notes: { type: 'string' },
  },
  required: ['concern_level', 'notes'],
  additionalProperties: false,
};

function buildListingSummary(listing) {
  const lines = [
    `Title: ${listing.title || '(not given)'}`,
    `Description: ${listing.description || '(not given)'}`,
    `Price (NZD): ${listing.price ?? '(not given)'}`,
    `Category: ${listing.category || '(not given)'}`,
  ];

  const feedback = listing.sellerFeedback;
  if (feedback && typeof feedback === 'object' && !Array.isArray(feedback)) {
    lines.push(
      `Seller feedback: ${feedback.percentPositive ?? '?'}% positive, ${feedback.reviewCount ?? '?'} reviews, member since ${feedback.memberSince || '?'}`,
    );
  } else {
    lines.push('Seller feedback: (not given)');
  }

  return lines.join('\n');
}

// only instantiate the client if there's actually a key configured, so a missing
// key fails fast and quietly instead of making a doomed network call every time
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

async function assessListing(listing) {
  const client = getClient();
  if (!client) {
    console.warn('ANTHROPIC_API_KEY not set, skipping Haiku fallback');
    return null;
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
      messages: [{ role: 'user', content: buildListingSummary(listing) }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) return null;

    const parsed = JSON.parse(textBlock.text);
    return { concernLevel: parsed.concern_level, notes: parsed.notes };
  } catch (err) {
    // an Anthropic outage or a bad key shouldn't take the whole check down,
    // the pattern rules already ran and can stand on their own
    console.error('Haiku assessment failed:', err.message);
    return null;
  }
}

module.exports = { assessListing };
