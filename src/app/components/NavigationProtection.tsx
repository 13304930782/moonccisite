import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { hasUnsavedChanges } from '../lib/useUnsavedLeave';
import { confirmAction } from '../lib/confirmAction';
export function NavigationProtection() {
  const blocker = useBlocker(hasUnsavedChanges);
  const latest = useRef(blocker); latest.current = blocker;
  const asking = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return;
    asking.current = true;
    void confirmAction('仍有未同步的改动，离开后这些改动将丢失。', '放弃修改并离开').then(ok => {
      asking.current = false;
      if (latest.current.state === 'blocked') {
        if (ok) latest.current.proceed(); else latest.current.reset();
      }
    });
  }, [blocker]);
  return null;
}
