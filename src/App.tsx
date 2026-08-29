import { TooltipProvider } from "@radix-ui/react-tooltip";
import { AppNotifications } from "./components/app-notifications";
import { ErrorBoundary } from "./components/error-boundary";
import { AppShell } from "./components/layout/app-shell";
import { SplashScreen } from "./components/splash-screen";
import "./App.css";

function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={350}>
        <AppShell />
        <AppNotifications />
        <SplashScreen />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
