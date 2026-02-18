# API – Dokumentacja (v1)

Ten dokument opisuje API aplikacji w bieżącej wersji testowej. API służy do pracy z:
- planem lekcji (odczyt z pliku `timetable_data.json`),
- frekwencją użytkownika (subjects, plans, byDate),
- podsumowaniami frekwencji,
- generowaniem jednorazowych linków do zdalnego zatwierdzania zmian (MVP).

Legacy `/api/*` wyłączone (HTTP 410). Używaj tylko prefiksu `/v1`.

## Podstawy

- Base URL (dev):
  - przez Vite: `http://localhost:5173`
  - bezpośrednio na serwer: `http://localhost:8787`
  - prefiks: `/v1` (np. `http://localhost:8787/v1`)
- Autoryzacja:
  - Single API key (zalecany dla aplikacji klienckich): dodaj nagłówek `Authorization: Bearer sk_...`
  - Sesja cookie (dla panelu w przeglądarce/WWW): po `POST /v1/login` otrzymasz cookie `auth` (httpOnly).
  - Dla żądań modyfikujących przy autoryzacji cookie wymagany jest nagłówek `X-CSRF-Token` równy wartości cookie `csrf`.
- Format odpowiedzi:
  - Sukces: `{ ok: true, data: any }`
  - Błąd (v1): `application/problem+json` (RFC7807-like) z polami `{ type, title, status, code, detail }`

Health:
- `GET /v1/health` → `{ ok: true, data: { status: "ok" } }`

## Klucz API (single-key)

Każdy użytkownik ma jeden klucz API. Klucz w pełnej formie jest zwracany tylko po regeneracji.

- Pobierz klucz (wymaga cookie sesyjnego):
  - `GET /v1/apikey`
  - 200 → `{ ok: true, data: { hasKey, preview, createdAt, lastUsedAt, format, requiresRotation } }`
- Zregeneruj klucz (unieważnia poprzedni):
  - `POST /v1/apikey/regenerate`
  - 200 → `{ ok: true, data: { apiKey, preview, createdAt, format } }`
  - przy autoryzacji cookie wymagany nagłówek `X-CSRF-Token` równy wartości cookie `csrf`
- Użycie w żądaniu:
  - dodaj nagłówek: `Authorization: Bearer sk_TWÓJ_KLUCZ`

Przykład (curl):

```bash
curl -H "Authorization: Bearer sk_XXXX" http://localhost:5173/v1/attendance
```

Uwaga: w Postman/Insomnia wybierz Auth = "Bearer Token" i wstaw `sk_XXXX`.

## Autoryzacja kont (opcjonalnie)

- `POST /v1/register` body `{ username, password }` → tworzy konto i loguje (cookie), gdy rejestracja jest włączona (`REGISTRATION_ENABLED=true`)
- `POST /v1/login` body `{ username, password }` → loguje (cookie)
- `POST /v1/logout` → wylogowuje (czyści cookie)
- `GET /v1/users/me` → `{ ok: true, data: { authenticated: boolean, user: { id, username } | null } }`
- Sesja cookie ma TTL (domyślnie 30 dni) i działa w trybie sliding: każde poprawne użycie sesji odświeża termin wygaśnięcia.

W trybie single-key do żądań zewnętrznych nie są potrzebne cookies – wystarczy nagłówek `Authorization: Bearer` z kluczem API.

## Timetable

- `GET /v1/teachers` → `{ ok: true, data: { [id: string]: string } }`
- `GET /v1/classes` → `{ ok: true, data: { [id: string]: string } }`
- `GET /v1/rooms` → `{ ok: true, data: { [id: string]: string } }`
- `GET /v1/teachers/:id/timetable` → `{ ok: true, data: { id: string, lessons: Lesson[] } }`
- `GET /v1/classes/:id/timetable?group=2/2&includeWhole=true` → `{ ok: true, data: { id: string, lessons: Lesson[] } }`
  - `group` (opcjonalnie): identyfikator lub nazwa grupy (np. `2/2`). Zwraca lekcje dla całej klasy ORAZ wskazanej grupy; inne grupy są wykluczone.
  - `includeWhole` (opcjonalnie, domyślnie `true`): czy dołączyć lekcje „cała klasa” przy filtrowaniu po `group`.
- `GET /v1/rooms/:id/timetable` → `{ ok: true, data: { id: string, lessons: Lesson[] } }`

Identyfikatory: `:id` może być kanonicznym identyfikatorem z pliku (np. `n12`, `o5`, `s36`) albo aliasem czytelnym dla człowieka:
- nauczyciel: inicjały/kod (np. `RM`),
- klasa: kod klasy (np. `4TAI`),
- sala: numer (np. `407`).

Jeśli alias jest niejednoznaczny, zwrócony zostanie `409 Conflict`. W odpowiedzi `200` timetablowej `data.id` zawiera kanoniczne ID, które zostało rozpoznane.

Przykład 4TAI Poniedziałek, grupa 2/2:
```bash
curl -s 'http://localhost:8787/v1/classes/4TAI/timetable?group=2%2F2&includeWhole=true' \
| jq '.data.lessons | map(select(.day=="Poniedziałek")) | sort_by(.lesson_num|tonumber) | .[] | {lesson_num,time,subject,teacher:(.teacher?.name),room:(.room?.name)}'
```

## Frekwencja – odczyt i zapis wpisów

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

- `GET /v1/attendance` → `{ ok: true, data: AttendanceState }`
- `PUT /v1/attendance` body `AttendanceState` → `{ ok: true, data: { saved: true } }`
- `GET /v1/attendance/entries?from&to&subjectKey&classId&teacherId&limit&cursor` → `{ ok: true, data: { entries: AttendanceEntry[], nextCursor? } }`
- `PATCH /v1/attendance/entries` body `{ updates: { id, present, ifMatch? }[] }` → `{ ok: true, data: { updated } }` (409 przy konflikcie wersji)
- `GET /v1/attendance/summary?from&to&subjectKey` → `{ ok: true, data: { total, present, percent, needToReach50, canSkipAndKeep50 } }`
- `POST /v1/attendance/days/{dateISO}/present` body `{ present: true|false }` → `{ ok: true, data: { updated } }`
- `GET /v1/attendance/plans` → `{ ok: true, data: Plan[] }` (lista zapisanych planów)
- `POST /v1/attendance/days/{dateISO}/apply-plan` body `{ planId, overwrite?: boolean, setPresent?: boolean }` → `{ ok: true, data: { created, overwritten } }`
- Dla mutacji (`PUT /attendance`, `PATCH /attendance/entries`, `POST .../present`, `POST .../apply-plan`) przy auth cookie wymagany jest `X-CSRF-Token`.

Przykłady:

```bash
# Lista wpisów
curl -H "Authorization: Bearer sk_XXXX" "http://localhost:8787/v1/attendance/entries?from=2025-09-01&to=2025-09-30&limit=100"

# Aktualizacja wpisów
curl -X PATCH "http://localhost:8787/v1/attendance/entries" \
  -H "Authorization: Bearer sk_XXXX" -H "Content-Type: application/json" \
  -d '{"updates":[{"id":"2025-09-01#Poniedziałek#1","present":false}]}'

# Ustaw cały dzień na obecny
curl -X POST "http://localhost:8787/v1/attendance/days/2025-09-01/present" \
  -H "Authorization: Bearer sk_XXXX" -H "Content-Type: application/json" \
  -d '{"present":true}'

# Wypełnij dzień z planu (nadpisz istniejące wpisy i ustaw obecność na true)
curl -X POST "http://localhost:8787/v1/attendance/days/2025-09-01/apply-plan" \
  -H "Authorization: Bearer sk_XXXX" -H "Content-Type: application/json" \
  -d '{"planId":"plan_123","overwrite":true,"setPresent":true}'
```

Uwagi:
- `subjectKey` jest normalizowany (małe litery, bez markerów grup 1/2). W UI możesz używać dowolnych labeli (`subjectLabel`).
- Na start zapis idzie w całości – najlepsza praktyka to: GET → modyfikacja → PUT.

## Podsumowanie frekwencji

- `GET /v1/attendance/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&subjectKey=opcjonalnie`

```bash
curl -H "Authorization: Bearer sk_XXXX" \
  "http://localhost:8787/v1/attendance/summary?from=2025-01-01&to=2025-12-31"
```

## Planer nieobecności / zdalne zatwierdzanie (MVP)

Linki jednorazowe do akceptacji/odrzucenia zmiany wpisu. Obecnie tworzenie wymaga sesji cookie (z przeglądarki); odczyt/akceptacja po tokenie.

Endpointy:
- `POST /v1/approvals` (opcjonalny `Idempotency-Key`) → `201 { ok, data: { token, url, expiresAt } }`
- `GET /v1/approvals/:token` → `{ ok, data: { status, createdAt, expiresAt } }`
- `POST /v1/approvals/:token` body `{ decision: 'accept'|'deny' }` → `{ ok: true, data: { status } }` lub `409`
- Przy autoryzacji cookie, mutacje (`POST /v1/approvals`, `POST /v1/approvals/:token`) wymagają `X-CSRF-Token`.

Uwaga: przy `accept` serwer wykona `toggle` lub `set present:true/false` dla wskazanego `entryId` w dniu `dateISO`.

## Overrides (nauczyciele/przedmioty)

- Odczyt (publiczny): `GET /v1/overrides` → `{ ok: true, data: { subjectOverrides, teacherNameOverrides } }`
- Zapis (cookie auth + admin): `PUT /v1/overrides` body `{ subjectOverrides, teacherNameOverrides }` → `{ ok: true, data: { saved: true } }`

## Zadania i utrzymanie planu

- `POST /v1/jobs/timetable-scrape` (admin) → `202 { ok: true, data: { jobId, statusUrl, status } }` – uruchamia asynchroniczne odświeżenie planu
- `POST /v1/jobs/articles-scrape` (admin) → `202 { ok: true, data: { jobId, statusUrl, status } }` – odświeża artykuły
- `GET /v1/jobs/:jobId` → `{ ok: true, data: Job }` ze statusem (`queued|running|succeeded|failed|timeout`)
- `POST /v1/refresh` (admin) → synchroniczne odświeżenie planu przez scraper (`200|409|500`), przy sukcesie zwracane jest także `data` (jeśli scraper poda wynik strukturalny)
- `GET /v1/timetable/backups` (admin) → `{ ok: true, data: { filename, size, mtime }[] }`
- `POST /v1/timetable/restore` (admin) body `{ filename }` → `{ ok: true, data: { restored: true } }`
- Endpointy administracyjne mutujące (`POST /v1/jobs/*`, `POST /v1/refresh`, `POST /v1/timetable/restore`) wymagają cookie auth, roli admin i `X-CSRF-Token`.

## Przykłady (JS fetch)

```js
const key = 'sk_XXXX';
const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

// Pobierz stan
const st = await fetch('/v1/attendance', { headers: { Authorization: 'Bearer ' + key } })
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
await fetch('/v1/attendance', { method: 'PUT', headers: H, body: JSON.stringify({ ...st, version: 1 }) });
```

## Statusy i limity

- 400 – niepoprawne dane żądania
- 401 – brak autoryzacji (zły lub brakujący klucz API / brak cookie)
- 403 – brak uprawnień
- 404 – nie znaleziono
- 409 – konflikt
- 500 – błąd serwera

Nagłówki (v1):
- `X-Request-Id` – identyfikator żądania
- `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
- na endpointach planu lekcji cache: `Cache-Control: public, max-age=300, stale-while-revalidate=60`

Rate limiting (obecnie):
- `/v1/login` – limiter 20 żądań / 10 min
- `/v1/register` – limiter 10 żądań / 10 min
- `/v1/refresh` – limiter 10 żądań / 15 min

## Bezpieczeństwo i środowisko

- Klucz API trzymaj w sekrecie. `POST /v1/apikey/regenerate` unieważnia poprzedni.
- W dev Vite proxy ustawia CORS/połączenie z serwerem automatycznie; bezpośrednio na serwerze Express obowiązują zasady CORS z `server/middleware/security.js`.
- Zapis danych testowych jest w pliku `server/data.json` (ignorowany przez git).

## Zmiany i wersjonowanie

- `version` w stanie frekwencji = 1 (na razie bez ETag / If-Match).
- Ten dokument dotyczy gałęzi `api-testing` i może różnić się od `main`.
