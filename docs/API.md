# API – Dokumentacja (wersja testowa)

Ten dokument opisuje API aplikacji w bieżącej wersji testowej. API służy do pracy z:
- planem lekcji (odczyt z pliku `timetable_data.json`),
- frekwencją użytkownika (subjects, plans, byDate),
- podsumowaniami frekwencji,
- generowaniem jednorazowych linków do zdalnego zatwierdzania zmian (MVP).

W trybie deweloperskim działa proxy Vite na `/api` do serwera Express.

## Podstawy

- Base URL (dev):
  - przez Vite: `http://localhost:5173`
  - bezpośrednio na serwer: `http://localhost:8787`
- Autoryzacja:
  - Single API key (zalecany dla aplikacji klienckich): dodaj nagłówek `Authorization: Bearer sk_...`
  - Sesja cookie (dla panelu w przeglądarce/WWW): po `POST /api/login` otrzymasz cookie `auth` (httpOnly).
- Format odpowiedzi:
  - Sukces: `{ ok: true, data?: any }`
  - Błąd: `{ ok: false, error: string }` i odpowiedni status HTTP (400/401/403/404/409/500).

## Klucz API (single-key)

Każdy użytkownik ma jeden klucz API. W czasie testów klucz jest widoczny w panelu użytkownika oraz dostępny przez endpointy.

- Pobierz klucz (wymaga cookie sesyjnego):
  - `GET /api/apikey`
  - 200 → `{ ok: true, apiKey: "sk_..." }`
- Zregeneruj klucz (unieważnia poprzedni):
  - `POST /api/apikey/regenerate`
  - 200 → `{ ok: true, apiKey: "sk_..." }`
- Użycie w żądaniu:
  - dodaj nagłówek: `Authorization: Bearer sk_TWÓJ_KLUCZ`

Przykład (curl):

```bash
curl -H "Authorization: Bearer sk_XXXX" http://localhost:5173/api/attendance
```

Uwaga: w Postman/Insomnia wybierz Auth = "Bearer Token" i wstaw `sk_XXXX`.

## Autoryzacja kont (opcjonalnie)

- `POST /api/register` body `{ username, password }` → tworzy konto i loguje (cookie)
- `POST /api/login` body `{ username, password }` → loguje (cookie)
- `POST /api/logout` → wylogowuje (czyści cookie)
- `GET /api/me` → `{ ok: true, authenticated: boolean, user: { id, username } | null }`

W trybie single-key do żądań zewnętrznych nie są potrzebne cookies – wystarczy nagłówek `Authorization: Bearer` z kluczem API.

## Timetable

- `GET /api/timetable` → surowy JSON planu (`public/timetable_data.json`).

Przykład:

```bash
curl -H "Authorization: Bearer sk_XXXX" http://localhost:5173/api/timetable
```

## Frekwencja – cały stan

Stan użytkownika zawiera:

```ts
type AttendanceState = {
  subjects: { key: string; label: string }[];
  plans: Array<{
    id: string;
    name: string;
    days: Record<string, { items: { slotHint?: string; subjectKey: string; subjectLabel: string }[] }>;
    createdAt: number;
    // opcjonalnie: source: { kind: 'school'; classId: string; className: string; group?: string|null; meta?: any }
  }>;
  byDate: Record<string, Array<{
    id: string;        // np. "2025-09-01#Poniedziałek#1"
    date: string;      // ISO YYYY-MM-DD
    dayName: string;   // np. "Poniedziałek"
    slot: string;      // np. "Poniedziałek#1"
    subjectKey: string;
    subjectLabel: string;
    present: boolean;
  }>>;
  // wersjonowanie i metadane (wewnętrzne)
  version?: number;    // obecnie 1
  updatedAt?: number;  // ms
}
```

Endpointy:

- `GET /api/attendance` → `{ ok: true, data: AttendanceState }`
- `PUT /api/attendance` body = cały `AttendanceState` (min. `subjects`, `plans`, `byDate`) → zapisuje i zwraca `{ ok: true }`

Przykład GET:

```bash
curl -H "Authorization: Bearer sk_XXXX" http://localhost:5173/api/attendance
```

Przykład PUT (minimalny):

```bash
curl -X PUT http://localhost:5173/api/attendance \
  -H "Authorization: Bearer sk_XXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "subjects":[{"key":"matematyka","label":"Matematyka"}],
    "plans":[],
    "byDate":{},
    "version":1
  }'
```

Uwagi:
- `subjectKey` jest normalizowany (małe litery, bez markerów grup 1/2). W UI możesz używać dowolnych labeli (`subjectLabel`).
- Na start zapis idzie w całości – najlepsza praktyka to: GET → modyfikacja → PUT.

## Podsumowanie frekwencji

- `GET /api/attendance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&subject=opcjonalnie`
  - zwraca `{ ok: true, data: { total, present, percent, needToReach50, canSkipAndKeep50 } }`
  - `subject` – (opcjonalnie) klucz znormalizowany, np. `matematyka`

Przykład:

```bash
curl -H "Authorization: Bearer sk_XXXX" \
  "http://localhost:5173/api/attendance/summary?from=2025-01-01&to=2025-12-31"
```

## Zdalne zatwierdzanie (MVP)

Linki jednorazowe do akceptacji/odrzucenia zmiany wpisu. Obecnie tworzenie wymaga sesji cookie (z przeglądarki); odczyt/akceptacja po tokenie.

- Utwórz żądanie (cookie auth):
  - `POST /api/attendance/approvals` body `{ action: 'toggle'|'set', dateISO, entryId, present? }`
  - 200 → `{ ok: true, token: 'appr_...' }`
- Podgląd statusu:
  - `GET /api/attendance/approvals/:token` → `{ ok: true, data: { status, createdAt, expiresAt, payload } }`
- Decyzja:
  - `POST /api/attendance/approvals/:token/decision` body `{ decision: 'accept'|'deny' }` → `{ ok: true }`

Uwaga: przy `accept` serwer wykona `toggle` lub `set present:true/false` dla wskazanego `entryId` w dniu `dateISO`.

## Overrides (nauczyciele/przedmioty)

- Odczyt (bez auth): `GET /api/overrides` → `{ ok: true, data: { subjectOverrides, teacherNameOverrides } }`
- Zapis (cookie auth): `POST /api/overrides` body `{ subjectOverrides, teacherNameOverrides }` → `{ ok: true }`

## Przykłady (JS fetch)

```js
const key = 'sk_XXXX';
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

// Pobierz stan
const st = await fetch('/api/attendance', { headers: { Authorization: 'Bearer ' + key } })
  .then(r => r.json()).then(j => j.data);

// Dodaj lekcję
const iso = '2025-09-01';
st.byDate[iso] = st.byDate[iso] || [];
st.byDate[iso].push({
  id: `${iso}#Poniedziałek#1`,
  date: iso,
  dayName: 'Poniedziałek',
  slot: 'Poniedziałek#1',
  subjectKey: 'matematyka',
  subjectLabel: 'Matematyka',
  present: true,
});

// Zapisz całość
await fetch('/api/attendance', { method: 'PUT', headers: H, body: JSON.stringify({ ...st, version: 1 }) });
```

## Statusy i limity

- 400 – niepoprawne dane żądania
- 401 – brak autoryzacji (zły lub brakujący klucz API / brak cookie)
- 403 – brak uprawnień
- 404 – nie znaleziono
- 409 – konflikt
- 500 – błąd serwera

Rate limiting (obecnie):
- `/api/login` – limiter 20 żądań / 10 min
- `/api/refresh` – limiter 10 żądań / 15 min

## Bezpieczeństwo i środowisko

- Klucz API trzymaj w sekrecie. `POST /api/apikey/regenerate` unieważnia poprzedni.
- W dev Vite proxy ustawia CORS/połączenie z serwerem automatycznie; bezpośrednio na serwerze Express obowiązują zasady CORS z `server/server.js`.
- Zapis danych testowych jest w pliku `server/data.json` (ignorowany przez git).

## Zmiany i wersjonowanie

- `version` w stanie frekwencji = 1 (na razie bez ETag / If-Match).
- Ten dokument dotyczy gałęzi `api-testing` i może różnić się od `main`.

