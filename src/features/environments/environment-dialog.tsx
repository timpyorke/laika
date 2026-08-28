import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { useAppStore } from "../../store/use-app-store";

export function EnvironmentDialog() {
  const open = useAppStore((state) => state.environmentDialogOpen);
  const setOpen = useAppStore((state) => state.setEnvironmentDialogOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Environments" description="Choose values for the current workspace.">
        <label className="grid gap-2 text-sm font-medium">
          Active environment
          <select className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm">
            <option>No environment</option>
          </select>
        </label>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Input placeholder="Variable" aria-label="Environment variable" disabled />
          <Input placeholder="Value" aria-label="Environment value" disabled />
        </div>
      </DialogContent>
    </Dialog>
  );
}
