import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useAppStore } from "../store/use-app-store";
import { cn } from "../lib/utils";
import { LaikaGlyph } from "./ui/laika-mark";

const FADE_MS = 300;

/**
 * Covers the window with the app's own background from first paint until the
 * workspace finishes its initial load, so launch never shows the native
 * window's default white canvas or an empty shell. Only reacts to the first
 * workspaceLoading transition — later reloads (e.g. after creating a
 * collection) must not bring the splash back.
 */
export function SplashScreen() {
  const workspaceLoading = useAppStore((state) => state.workspaceLoading);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (!workspaceLoading) setHasLoadedOnce(true);
  }, [workspaceLoading]);

  useEffect(() => {
    if (!hasLoadedOnce) return;
    const timer = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [hasLoadedOnce]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden={hasLoadedOnce}
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[var(--background)] transition-opacity ease-out",
        hasLoadedOnce ? "opacity-0" : "opacity-100",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--background)]">
        <LaikaGlyph size={30} className="[stroke-width:1.6]" />
      </span>
      <span className="font-display text-[17px] font-semibold tracking-[0.01em] text-[var(--foreground)]">Laika</span>
      <span className="flex items-center gap-2 text-[11.5px] text-[var(--muted)]" role="status">
        <LoaderCircle className="animate-spin" size={14} />
        Loading workspace…
      </span>
    </div>
  );
}
