// Sticky title bar for popups, with a large close button that stays visible while the form scrolls.
export default function SheetTop({ title, onClose }) {
  return (
    <div className="sheet-top">
      <h3>{title}</h3>
      {onClose && (
        <button type="button" className="close-x" aria-label="إغلاق" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
