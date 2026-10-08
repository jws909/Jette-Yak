import { generateMedicationNotes } from '../utils/mainPageUtils';

/**
 * 복용 전 주의점 카드 (MEDICATION NOTE)
 */
export default function MedicationNoteCard({
  prescriptionData,
  currentRxStatus,
  activeMedsForTargetDate,
  onOpenCautionModal,
}) {
  const medNotes = generateMedicationNotes(
    prescriptionData,
    currentRxStatus,
    activeMedsForTargetDate
  );

  return (
    <div className="medication-note-card">
      <div className="card-top-row">
        <div>
          <span className="card-sub-label">MEDICATION NOTE</span>
          <h3 className="card-main-title">복용 전, 잠깐만요.</h3>
        </div>
        {medNotes && (
          <span className={`note-status-badge ${medNotes.badgeType}`}>
            {medNotes.badgeText}
          </span>
        )}
      </div>

      <div className="note-points-list">
        {medNotes.points.map((pt, idx) => (
          <div key={idx} className={`note-point-item ${pt.highlight ? 'highlight' : ''}`}>
            <span className={`note-point-num ${pt.highlight ? 'highlight' : ''}`}>
              {pt.highlight ? '!' : idx + 1}
            </span>
            <div className="note-point-content">
              <strong className="note-point-category">{pt.category}</strong>
              <p className="note-point-text">{pt.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="note-action-footer">
        <button
          type="button"
          className="note-detail-btn"
          onClick={onOpenCautionModal}
        >
          주의사항 자세히 보기 &gt;
        </button>
      </div>
    </div>
  );
}
