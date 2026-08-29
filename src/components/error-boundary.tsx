import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/button";

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State { return { hasError: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render error", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex h-full items-center justify-center bg-[var(--background)] p-8 text-[var(--foreground)]">
          <div className="max-w-md text-center">
            <h1 className="font-display text-[20px] font-semibold">Laika could not open this view</h1>
            <p className="mt-2 text-[12.5px] text-[var(--muted)]">Reload the workspace to continue.</p>
            <Button className="mt-5" onClick={() => window.location.reload()}>Reload workspace</Button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
