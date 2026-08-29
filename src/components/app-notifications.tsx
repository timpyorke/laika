import { Toaster } from "sonner";
import { useAppStore } from "../store/use-app-store";

/**
 * Toasts are themed off the app tokens rather than sonner's defaults so a
 * failure notice reads as part of the panel chrome, not as a foreign widget.
 */
export function AppNotifications() {
  const theme = useAppStore((state) => state.theme);
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      closeButton
      style={{
        fontFamily: "var(--font-sans)",
        "--normal-bg": "var(--surface-raised)",
        "--normal-text": "var(--foreground)",
        "--normal-border": "var(--border-strong)",
        "--success-bg": "var(--surface-raised)",
        "--success-text": "var(--success)",
        "--success-border": "var(--border-strong)",
        "--error-bg": "var(--surface-raised)",
        "--error-text": "var(--danger)",
        "--error-border": "var(--danger-strong)",
        "--warning-bg": "var(--surface-raised)",
        "--warning-text": "var(--warning)",
        "--warning-border": "var(--border-strong)",
      } as React.CSSProperties}
      toastOptions={{ classNames: { title: "text-[12.5px] font-medium", description: "text-[11.5px]" } }}
    />
  );
}
