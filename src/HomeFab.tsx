import React from "react";
import { Home } from "lucide-react";

export default function HomeFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Powrót do hubu"
      className="fixed bottom-4 right-4 z-[45] inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-900 shadow-lg ring-1 ring-slate-200 backdrop-blur hover:bg-white print:hidden"
    >
      <Home className="h-4 w-4" />
      Strona główna
    </button>
  );
}


