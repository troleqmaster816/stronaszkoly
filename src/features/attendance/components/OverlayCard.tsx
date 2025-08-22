import React from 'react'
import { motion } from 'framer-motion'

export function OverlayCard({ title, children, size }: {title:string; children: React.ReactNode; size?: 'default'|'wide'}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
        className={`${size === 'wide' ? 'w-full max-w-[min(96vw,1300px)]' : 'w-full max-w-2xl'} bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl p-4`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        {children}
      </motion.div>
    </div>
  );
}


