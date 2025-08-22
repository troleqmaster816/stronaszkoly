# Strona szkoły

Krótki opis: Aplikacja do przeglądania planu lekcji i materiałów szkolnych.

## Funkcje
- Przeglądanie planu lekcji
- Harmonogram i informacje szkolne
- Statut szkoły w aplikacji
- Prosta nawigacja po modułach

## Wymagania
- Node.js 18+
- Python 3 (dla skryptów w katalogu `public/`)

## Szybki start

Frontend (tylko interfejs):
```bash
npm install
npm run dev
```

Pełne środowisko (frontend + serwer API na porcie 8787, proxy na `/api`):
```bash
npm install
npm run dev:full
```

Serwer API samodzielnie (Express):
```bash
npm run server
```

## Zmienne środowiskowe (opcjonalnie)
- `ADMIN_USER` – login do panelu administracyjnego (domyślnie: `admin`)
- `ADMIN_PASS` – hasło do panelu (domyślnie: `admin123`)
- `PORT` – port serwera API (domyślnie: `8787`)
- `PYTHON_PATH` – ścieżka/komenda do Pythona (`python`, `python3` lub pełna ścieżka)

## Skróty
- `npm run build` – build produkcyjny (TypeScript + Vite)
- `npm run preview` – podgląd buildu
- `npm run lint` – lintowanie kodu

Repozytorium: https://github.com/troleqmaster816/stronaszkoly
