import { installMotionPreference } from './app/lib/motionPreference';
import { AppErrorBoundary, StartupComplete } from './app/components/AppErrorBoundary';
import {ensureMessages} from './app/i18n';
import {languageLoadError,splitLocalePath} from './app/lib/locale';
import { isChunkErrorHandled } from './app/lib/recoverableChunk';

  import { createRoot, hydrateRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import "./styles/motion.css";

  window.addEventListener('vite:preloadError', event => {
    // Let the importing control handle its own failure before considering reload.
    // Do not cancel the event: Vite must reject with the same error object.
    setTimeout(() => {
    if (isChunkErrorHandled((event as Event & { payload?: unknown }).payload)) return;
    try {
      if (window.sessionStorage.getItem('mooncci:preload-reloaded')) return;
      window.sessionStorage.setItem('mooncci:preload-reloaded', '1');
    } catch {
      return;
    }
    window.location.reload();
    }, 0);
  });

  installMotionPreference();
  const root = document.getElementById("root")!;
  const seed = document.getElementById('mooncci-document-data');
  const documentData = seed ? JSON.parse(seed.textContent || '{}') : undefined;
  if(seed) document.documentElement.dataset.documentHydrating='true';
  const app = <AppErrorBoundary><App documentData={documentData}/><StartupComplete /></AppErrorBoundary>;
  async function start() {
    try {
      await ensureMessages(splitLocalePath(window.location.pathname).locale);
      if (seed) hydrateRoot(root, app); else createRoot(root).render(app);
    } catch {
      const notice=document.createElement('p');notice.setAttribute('role','alert');
      notice.textContent=languageLoadError(splitLocalePath(window.location.pathname).locale);
      root.prepend(notice);
    }
  }
  void start();
