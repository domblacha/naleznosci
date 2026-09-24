---
project: naleznosci
researched_at: 2026-09-22
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro 7 (React 19 islands, Tailwind 4)
  runtime: Cloudflare Workers (workerd) via @astrojs/cloudflare
---

## Rekomendacja

**Deploy na Cloudflare Workers.**

Projekt już ma skonfigurowany adapter `@astrojs/cloudflare` (`output: "server"`, `wrangler.jsonc`), więc to platforma o zerowym koszcie migracji. Przy skali z PRD (mały ruch, 10k–100k żądań/mies.) mieści się komfortowo w darmowym tierze (100k żądań/dzień) — czyli ~0 zł/mies., co odpowiada priorytetowi minimalizacji kosztu z wywiadu. Platforma zalicza 4 z 5 kryteriów agent-friendly jako Pass (CLI-first, managed/serverless, agent-readable docs, stabilne API deployu), z jedynie częściowym pokryciem MCP.

## Porównanie platform

| Platforma | CLI-first | Managed/serverless | Agent-readable docs | Stabilne API deployu | MCP/integracja | Suma |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Partial | 4 Pass / 1 Partial |
| Netlify | Partial | Pass | Pass | Pass | Pass | 4 Pass / 1 Partial |
| Railway | Partial | Pass | Pass | Pass | Pass | 4 Pass / 1 Partial |
| Vercel | Pass | Pass | Pass | Pass | Partial (beta) | 4 Pass / 1 Partial |
| Render | Partial | Pass | Pass | Pass | Pass | 3 Pass / 2 Partial |
| Fly.io | Partial | Partial | Partial | Pass | Pass | 2 Pass / 3 Partial |

Uwagi per platforma:
- **Cloudflare Workers** — `wrangler deploy` / `wrangler rollback` / `wrangler tail` w pełni GA; dokumentacja jako `llms.txt`/`llms-full.txt`; deploy deterministyczny. MCP ograniczony do dokumentacyjnego serwera i biblioteki `workers-mcp`, bez pełnego "ops" MCP dla deployu.
- **Netlify** — porównywalny wynik technicznie, z GA MCP server (od czerwca 2025). CLI rollback odbywa się przez dashboard/audit log, nie ma dedykowanej komendy CLI — stąd Partial na CLI-first. Darmowy tier oparty na kredytach (300/mies.), prawdopodobnie wystarczający, ale z mniejszym marginesem niż Cloudflare.
- **Railway** — Nixpacks auto-wykrywa Node/Astro (zero-config), GA hosted MCP server + konektor Claude. Rollback do dowolnego starszego deployu tylko przez dashboard. Brak darmowego tieru — Hobby $5/mies. + zużycie, realistycznie ~5–15 USD/mies.
- **Vercel** — pełne GA na 4/5 kryteriów, ale Hobby tier jest **tylko non-commercial**; aplikacja do śledzenia należności to realny produkt, więc realistycznie wymusza Pro ($20/user/mies.), co koliduje z priorytetem minimalizacji kosztu. MCP w Public Beta.
- **Render** — darmowy tier usypia po 15 min bezczynności (nieakceptowalne dla MVP z realnym ruchem), Starter $7/mies. wymagany dla stabilnej dostępności. Deploy głównie przez git-push/dashboard, CLI jest warstwą inspekcyjną, nie głównym kanałem deployu.
- **Fly.io** — najtańszy wariant (~2–5 USD/mies. ze scale-to-zero), ale wymaga własnoręcznego napisania Dockerfile (poza zakresem tego skilla) i utrzymania kontenera; region Warszawa jest w trakcie dekomisji (Region Consolidation Project), najbliższe: Frankfurt/Amsterdam.

### Shortlistowane platformy

#### 1. Cloudflare Workers (Rekomendowana)

Zerowy koszt migracji (już zintegrowana), koszt operacyjny $0/mies. przy tej skali, w pełni CLI-first, deterministyczny deploy i rollback, dokumentacja czytelna dla agentów. Największa słabość to częściowe pokrycie MCP i specyficzne dla workerd zachowania środowiska (patrz rejestr ryzyk).

#### 2. Netlify

Technicznie równorzędna Cloudflare (4 Pass/1 Partial), z GA MCP server — przewaga nad Cloudflare pod względem integracji agentowej. Wymaga jednak wymiany adaptera z `@astrojs/cloudflare` na `@astrojs/netlify`, aktualizacji CI/README i ponownej weryfikacji smoke testu — realny koszt migracji przy budżecie 3 tygodni po godzinach.

#### 3. Railway

Najlepsze DX spośród platform kontenerowych/Node-native, GA MCP i zero-config build przez Nixpacks. Traci na priorytecie kosztowym — brak darmowego tieru, realistycznie $5–15/mies. — oraz wymaga migracji z Workers na `@astrojs/node`.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — słabości

1. **Otwarty bug astro:env** — nierozwiązany issue ([withastro/astro#16790](https://github.com/withastro/astro/issues/16790)): adapter Cloudflare nie zawsze przekazuje zmienne z `wrangler.jsonc` do `astro:env`. Projekt już używa `astro:env/server` dla `SUPABASE_URL`/`SUPABASE_KEY` — trafienie na ten bug oznacza ciche, trudne do zdiagnozowania awarie auth w produkcji.
2. **workerd to nie pełny Node.js** — mimo flagi `nodejs_compat`, część pakietów npm może się cicho zepsuć na edge runtime w sposób niewidoczny lokalnie, jeśli lokalny dev (Miniflare) różni się subtelnie od produkcyjnego workerd.
3. **10ms CPU na request na darmowym tierze** — jeśli wyliczanie odsetek/rekompensaty dla klienta z wieloma zaległymi fakturami (US-01) okaże się cięższe niż zakładano, można trafić na throttling bez oczywistego komunikatu błędu.
4. **MCP tylko częściowy** — brak jednego oficjalnego "Workers ops" MCP pokrywającego pełny cykl deploy/rollback/logs; agent musi polegać na wrangler CLI przez Bash zamiast strukturalnych wywołań narzędzi.
5. **Vendor lock-in na poziomie kodu** — `Astro.locals.runtime.env`, importy `cloudflare:workers` i inne API specyficzne dla Workers wnikają do kodu aplikacji; późniejsza zmiana platformy byłaby droższa niż na platformach opartych na zwykłym Node.

### Pre-Mortem — jak mogłoby się to nie udać

Sześć miesięcy po wdrożeniu na Cloudflare Workers aplikacja miała sporadyczne, trudne do odtworzenia awarie logowania. Przyczyną był znany bug forwardowania zmiennych z `astro:env` — po części redeployów z drobną zmianą w `wrangler.jsonc` zmienne środowiskowe czasem nie docierały do runtime'u, więc klient Supabase raz na kilka deployów startował bez kluczy i użytkownicy nie mogli się zalogować. Solo dev spędził sporo czasu, zakładając błąd po stronie Supabase, zanim trafił na odpowiedni GitHub issue. Równolegle, gdy liczba klientów z wieloma zaległymi fakturami urosła, generowanie zbiorczego ponaglenia zaczęło czasem przekraczać limit CPU na darmowym tierze w godzinach szczytu, co manifestowało się jako losowe 500 bez logów wyjaśniających przyczynę — bo `wrangler tail` trzeba było mieć uruchomiony w danym momencie, żeby to złapać.

### Unknown Unknowns

- Lokalny `astro dev` z adapterem Cloudflare uruchamia się na symulowanym workerd (przez Miniflare), więc różnice dev/prod są mniejsze niż na typowych platformach serverless — ale nie zerowe; warto to zweryfikować przy pierwszym prawdziwym deployu, nie zakładać identyczności.
- Adapter Cloudflare porzucił wsparcie dla Pages w wersji 13 (marzec 2026) — Workers to jedyna ścieżka naprzód; stare tutoriale o "Astro na Cloudflare Pages" mogą już nie mieć zastosowania do obecnej wersji adaptera.
- `wrangler secret put` (produkcja) i `.dev.vars` (lokalnie) mają rozłączne źródła prawdy — łatwo zapomnieć zsynchronizować sekret produkcyjny po zmianie lokalnej.
- Rollback przez `wrangler rollback` cofa kod, ale nie cofa żadnych migracji schematu Supabase — jeśli deploy towarzyszy migracji SQL, rollback samego Workera nie jest bezpieczny bez ręcznej koordynacji z migracją bazy.

## Historia operacyjna

- **Preview deploys**: `wrangler deploy` z osobną nazwą środowiska/subdomeną per branch (lub Cloudflare Workers Preview URLs) daje URL do podglądu przed merge; brak wbudowanej ochrony dostępu bez dodatkowej konfiguracji Cloudflare Access — dla MVP z jednym deweloperem nie jest to krytyczne.
- **Sekrety**: `wrangler secret put SUPABASE_KEY` (i `SUPABASE_URL`) dla produkcji — przechowywane po stronie Cloudflare, widoczne tylko dla właściciela konta Cloudflare; lokalnie `.dev.vars` (gitignored, zgodnie z README). Rotacja = ponowne `wrangler secret put` + redeploy.
- **Rollback**: `wrangler rollback [deployment-id]` (lub bez argumentu — do poprzedniego deploymentu) cofa kod natychmiast; **nie cofa** migracji Supabase — migracje SQL wymagają osobnej, ręcznej koordynacji z rollbackiem kodu.
- **Zatwierdzenie (approval)**: publikacja do produkcji (`wrangler deploy` na główną nazwę Workera) może wykonać agent bez interwencji człowieka przy MVP jednoosobowym, o ile CI (lint, `astro check`, build) przechodzi; rotacja `SUPABASE_KEY` i usunięcie/reset bazy Supabase wymagają jawnej zgody użytkownika.
- **Logi**: `wrangler tail` daje live stream ostatnich zdarzeń (do 100 na połączenie) po stronie CLI — do odczytu logów runtime w czasie rzeczywistym; historyczne logi wymagają Cloudflare Logpush (poza zakresem MVP).

## Rejestr ryzyk

| Ryzyko | Źródło | Prawdopodobieństwo | Wpływ | Mitygacja |
|---|---|---|---|---|
| Zmienne z `astro:env` nie docierają do runtime po deployu (issue #16790) | Devil's advocate / badanie | M | H | Po pierwszym deployu zweryfikować ręcznie, że `SUPABASE_URL`/`SUPABASE_KEY` są dostępne w produkcji; jako fallback użyć `Astro.locals.runtime.env` zamiast `astro:env/server`, jeśli problem wystąpi |
| Rollback kodu bez rollbacku migracji Supabase | Devil's advocate | L | H | Traktować migracje SQL jako osobny, jednokierunkowy krok; przed każdą migracją robić kopię/snapshot i nie łączyć rollbacku kodu z cofaniem schematu bez ręcznej weryfikacji |
| Throttling przy 10ms CPU na request na darmowym tierze przy cięższych wyliczeniach zbiorczego ponaglenia | Pre-mortem | L | M | Zmierzyć czas wykonania logiki eskalacji/odsetek dla klienta z wieloma fakturami podczas implementacji; w razie potrzeby przejść na płatny tier ($5/mies. za 10M żądań) |
| Subtelne różnice dev/prod na workerd dla pakietów npm zależnych od pełnego Node API | Unknown unknowns | L | M | Testować krytyczne ścieżki (auth, generowanie treści ponaglenia) na `wrangler dev`/preview deployment przed każdym merge do main, nie tylko lokalnie |
| Sekret produkcyjny niezsynchronizowany z `.dev.vars` po zmianie lokalnej | Unknown unknowns | M | L | Przy każdej zmianie `SUPABASE_URL`/`SUPABASE_KEY` lokalnie, jawnie odnotować krok `wrangler secret put` w checklist wdrożeniowej |
| Brak pełnego "ops" MCP dla Workers ogranicza agentowe zarządzanie deployem do CLI przez Bash | Research finding | L | L | Zaakceptować jako świadomy kompromis MVP; `wrangler` CLI w pełni pokrywa potrzeby solo deva |

## Pierwsze kroki

1. Zweryfikować, że `wrangler.jsonc` ma poprawną nazwę Workera i `compatibility_date` ≥ 2024-09-23 (wymagane dla `nodejs_compat`).
2. Uzupełnić `SUPABASE_URL` i `SUPABASE_KEY` jako Cloudflare Workers secrets: `npx wrangler secret put SUPABASE_URL` oraz `npx wrangler secret put SUPABASE_KEY`.
3. Zbudować i wdrożyć: `npm run build && npx wrangler deploy`.
4. Zweryfikować w produkcji, że `astro:env` faktycznie zwraca sekrety (patrz ryzyko #1) — zalogować się testowym kontem przez `/auth/signin`.
5. Skonfigurować `SUPABASE_URL`/`SUPABASE_KEY` jako repository secrets w GitHub Actions (już oczekiwane przez `.github/workflows/ci.yml`), żeby krok `build` w CI przechodził.

## Poza zakresem

Poniższe nie było oceniane w tym badaniu:
- Konfiguracja obrazów Docker
- Konfiguracja pipeline'u CI/CD (poza już istniejącym `.github/workflows/ci.yml`)
- Architektura produkcyjna na dużą skalę (multi-region, HA, DR)
