import React from "react";
import { CalendarDays, FileText, ListChecks } from "lucide-react";
import { motion } from "framer-motion";
import NewsSection from "./features/news/NewsSection";

type HubProps = {
  navigate: (to: string) => void;
};

export default function Hub({ navigate }: HubProps) {
  return (
    <div className="relative min-h-screen w-full">
      {/* Background image */}
      <img
        src="/szkola.png"
        alt="Zespół Szkół Elektronicznych im. Stanisława Staszica w Zduńskiej Woli"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-black/50" />
      {/* Subtle grid overlay to reinforce tech theme */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center px-4 py-10 text-white">
        <header className="w-full">
          <div className="relative mx-auto max-w-5xl text-center">
            {/* dekoracyjna poświata pod tytułem (elektroniczny klimat) */}
            <div className="pointer-events-none absolute -inset-x-20 -top-8 -bottom-8 opacity-60 blur-2xl">
              <div className="mx-auto h-full w-full max-w-4xl rounded-full bg-gradient-to-r from-cyan-400/25 via-emerald-300/20 to-violet-400/25" />
            </div>

            {/* usunięto ikonę nad tytułem */}

            <h1 className="relative mx-auto max-w-5xl text-center text-3xl font-extrabold leading-tight tracking-tight font-space-grotesk neon-title sm:text-4xl md:text-5xl">
              <span className="block uppercase tracking-tight sm:text-5xl md:text-6xl shimmer">
                Zespół Szkół Elektronicznych
              </span>
              <span className="block mt-1 leading-tight">
                <span className="opacity-90">im.</span>{' '}
                <span className="uppercase shimmer">Stanisława Staszica</span>
              </span>
              <span className="neon-underline block mt-1 uppercase tracking-wider sm:text-4xl md:text-5xl">
                W Zduńskiej Woli
              </span>
            </h1>
            <div className="relative mx-auto mt-3 h-1 w-40 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-violet-400 shadow-[0_0_24px_rgba(59,130,246,0.35)]" />
          </div>
        </header>

        <main className="mt-10 w-full">
          {/* Symmetrical 2x2 grid on desktop, stacked on mobile */}
          <div className="mx-auto max-w-3xl grid grid-cols-1 gap-4 sm:grid-cols-2">
            <HubTile
              title="Plan lekcji"
              description="Przeglądaj interaktywny plan dla klas, nauczycieli i sal."
              icon={<CalendarDays className="h-6 w-6" />}
              onClick={() => navigate("/plan")}
            />
            <HubTile
              title="Frekwencja"
              description="Zarządzaj obecnościami i planami zajęć."
              icon={<ListChecks className="h-6 w-6" />}
              onClick={() => navigate("/frekwencja")}
            />
            <HubTile
              title="Harmonogram"
              description="Wydarzenia, rady, terminy."
              icon={<ListChecks className="h-6 w-6" />}
              onClick={() => navigate("/harmonogram")}
            />
            <HubTile
              title="Statut szkoły"
              description="Przejrzyj statut szkoły."
              icon={<FileText className="h-6 w-6" />}
              onClick={() => navigate("/statut")}
            />
          </div>

          <div className="mt-16">
            <NewsSection />
          </div>
        </main>

        <footer className="mt-auto w-full pt-10 text-center text-xs text-zinc-200/90">
          © {new Date().getFullYear()} ZSE Zduńska Wola
        </footer>
      </div>
    </div>
  );
}

function HubTile({
  title,
  description,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      transition={{ type: "spring", stiffness: 220, damping: 20, mass: 0.6 }}
      className="group relative flex h-[120px] flex-col justify-between overflow-hidden rounded-2xl bg-white/10 p-4 text-left text-white shadow-xl backdrop-blur-md"
    >
      {/* gradient border glow */}
      <span className="pointer-events-none absolute inset-px rounded-2xl bg-gradient-to-br from-cyan-300/10 via-emerald-300/10 to-violet-300/10 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100" />
      {/* sheen */}
      <span className="pointer-events-none absolute -inset-10 translate-y-10 rotate-12 bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100" />

      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white shadow-md">
          {icon}
        </span>
        <span className="text-lg font-semibold drop-shadow-sm">{title}</span>
      </div>

      <div className="relative">
        <p className="text-xs text-zinc-100/95 leading-snug max-w-sm">{description}</p>
        <span className="mt-1 inline-block text-xs text-white/90 underline-offset-2 group-hover:underline">Przejdź</span>
      </div>
    </motion.button>
  );
}


