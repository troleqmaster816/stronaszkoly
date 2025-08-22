import React, { createContext, useContext } from "react";

type TabsCtx = { value: string; onValueChange: (v: string) => void };
const Ctx = createContext<TabsCtx | null>(null);

export function Tabs({ value, onValueChange, className = "", children }: {
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Ctx.Provider value={{ value, onValueChange }}>
      <div className={className} data-value={value}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({ className = "", children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className}>{children}</div>;
}

export function TabsTrigger({ value, className = "", children }: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(Ctx);
  return (
    <button
      className={className}
      data-value={value}
      aria-pressed={ctx?.value === value}
      onClick={() => ctx?.onValueChange(value)}
    >
      {children}
    </button>
  );
}


