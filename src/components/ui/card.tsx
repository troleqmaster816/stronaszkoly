import React from "react";

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white text-slate-900 shadow ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-4 border-b border-slate-200 ${className}`} {...props} />;
}

export function CardTitle({ className = "", ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`text-base font-semibold ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`p-4 ${className}`} {...props} />;
}

export default Card;


