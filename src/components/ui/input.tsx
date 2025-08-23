import React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${className}`}
      {...props}
    />
  );
}

export default Input;


