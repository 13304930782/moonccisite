import { installMotionPreference } from './app/lib/motionPreference';
import { AppErrorBoundary, StartupComplete } from './app/components/AppErrorBoundary';

  import { createRoot, hydrateRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import "./styles/motion.css";

  installMotionPreference();
  const root = document.getElementById("root")!;
  const seed = document.getElementById('mooncci-document-data');
  const documentData = seed ? JSON.parse(seed.textContent || '{}') : undefined;
  if(seed) document.documentElement.dataset.documentHydrating='true';
  const app = <AppErrorBoundary><App documentData={documentData}/><StartupComplete /></AppErrorBoundary>;
  if (seed) hydrateRoot(root, app); else createRoot(root).render(app);
  