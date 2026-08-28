import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import "monaco-editor/language/json/monaco.contribution";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import { Braces, WrapText } from "lucide-react";
import { useRef, useState } from "react";
import { useAppStore } from "../../store/use-app-store";
import { Button } from "./button";
import type { CodeEditorProps } from "./code-editor";

self.MonacoEnvironment = { getWorker(_workerId: string, label: string) { return label === "json" ? new jsonWorker() : new editorWorker(); } };
loader.config({ monaco });

export default function MonacoCodeEditor({ value, onChange, language, readOnly = false, ariaLabel, className }: CodeEditorProps) {
  const theme = useAppStore((state) => state.theme);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const [wrap, setWrap] = useState(true);
  const mount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.getDomNode()?.setAttribute("aria-label", ariaLabel);
  };
  return <div className={`relative min-h-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--background)] ${className ?? ""}`}>
    <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] p-0.5 shadow-sm">
      {language === "json" && !readOnly ? <Button variant="ghost" size="icon" className="h-7 w-7" title="Format JSON" aria-label="Format JSON" onClick={() => void editorRef.current?.getAction("editor.action.formatDocument")?.run()}><Braces size={14} /></Button> : null}
      <Button variant="ghost" size="icon" className="h-7 w-7" title="Toggle line wrapping" aria-label="Toggle line wrapping" aria-pressed={wrap} onClick={() => setWrap((value) => !value)}><WrapText size={14} /></Button>
    </div>
    <Editor height="100%" language={language} value={value} theme={theme === "dark" ? "vs-dark" : "light"} onMount={mount} onChange={(next) => onChange?.(next ?? "")} options={{ readOnly, ariaLabel, automaticLayout: true, minimap: { enabled: false }, fontSize: 13, lineHeight: 20, padding: { top: 12, bottom: 12 }, scrollBeyondLastLine: false, wordWrap: wrap ? "on" : "off", wrappingIndent: "indent", accessibilitySupport: "auto", renderValidationDecorations: "on", tabSize: 2 }} />
  </div>;
}
