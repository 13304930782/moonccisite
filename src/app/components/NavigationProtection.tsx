import { useI18n } from '../i18n';
import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { hasUnsavedChanges, preservesFormNavigation } from '../lib/useUnsavedLeave';
import { confirmAction } from '../lib/confirmAction';
export function NavigationProtection() {
  const { t } = useI18n();
  const blocker = useBlocker(navigation => !preservesFormNavigation(navigation)&&hasUnsavedChanges());
  const latest = useRef(blocker); latest.current = blocker;
  const asking = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return;
    asking.current = true;
    void confirmAction(t("m_89ba873bd6"), t("m_ccb06b8a18")).then(ok => {
      asking.current = false;
      if (latest.current.state === 'blocked') {
        if (ok) latest.current.proceed(); else latest.current.reset();
      }
    });
  }, [blocker]);
  return null;
}
