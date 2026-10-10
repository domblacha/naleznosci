# UX: taby, kolejność menu i header na mobile — Plan Brief

> Full plan: `context/changes/ux-improvement/plan.md`
> Research: `context/changes/ux-improvement/research.md`

## What & Why

Cztery strony aplikacji (Faktury, Klienci, Historia, Ustawienia) układają dziś sekcje jedną pod drugą. Dzielimy je na zakładki wspólnym komponentem tabs, porządkujemy menu (Faktury, Historia, Klienci, Ustawienia) i robimy header czytelny na telefonie (dwa wiersze).

## Starting Point

`/` i `/clients` to po jednej wyspie React ze wspólnym stanem; `/history` i `/settings` to po dwie niezależne wyspy. Komponentu tabs nie ma, ale `radix-ui` już go zawiera. `Topbar.astro` to jeden wiersz bez klas responsywnych.

## Desired End State

Każda strona ma taby (Faktury: Ponaglenia · Eskalacja · Wstrzymane; Klienci: Aktywni · Nieaktywni; Historia: Zapłacone · Anulowane; Ustawienia: Dane nadawcy · Reguła eskalacji), z licznikami na tabach z listami, aktualizowanymi po każdej akcji. Przełączanie tabów nie gubi wpisanych danych w ustawieniach, a fokus po akcjach zawsze trafia na widoczny element. Na telefonie header ma e-mail i Wyloguj na górze, menu pod spodem.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Kolejność i domyślny tab na `/` | Ponaglenia (domyślny) · Eskalacja · Wstrzymane | Nie odwraca decyzji „od razu widać, komu wysłać ponaglenie”. | Plan |
| Zawartość „Eskalacja” | Wszystkie grupy poza `paused` (także „Bieżące” i „Przed etapem 1”) | Zachowuje grupowanie z FR-010. | Research / Plan |
| Stan taba | Tylko lokalny, bez `?tab=` | Najprostsze; odświeżenie wraca do pierwszego taba. | Plan |
| Nieaktywne panele | `forceMount` na każdym `TabsContent` | Chroni niezapisane formularze i cele fokusu bez refaktoru hooków. | Research / Plan |
| Liczniki | Na wszystkich tabach z listami | Widać bez klikania, że w ukrytym tabie coś jest. | Plan |
| Po akcji przenoszącej pozycję | Zostań na tabie, fokus na „Dodaj …” nad tabami | Seria usunięć/przywróceń bez skakania między tabami. | Plan |
| Puste stany | Globalny pusty stan bez tabów + tekst per pusty panel | Zachowuje obecne CTA dla nowego użytkownika. | Plan |
| Historia | Nowa wyspa `HistoryManager` ze wspólnym stanem | Liczniki muszą wynikać z tego samego stanu co listy. | Research / Plan |
| Header mobile | Dwa wiersze poniżej `sm`, desktop bez zmian (`sm:contents`) | Zmiana tylko tam, gdzie jest potrzebna. | Plan |

## Scope

**In scope:**
- `ui/tabs` przez shadcn + sekcja w `/dev/ui`
- Taby na `/`, `/clients`, `/history`, `/settings` z licznikami (poza ustawieniami)
- Kolejność menu, dwuwierszowy header na mobile, `initial-scale=1`
- Tekst 409 „…w zakładce „Nieaktywni””, aktualizacja README

**Out of scope:**
- Stan taba w URL, automatyczne przełączanie taba po akcji, ukrywanie pustych tabów
- Śledzenie „dirty” formularzy, zmiany API/bazy/logiki eskalacji
- Testy komponentowe/E2E

## Architecture / Approach

Jeden niekontrolowany komponent `Tabs` (`defaultValue` = pierwszy tab), zawsze z `forceMount`. Taby wewnątrz `InvoicesManager` (z wyniesionym `buildClientReminders` dla licznika ponagleń) i `ClientsManager`; na `/history` i `/settings` nowe wyspy-wrappery (`HistoryManager` z podniesionym stanem list, `SettingsTabs` bez zmian w formularzach). Przyciski „Dodaj fakturę/klienta” nad tabami jako stały cel fokusu; fallback fokusu pomija elementy wewnątrz `[hidden]`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Komponent Tabs i header | `ui/tabs`, kitchen sink, menu i header mobile | Generator shadcn doda zbędną zależność lub style łamiące tokeny |
| 2. Faktury i Klienci | Taby z licznikami w dwóch managerach, fokus, teksty pustych paneli, 409 | Fokus trafiający do ukrytego panelu |
| 3. Historia i Ustawienia | `HistoryManager` ze wspólnym stanem, `SettingsTabs`, README | Regresja przywracania/zmiany daty po przejściu na komponenty kontrolowane |

**Prerequisites:** świeży branch `feat/ux-improvement` z aktualnego `main`; lokalny Supabase dla smoke.
**Estimated effort:** ~2–3 sesje w 3 fazach.

## Open Risks & Assumptions

- Etykieta „Nieaktywni” (z `change.md`) obok terminu „usunięci” w reszcie aplikacji — puste panele i komunikaty używają „usuniętych”.
- Trzy triggery z licznikami muszą się zmieścić przy 360 px; sprawdzane ręcznie.
- `/dev/ui` pokaże taby w managerach automatycznie — kitchen sink może wymagać korekt danych przykładowych.

## Success Criteria (Summary)

- Na każdej z czterech stron użytkownik przełącza taby, a liczniki zgadzają się z treścią także po akcjach.
- Przełączanie tabów w ustawieniach nie gubi wpisanych danych; fokus po akcjach nigdy nie ginie.
- Na telefonie header jest dwuwierszowy i nic nie przewija się poziomo; na desktopie bez zmian.
