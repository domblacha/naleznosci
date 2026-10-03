# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## W .astro: className dla komponentów React, class dla elementów HTML

- **Context**: pliki .astro, które przekazują klasy do komponentów React (np. Card, Button z src/components/ui/)
- **Problem**: komponent React czyta className; class jest ignorowane (trafia do ...props), więc klasy layoutu znikają. Karta auth miała 233px zamiast max-w-sm i skakała po pojawieniu się komunikatu.
- **Rule**: W .astro używaj className na komponentach React, a class (lub class:list) tylko na natywnych elementach HTML i komponentach Astro. Po zmianie sprawdź klasę w wyrenderowanym HTML.
- **Applies to**: implement, impl-review
