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

/**
 * Editor themes drawn from the same Ajman palette as the rest of the app, so a
 * JSON body reads as part of the panel rather than as an embedded IDE.
 */
monaco.editor.defineTheme("laika-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "", foreground: "9FB2B4" },
    { token: "string.key.json", foreground: "86BFCB" },
    { token: "string.value.json", foreground: "C9B96C" },
    { token: "string", foreground: "C9B96C" },
    { token: "number", foreground: "5BA1A6" },
    { token: "keyword.json", foreground: "D6C06A" },
    { token: "keyword", foreground: "D6C06A" },
    { token: "delimiter", foreground: "628288" },
    { token: "comment", foreground: "547278", fontStyle: "italic" },
  ],
  colors: {
    "editor.background": "#05283A",
    "editor.foreground": "#E5E1D2",
    "editorLineNumber.foreground": "#416069",
    "editorLineNumber.activeForeground": "#9FB2B4",
    "editorGutter.background": "#062F45",
    "editor.lineHighlightBackground": "#073349",
    "editor.selectionBackground": "#0F5070",
    "editor.inactiveSelectionBackground": "#0B4360",
    "editorCursor.foreground": "#C4692F",
    "editorWidget.background": "#073349",
    "editorWidget.border": "#0F5070",
    "editorIndentGuide.background1": "#0A3A53",
    "scrollbarSlider.background": "#0F507080",
    "scrollbarSlider.hoverBackground": "#15678B80",
  },
});

monaco.editor.defineTheme("laika-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "", foreground: "2E3A42" },
    { token: "string.key.json", foreground: "1A5F7A" },
    { token: "string.value.json", foreground: "8A6A1E" },
    { token: "string", foreground: "8A6A1E" },
    { token: "number", foreground: "2A7F8E" },
    { token: "keyword.json", foreground: "9A7F22" },
    { token: "keyword", foreground: "9A7F22" },
    { token: "delimiter", foreground: "8A8C7E" },
    { token: "comment", foreground: "9A9B8B", fontStyle: "italic" },
  ],
  colors: {
    "editor.background": "#FBF8F0",
    "editor.foreground": "#14212B",
    "editorLineNumber.foreground": "#B5B3A0",
    "editorLineNumber.activeForeground": "#7A7E72",
    "editorGutter.background": "#F2EDE0",
    "editor.lineHighlightBackground": "#F2EDE0",
    "editor.selectionBackground": "#E3DCC7",
    "editorCursor.foreground": "#B2521F",
    "editorWidget.background": "#EFEADC",
    "editorWidget.border": "#D8CFB9",
    "editorIndentGuide.background1": "#E3DCC7",
  },
});

export default function MonacoCodeEditor({ value, onChange, language, readOnly = false, ariaLabel, className }: CodeEditorProps) {
  const theme = useAppStore((state) => state.theme);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const [wrap, setWrap] = useState(true);
  const mount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.getDomNode()?.setAttribute("aria-label", ariaLabel);
  };
  return <div className={`relative min-h-0 overflow-hidden bg-[var(--background)] ${className ?? ""}`}>
    <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5 shadow-sm">
      {language === "json" && !readOnly ? <Button variant="ghost" size="icon" className="h-6 w-6" title="Format JSON" aria-label="Format JSON" onClick={() => void editorRef.current?.getAction("editor.action.formatDocument")?.run()}><Braces size={13} /></Button> : null}
      <Button variant="ghost" size="icon" className="h-6 w-6" title="Toggle line wrapping" aria-label="Toggle line wrapping" aria-pressed={wrap} onClick={() => setWrap((value) => !value)}><WrapText size={13} /></Button>
    </div>
    <Editor
      height="100%"
      language={language}
      value={value}
      theme={theme === "dark" ? "laika-dark" : "laika-light"}
      onMount={mount}
      onChange={(next) => onChange?.(next ?? "")}
      options={{
        readOnly,
        ariaLabel,
        automaticLayout: true,
        minimap: { enabled: false },
        fontFamily: "'IBM Plex Mono', ui-monospace, Consolas, monospace",
        fontSize: 12,
        lineHeight: 21,
        padding: { top: 8, bottom: 8 },
        scrollBeyondLastLine: false,
        wordWrap: wrap ? "on" : "off",
        wrappingIndent: "indent",
        accessibilitySupport: "auto",
        renderValidationDecorations: "on",
        tabSize: 2,
      }}
    />
  </div>;
}
