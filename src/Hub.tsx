import React from "react";
import { CalendarDays, FileText, ListChecks } from "lucide-react";

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

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center px-4 py-10 text-white">
        <header className="w-full">
          <h1 className="mx-auto max-w-5xl text-center text-3xl font-extrabold leading-tight tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] sm:text-4xl md:text-5xl">
            Zespół Szkół Elektronicznych im. Stanisława Staszica
            <br className="hidden sm:block" />
            w Zduńskiej Woli
          </h1>
          <p className="mx-auto mt-3 max-w-3xl text-center text-sm text-zinc-100/90 drop-shadow">
            Nowy hub – szybki dostęp do planu lekcji, harmonogramu i statutu szkoły.
          </p>
        </header>

        <main className="mt-10 w-full max-w-3xl">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-2 rounded-2xl border border-white/20 bg-white/25 p-4 text-left shadow-lg backdrop-blur-md hover:bg-white/35 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-white/50 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/25 text-white drop-shadow">
          {icon}
        </span>
        <span className="text-lg font-semibold sm:text-xl drop-shadow">{title}</span>
      </div>
      <p className="text-sm text-zinc-100/95">{description}</p>
      <span className="mt-1 text-sm text-white/90 underline-offset-2 group-hover:underline">Przejdź</span>
    </button>
  );
}


