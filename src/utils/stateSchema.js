export const CURRENT_SCHEMA_VERSION = 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function extractStateEnvelope(raw) {
  const envelope = asObject(raw);
  if (!envelope) {
    throw new Error('Invalid file format. Expected a JSON object.');
  }

  // New format: { schemaVersion, exportedAt, state }
  if (asObject(envelope.state)) {
    return {
      schemaVersion: Number.isInteger(envelope.schemaVersion) ? envelope.schemaVersion : 1,
      state: envelope.state,
    };
  }

  // Legacy format: state object at root
  return {
    schemaVersion: Number.isInteger(envelope.schemaVersion) ? envelope.schemaVersion : 1,
    state: envelope,
  };
}

function migrateV1ToV2(state) {
  const next = { ...state };
  if (!Number.isInteger(next.sprintStartDay)) next.sprintStartDay = 1;
  if (!Array.isArray(next.chatHistory)) next.chatHistory = [];

  if (Array.isArray(next.sprints)) {
    next.sprints = next.sprints.map(s => ({
      ...s,
      memberCapacity: Array.isArray(s?.memberCapacity) ? s.memberCapacity.filter(Boolean) : [],
    }));
  }

  return next;
}

export function migrateStateBySchema(state, fromVersion = 1) {
  let next = asObject(state) || {};
  let version = Number.isInteger(fromVersion) ? fromVersion : 1;

  while (version < CURRENT_SCHEMA_VERSION) {
    if (version === 1) {
      next = migrateV1ToV2(next);
      version = 2;
      continue;
    }
    break;
  }

  return { state: next, schemaVersion: CURRENT_SCHEMA_VERSION };
}

export function sanitizeImportedState(candidate, fallback) {
  const parsed = asObject(candidate);
  if (!parsed) {
    throw new Error('Invalid file format. Expected a JSON object.');
  }

  return {
    ...fallback,
    ...parsed,
    teamMembers: Array.isArray(parsed.teamMembers) ? parsed.teamMembers.filter(Boolean) : fallback.teamMembers,
    sprints: Array.isArray(parsed.sprints)
      ? parsed.sprints.filter(Boolean).map(s => ({
          ...s,
          memberCapacity: Array.isArray(s?.memberCapacity) ? s.memberCapacity.filter(Boolean) : [],
        }))
      : fallback.sprints,
    regions: Array.isArray(parsed.regions) ? parsed.regions.filter(Boolean) : fallback.regions,
    holidays: Array.isArray(parsed.holidays) ? parsed.holidays.filter(Boolean) : fallback.holidays,
    chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory.filter(Boolean) : [],
    sprintDurationDays: Number.isFinite(parsed.sprintDurationDays)
      ? clamp(parsed.sprintDurationDays, 5, 30)
      : fallback.sprintDurationDays,
    supportImpactFactor: Number.isFinite(parsed.supportImpactFactor)
      ? clamp(parsed.supportImpactFactor, 0, 1)
      : fallback.supportImpactFactor,
    sprintStartDay: Number.isInteger(parsed.sprintStartDay)
      ? clamp(parsed.sprintStartDay, 0, 6)
      : (fallback.sprintStartDay ?? 1),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

export function buildExportPayload(state) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
}

