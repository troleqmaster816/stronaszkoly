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

## Dokumentacja API

Szczegółowa dokumentacja REST API znajduje się w `docs/API.md`.

## Produkcja – szkola.tkch.eu

### Build aplikacji

```bash
npm ci
npm run build
```

Powstanie katalog `dist/` z plikami SPA.

### Uruchomienie backendu (Express)

W produkcji backend serwuje zarówno API (`/v1`) jak i statyczny build z `dist/` z fallbackiem SPA.

Zmienne środowiskowe (zalecane):

```bash
export NODE_ENV=production
export PORT=8787
export ADMIN_USER=admin
export ADMIN_PASS='silne_haslo'
export ALLOWED_ORIGINS='https://szkola.tkch.eu'
```

Start serwera:

```bash
node server/server.js
```

### Reverse proxy (Nginx/Traefik)

Skonfiguruj proxy aby ruch z `https://szkola.tkch.eu` był kierowany do `http://127.0.0.1:8787`.

- **HTTPS**: włącz TLS (Let's Encrypt). 
- **Nagłówki**: pozostaw `SameSite=Lax`; w produkcji ciasteczka `auth` są `Secure`.
- **CORS**: dla frontendu z tej samej domeny nie jest potrzebny. Dla innych pochodzeń dodaj je do `ALLOWED_ORIGINS`.

Przykładowy blok Nginx:

```
server {
  listen 443 ssl http2;
  server_name szkola.tkch.eu;
  # ssl_certificate ... ; ssl_certificate_key ... ;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

### Uwagi bezpieczeństwa

- `auth` i `csrf` są `Secure` w produkcji; wymagaj HTTPS.
- CSRF jest wymagany tylko dla zapytań opartych na sesji cookie.
- W razie potrzeby ustaw niestandardowe `ALLOWED_ORIGINS`.

### Aktualizacja planu / skrypty Python

Backend uruchamia skrypty Pythona z katalogu `public/`. Zapewnij Pythona 3 na serwerze. Opcjonalnie ustaw `PYTHON_PATH`.
