/**
 * WorkspaceContext.jsx
 *
 * Manages the workspace index (list of all workspaces) and the active
 * workspace selection, independently of per-workspace velocity state.
 *
 * Workspaces are stored in two localStorage entries:
 *  - WORKSPACE_INDEX_KEY : JSON array of { id, name, storageKey }
 *  - ACTIVE_WORKSPACE_KEY: id of the currently active workspace
 *
 * The default workspace always uses PRIMARY_STORAGE_KEY so it is backwards-
 * compatible with existing data saved before multi-workspace support.
 *
 * Exported:
 *  - WorkspaceProvider  — wrap the app root (outside VelocityProvider)
 *  - useWorkspaces()    — hook: { workspaces, activeWorkspace, activeWorkspaceId,
 *                                switchWorkspace, createWorkspace,
 *                                renameWorkspace, deleteWorkspace }
 *  - PRIMARY_STORAGE_KEY — re-exported so VelocityProvider can use it
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

export const PRIMARY_STORAGE_KEY   = 'agile_velocity_tool_state';
export const WORKSPACE_INDEX_KEY   = 'agile_velocity_tool_workspaces';
export const ACTIVE_WORKSPACE_KEY  = 'agile_velocity_active_workspace';

const DEFAULT_WORKSPACE = {
  id: 'default',
  name: 'Default Workspace',
  storageKey: PRIMARY_STORAGE_KEY,
};

function loadIndex() {
  try {
    const raw    = localStorage.getItem(WORKSPACE_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list   = Array.isArray(parsed) ? parsed : [];
    return list.find(w => w.id === 'default') ? list : [DEFAULT_WORKSPACE, ...list];
  } catch {
    return [DEFAULT_WORKSPACE];
  }
}

function saveIndex(list) {
  try { localStorage.setItem(WORKSPACE_INDEX_KEY, JSON.stringify(list)); } catch { /* ignore quota errors */ }
}

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const [workspaces, setWorkspaces] = useState(loadIndex);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => localStorage.getItem(ACTIVE_WORKSPACE_KEY) || 'default'
  );

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  const persistIndex = useCallback((next) => {
    setWorkspaces(next);
    saveIndex(next);
  }, []);

  /** Switch the active workspace. VelocityProvider remounts via key= in App.jsx. */
  const switchWorkspace = useCallback((targetId) => {
    if (targetId === activeWorkspaceId) return;
    const target = workspaces.find(w => w.id === targetId);
    if (!target) return;
    try {
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, targetId);
      setActiveWorkspaceId(targetId);
    } catch { /* ignore quota errors */ }
  }, [activeWorkspaceId, workspaces]);

  /** Create a new blank workspace and add it to the index. */
  const createWorkspace = useCallback((name) => {
    const id = `ws-${Date.now()}`;
    const ws = { id, name: name.trim(), storageKey: `agile_velocity_tool_state_${id}` };
    persistIndex([...workspaces, ws]);
    return ws;
  }, [workspaces, persistIndex]);

  /** Rename any workspace (including default). */
  const renameWorkspace = useCallback((id, name) => {
    persistIndex(workspaces.map(w => w.id === id ? { ...w, name: name.trim() } : w));
  }, [workspaces, persistIndex]);

  /**
   * Delete a workspace. Guards:
   *  - Cannot delete the default workspace
   *  - Cannot delete the currently active workspace
   */
  const deleteWorkspace = useCallback((id) => {
    if (id === 'default' || id === activeWorkspaceId) return;
    const ws = workspaces.find(w => w.id === id);
    if (!ws) return;
    try { localStorage.removeItem(ws.storageKey); } catch { /* ignore */ }
    persistIndex(workspaces.filter(w => w.id !== id));
  }, [workspaces, activeWorkspaceId, persistIndex]);

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      activeWorkspaceId,
      switchWorkspace,
      createWorkspace,
      renameWorkspace,
      deleteWorkspace,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaces() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspaces must be used within WorkspaceProvider');
  return ctx;
}
