import { cn } from "../../lib/utils";

/**
 * The orbit glyph from the Laika mark — a body inside a tilted orbital ring.
 * Drawn in `currentColor` so it can sit on a tile or stand alone in an empty state.
 */
export function LaikaGlyph({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.1" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9.6" ry="4.5" transform="rotate(-28 12 12)" />
    </svg>
  );
}

/** Brand tile: the glyph knocked out of a burnt-sienna rounded square. */
export function LaikaMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent)] text-[var(--background)]",
        className,
      )}
      aria-hidden="true"
    >
      <LaikaGlyph size={15} className="[stroke-width:1.8]" />
    </span>
  );
}
