import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { CodeEditor } from "../../components/ui/code-editor";
import { useAppStore } from "../../store/use-app-store";
import { generateCurl, parseCurl } from "./curl";

export function CurlDialog({ open, mode, onOpenChange }: { open: boolean; mode: "generate" | "import"; onOpenChange: (open: boolean) => void }) {
  const draft = useAppStore((state) => state.draft);
  const importDraft = useAppStore((state) => state.importDraft);
  const [value, setValue] = useState("");
  useEffect(() => { if (open) setValue(mode === "generate" ? generateCurl(draft) : "curl "); }, [draft, mode, open]);
  const submit = async () => {
    if (mode === "generate") { await navigator.clipboard.writeText(value); toast.success("cURL copied"); return; }
    try { importDraft(parseCurl(value)); onOpenChange(false); toast.success("cURL imported"); }
    catch (error) { toast.error("Could not import cURL", { description: error instanceof Error ? error.message : "Check the command and try again." }); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title={mode === "generate" ? "cURL snippet" : "Import cURL"} description={mode === "generate" ? "Credential values are replaced with variable placeholders." : "Paste a cURL command to open it as a new unsaved request."}>
    <CodeEditor className="h-72" value={value} onChange={setValue} language="plaintext" ariaLabel={mode === "generate" ? "Generated cURL" : "cURL command"} />
    <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void submit()}>{mode === "generate" ? "Copy" : "Import"}</Button></div>
  </DialogContent></Dialog>;
}
