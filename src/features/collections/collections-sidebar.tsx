import { ChevronRight, Folder, Search } from "lucide-react";
import { Input } from "../../components/ui/input";

export function CollectionsSidebar() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 panel-scroll">
      <label className="relative block">
        <Search className="absolute left-2.5 top-2.5 text-[var(--muted)]" size={15} />
        <Input className="w-full pl-8" placeholder="Search collections" aria-label="Search collections" />
      </label>
      <button className="mt-4 flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-[var(--surface-muted)]">
        <ChevronRight size={15} className="text-[var(--muted)]" />
        <Folder size={16} className="text-[#d19a24]" />
        <span className="truncate">Getting started</span>
        <span className="ml-auto text-xs text-[var(--muted)]">0</span>
      </button>
    </div>
  );
}
