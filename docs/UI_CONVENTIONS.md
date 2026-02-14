# UI Conventions

Ten dokument definiuje minimalne zasady spójności UI w projekcie.

## Cel

- Utrzymać jednolity wygląd między modułami (`Hub`, `Plan`, `Frekwencja`, `Harmonogram`, `Statut`).
- Ograniczyć ręczne, niespójne stylowanie bazowych kontrolek.
- Unikać regresji przy dalszym rozwoju.

## Zasady bazowe

1. Używaj wspólnych komponentów z `src/components/ui/` dla:
- przycisków,
- pól input/select/textarea,
- kart,
- badge/chip.

2. Unikaj globalnych styli wpływających na wszystkie `button`/`a`/`h1`.

3. Trzymaj się jednego języka wizualnego:
- spójne promienie (`rounded-*`),
- spójne obramowania (`border-zinc-*`),
- spójne focus states (`focus:ring-*`),
- spójne odstępy pionowe i poziome.

4. Dla modal/drawer:
- ten sam układ overlay (`fixed inset-0 bg-black/...`),
- ten sam styl kontenera (`rounded-2xl border ... bg-zinc-900`),
- spójny układ nagłówka i przycisku zamknięcia.

5. Dla list filtrów i paneli narzędzi:
- jeden wzorzec „sekcja + header + content” (preferuj komponent `Section` albo analogiczny wspólny wrapper).

## Tokeny/kolory

- Preferowany motyw bazowy: `zinc`/`neutral`.
- Kolory semantyczne:
- sukces: `emerald`,
- ostrzeżenie: `amber`/`yellow`,
- błąd: `red`,
- informacja: `blue`.

## Dostępność

1. Interaktywne elementy muszą mieć:
- `aria-label` jeśli brak tekstu widocznego,
- widoczny focus state.

2. Nie opieraj znaczenia wyłącznie na kolorze.

## Rekomendacje implementacyjne

1. Gdy pojawia się nowe, ręcznie stylowane UI bazowe:
- najpierw rozważ rozszerzenie `src/components/ui/*`,
- dopiero potem styl lokalny.

2. Jeżeli komponent zawiera >300 linii logiki + JSX:
- wydziel helpery do `src/features/<feature>/lib/`,
- wydziel sekcje UI do `src/features/<feature>/components/`.
