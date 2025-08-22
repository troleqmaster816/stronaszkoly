import React from "react";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline";
};

export function Button({ variant = "default", className = "", ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 transition";
  const styles =
    variant === "outline"
      ? "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 focus:ring-slate-300"
      : "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-400";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export default Button;


