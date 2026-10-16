import { useEffect } from 'react';
import { installControlMotion } from '../lib/controlMotion';
import { installSurfaceMotion } from '../lib/surfaceMotion';

export default function MotionExperience() {
  useEffect(() => {
    let frame = 0, stop = () => {};
    const start = () => {
      // Do not change the owner of a press already using the CSS fallback.
      if (document.querySelector('button:active,a:active,[role=button]:active')) { frame = requestAnimationFrame(start); return; }
      const stopControls = installControlMotion(), stopSurfaces = installSurfaceMotion();
      stop = () => { stopControls(); stopSurfaces(); };
    };
    start();
    return () => { cancelAnimationFrame(frame); stop(); };
  }, []);
  return null;
}
