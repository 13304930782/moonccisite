import { installMotionPreference } from './app/lib/motionPreference';
import { AppErrorBoundary, StartupComplete } from './app/components/AppErrorBoundary';

  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import "./styles/motion.css";

  installMotionPreference();
  createRoot(document.getElementById("root")!).render(<AppErrorBoundary><App /><StartupComplete /></AppErrorBoundary>);
  