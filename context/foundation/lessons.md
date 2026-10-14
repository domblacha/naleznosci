# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## W .astro: className dla komponentów React, class dla elementów HTML

- **Context**: pliki .astro, które przekazują klasy do komponentów React (np. Card, Button z src/components/ui/)
- **Problem**: komponent React czyta className; class jest ignorowane (trafia do ...props), więc klasy layoutu znikają. Karta auth miała 233px zamiast max-w-sm i skakała po pojawieniu się komunikatu.
- **Rule**: W .astro używaj className na komponentach React, a class (lub class:list) tylko na natywnych elementach HTML i komponentach Astro. Po zmianie sprawdź klasę w wyrenderowanym HTML.
- **Applies to**: implement, impl-review

## Dev server aplikacji: ubij przed pracą i po pracy

- **Context**: gate'y wymagające działającej aplikacji (`npm run smoke`, ręczne sprawdzenia) i każde uruchomienie `npm run dev` / `astro dev`
- **Problem**: pozostawiony dev server na porcie aplikacji (4321) miał nieaktualny cache Vite (`node_modules/.vite/deps_ssr/...` nie istniał) i zwracał 500 na każdą trasę, więc smoke padał na wszystkich krokach. Astro 7 nie pozwala uruchomić drugiej instancji obok.
- **Rule**: Przed rozpoczęciem pracy ubij wszystkie serwery nasłuchujące na porcie aplikacji (`npx astro dev stop`, potem `lsof -tiTCP:4321 -sTCP:LISTEN | xargs -r kill`). Każdy serwer uruchomiony na potrzeby pracy ubij po jej zakończeniu. Dotyczy tylko portu tej aplikacji — innych procesów nie ruszaj.
- **Applies to**: implement, impl-review

## Migracje lokalnie: zachowuj dane dev, nie rób db reset

- **Context**: tworzenie i stosowanie migracji Supabase na lokalnej bazie dev (w tym kroki gate'ów typu `npx supabase db reset`)
- **Problem**: `supabase db reset` odtwarza bazę od zera i kasuje dane wpisane ręcznie przez użytkownika, który nie chce za każdym razem wprowadzać ich od nowa.
- **Rule**: Lokalnie stosuj nowe migracje przez `npx supabase migration up`, które zachowuje dane. `db reset` uruchamiaj tylko po wyraźnej zgodzie użytkownika; weryfikację "migracja stosuje się od zera" rób na osobnej bazie, nie na bazie dev z danymi.
- **Applies to**: plan, implement, impl-review

## Nowa zmiana: świeży branch z aktualnego main

- **Context**: pierwsza faza /10x-implement
- **Problem**: commit fazy wylądowałby na main albo na nieaktualnej bazie
- **Rule**: Przed pierwszą fazą nowej zmiany przełącz się na main, zrób `git pull`, a potem utwórz branch `feat/<change-id>` (`git switch -c`). Nigdy nie commituj fazy bezpośrednio na main ani na branchu utworzonym z nieaktualnego main.
- **Applies to**: implement

## Tytuły testów po angielsku

- **Context**: tytuły `describe`/`it` we wszystkich plikach `*.test.ts` (Vitest)
- **Problem**: testy dostawały polskie tytuły i trzeba je było tłumaczyć po fakcie (testing-domain-rules, faza 1)
- **Rule**: Nazwy testów (describe/it) piszemy po angielsku. Komentarze w kodzie zostają po polsku; polskie literały (dane fixture'ów, cytowany tekst ponaglenia) zostają bez zmian.
- **Applies to**: plan, implement, impl-review
