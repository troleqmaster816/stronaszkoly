import React from "react";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary";
};

export function Badge({ variant = "default", className = "", ...props }: BadgeProps) {
  const base = "inline-flex items-center rounded-full px-2 py-1 text-xs border";
  const styles =
    variant === "secondary"
      ? "bg-slate-100 text-slate-700 border-slate-200"
      : "bg-slate-900 text-white border-slate-900";
  return <span className={`${base} ${styles} ${className}`} {...props} />;
}

export default Badge;


