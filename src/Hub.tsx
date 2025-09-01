import React, { useEffect, useState } from "react";
import { CalendarDays, FileText, ListChecks } from "lucide-react";
import { motion } from "framer-motion";
import NewsSection from "./features/news/NewsSection";

type HubProps = {
  navigate: (to: string) => void;
};

export default function Hub({ navigate }: HubProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [me, setMe] = useState<{ id: string; username: string } | null>(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ username: "", password: "" });
  const [singleApiKey, setSingleApiKey] = useState<string | null>(null);
  const [articlesJob, setArticlesJob] = useState<{ id: string; status: string } | null>(null);
  const [articlesBusy, setArticlesBusy] = useState(false);
  const [ttBusy, setTtBusy] = useState(false);
  const [backups, setBackups] = useState<{ filename: string; size: number; mtime: string }[] | null>(null);

  const refreshMe = async () => {
    try {
      const res = await fetch('/v1/users/me', { credentials: 'include' });
      const j = await res.json();
      if (j?.ok && j.authenticated) {
        setIsAuth(true);
        setMe(j.user);
      } else {
        setIsAuth(false);
        setMe(null);
      }
    } catch {}
  };
  useEffect(() => { refreshMe(); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(loginForm) });
      if (!res.ok) { alert('Logowanie nieudane'); return; }
      setLoginForm({ username: '', password: '' });
      await refreshMe();
      await loadSingleKey();
    } catch {}
  };
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/v1/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(registerForm) });
      if (!res.ok) { const t = await res.json().catch(()=>({})); alert(t?.error || 'Rejestracja nieudana'); return; }
      setRegisterForm({ username: '', password: '' });
      await refreshMe();
      await loadSingleKey();
    } catch {}
  };
  const handleLogout = async () => {
    try { await fetch('/v1/logout', { method: 'POST', credentials: 'include' }); } finally { setIsAuth(false); setMe(null); }
  };
  const loadSingleKey = async () => {
    try {
      const res = await fetch('/v1/apikey', { credentials: 'include' });
      const j = await res.json();
      if (j?.ok) setSingleApiKey(j.apiKey);
    } catch {}
  };
  const regenSingleKey = async () => {
    try {
      const res = await fetch('/v1/apikey/regenerate', { method: 'POST', credentials: 'include' });
      const j = await res.json();
      if (j?.ok) setSingleApiKey(j.apiKey);
    } catch {}
  };

  const refreshTimetable = async () => {
    try {
      setTtBusy(true);
      const res = await fetch('/v1/refresh', { method: 'POST', credentials: 'include' });
      if (!res.ok) { const t = await res.json().catch(()=>({})); alert(t?.error || 'Nie udało się uruchomić odświeżania'); return; }
      alert('Plan został odświeżony.');
    } finally {
      setTtBusy(false);
    }
  };

  const loadBackups = async () => {
    try {
      const res = await fetch('/v1/timetable/backups', { credentials: 'include' });
      const j = await res.json();
      setBackups(Array.isArray(j?.data) ? j.data : []);
    } catch {}
  };

  const restoreBackup = async (filename: string) => {
    try {
      const res = await fetch('/v1/timetable/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ filename }) });
      if (!res.ok) { const t = await res.json().catch(()=>({})); alert(t?.error || 'Nie udało się przywrócić kopii'); return; }
      alert('Przywrócono wybrany plan.');
    } catch {}
  };

  const startArticlesScrape = async () => {
    try {
      setArticlesBusy(true);
      const res = await fetch('/v1/jobs/articles-scrape', { method: 'POST', credentials: 'include' });
      if (!res.ok) { const t = await res.json().catch(()=>({})); alert(t?.error || 'Nie udało się uruchomić zadania'); setArticlesBusy(false); return; }
      const j = await res.json();
      const jobId = j?.jobId;
      if (!jobId) { setArticlesBusy(false); return; }
      setArticlesJob({ id: jobId, status: 'queued' });
      // Poll co 2s do zakończenia
      const poll = async () => {
        try {
          const st = await fetch(`/v1/jobs/${encodeURIComponent(jobId)}`, { credentials: 'include' });
          const jj = await st.json();
          setArticlesJob({ id: jobId, status: jj?.status || 'unknown' });
          if (jj?.status === 'succeeded' || jj?.status === 'failed') {
            setArticlesBusy(false);
            if (jj?.status === 'succeeded') {
              // Odśwież newsy po zakończeniu (proste przeładowanie pliku statycznego)
              try { await fetch('/articles.json', { cache: 'no-store' }); } catch {}
            } else if (jj?.error) {
              console.error('Articles job error:', jj.error);
            }
            return;
          }
          setTimeout(poll, 2000);
        } catch {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 1500);
    } catch {
      setArticlesBusy(false);
    }
  };

  return (
    <div className="relative min-h-[100svh] w-full">
      {/* Background image */}
      <img
        src="/szkola.png"
        alt="Zespół Szkół Elektronicznych im. Stanisława Staszica w Zduńskiej Woli"
        className="absolute inset-0 h-full w-full object-cover object-top sm:object-center"
      />
      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-black/50" />
      {/* Subtle grid overlay to reinforce tech theme */}
      <div className="hidden sm:block pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col items-center px-4 pt-14 pb-20 sm:py-10 text-white">
        {/* Profile button */}
        <div className="absolute right-4 top-4">
          <button
            onClick={() => { setProfileOpen(true); if (isAuth) loadSingleKey(); }}
            className="px-3 py-1.5 rounded-lg border border-white/30 bg-black/40 hover:bg-black/60 backdrop-blur"
          >
            {isAuth ? (me?.username || 'Profil') : 'Zaloguj / Rejestracja'}
          </button>
        </div>
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

        <main className="mt-8 sm:mt-10 w-full">
          {/* Symmetrical 2x2 grid on desktop, stacked on mobile */}
          <div className="mx-auto max-w-3xl grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
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

          <div className="mt-12 sm:mt-16">
            <NewsSection />
          </div>
        </main>

        <footer className="mt-auto w-full pt-10 text-center text-xs text-zinc-200/90">
          © {new Date().getFullYear()} ZSE Zduńska Wola
        </footer>
      </div>

      {/* Profile modal */}
      {profileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setProfileOpen(false)} />
          <div className="relative z-10 w-[92vw] max-w-xl rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-zinc-100 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">{isAuth ? 'Mój profil' : 'Zaloguj się lub zarejestruj'}</div>
              <button onClick={()=>setProfileOpen(false)} className="px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800">Zamknij</button>
            </div>
            {!isAuth ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <form onSubmit={handleLogin} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  <div className="text-sm font-medium mb-2">Logowanie</div>
                  <input className="w-full mb-2 px-3 py-2 rounded bg-zinc-900 border border-zinc-700" placeholder="Nazwa użytkownika"
                         value={loginForm.username} onChange={e=>setLoginForm(s=>({ ...s, username: e.target.value }))} />
                  <input type="password" className="w-full mb-2 px-3 py-2 rounded bg-zinc-900 border border-zinc-700" placeholder="Hasło"
                         value={loginForm.password} onChange={e=>setLoginForm(s=>({ ...s, password: e.target.value }))} />
                  <button className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500" type="submit">Zaloguj</button>
                </form>
                <form onSubmit={handleRegister} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  <div className="text-sm font-medium mb-2">Rejestracja</div>
                  <input className="w-full mb-2 px-3 py-2 rounded bg-zinc-900 border border-zinc-700" placeholder="Nazwa użytkownika"
                         value={registerForm.username} onChange={e=>setRegisterForm(s=>({ ...s, username: e.target.value }))} />
                  <input type="password" className="w-full mb-2 px-3 py-2 rounded bg-zinc-900 border border-zinc-700" placeholder="Hasło (min. 6)"
                         value={registerForm.password} onChange={e=>setRegisterForm(s=>({ ...s, password: e.target.value }))} />
                  <button className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500" type="submit">Zarejestruj</button>
                </form>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  <div>
                    <div className="text-sm">Zalogowano jako</div>
                    <div className="text-lg font-semibold">{me?.username}</div>
                  </div>
                  <button onClick={handleLogout} className="px-3 py-2 rounded bg-red-600 hover:bg-red-500">Wyloguj</button>
                </div>
                <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                  <div className="text-sm font-medium mb-2">Klucz API (test)</div>
                  <div className="text-xs opacity-80 mb-2">Pojedynczy klucz do wszystkich endpointów. Na czas testów widoczny w panelu cały czas.</div>
                  <div className="flex items-center gap-2">
                    <input readOnly value={singleApiKey || ''} className="flex-1 px-3 py-2 rounded bg-zinc-900 border border-zinc-700 font-mono" />
                    <button onClick={()=>{ navigator.clipboard.writeText(singleApiKey || ''); }} className="px-3 py-2 rounded border border-zinc-700 hover:bg-zinc-800">Kopiuj</button>
                    <button onClick={regenSingleKey} className="px-3 py-2 rounded bg-amber-600 hover:bg-amber-500">Regeneruj</button>
                  </div>
                </section>
                {me?.username === 'admin' ? (
                  <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                    <div className="text-sm font-medium mb-2">Aktualności</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={startArticlesScrape}
                        disabled={articlesBusy}
                        className={`px-3 py-2 rounded ${articlesBusy ? 'bg-zinc-700' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                      >
                        {articlesBusy ? 'Aktualizuję…' : 'Aktualizuj artykuły'}
                      </button>
                      {articlesJob ? (
                        <span className="text-xs opacity-80">Status: {articlesJob.status}</span>
                      ) : null}
                    </div>
                    <div className="text-[11px] mt-2 opacity-70">Po zakończeniu zadania nowe artykuły pojawią się w sekcji aktualności.</div>
                  </section>
                ) : null}
                {me?.username === 'admin' ? (
                  <section className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                    <div className="text-sm font-medium mb-2">Plan lekcji</div>
                    <div className="flex items-center gap-2 mb-2">
                      <button onClick={refreshTimetable} disabled={ttBusy} className={`px-3 py-2 rounded ${ttBusy ? 'bg-zinc-700' : 'bg-blue-600 hover:bg-blue-500'}`}>{ttBusy ? 'Odświeżam…' : 'Odśwież plan teraz'}</button>
                      <button onClick={loadBackups} className="px-3 py-2 rounded border border-zinc-700 hover:bg-zinc-800">Pokaż kopie zapasowe</button>
                    </div>
                    {Array.isArray(backups) ? (
                      backups.length === 0 ? (
                        <div className="text-xs text-zinc-400">Brak kopii zapasowych.</div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto text-xs">
                          {backups.map((b) => (
                            <div key={b.filename} className="flex items-center justify-between py-1 border-b border-zinc-800 last:border-b-0">
                              <div className="truncate pr-2">{b.filename}</div>
                              <div className="flex items-center gap-2">
                                <span className="opacity-70">{new Date(b.mtime).toLocaleString()}</span>
                                <button onClick={() => restoreBackup(b.filename)} className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500">Przywróć</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    ) : null}
                    <div className="text-[11px] mt-2 opacity-70">Przechowujemy 5 ostatnich różnych wersji planu.</div>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
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
      className="group relative flex h-[112px] sm:h-[120px] flex-col justify-between overflow-hidden rounded-2xl bg-white/10 p-3.5 sm:p-4 text-left text-white shadow-xl backdrop-blur-md"
    >
      {/* gradient border glow */}
      <span className="pointer-events-none absolute inset-px rounded-2xl bg-gradient-to-br from-cyan-300/10 via-emerald-300/10 to-violet-300/10 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100" />
      {/* sheen */}
      <span className="pointer-events-none absolute -inset-10 translate-y-10 rotate-12 bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100" />

      <div className="relative flex items-center gap-3">
        <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-white/20 text-white shadow-md">
          {icon}
        </span>
        <span className="text-base sm:text-lg font-semibold drop-shadow-sm">{title}</span>
      </div>

      <div className="relative">
        <p className="text-[11px] sm:text-xs text-zinc-100/95 leading-snug max-w-sm">{description}</p>
        <span className="mt-1 inline-block text-xs text-white/90 underline-offset-2 group-hover:underline">Przejdź</span>
      </div>
    </motion.button>
  );
}
