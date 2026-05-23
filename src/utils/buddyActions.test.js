import { describe, it, expect } from 'vitest';
import { parseActionEnvelope, stripActionFence } from './buddyActions';

describe('parseActionEnvelope', () => {
  it('extracts and parses a valid CREATE_SPRINT block', () => {
    const text = [
      'Based on your velocity here is my suggestion:',
      '',
      '```action',
      '{ "type": "CREATE_SPRINT", "name": "Sprint 5", "suggestedCommittedPoints": 30 }',
      '```',
    ].join('\n');
    expect(parseActionEnvelope(text)).toEqual({
      type: 'CREATE_SPRINT',
      name: 'Sprint 5',
      suggestedCommittedPoints: 30,
    });
  });

  it('returns null when type is not whitelisted', () => {
    const text = '```action\n{ "type": "DELETE_SPRINTS" }\n```';
    expect(parseActionEnvelope(text)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const text = '```action\n{ bad json }\n```';
    expect(parseActionEnvelope(text)).toBeNull();
  });

  it('returns null when no action block is present', () => {
    expect(parseActionEnvelope('Just a plain text response.')).toBeNull();
  });

  it('returns null for empty or null input', () => {
    expect(parseActionEnvelope('')).toBeNull();
    expect(parseActionEnvelope(null)).toBeNull();
  });

  it('extracts action when surrounded by prose on both sides', () => {
    const text = 'Here is my plan.\n\n```action\n{"type":"CREATE_SPRINT","name":"Sprint 3","suggestedCommittedPoints":25}\n```\n\nThis looks reasonable.';
    const result = parseActionEnvelope(text);
    expect(result?.type).toBe('CREATE_SPRINT');
    expect(result?.suggestedCommittedPoints).toBe(25);
  });
});

describe('stripActionFence', () => {
  it('removes the action fence block, leaving surrounding prose', () => {
    const text = 'Here is my plan.\n\n```action\n{"type":"CREATE_SPRINT","name":"Sprint 3","suggestedCommittedPoints":25}\n```\n\nThis looks reasonable.';
    const stripped = stripActionFence(text);
    expect(stripped).not.toContain('```action');
    expect(stripped).toContain('Here is my plan.');
    expect(stripped).toContain('This looks reasonable.');
  });

  it('returns text unchanged when no fence is present', () => {
    const text = 'Just a plain response.';
    expect(stripActionFence(text)).toBe(text);
  });

  it('handles null/empty input', () => {
    expect(stripActionFence('')).toBe('');
    expect(stripActionFence(null)).toBeNull();
  });
});
