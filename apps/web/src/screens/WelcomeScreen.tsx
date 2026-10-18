export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="welcome">
      <button type="button" className="welcome__touch" onClick={onStart}>
        <span className="welcome__brand">Snack Counter</span>
        <span className="welcome__headline">Hungry? Order here, pick up at the counter.</span>
        <span className="welcome__cta">Start your order</span>
        <span className="welcome__strip" aria-hidden="true">
          🍗 🧀 🥪 🍫 🥤 🍊 ☕ 🥟 🍗 🧀 🥪 🍫 🥤 🍊 ☕ 🥟
        </span>
      </button>
    </main>
  );
}
