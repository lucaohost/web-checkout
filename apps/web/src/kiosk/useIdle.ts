import { useCallback, useEffect, useRef, useState } from "react";

export const IDLE_AFTER_MS = 60_000;
export const COUNTDOWN_MS = 15_000;

/**
 * After a minute without a touch, ask whether anyone is still there; after the countdown, give up.
 * Returns the seconds left in the countdown (or null) and a way to say "I'm still here".
 */
export function useIdle({ enabled, onTimeout }: { enabled: boolean; onTimeout: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;
  const arm = useRef<() => void>(() => {});

  const stillHere = useCallback(() => {
    setSecondsLeft(null);
    arm.current();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setSecondsLeft(null);
      return;
    }

    let warn: ReturnType<typeof setTimeout> | undefined;
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;

    const clear = () => {
      if (warn) clearTimeout(warn);
      if (giveUp) clearTimeout(giveUp);
      if (tick) clearInterval(tick);
    };

    const startCountdown = () => {
      const started = Date.now();
      setSecondsLeft(Math.ceil(COUNTDOWN_MS / 1000));
      tick = setInterval(() => {
        setSecondsLeft(Math.max(0, Math.ceil((COUNTDOWN_MS - (Date.now() - started)) / 1000)));
      }, 250);
      giveUp = setTimeout(() => {
        clear();
        setSecondsLeft(null);
        timeoutRef.current();
      }, COUNTDOWN_MS);
    };

    const schedule = () => {
      clear();
      setSecondsLeft(null);
      warn = setTimeout(startCountdown, IDLE_AFTER_MS);
    };

    arm.current = schedule;
    schedule();
    window.addEventListener("pointerdown", schedule);
    window.addEventListener("keydown", schedule);

    return () => {
      clear();
      window.removeEventListener("pointerdown", schedule);
      window.removeEventListener("keydown", schedule);
    };
  }, [enabled]);

  return { secondsLeft, stillHere };
}
