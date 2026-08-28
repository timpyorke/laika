import { lazy, Suspense } from "react";

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language: "json" | "plaintext";
  readOnly?: boolean;
  ariaLabel: string;
  className?: string;
}

const MonacoCodeEditor = lazy(() => import("./monaco-code-editor"));

export function CodeEditor(props: CodeEditorProps) {
  if (import.meta.env.MODE === "test") {
    return <textarea className={props.className} aria-label={props.ariaLabel} value={props.value} readOnly={props.readOnly} onChange={(event) => props.onChange?.(event.target.value)} />;
  }
  return <Suspense fallback={<div className={`flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)] text-xs text-[var(--muted)] ${props.className ?? ""}`} role="status">Loading editor…</div>}><MonacoCodeEditor {...props} /></Suspense>;
}
