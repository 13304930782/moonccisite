declare module 'canvas-confetti' {
  function confetti(options: {angle?: number; startVelocity?: number; scalar?: number; ticks?: number; gravity?: number; particleCount: number; spread: number; origin: {x: number; y: number}; colors: string[]; disableForReducedMotion: boolean}): Promise<null> | null;
  namespace confetti { function reset(): void; }
  export default confetti;
}
