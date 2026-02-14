# PR Checklist

Użyj tej checklisty przed wysłaniem PR do review.

## Quality Gate

- [ ] `npm run lint` przechodzi bez błędów.
- [ ] `npm run build` przechodzi.

## Functional Safety

- [ ] Zmiana nie łamie głównych ścieżek: logowanie, plan lekcji, frekwencja, harmonogram, statut, aktualności.
- [ ] Dla zmian w API zaktualizowano odpowiednią dokumentację (`docs/API.md`, OpenAPI jeśli dotyczy).

## UI Consistency

- [ ] Bazowe kontrolki korzystają ze wspólnych komponentów UI (`src/components/ui/*`) albo świadomie rozszerzają istniejące wzorce.
- [ ] Modal/drawer/panele filtrów zachowują spójny styl z resztą aplikacji.
- [ ] Brak nowych globalnych override dla elementów HTML (`button`, `a`, `h1` itd.).

## Code Structure

- [ ] Brak duplikacji utili domenowych (daty, normalizacja, liczenie frekwencji, mapowanie nazw).
- [ ] Większa logika została wydzielona do `lib/` i/lub `components/`.

## Repository Hygiene

- [ ] Brak nowych artefaktów runtime w repo (`public/backups`, `public/__pycache__`, `.pip_installed_*`, itp.).
- [ ] Brak plików lokalnych/notatek/debugowych.
