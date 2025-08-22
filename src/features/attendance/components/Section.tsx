import React from 'react'

export function Section({title, icon, children, right}: {title:string; icon: React.ReactNode; children: React.ReactNode; right?:React.ReactNode}) {
  return (
    <section className="bg-neutral-950 border border-neutral-800 rounded-xl">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">{icon}<h2 className="font-semibold">{title}</h2></div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}


