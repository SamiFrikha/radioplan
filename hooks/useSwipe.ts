import { useEffect, useRef, type RefObject } from 'react';

interface SwipeCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

/**
 * Détecte un swipe horizontal sur l'élément ref fourni.
 * Seuil : >= 50px horizontal ET ratio horizontal/vertical > 1.5
 * Cooldown 300ms pour éviter sauts multiples en cas de gestes rapides.
 * Stable-ref pattern : les listeners ne sont pas réinstallés à chaque render.
 * Tous les listeners sont passive:true.
 * N'installe les listeners que si `enabled` est true.
 */
export function useSwipe(
  ref: RefObject<HTMLElement>,
  { onSwipeLeft, onSwipeRight }: SwipeCallbacks,
  enabled: boolean = true
) {
  // Stable refs pour les callbacks — évite le teardown/reinstall des listeners
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  onSwipeLeftRef.current = onSwipeLeft;
  onSwipeRightRef.current = onSwipeRight;

  const startX = useRef(0);
  const startY = useRef(0);
  const cooldown = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let cooldownTimer: ReturnType<typeof setTimeout> | null = null;

    const onTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (cooldown.current) return;
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < 50) return;
      if (absDx / (absDy || 1) < 1.5) return;

      cooldown.current = true;
      cooldownTimer = setTimeout(() => { cooldown.current = false; }, 300);

      if (dx < 0) onSwipeLeftRef.current?.();
      else onSwipeRightRef.current?.();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      if (cooldownTimer !== null) clearTimeout(cooldownTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ref]);
}
