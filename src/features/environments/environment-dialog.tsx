import { Clipboard, Eye, EyeOff, LockKeyhole, Plus, Save, Trash2, UnlockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { normalizeApplicationError } from "../../lib/application-error";
import { useAppStore } from "../../store/use-app-store";
import type { EnvironmentVariable } from "../../types/environment";
import * as client from "./environment-client";

const selectClass = "h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm";

function VariableRow({ variable }: { variable: EnvironmentVariable }) {
  const unlocked = useAppStore((state) => state.secretStoreStatus.unlocked);
  const saveVariable = useAppStore((state) => state.saveEnvironmentVariable);
  const deleteVariable = useAppStore((state) => state.deleteEnvironmentVariable);
  const [name, setName] = useState(variable.name);
  const [value, setValue] = useState(variable.value);
  const [secret, setSecret] = useState(variable.isSecret);
  const [revealed, setRevealed] = useState<string | null>(null);

  const reveal = async () => {
    if (revealed !== null) { setRevealed(null); return; }
    try { setRevealed(await client.revealEnvironmentVariable(variable.id)); }
    catch (error) {
      const normalized = normalizeApplicationError(error);
      toast.error(normalized.title, { description: normalized.message });
    }
  };
  const copy = async () => {
    try {
      const secretValue = revealed ?? await client.revealEnvironmentVariable(variable.id);
      await navigator.clipboard.writeText(secretValue);
      toast.success("Secret copied");
    } catch (error) {
      const normalized = normalizeApplicationError(error);
      toast.error(normalized.title, { description: normalized.message });
    }
  };
  const save = async () => {
    await saveVariable({ id: variable.id, environmentId: variable.environmentId, name, value, isSecret: secret });
    if (secret) { setValue(""); setRevealed(null); }
  };

  return (
    <div className="grid grid-cols-[minmax(110px,0.8fr)_minmax(150px,1.2fr)_auto] items-center gap-2 border-b border-[var(--border)] py-2">
      <Input aria-label={`Variable name ${variable.name}`} value={name} onChange={(event) => setName(event.target.value)} />
      <div className="flex min-w-0 items-center gap-1">
        <Input aria-label={`Value for ${variable.name}`} type={secret && revealed === null ? "password" : "text"} value={secret ? (revealed ?? value) : value} placeholder={secret && variable.hasSecret ? "Stored in vault" : "Value"} onChange={(event) => { setValue(event.target.value); setRevealed(null); }} autoComplete="off" />
        {secret && variable.hasSecret ? <>
          <Button variant="ghost" size="icon" onClick={() => void reveal()} disabled={!unlocked} aria-label={revealed === null ? `Reveal ${name}` : `Hide ${name}`} title={revealed === null ? "Reveal" : "Hide"}>{revealed === null ? <Eye size={14} /> : <EyeOff size={14} />}</Button>
          <Button variant="ghost" size="icon" onClick={() => void copy()} disabled={!unlocked} aria-label={`Copy ${name}`} title="Copy secret"><Clipboard size={14} /></Button>
        </> : null}
      </div>
      <div className="flex items-center gap-1">
        <label className="flex items-center gap-1 text-xs text-[var(--muted)]"><input type="checkbox" checked={secret} onChange={(event) => { setSecret(event.target.checked); setValue(""); setRevealed(null); }} /> Secret</label>
        <Button variant="ghost" size="icon" disabled={secret && !unlocked} onClick={() => void save()} aria-label={`Save ${name}`}><Save size={14} /></Button>
        <Button variant="danger" size="icon" onClick={() => void deleteVariable(variable.id)} aria-label={`Delete ${name}`}><Trash2 size={14} /></Button>
      </div>
    </div>
  );
}

export function EnvironmentDialog() {
  const open = useAppStore((state) => state.environmentDialogOpen);
  const setOpen = useAppStore((state) => state.setEnvironmentDialogOpen);
  const environments = useAppStore((state) => state.environments);
  const variables = useAppStore((state) => state.environmentVariables);
  const activeEnvironmentId = useAppStore((state) => state.activeEnvironmentId);
  const vault = useAppStore((state) => state.secretStoreStatus);
  const createEnvironment = useAppStore((state) => state.createEnvironment);
  const renameEnvironment = useAppStore((state) => state.renameEnvironment);
  const deleteEnvironment = useAppStore((state) => state.deleteEnvironment);
  const setActiveEnvironment = useAppStore((state) => state.setActiveEnvironment);
  const saveVariable = useAppStore((state) => state.saveEnvironmentVariable);
  const unlock = useAppStore((state) => state.unlockSecretStore);
  const lock = useAppStore((state) => state.lockSecretStore);
  const [password, setPassword] = useState("");
  const [environmentName, setEnvironmentName] = useState("");
  const [scope, setScope] = useState<string>("workspace");
  const [variableName, setVariableName] = useState("");
  const [variableValue, setVariableValue] = useState("");
  const [variableSecret, setVariableSecret] = useState(false);

  useEffect(() => {
    if (scope !== "workspace" && !environments.some((item) => item.id === scope)) setScope("workspace");
  }, [environments, scope]);

  const scopedVariables = variables.filter((variable) => variable.environmentId === (scope === "workspace" ? null : scope));
  const selectedEnvironment = environments.find((item) => item.id === scope);
  const submitUnlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await unlock(password)) setPassword("");
  };
  const addVariable = async (event: React.FormEvent) => {
    event.preventDefault();
    await saveVariable({ id: null, environmentId: scope === "workspace" ? null : scope, name: variableName, value: variableValue, isSecret: variableSecret });
    setVariableName(""); setVariableValue(""); setVariableSecret(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] w-[min(760px,calc(100vw-32px))] overflow-auto panel-scroll" title="Environments & secrets" description="Workspace values apply everywhere; the active environment overrides matching names.">
        <section className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">{vault.unlocked ? <UnlockKeyhole size={16} /> : <LockKeyhole size={16} />} Secret vault</div>
          {vault.unlocked ? (
            <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]"><span>Unlocked. Secret values require an explicit reveal, copy, save, or send action.</span><Button variant="secondary" size="sm" onClick={() => void lock()}>Lock</Button></div>
          ) : (
            <form className="mt-3 flex gap-2" onSubmit={submitUnlock}>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={vault.initialized ? "Master password" : "Create a master password"} aria-label="Vault master password" autoComplete="off" />
              <Button type="submit" disabled={password.length === 0}>{vault.initialized ? "Unlock" : "Create vault"}</Button>
            </form>
          )}
        </section>

        <section className="mt-5 grid gap-3">
          <label className="grid gap-1 text-sm font-medium">Active environment
            <select className={selectClass} value={activeEnvironmentId ?? ""} onChange={(event) => void setActiveEnvironment(event.target.value || null)}><option value="">No environment</option>{environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select>
          </label>
          <div className="flex gap-2">
            <Input value={environmentName} onChange={(event) => setEnvironmentName(event.target.value)} placeholder="Environment name" aria-label="Environment name" />
            <Button variant="secondary" onClick={() => { void createEnvironment(environmentName); setEnvironmentName(""); }} disabled={!environmentName.trim()}><Plus size={14} /> Add</Button>
            {selectedEnvironment ? <><Button variant="secondary" onClick={() => void renameEnvironment(selectedEnvironment.id, environmentName)} disabled={!environmentName.trim()}><Save size={14} /> Rename selected</Button><Button variant="danger" onClick={() => void deleteEnvironment(selectedEnvironment.id)}><Trash2 size={14} /> Delete selected</Button></> : null}
          </div>
        </section>

        <section className="mt-5">
          <div className="flex items-end justify-between gap-3">
            <div><h3 className="text-sm font-semibold">Variables</h3><p className="mt-1 text-xs text-[var(--muted)]">Reference values with <code>{"{{name}}"}</code>.</p></div>
            <label className="grid gap-1 text-xs text-[var(--muted)]">Scope<select className={selectClass} value={scope} onChange={(event) => setScope(event.target.value)}><option value="workspace">Workspace</option>{environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select></label>
          </div>
          <form className="mt-3 grid grid-cols-[minmax(110px,0.8fr)_minmax(150px,1.2fr)_auto] items-center gap-2 rounded-md bg-[var(--surface-muted)] p-2" onSubmit={addVariable}>
            <Input value={variableName} onChange={(event) => setVariableName(event.target.value)} placeholder="baseUrl" aria-label="New variable name" />
            <Input type={variableSecret ? "password" : "text"} value={variableValue} onChange={(event) => setVariableValue(event.target.value)} placeholder="Value" aria-label="New variable value" autoComplete="off" />
            <div className="flex items-center gap-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={variableSecret} onChange={(event) => setVariableSecret(event.target.checked)} /> Secret</label><Button type="submit" size="sm" disabled={!variableName.trim() || (variableSecret && !vault.unlocked)}><Plus size={14} /> Add</Button></div>
          </form>
          <div className="mt-2">{scopedVariables.length === 0 ? <p className="py-6 text-center text-xs text-[var(--muted)]">No variables in this scope.</p> : scopedVariables.map((variable) => <VariableRow key={variable.id} variable={variable} />)}</div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
