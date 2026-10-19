export function IdleDialog({ secondsLeft, onStay }: { secondsLeft: number; onStay: () => void }) {
  return (
    <div className="idle-backdrop">
      <div role="alertdialog" aria-labelledby="idle-title" aria-describedby="idle-body" className="idle">
        <h2 id="idle-title" className="idle__title">
          Still there?
        </h2>
        <p id="idle-body" className="idle__body">
          This screen will start over in {secondsLeft}s so the next person does not see your order.
        </p>
        <button type="button" className="button button--primary" onClick={onStay}>
          I'm still here
        </button>
      </div>
    </div>
  );
}
