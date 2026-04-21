/**
 * VelocityContext.jsx
 *
 * Global state management for the Agile Velocity Tool.
 * Uses React's useReducer with a lazy localStorage initializer so saved
 * data is loaded synchronously before the first render — no race condition.
 *
 * Exported from this module:
 *  - VelocityProvider  — wrap your app in this to provide state
 *  - useVelocity()     — hook to access { state, dispatch } anywhere
 *  - aggregateCapacity() — helper to sum PTO/support/other across a sprint's member rows
 */
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  CURRENT_SCHEMA_VERSION,
  extractStateEnvelope,
  migrateStateBySchema,
  sanitizeImportedState,
} from '../utils/stateSchema';

const VelocityContext = createContext(null);
const STORAGE_KEY = 'agile_velocity_tool_state';

/**
 * Given a sprint start date and a number of working days, compute the end date
 * by walking forward calendar days and counting only Mon–Fri.
 *
 * The end date is the last working day of the sprint (inclusive).
 *
 * @param {string} startDate - 'YYYY-MM-DD'
 * @param {number} workingDays - number of working days in the sprint (e.g. 10)
 * @returns {string} 'YYYY-MM-DD'
 */
export function calcSprintEndDate(startDate, workingDays) {
  if (!startDate || !workingDays) return '';
  const d = new Date(startDate + 'T00:00:00');
  let counted = 0;
  // The start date itself is day 1 if it's a weekday
  while (counted < workingDays) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) counted++;
    if (counted < workingDays) d.setDate(d.getDate() + 1);
  }
  // Skip forward past any trailing weekend so end date is always a weekday
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Given a sprint start day-of-week (0=Sun … 6=Sat) and a sprint duration in
 * working days, return the total calendar days spanned by the sprint.
 * This is purely informational — the actual end date uses calcSprintEndDate.
 *
 * A 10-working-day sprint starting Monday spans 14 calendar days (2 weekends).
 * A 10-working-day sprint starting Wednesday spans 16 calendar days (2 weekends,
 * first partial week has 3 days, second has 5, third has 2).
 *
 * @param {number} startDow - 0–6
 * @param {number} workingDays
 * @returns {{ calendarDays: number, weekendsIncluded: number }}
 */
export function sprintCalendarInfo(startDow, workingDays) {
  // Walk a dummy week cycle to count calendar days
  let cal = 0;
  let counted = 0;
  let dow = startDow;
  while (counted < workingDays) {
    if (dow !== 0 && dow !== 6) counted++;
    cal++;
    dow = (dow + 1) % 7;
  }
  const weekendsIncluded = Math.ceil((cal - (workingDays)) / 2);
  return { calendarDays: cal, weekendsIncluded };
}

/**
 * Count how many holidays from a region fall within a sprint's date range (inclusive).
 * Only counts weekdays (Mon–Fri) since weekends don't consume working days.
 *
 * @param {string} regionId
 * @param {string} startDate - 'YYYY-MM-DD'
 * @param {string} endDate   - 'YYYY-MM-DD'
 * @param {Holiday[]} holidays
 * @returns {{ count: number, names: string[] }}
 */
export function countHolidaysInSprint(regionId, startDate, endDate, holidays = []) {
  if (!regionId || !startDate || !endDate) return { count: 0, names: [] };
  const start = new Date(startDate + 'T00:00:00');
  const end   = new Date(endDate   + 'T00:00:00');
  const matching = holidays.filter(h => {
    if (h.regionId !== regionId) return false;
    const d = new Date(h.date + 'T00:00:00');
    if (d < start || d > end) return false;
    const dow = d.getDay();
    return dow !== 0 && dow !== 6; // skip weekends
  });
  return {
    count: matching.length,
    names: matching.map(h => h.name),
  };
}

/**
 * Build a memberCapacity row with holiday PTO auto-filled from the member's region.
 */
function memberCapacityRowWithHolidays(member, startDate, endDate, holidays) {
  const { count, names } = countHolidaysInSprint(member.regionId, startDate, endDate, holidays);
  return {
    memberId:    member.id,
    memberName:  member.name,
    allocation:  member.allocation ?? 100,
    ptoDays:     count,
    holidayDays: count,
    holidayNames: names,
    supportDays: 0,
    otherDays:   0,
    otherLabel:  '',
  };
}

/**
 * Seed a full memberCapacity array from the current team roster.
 * Used when creating the very first sprint (no previous sprint to carry forward from).
 *
 * @param {TeamMember[]} teamMembers
 * @returns {MemberCapacityRow[]}
 */
function seedMemberCapacity(teamMembers, startDate, endDate, holidays) {
  return teamMembers.map(m => memberCapacityRowWithHolidays(m, startDate, endDate, holidays));
}

function createDefaultMilestone() {
  return {
    id: uuidv4(),
    name: 'Production',
    targetDate: '',
    gate: '',
    status: 'not_started',
    notes: '',
    dependsOnMilestoneIds: [],
  };
}

function normalizeReleaseMilestones(milestones) {
  if (!Array.isArray(milestones)) return [];
  const normalized = milestones
    .filter(Boolean)
    .map(m => ({
      id: m.id || uuidv4(),
      name: m.name || '',
      targetDate: m.targetDate || '',
      gate: m.gate || '',
      status: m.status || 'not_started',
      notes: m.notes || '',
      dependsOnMilestoneIds: Array.isArray(m.dependsOnMilestoneIds)
        ? m.dependsOnMilestoneIds.filter(Boolean)
        : [],
    }));
  const validIds = new Set(normalized.map(m => m.id));
  return normalized.map(m => ({
    ...m,
    dependsOnMilestoneIds: [...new Set(m.dependsOnMilestoneIds)]
      .filter(depId => depId !== m.id && validIds.has(depId)),
  }));
}

/**
 * Sum PTO, support, and other days across all member rows for a sprint.
 * Exported so components and velocityCalc.js can use it without importing the full reducer.
 *
 * @param {MemberCapacityRow[]} memberCapacity
 * @returns {{ ptoDays: number, supportDays: number, otherDays: number }}
 */
export function aggregateCapacity(memberCapacity = []) {
  return {
    ptoDays:     memberCapacity.reduce((s, r) => s + (r.ptoDays     || 0), 0),
    supportDays: memberCapacity.reduce((s, r) => s + (r.supportDays || 0), 0),
    otherDays:   memberCapacity.reduce((s, r) => s + (r.otherDays   || 0), 0),
  };
}

const _m1 = uuidv4(), _m2 = uuidv4(), _m3 = uuidv4();
const _r1 = uuidv4(), _r2 = uuidv4();

const defaultState = {
  regions: [
    { id: _r1, name: 'United States' },
    { id: _r2, name: 'India' },
  ],
  holidays: [
    // US 2026 federal holidays
    { id: uuidv4(), regionId: _r1, name: "New Year's Day",        date: '2026-01-01' },
    { id: uuidv4(), regionId: _r1, name: 'MLK Day',               date: '2026-01-19' },
    { id: uuidv4(), regionId: _r1, name: "Presidents' Day",       date: '2026-02-16' },
    { id: uuidv4(), regionId: _r1, name: 'Memorial Day',          date: '2026-05-25' },
    { id: uuidv4(), regionId: _r1, name: 'Juneteenth',            date: '2026-06-19' },
    { id: uuidv4(), regionId: _r1, name: 'Independence Day',      date: '2026-07-04' },
    { id: uuidv4(), regionId: _r1, name: 'Labor Day',             date: '2026-09-07' },
    { id: uuidv4(), regionId: _r1, name: 'Columbus Day',          date: '2026-10-12' },
    { id: uuidv4(), regionId: _r1, name: 'Veterans Day',          date: '2026-11-11' },
    { id: uuidv4(), regionId: _r1, name: 'Thanksgiving Day',      date: '2026-11-26' },
    { id: uuidv4(), regionId: _r1, name: 'Christmas Day',         date: '2026-12-25' },
    // India 2026 national holidays
    { id: uuidv4(), regionId: _r2, name: 'Republic Day',          date: '2026-01-26' },
    { id: uuidv4(), regionId: _r2, name: 'Holi',                  date: '2026-03-04' },
    { id: uuidv4(), regionId: _r2, name: 'Ram Navami',            date: '2026-03-27' },
    { id: uuidv4(), regionId: _r2, name: 'Good Friday',           date: '2026-04-03' },
    { id: uuidv4(), regionId: _r2, name: 'Eid ul-Fitr',           date: '2026-04-01' },
    { id: uuidv4(), regionId: _r2, name: 'Ambedkar Jayanti',      date: '2026-04-14' },
    { id: uuidv4(), regionId: _r2, name: 'Independence Day',      date: '2026-08-15' },
    { id: uuidv4(), regionId: _r2, name: 'Gandhi Jayanti',        date: '2026-10-02' },
    { id: uuidv4(), regionId: _r2, name: 'Dussehra',              date: '2026-10-20' },
    { id: uuidv4(), regionId: _r2, name: 'Diwali',                date: '2026-11-08' },
    { id: uuidv4(), regionId: _r2, name: 'Christmas Day',         date: '2026-12-25' },
  ],
  teamMembers: [
    { id: _m1, name: 'Alice Johnson', role: 'Developer',  regionId: _r1 },
    { id: _m2, name: 'Bob Smith',     role: 'Developer',  regionId: _r1 },
    { id: _m3, name: 'Carol White',   role: 'QA Engineer', regionId: _r2 },
  ],
  sprints: [
    {
      id: uuidv4(), name: 'Sprint 1', startDate: '2026-01-05', endDate: '2026-01-18',
      committedPoints: 40, completedPoints: 35, notes: '',
      memberCapacity: [
        { memberId: _m1, memberName: 'Alice Johnson', allocation: 100, ptoDays: 1, holidayDays: 1, holidayNames: ['MLK Day'], supportDays: 0, otherDays: 0, otherLabel: '' },
        { memberId: _m2, memberName: 'Bob Smith',     allocation: 80,  ptoDays: 1, holidayDays: 1, holidayNames: ['MLK Day'], supportDays: 1, otherDays: 0, otherLabel: '' },
        { memberId: _m3, memberName: 'Carol White',   allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
      ],
    },
    {
      id: uuidv4(), name: 'Sprint 2', startDate: '2026-01-19', endDate: '2026-02-01',
      committedPoints: 42, completedPoints: 42, notes: '',
      memberCapacity: [
        { memberId: _m1, memberName: 'Alice Johnson', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
        { memberId: _m2, memberName: 'Bob Smith',     allocation: 80,  ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
        { memberId: _m3, memberName: 'Carol White',   allocation: 100, ptoDays: 1, holidayDays: 1, holidayNames: ['Republic Day'], supportDays: 0, otherDays: 0, otherLabel: '' },
      ],
    },
    {
      id: uuidv4(), name: 'Sprint 3', startDate: '2026-02-02', endDate: '2026-02-15',
      committedPoints: 45, completedPoints: 38, notes: '',
      memberCapacity: [
        { memberId: _m1, memberName: 'Alice Johnson', allocation: 100, ptoDays: 2, holidayDays: 0, holidayNames: [], supportDays: 1, otherDays: 0, otherLabel: '' },
        { memberId: _m2, memberName: 'Bob Smith',     allocation: 100, ptoDays: 1, holidayDays: 0, holidayNames: [], supportDays: 1, otherDays: 0, otherLabel: '' },
        { memberId: _m3, memberName: 'Carol White',   allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
      ],
    },
    {
      id: uuidv4(), name: 'Sprint 4', startDate: '2026-02-16', endDate: '2026-03-01',
      committedPoints: 40, completedPoints: 44, notes: '',
      memberCapacity: [
        { memberId: _m1, memberName: 'Alice Johnson', allocation: 100, ptoDays: 1, holidayDays: 1, holidayNames: ["Presidents' Day"], supportDays: 0, otherDays: 1, otherLabel: 'Training' },
        { memberId: _m2, memberName: 'Bob Smith',     allocation: 100, ptoDays: 2, holidayDays: 1, holidayNames: ["Presidents' Day"], supportDays: 0, otherDays: 0, otherLabel: '' },
        { memberId: _m3, memberName: 'Carol White',   allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
      ],
    },
    {
      id: uuidv4(), name: 'Sprint 5', startDate: '2026-03-02', endDate: '2026-03-15',
      committedPoints: 46, completedPoints: 46, notes: '',
      memberCapacity: [
        { memberId: _m1, memberName: 'Alice Johnson', allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 1, otherDays: 0, otherLabel: '' },
        { memberId: _m2, memberName: 'Bob Smith',     allocation: 100, ptoDays: 0, holidayDays: 0, holidayNames: [], supportDays: 0, otherDays: 0, otherLabel: '' },
        { memberId: _m3, memberName: 'Carol White',   allocation: 100, ptoDays: 1, holidayDays: 1, holidayNames: ['Holi'], supportDays: 0, otherDays: 0, otherLabel: '' },
      ],
    },
  ],
  sprintDurationDays: 14,
  supportImpactFactor: 0.8,
  sprintStartDay: 1, // 1 = Monday (0=Sun, 1=Mon, ..., 6=Sat)
  releasePlans: [
    {
      id: uuidv4(),
      name: 'MVP Release',
      backlogPoints: 180,
      targetDate: '2026-09-30',
      notes: '',
      milestones: [
        {
          id: uuidv4(),
          name: 'Production',
          targetDate: '2026-09-30',
          gate: 'Go/No-Go approval',
          status: 'not_started',
          notes: '',
          dependsOnMilestoneIds: [],
        },
      ],
    },
  ],
  integrations: {
    jira: {
      connected: false,
      baseUrl: '',
      projectKey: '',
      username: '',
      token: '',
      mappings: {
        sprint: 'Sprint',
        points: 'Story Points',
        status: 'Status',
      },
    },
    azure: {
      connected: false,
      organization: '',
      project: '',
      pat: '',
      mappings: {
        sprint: 'Iteration Path',
        points: 'Story Points',
        status: 'State',
      },
    },
  },
  aiActionAudit: [],
  schemaVersion: CURRENT_SCHEMA_VERSION,
  activeTab: 'dashboard',
  chatHistory: [],
};

/**
 * Root reducer. Handles all state transitions for team members, sprints,
 * settings, and chat history.
 *
 * Key behaviours:
 * - ADD_MEMBER: adds to roster only — does NOT touch existing sprints
 * - ADD_SPRINT: carries forward previous sprint's allocation values;
 *               merges any team members added since the last sprint
 * - UPDATE_MEMBER: syncs memberName across all sprint capacity rows when name changes
 * - REMOVE_MEMBER: removes the member's row from every sprint
 */
export function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_STATE': {
      const next = action.payload && typeof action.payload === 'object' ? action.payload : {};
      const migrated = migrateStateBySchema(next, next.schemaVersion);
      return sanitizeImportedState(migrated.state, state);
    }
    case 'SET_TAB':    return { ...state, activeTab: action.tab };

    // ── Release Planning ───────────────────────────────────────────────────
    case 'ADD_RELEASE':
      return {
        ...state,
        releasePlans: [...(state.releasePlans || []), {
          id: uuidv4(),
          name: 'New Release',
          backlogPoints: 100,
          targetDate: '',
          notes: '',
          milestones: [createDefaultMilestone()],
        }],
      };
    case 'UPDATE_RELEASE':
      return {
        ...state,
        releasePlans: (state.releasePlans || []).map(r => {
          if (r.id !== action.id) return r;
          const next = { ...r, ...action.data };
          return {
            ...next,
            milestones: normalizeReleaseMilestones(next.milestones),
          };
        }),
      };
    case 'REMOVE_RELEASE':
      return {
        ...state,
        releasePlans: (state.releasePlans || []).filter(r => r.id !== action.id),
      };
    case 'ADD_RELEASE_MILESTONE':
      return {
        ...state,
        releasePlans: (state.releasePlans || []).map(r => {
          if (r.id !== action.releaseId) return r;
          return {
            ...r,
            milestones: [...normalizeReleaseMilestones(r.milestones), createDefaultMilestone()],
          };
        }),
      };
    case 'UPDATE_RELEASE_MILESTONE':
      return {
        ...state,
        releasePlans: (state.releasePlans || []).map(r => {
          if (r.id !== action.releaseId) return r;
          const existing = normalizeReleaseMilestones(r.milestones);
          return {
            ...r,
            milestones: normalizeReleaseMilestones(existing.map(m =>
              m.id === action.milestoneId ? { ...m, ...(action.data || {}) } : m
            )),
          };
        }),
      };
    case 'REMOVE_RELEASE_MILESTONE':
      return {
        ...state,
        releasePlans: (state.releasePlans || []).map(r => {
          if (r.id !== action.releaseId) return r;
          const retained = normalizeReleaseMilestones(r.milestones).filter(m => m.id !== action.milestoneId);
          return {
            ...r,
            milestones: retained.map(m => ({
              ...m,
              dependsOnMilestoneIds: (m.dependsOnMilestoneIds || []).filter(id => id !== action.milestoneId),
            })),
          };
        }),
      };

    // ── Integrations ───────────────────────────────────────────────────────
    case 'UPDATE_INTEGRATION': {
      return {
        ...state,
        integrations: {
          ...(state.integrations || {}),
          [action.provider]: {
            ...(state.integrations?.[action.provider] || {}),
            ...(action.data || {}),
          },
        },
      };
    }
    case 'UPDATE_INTEGRATION_MAPPING': {
      const current = state.integrations?.[action.provider] || {};
      return {
        ...state,
        integrations: {
          ...(state.integrations || {}),
          [action.provider]: {
            ...current,
            mappings: {
              ...(current.mappings || {}),
              [action.field]: action.value,
            },
          },
        },
      };
    }
    case 'ADD_AI_ACTION_AUDIT': {
      const next = [...(state.aiActionAudit || []), {
        id: uuidv4(),
        at: new Date().toISOString(),
        ...action.entry,
      }];
      return { ...state, aiActionAudit: next.slice(-100) };
    }
    case 'CLEAR_AI_ACTION_AUDIT':
      return { ...state, aiActionAudit: [] };

    // ── Regions ───────────────────────────────────────────────────────────
    case 'ADD_REGION':
      return { ...state, regions: [...(state.regions || []), { id: uuidv4(), name: '' }] };
    case 'UPDATE_REGION':
      return {
        ...state,
        regions: (state.regions || []).map(r => r.id === action.id ? { ...r, ...action.data } : r),
      };
    case 'REMOVE_REGION': {
      // Remove region, its holidays, and clear regionId from members
      return {
        ...state,
        regions:     (state.regions  || []).filter(r => r.id !== action.id),
        holidays:    (state.holidays || []).filter(h => h.regionId !== action.id),
        teamMembers: state.teamMembers.map(m => m.regionId === action.id ? { ...m, regionId: null } : m),
      };
    }

    // ── Holidays ──────────────────────────────────────────────────────────
    case 'ADD_HOLIDAY':
      return {
        ...state,
        holidays: [...(state.holidays || []), {
          id: uuidv4(),
          regionId: action.regionId,
          name: '',
          date: '',
        }],
      };
    case 'UPDATE_HOLIDAY':
      return {
        ...state,
        holidays: (state.holidays || []).map(h => h.id === action.id ? { ...h, ...action.data } : h),
      };
    case 'REMOVE_HOLIDAY':
      return { ...state, holidays: (state.holidays || []).filter(h => h.id !== action.id) };

    // ── Team Members ──────────────────────────────────────────────────────
    case 'ADD_MEMBER': {
      const newMember = { id: uuidv4(), name: '', role: 'Developer', regionId: null };
      return { ...state, teamMembers: [...state.teamMembers, newMember] };
    }
    case 'UPDATE_MEMBER': {
      const updated = state.teamMembers.map(m => m.id === action.id ? { ...m, ...action.data } : m);
      const sprints = action.data.name !== undefined
        ? state.sprints.map(s => ({
            ...s,
            memberCapacity: (s.memberCapacity || []).map(r =>
              r.memberId === action.id ? { ...r, memberName: action.data.name } : r
            ),
          }))
        : state.sprints;
      return { ...state, teamMembers: updated, sprints };
    }
    case 'REMOVE_MEMBER': {
      const sprints = state.sprints.map(s => ({
        ...s,
        memberCapacity: (s.memberCapacity || []).filter(r => r.memberId !== action.id),
      }));
      return { ...state, teamMembers: state.teamMembers.filter(m => m.id !== action.id), sprints };
    }

    // ── Sprints ───────────────────────────────────────────────────────────
    case 'ADD_SPRINT': {
      const last        = state.sprints[state.sprints.length - 1];
      const num         = state.sprints.length + 1;
      const holidays    = state.holidays || [];
      const startDate   = last ? last.endDate : '';
      const endDate     = calcSprintEndDate(startDate, state.sprintDurationDays);

      const prevCapacity  = last?.memberCapacity || [];
      const prevMemberIds = new Set(prevCapacity.map(r => r.memberId));

      // Build a quick lookup: memberId → allocation from the previous sprint
      const prevAllocMap = {};
      prevCapacity.forEach(r => { prevAllocMap[r.memberId] = r.allocation ?? 100; });

      // ── Compute suggested committed points from recency-weighted velocity ──
      // Uses the same formula as calcWeightedVelocity: sprint at index i gets weight (i+1)
      const completedSprints = state.sprints.filter(s => s.completedPoints > 0);
      let suggestedCommitted = 0;
      if (completedSprints.length > 0) {
        let weightSum = 0, valueSum = 0;
        completedSprints.forEach((s, i) => {
          const w = i + 1;
          weightSum += w;
          valueSum  += (s.completedPoints || 0) * w;
        });
        suggestedCommitted = Math.round(valueSum / weightSum);
      }

      // Carry forward allocation from last sprint, reset day-off fields,
      // then re-calculate holiday PTO for the new sprint's date range
      const carried = prevCapacity.map(r => {
        const member = state.teamMembers.find(m => m.id === r.memberId);
        const { count, names } = countHolidaysInSprint(member?.regionId, startDate, endDate, holidays);
        return {
          ...r,
          ptoDays:      count,
          holidayDays:  count,
          holidayNames: names,
          supportDays:  0,
          otherDays:    0,
          otherLabel:   '',
        };
      });

      const newMemberRows = state.teamMembers
        .filter(m => !prevMemberIds.has(m.id))
        .map(m => {
          const { count, names } = countHolidaysInSprint(m.regionId, startDate, endDate, holidays);
          return {
            memberId:     m.id,
            memberName:   m.name,
            allocation:   prevAllocMap[m.id] ?? 100,
            ptoDays:      count,
            holidayDays:  count,
            holidayNames: names,
            supportDays:  0,
            otherDays:    0,
            otherLabel:   '',
          };
        });

      const memberCapacity = prevCapacity.length > 0
        ? [...carried, ...newMemberRows]
        : seedMemberCapacity(state.teamMembers, startDate, endDate, holidays);

      return {
        ...state,
        sprints: [...state.sprints, {
          id: uuidv4(),
          name: `Sprint ${num}`,
          startDate,
          endDate,
          committedPoints:          suggestedCommitted,
          suggestedCommittedPoints: suggestedCommitted, // snapshot for override indicator
          scopeAddedPoints: 0,
          scopeRemovedPoints: 0,
          completedPoints: 0,
          notes: '',
          memberCapacity,
        }],
      };
    }

    case 'UPDATE_SPRINT':
      return { ...state, sprints: state.sprints.map(s => s.id === action.id ? { ...s, ...action.data } : s) };

    /**
     * RECALC_SPRINT_HOLIDAYS — called when sprint dates change or holidays/regions change.
     * Re-computes holidayDays for every member in the sprint without touching manual ptoDays adjustments.
     * The ptoDays is set to max(manual extra, holidayDays) so manual additions are preserved.
     */
    case 'RECALC_SPRINT_HOLIDAYS': {
      const holidays = state.holidays || [];
      return {
        ...state,
        sprints: state.sprints.map(s => {
          if (s.id !== action.sprintId) return s;
          return {
            ...s,
            memberCapacity: (s.memberCapacity || []).map(r => {
              const member = state.teamMembers.find(m => m.id === r.memberId);
              const { count, names } = countHolidaysInSprint(member?.regionId, s.startDate, s.endDate, holidays);
              const extraManual = Math.max(0, (r.ptoDays || 0) - (r.holidayDays || 0));
              return {
                ...r,
                holidayDays:  count,
                holidayNames: names,
                ptoDays:      count + extraManual,
              };
            }),
          };
        }),
      };
    }

    case 'REMOVE_SPRINT':
      return { ...state, sprints: state.sprints.filter(s => s.id !== action.id) };

    /**
     * MOVE_SPRINT — reorders an incomplete sprint up or down in the array.
     * direction: 'up' (toward index 0) | 'down' (toward end).
     * A sprint is considered complete when completedPoints > 0 and cannot be moved.
     * The swap is also blocked if the adjacent sprint is complete.
     */
    case 'MOVE_SPRINT': {
      const { id, direction } = action;
      const sprints = [...state.sprints];
      const idx = sprints.findIndex(s => s.id === id);
      if (idx === -1) return state;
      if ((sprints[idx].completedPoints || 0) > 0) return state; // complete sprints are locked
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sprints.length) return state;
      if ((sprints[targetIdx].completedPoints || 0) > 0) return state; // can't move past a complete sprint
      [sprints[idx], sprints[targetIdx]] = [sprints[targetIdx], sprints[idx]];
      return { ...state, sprints };
    }

    /**
     * CLONE_SPRINT — duplicates an existing sprint's team roster and allocations
     * into a new sprint appended after it. Resets day-off fields and points.
     */
    case 'CLONE_SPRINT': {
      const source = state.sprints.find(s => s.id === action.id);
      if (!source) return state;
      const num      = state.sprints.length + 1;
      const holidays = state.holidays || [];
      const startDate = source.endDate || '';
      const endDate   = calcSprintEndDate(startDate, state.sprintDurationDays);

      const memberCapacity = (source.memberCapacity || []).map(r => {
        const member = state.teamMembers.find(m => m.id === r.memberId);
        const { count, names } = countHolidaysInSprint(member?.regionId, startDate, endDate, holidays);
        return {
          ...r,
          ptoDays:      count,
          holidayDays:  count,
          holidayNames: names,
          supportDays:  0,
          otherDays:    0,
          otherLabel:   '',
        };
      });

      return {
        ...state,
        sprints: [...state.sprints, {
          ...source,
          id: uuidv4(),
          name: `Sprint ${num}`,
          startDate,
          endDate,
          committedPoints:          source.suggestedCommittedPoints ?? source.committedPoints,
          suggestedCommittedPoints: source.suggestedCommittedPoints,
          completedPoints:          0,
          scopeAddedPoints:         0,
          scopeRemovedPoints:       0,
          notes: '',
          memberCapacity,
        }],
      };
    }

    /**
     * BULK_TEAM_DAY_OFF — adjusts otherDays by `days` for every member in a sprint.
     * Pass a positive value to add, negative to remove. Clamps at 0.
     * Clears the otherLabel when the count reaches 0.
     */
    case 'BULK_TEAM_DAY_OFF': {
      const delta = Number(action.days) || 1;
      return {
        ...state,
        sprints: state.sprints.map(s => {
          if (s.id !== action.sprintId) return s;
          return {
            ...s,
            memberCapacity: (s.memberCapacity || []).map(r => {
              const nextDays = Math.max(0, (r.otherDays || 0) + delta);
              return {
                ...r,
                otherDays: nextDays,
                otherLabel: nextDays === 0 ? '' : (r.otherLabel || 'Team Day Off'),
              };
            }),
          };
        }),
      };
    }

    /**
     * RECALC_ALL_SPRINT_HOLIDAYS — re-applies holiday data for every sprint.
     * Called after importing state so existing sprints match the current holiday calendar.
     */
    case 'RECALC_ALL_SPRINT_HOLIDAYS': {
      const holidays = state.holidays || [];
      return {
        ...state,
        sprints: state.sprints.map(s => ({
          ...s,
          memberCapacity: (s.memberCapacity || []).map(r => {
            const member = state.teamMembers.find(m => m.id === r.memberId);
            const { count, names } = countHolidaysInSprint(member?.regionId, s.startDate, s.endDate, holidays);
            const extraManual = Math.max(0, (r.ptoDays || 0) - (r.holidayDays || 0));
            return {
              ...r,
              holidayDays:  count,
              holidayNames: names,
              ptoDays:      count + extraManual,
            };
          }),
        })),
      };
    }

    case 'UPDATE_SPRINT_MEMBER_CAPACITY':
      return {
        ...state,
        sprints: state.sprints.map(s => {
          if (s.id !== action.sprintId) return s;
          return {
            ...s,
            memberCapacity: (s.memberCapacity || []).map(r =>
              r.memberId === action.memberId ? { ...r, ...action.data } : r
            ),
          };
        }),
      };

    // ── Settings ──────────────────────────────────────────────────────────
    case 'SET_SPRINT_DURATION': return { ...state, sprintDurationDays: action.value };
    case 'SET_SUPPORT_IMPACT':  return { ...state, supportImpactFactor: action.value };
    case 'SET_SPRINT_START_DAY': return { ...state, sprintStartDay: action.value };

    // ── Chat ──────────────────────────────────────────────────────────────
    case 'ADD_CHAT_MESSAGE': return { ...state, chatHistory: [...state.chatHistory, action.message] };
    case 'CLEAR_CHAT':       return { ...state, chatHistory: [] };

    default: return state;
  }
}

/**
 * Context provider. Wraps the app in App.jsx.
 *
 * Initializes state from localStorage synchronously via the useReducer
 * lazy initializer — falls back to defaultState if nothing is saved.
 * Persists state to localStorage on every change.
 */
export function VelocityProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const envelope = extractStateEnvelope(JSON.parse(saved));
        const migrated = migrateStateBySchema(envelope.state, envelope.schemaVersion);
        return sanitizeImportedState(migrated.state, defaultState);
      }
    } catch { /* ignore parse/storage errors, fall through to default */ }
    return defaultState;
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore quota errors */ }
  }, [state]);

  return (
    <VelocityContext.Provider value={{ state, dispatch }}>
      {children}
    </VelocityContext.Provider>
  );
}

/**
 * Hook to access global velocity state and dispatch.
 *
 * @returns {{ state: AppState, dispatch: Function }}
 *
 * @example
 * const { state, dispatch } = useVelocity();
 * dispatch({ type: 'ADD_SPRINT' });
 */
export function useVelocity() {
  return useContext(VelocityContext);
}
