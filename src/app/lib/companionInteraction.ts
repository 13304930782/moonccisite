export type CompanionReaction = 'pet' | 'hit' | null;
export const PET_DURATION_MS = 2200;
export const ANGRY_DURATION_MS = 3500;
export const DOUBLE_TAP_MS = 450;
export const DOUBLE_PAIR_MS = 1600;

// Four taps, grouped as two double-clicks; each group has its own time window.
// A deferred single click opens the card without making multi-clicks flicker it.
export function createCompanionGesture() {
  let firstTap: number | null = null;
  let firstPair: number | null = null;
  return {
    reset() {
      firstTap = null;
      firstPair = null;
    },
    tap(now: number): 'single' | 'double' | 'hit' {
      if (firstPair !== null && now - firstPair > DOUBLE_PAIR_MS)
        firstPair = null;
      if (
        firstTap !== null &&
        now - firstTap >= 0 &&
        now - firstTap <= DOUBLE_TAP_MS
      ) {
        firstTap = null;
        if (firstPair !== null && now - firstPair <= DOUBLE_PAIR_MS) {
          firstPair = null;
          return 'hit';
        }
        firstPair = now;
        return 'double';
      }
      firstTap = now;
      return 'single';
    },
  };
}
export function reactionEmotion(reaction: CompanionReaction, base: string) {
  return reaction === 'hit' ? '21' : reaction === 'pet' ? '10' : base;
}

// Pointer events avoid synthetic click/detail differences on touch browsers.
export function createCompanionPointer() {
  let stroke: {
    id: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
    distance: number;
    rubbed: boolean;
    started: number;
  } | null = null;
  return {
    begin(id: number, x: number, y: number, now: number) {
      if (stroke) return false;
      stroke = {
        id,
        x,
        y,
        originX: x,
        originY: y,
        distance: 0,
        rubbed: false,
        started: now,
      };
      return true;
    },
    move(id: number, x: number, y: number) {
      if (!stroke || stroke.id !== id) return false;
      stroke.distance += Math.hypot(x - stroke.x, y - stroke.y);
      stroke.x = x;
      stroke.y = y;
      // Jitter in a small area must not cancel a tap sequence.
      if (
        !stroke.rubbed &&
        stroke.distance >= 28 &&
        Math.hypot(x - stroke.originX, y - stroke.originY) >= 12
      ) {
        stroke.rubbed = true;
        return true;
      }
      return false;
    },
    end(id: number, now: number) {
      if (!stroke || stroke.id !== id) return false;
      const tap = !stroke.rubbed && now - stroke.started <= 700;
      stroke = null;
      return tap;
    },
    cancel(id?: number) {
      if (id === undefined || stroke?.id === id) stroke = null;
    },
  };
}
