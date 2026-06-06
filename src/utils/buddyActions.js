export const ACTION_WHITELIST = new Set(['CREATE_SPRINT']);

export const ACTION_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'CREATE_SPRINT',
      description: 'Propose creating a new sprint. The user reviews and confirms before it is added.',
      parameters: {
        type: 'object',
        required: ['name', 'suggestedCommittedPoints'],
        properties: {
          name: {
            type: 'string',
            description: 'Sprint name, e.g. "Sprint 12"',
          },
          startDate: {
            type: 'string',
            description: 'Sprint start date in ISO format YYYY-MM-DD',
          },
          suggestedCommittedPoints: {
            type: 'number',
            description: 'Recommended committed story points based on recent velocity',
          },
          notes: {
            type: 'string',
            description: 'Optional planning notes or rationale for the suggested commitment',
          },
        },
      },
    },
  },
];

const FENCE_RE = /```action\s*\n([\s\S]*?)\n?```/;

export function parseActionEnvelope(text) {
  if (!text) return null;
  const match = text.match(FENCE_RE);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1].trim());
    if (!data || !ACTION_WHITELIST.has(data.type)) return null;
    return data;
  } catch {
    return null;
  }
}

export function stripActionFence(text) {
  if (!text) return text;
  return text.replace(FENCE_RE, '').trim();
}
