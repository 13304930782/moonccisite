import { installMotionPreference } from './app/lib/motionPreference';
import { AppErrorBoundary, StartupComplete } from './app/components/AppErrorBoundary';

  import { createRoot, hydrateRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import "./styles/motion.css";

  window.addEventListener('vite:preloadError', event => {
    try {
      if (window.sessionStorage.getItem('mooncci:preload-reloaded')) return;
      window.sessionStorage.setItem('mooncci:preload-reloaded', '1');
    } catch {
      return;
    }
    event.preventDefault();
    window.location.reload();
  });

  installMotionPreference();
  const root = document.getElementById("root")!;
  const seed = document.getElementById('mooncci-document-data');
  const documentData = seed ? JSON.parse(seed.textContent || '{}') : undefined;
  if(seed) document.documentElement.dataset.documentHydrating='true';
  const app = <AppErrorBoundary><App documentData={documentData}/><StartupComplete /></AppErrorBoundary>;
  if (seed) hydrateRoot(root, app); else createRoot(root).render(app);
