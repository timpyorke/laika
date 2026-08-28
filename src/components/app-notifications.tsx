import { Toaster } from "sonner";
import { useAppStore } from "../store/use-app-store";

export function AppNotifications() {
  const theme = useAppStore((state) => state.theme);
  return <Toaster theme={theme} position="bottom-right" richColors closeButton />;
}
