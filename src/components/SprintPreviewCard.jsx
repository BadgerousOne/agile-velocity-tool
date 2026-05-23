import React, { useState } from 'react';
import './SprintPreviewCard.css';

export default function SprintPreviewCard({ sprintData, onConfirm, onCancel, confirming }) {
  const [committedPoints, setCommittedPoints] = useState(sprintData.committedPoints ?? 0);
  const [notes, setNotes] = useState(sprintData.notes ?? '');

  function handleConfirm() {
    onConfirm({ ...sprintData, committedPoints: Number(committedPoints), notes });
  }

  return (
    <div className="sprint-preview" role="region" aria-label="Proposed sprint">
      <div className="sprint-preview__header">
        <span className="sprint-preview__label">Proposed Sprint</span>
        <span className="sprint-preview__name">{sprintData.name}</span>
      </div>

      {(sprintData.startDate || sprintData.endDate) && (
        <div className="sprint-preview__dates">
          {sprintData.startDate} → {sprintData.endDate}
        </div>
      )}

      <div className="sprint-preview__field">
        <label className="sprint-preview__field-label" htmlFor="sp-committed">
          Committed points
        </label>
        <input
          id="sp-committed"
          className="sprint-preview__input"
          type="number"
          min={0}
          value={committedPoints}
          onChange={e => setCommittedPoints(e.target.value)}
          disabled={confirming}
        />
      </div>

      {sprintData.memberCapacity?.length > 0 && (
        <table className="sprint-preview__members">
          <thead>
            <tr>
              <th>Member</th>
              <th>Allocation</th>
            </tr>
          </thead>
          <tbody>
            {sprintData.memberCapacity.map(row => (
              <tr key={row.memberId}>
                <td>{row.memberName}</td>
                <td>{row.allocation}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="sprint-preview__field">
        <label className="sprint-preview__field-label" htmlFor="sp-notes">
          Notes
        </label>
        <textarea
          id="sp-notes"
          className="sprint-preview__textarea"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional planning notes…"
          disabled={confirming}
        />
      </div>

      <div className="sprint-preview__actions">
        <button
          className="sprint-preview__confirm"
          onClick={handleConfirm}
          disabled={confirming}
        >
          {confirming ? 'Creating…' : 'Confirm & Create Sprint'}
        </button>
        <button
          className="sprint-preview__cancel"
          onClick={onCancel}
          disabled={confirming}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
