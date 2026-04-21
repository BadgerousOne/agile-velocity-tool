export const CURRENT_SCHEMA_VERSION = 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Strip HTML from a string to prevent XSS from imported state files.
 * Removes script/style/iframe tag content entirely, then strips all remaining tags.
 * Applies only to free-text fields (names, notes, labels).
 *
 * @param {*} value
 * @returns {string}
 */
function stripHtml(value) {
  if (typeof value !== 'string') return '';
  return value
    // Remove dangerous tag blocks AND their content
    .replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Remove all remaining tags
    .replace(/<[^>]*>/g, '')
    // Decode safe HTML entities
    .replace(/&[a-z]+;/gi, c => {
      const map = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'" };
      return map[c.toLowerCase()] ?? c;
    })
    .trim();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function isNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const MILESTONE_STATUS = new Set(['not_started', 'on_track', 'at_risk', 'blocked', 'done']);

function sanitizeMilestones(milestones) {
  if (!Array.isArray(milestones)) return [];
  const normalized = milestones.filter(Boolean).map(m => ({
    id: typeof m.id === 'string' && m.id.trim() ? m.id : `ms_${Math.random().toString(36).slice(2, 10)}`,
    name: stripHtml(m.name),
    targetDate: typeof m.targetDate === 'string' ? m.targetDate : '',
    gate: stripHtml(m.gate),
    status: MILESTONE_STATUS.has(m.status) ? m.status : 'not_started',
    notes: stripHtml(m.notes),
    dependsOnMilestoneIds: Array.isArray(m.dependsOnMilestoneIds)
      ? m.dependsOnMilestoneIds.filter(v => typeof v === 'string' && v.trim())
      : [],
  }));
  const validIds = new Set(normalized.map(m => m.id));
  return normalized.map(m => ({
    ...m,
    dependsOnMilestoneIds: [...new Set(m.dependsOnMilestoneIds)]
      .filter(depId => depId !== m.id && validIds.has(depId)),
  }));
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
    teamMembers: Array.isArray(parsed.teamMembers)
      ? parsed.teamMembers.filter(Boolean).map(m => ({
          ...m,
          name: stripHtml(m.name),
          role: stripHtml(m.role),
        }))
      : fallback.teamMembers,
    sprints: Array.isArray(parsed.sprints)
      ? parsed.sprints.filter(Boolean).map(s => ({
          ...s,
          name: stripHtml(s.name),
          notes: stripHtml(s.notes),
          memberCapacity: Array.isArray(s?.memberCapacity)
            ? s.memberCapacity.filter(Boolean).map(r => ({
                ...r,
                memberName: stripHtml(r.memberName),
                otherLabel: stripHtml(r.otherLabel),
              }))
            : [],
        }))
      : fallback.sprints,
    regions: Array.isArray(parsed.regions)
      ? parsed.regions.filter(Boolean).map(r => ({ ...r, name: stripHtml(r.name) }))
      : fallback.regions,
    holidays: Array.isArray(parsed.holidays)
      ? parsed.holidays.filter(Boolean).map(h => ({ ...h, name: stripHtml(h.name) }))
      : fallback.holidays,
    releasePlans: Array.isArray(parsed.releasePlans)
      ? parsed.releasePlans.filter(Boolean).map(plan => ({
          ...plan,
          name: stripHtml(plan.name),
          notes: stripHtml(plan.notes),
          milestones: sanitizeMilestones(plan?.milestones),
        }))
      : (fallback.releasePlans || []),
    integrations: asObject(parsed.integrations) ? parsed.integrations : (fallback.integrations || {}),
    aiActionAudit: Array.isArray(parsed.aiActionAudit) ? parsed.aiActionAudit.filter(Boolean) : (fallback.aiActionAudit || []),
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

/**
 * Validate imported state before migration/sanitization so users get clear,
 * actionable errors instead of silent coercion.
 */
export function validateImportedState(candidate) {
  const parsed = asObject(candidate);
  if (!parsed) {
    throw new Error('Invalid state payload. Expected an object under "state".');
  }

  const errors = [];

  if ('teamMembers' in parsed && !Array.isArray(parsed.teamMembers)) {
    errors.push('teamMembers must be an array.');
  }
  if (Array.isArray(parsed.teamMembers)) {
    parsed.teamMembers.forEach((m, i) => {
      if (!asObject(m)) {
        errors.push(`teamMembers[${i}] must be an object.`);
        return;
      }
      if (typeof m.id !== 'string' || !m.id.trim()) {
        errors.push(`teamMembers[${i}].id must be a non-empty string.`);
      }
    });
  }

  if ('sprints' in parsed && !Array.isArray(parsed.sprints)) {
    errors.push('sprints must be an array.');
  }
  if (Array.isArray(parsed.sprints)) {
    parsed.sprints.forEach((s, i) => {
      if (!asObject(s)) {
        errors.push(`sprints[${i}] must be an object.`);
        return;
      }
      if (typeof s.id !== 'string' || !s.id.trim()) {
        errors.push(`sprints[${i}].id must be a non-empty string.`);
      }
      if ('startDate' in s && s.startDate && !isIsoDate(s.startDate)) {
        errors.push(`sprints[${i}].startDate must be YYYY-MM-DD.`);
      }
      if ('endDate' in s && s.endDate && !isIsoDate(s.endDate)) {
        errors.push(`sprints[${i}].endDate must be YYYY-MM-DD.`);
      }
      if ('committedPoints' in s && !isNonNegativeNumber(s.committedPoints)) {
        errors.push(`sprints[${i}].committedPoints must be a non-negative number.`);
      }
      if ('completedPoints' in s && !isNonNegativeNumber(s.completedPoints)) {
        errors.push(`sprints[${i}].completedPoints must be a non-negative number.`);
      }

      if ('memberCapacity' in s && !Array.isArray(s.memberCapacity)) {
        errors.push(`sprints[${i}].memberCapacity must be an array.`);
      }
      if (Array.isArray(s.memberCapacity)) {
        s.memberCapacity.forEach((r, j) => {
          if (!asObject(r)) {
            errors.push(`sprints[${i}].memberCapacity[${j}] must be an object.`);
            return;
          }
          if (typeof r.memberId !== 'string' || !r.memberId.trim()) {
            errors.push(`sprints[${i}].memberCapacity[${j}].memberId must be a non-empty string.`);
          }
          if ('allocation' in r && (!Number.isFinite(r.allocation) || r.allocation < 0 || r.allocation > 100)) {
            errors.push(`sprints[${i}].memberCapacity[${j}].allocation must be between 0 and 100.`);
          }
          if ('ptoDays' in r && !isNonNegativeNumber(r.ptoDays)) {
            errors.push(`sprints[${i}].memberCapacity[${j}].ptoDays must be a non-negative number.`);
          }
          if ('supportDays' in r && !isNonNegativeNumber(r.supportDays)) {
            errors.push(`sprints[${i}].memberCapacity[${j}].supportDays must be a non-negative number.`);
          }
          if ('otherDays' in r && !isNonNegativeNumber(r.otherDays)) {
            errors.push(`sprints[${i}].memberCapacity[${j}].otherDays must be a non-negative number.`);
          }
        });
      }
    });
  }

  if ('sprintDurationDays' in parsed && !Number.isFinite(parsed.sprintDurationDays)) {
    errors.push('sprintDurationDays must be a number.');
  }
  if ('supportImpactFactor' in parsed && !Number.isFinite(parsed.supportImpactFactor)) {
    errors.push('supportImpactFactor must be a number between 0 and 1.');
  }
  if ('sprintStartDay' in parsed && !Number.isInteger(parsed.sprintStartDay)) {
    errors.push('sprintStartDay must be an integer from 0 to 6.');
  }

  if ('releasePlans' in parsed && !Array.isArray(parsed.releasePlans)) {
    errors.push('releasePlans must be an array.');
  }
  if (Array.isArray(parsed.releasePlans)) {
    parsed.releasePlans.forEach((plan, i) => {
      if (!asObject(plan)) {
        errors.push(`releasePlans[${i}] must be an object.`);
        return;
      }
      if ('milestones' in plan && !Array.isArray(plan.milestones)) {
        errors.push(`releasePlans[${i}].milestones must be an array.`);
      }
      if (Array.isArray(plan.milestones)) {
        plan.milestones.forEach((ms, j) => {
          if (!asObject(ms)) {
            errors.push(`releasePlans[${i}].milestones[${j}] must be an object.`);
            return;
          }
          if (typeof ms.id !== 'string' || !ms.id.trim()) {
            errors.push(`releasePlans[${i}].milestones[${j}].id must be a non-empty string.`);
          }
          if ('targetDate' in ms && ms.targetDate && !isIsoDate(ms.targetDate)) {
            errors.push(`releasePlans[${i}].milestones[${j}].targetDate must be YYYY-MM-DD.`);
          }
          if ('status' in ms && !MILESTONE_STATUS.has(ms.status)) {
            errors.push(`releasePlans[${i}].milestones[${j}].status must be one of: not_started, on_track, at_risk, blocked, done.`);
          }
          if ('dependsOnMilestoneIds' in ms && !Array.isArray(ms.dependsOnMilestoneIds)) {
            errors.push(`releasePlans[${i}].milestones[${j}].dependsOnMilestoneIds must be an array.`);
          }
          if (Array.isArray(ms.dependsOnMilestoneIds)) {
            ms.dependsOnMilestoneIds.forEach((dep, k) => {
              if (typeof dep !== 'string' || !dep.trim()) {
                errors.push(`releasePlans[${i}].milestones[${j}].dependsOnMilestoneIds[${k}] must be a non-empty string.`);
              }
            });
          }
        });
      }
    });
  }
  if ('integrations' in parsed && !asObject(parsed.integrations)) {
    errors.push('integrations must be an object.');
  }
  if ('aiActionAudit' in parsed && !Array.isArray(parsed.aiActionAudit)) {
    errors.push('aiActionAudit must be an array.');
  }

  if (errors.length) {
    const preview = errors.slice(0, 6).join(' ');
    const suffix = errors.length > 6 ? ` (+${errors.length - 6} more)` : '';
    throw new Error(`Import validation failed: ${preview}${suffix}`);
  }
}

export function buildExportPayload(state) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
}

