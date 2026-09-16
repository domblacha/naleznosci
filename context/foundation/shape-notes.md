---
project: "Należności"
context_type: greenfield
created: 2026-09-14
updated: 2026-09-16
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "kategoria bólu"
      decision: "obciążenie koordynacyjne — ręczne śledzenie wielu klientów/faktur i dopasowywanie reakcji do sytuacji"
    - topic: "insight"
      decision: "deterministyczna eskalacja usuwa decyzję — stałe progi stosowane konsekwentnie zamiast ręcznej oceny kiedy i jak mocno naciskać"
    - topic: "zakres persony"
      decision: "jednoosobowa działalność / freelancer, bez zespołu księgowego"
    - topic: "model logowania"
      decision: "email + hasło, płaski model single-tenant, bez ról"
    - topic: "stan przed pierwszym progiem"
      decision: "faktura widoczna jako 'po terminie' bez etapu; odsetki już naliczane; brak ponaglenia"
    - topic: "etapy eskalacji"
      decision: "stałe 4 etapy, konfigurowalne dni progów; etap 4 końcowy; zmiana progów działa natychmiast na wszystkie faktury"
    - topic: "odsetki"
      decision: "odsetki proste od jednej rocznej stopy wpisanej przez użytkownika; od dnia po terminie do dziś lub daty wpłaty; wstrzymanie nie zatrzymuje odsetek"
    - topic: "rekompensata"
      decision: "3 progi kwotowe w PLN konfigurowane przez użytkownika; przełącznik naliczania rekompensaty na kliencie (B2C)"
    - topic: "precyzja"
      decision: "kwoty zaokrąglane do grosza (połowa w górę); granica dnia wg czasu polskiego"
    - topic: "ponaglenie"
      decision: "zawsze per klient; obejmuje faktury na etapach 1–4; pozycje z kwotami, odsetkami i rekompensatą + suma; 4 edytowalne szablony tonów"
    - topic: "konto"
      decision: "rejestracja, logowanie, wylogowanie; reset hasła poza MVP"
    - topic: "klienci"
      decision: "duplikat po NIP, a przy braku NIP po nazwie (także wśród nieaktywnych); blokada usunięcia klienta z otwartymi fakturami; nieaktywnego można przywrócić"
    - topic: "edycja faktury"
      decision: "termin i kwota zablokowane od dnia po terminie, chyba że eskalacja jest wstrzymana"
    - topic: "częściowe wpłaty"
      decision: "poza MVP"
    - topic: "wstrzymanie/wznowienie"
      decision: "ręczne wznowienie; wstrzymanie nie przesuwa terminu; po wznowieniu etap wynika z aktualnych dni po terminie"
    - topic: "lista faktur"
      decision: "wszystkie otwarte faktury w grupach (bieżące, po terminie przed progiem, etapy 1–4, wstrzymane); filtr po kliencie; sortowanie po dniach po terminie lub kwocie; zapłacone/anulowane w historii"
    - topic: "prognoza"
      decision: "nice-to-have; nieopłacone z terminem w ciągu 30 dni + już przeterminowane (pokazane osobno), bez anulowanych i bez odsetek"
  frs_drafted: 14
  quality_check_status: accepted
---

# Shape Notes — Należności

## Vision & Problem Statement

Właściciel jednoosobowej działalności gospodarczej, który samodzielnie wystawia faktury klientom, traci czas i popełnia błędy, ręcznie pilnując przeterminowanych należności: musi śledzić, która faktura jest zaległa, liczyć odsetki i rekompensatę, decydować jak mocno naciskać na danego klienta i pisać treść przypomnienia dopasowaną do sytuacji. Bez systemu ten proces jest niekonsekwentny — eskalacja bywa pomijana, klienci z kilkoma zaległymi fakturami dostają chaotyczne, osobne ponaglenia zamiast jednego zbiorczego.

Deterministyczna eskalacja — stałe, konfigurowalne progi dni po terminie — usuwa z użytkownika konieczność decydowania za każdym razem, kiedy i jak mocno naciskać na klienta. System stosuje regułę konsekwentnie, wylicza odsetki/rekompensatę automatycznie i generuje dopasowaną treść ponaglenia, czego arkusz kalkulacyjny czy pamięć użytkownika nie dają.

## User & Persona

**Persona podstawowa**: Właściciel jednoosobowej działalności gospodarczej (freelancer / mikroprzedsiębiorca), który samodzielnie wystawia faktury klientom i nie ma zespołu księgowego. Sięga po produkt, gdy faktura klienta mija termin płatności i trzeba zdecydować, co, komu i jak przypomnieć — oraz codziennie/cyklicznie, żeby sprawdzić stan należności i prognozę wpływów. Jego klientami są głównie firmy, ale mogą trafić się też konsumenci (bez prawa do rekompensaty).

## Access Control

Rejestracja i logowanie: email + hasło; użytkownik może się wylogować. Model płaski, single-tenant — jedno konto = jeden właściciel działalności, widzi wyłącznie swoich klientów i faktury. Brak ról (admin/członek/gość) w MVP. Nieuwierzytelniony użytkownik trafiający na chronioną trasę jest przekierowywany do logowania. Reset hasła poza MVP.

## Success Criteria

### Primary
- Użytkownik przechodzi pełny przepływ: rejestruje się i loguje, dodaje klienta i fakturę, widzi ją poprawnie przypisaną do grupy/etapu eskalacji na liście, generuje i kopiuje do schowka treść ponaglenia dla klienta w tonie odpowiadającym etapowi, a po oznaczeniu faktury jako zapłaconej znika ona natychmiast z eskalacji.
- Klient z kilkoma fakturami na etapach 1–4 dostaje jedno zbiorcze ponaglenie z listą pozycji (z odsetkami i rekompensatą), nie osobne per faktura.

### Secondary
- Dashboard z prognozą wpływów na 30 dni daje sensowną orientację finansową użytkownikowi.

### Guardrails
- Wyliczenia odsetek i rekompensaty są poprawne: odsetki = kwota × roczna stopa × dni po terminie / 365, rekompensata = kwota z progu odpowiadającego wartości faktury (0 dla klientów z wyłączoną rekompensatą), wszystkie kwoty zaokrąglone do grosza.
- Etap eskalacji jest deterministyczny — ta sama faktura, ta sama data i te same ustawienia zawsze dają ten sam etap, bez losowości ani niespójności.

## Functional Requirements

### Uwierzytelnianie
- FR-001: Użytkownik może zarejestrować konto, zalogować się (email + hasło) i wylogować. Priority: must-have
  > Socrates: Counter-argument considered: "brak kontrargumentu". Resolution: kept as written.
  > Rewizja 2026-09-16: dodano rejestrację i wylogowanie — wcześniej nie było wiadomo, skąd bierze się konto. Reset hasła poza MVP.

### Klienci i faktury
- FR-002: Użytkownik może dodać klienta (z opcjonalnym NIP i przełącznikiem „naliczaj rekompensatę”, domyślnie włączonym), edytować go, usunąć i przywrócić. Duplikat wykrywany jest po NIP, a przy braku NIP po nazwie (bez rozróżniania wielkości liter), także wśród klientów nieaktywnych. Usunięcie oznacza klienta jako nieaktywnego z zachowaniem historii i jest zablokowane, dopóki klient ma nieopłacone faktury. Priority: must-have
  > Socrates: Counter-argument considered (round 2): "trwałe usunięcie klienta kasuje historię faktur i wyliczeń" + "brak walidacji duplikatów rozdrabnia dane". Resolution: usunięcie zmienione na oznaczenie jako nieaktywny (klient nieaktywny, historia zachowana); dodano walidację duplikatów przy tworzeniu klienta.
  > Rewizja 2026-09-16: doprecyzowano klucz duplikatu, blokadę usunięcia klienta z otwartymi fakturami, przywracanie oraz przełącznik rekompensaty dla klientów-konsumentów.
- FR-003: Użytkownik może dodać, edytować i usunąć fakturę przypisaną do klienta (numer, kwota, termin płatności). Usunięcie oznacza fakturę jako anulowaną z zachowaniem historii; anulowana faktura nie uczestniczy w eskalacji, ponagleniach ani prognozie. Termin płatności i kwota nie są edytowalne od dnia po terminie, chyba że eskalacja faktury jest wstrzymana (FR-013). Priority: must-have
  > Socrates: Counter-argument considered (round 2): "trwałe usunięcie faktury kasuje historię odsetek/eskalacji" + "edycja terminu płatności po naliczeniu eskalacji mogłaby cofnąć lub zafałszować wyliczenia". Resolution: usunięcie zmienione na oznaczenie jako anulowana (faktura anulowana, historia zachowana); edycja terminu płatności zablokowana po starcie eskalacji, chyba że eskalacja jest ręcznie wstrzymana.
  > Rewizja 2026-09-16: blokada obejmuje też kwotę i startuje od dnia po terminie (wtedy zaczynają się odsetki), nie od progu +3.
- FR-004: Użytkownik może oznaczyć fakturę jako zapłaconą w całości, zapisując datę faktycznej wpłaty. Priority: must-have
  > Socrates: Counter-argument considered: "brak daty faktycznej wpłaty utrudnia późniejszą analizę opóźnień". Resolution: rozszerzono FR o zapis daty wpłaty.
  > Rewizja 2026-09-16: tylko wpłata w całości — częściowe wpłaty poza MVP.

### Eskalacja i wyliczenia
- FR-005: System automatycznie przypisuje każdej nieopłaconej, niewstrzymanej fakturze stan na podstawie liczby dni po terminie: bieżąca, po terminie przed pierwszym progiem, albo jeden z 4 etapów eskalacji (domyślne progi +3, +7, +14, +30). Etap 4 jest końcowy. Priority: must-have
  > Socrates: Counter-argument considered: "brak możliwości ręcznego wstrzymania eskalacji dla faktury w trakcie negocjacji". Resolution: dodano FR-013 — ręczne wstrzymanie eskalacji.
  > Rewizja 2026-09-16: doprecyzowano stan przed pierwszym progiem oraz końcowość etapu 4.
- FR-006: Faktura oznaczona jako zapłacona natychmiast wypada z eskalacji. Priority: must-have
  > Socrates: Counter-argument considered: "brak kontrargumentu". Resolution: kept as written.
- FR-007: System wylicza dla przeterminowanej faktury odsetki proste (kwota × roczna stopa × dni po terminie / 365) za okres od dnia po terminie do dziś, a dla zapłaconej — do daty wpłaty, oraz rekompensatę wg progów kwotowych (FR-009), o ile klient ma włączone naliczanie rekompensaty. Wstrzymanie eskalacji nie zatrzymuje odsetek. Priority: must-have
  > Socrates: Counter-argument considered: "automatyczne wyliczenia bez ręcznej korekty są ryzykowne, jeśli użytkownik nie rozumie wzoru". Resolution: kept as written — konfigurowalność stopy/progów (FR-009) daje wystarczającą kontrolę; ręczna korekta wyliczonej kwoty uznana za zbyt ryzykowną funkcję (mogłaby zafałszować wyliczenie) i pozostaje poza MVP.
  > Rewizja 2026-09-16: dodano wzór, okres naliczania, wpływ wstrzymania i warunek B2B; usunięto błędne powiązanie odsetek z progami dni eskalacji.
- FR-008: System grupuje faktury klienta będące na etapach 1–4 w jedno zbiorcze ponaglenie z listą pozycji (nie osobne per faktura), w tonie odpowiadającym najwyższemu etapowi wśród tych faktur. Faktury wstrzymane i przed pierwszym progiem nie wchodzą do ponaglenia. Priority: must-have
  > Socrates: Counter-argument considered: "zbiorcze ponaglenie miesza tony komunikacji z różnych etapów". Resolution: doprecyzowano — cała treść przyjmuje ton najbardziej zaawansowanego etapu wśród faktur klienta.
  > Rewizja 2026-09-16: doprecyzowano, które faktury wchodzą do ponaglenia.
- FR-009: Użytkownik może skonfigurować dni 4 progów eskalacji, roczną stopę odsetek oraz 3 progi kwotowe rekompensaty w PLN. Zmiana ustawień działa natychmiast na wszystkie otwarte faktury. Priority: must-have
  > Socrates: Counter-argument considered: "brak kontrargumentu". Resolution: kept as written.
  > Rewizja 2026-09-16: liczba etapów stała (4); rekompensata jako 3 progi kwotowe zamiast jednej wartości; zmiana działa wstecz na otwarte faktury.
- FR-013: Użytkownik może ręcznie wstrzymać i wznowić eskalację wybranej faktury bez oznaczania jej jako zapłaconej. Wstrzymanie nie przesuwa terminu — po wznowieniu faktura trafia na etap wynikający z aktualnej liczby dni po terminie. Priority: must-have
  > Socrates: dodane w wyniku rundy dla FR-005 — pokrywa przypadek trwających negocjacji z klientem.
  > Rewizja 2026-09-16: dodano wznowienie i jego skutek dla etapu.

### Widoki i ponaglenia
- FR-010: Użytkownik widzi listę otwartych faktur pogrupowaną na: bieżące, po terminie przed pierwszym progiem, etapy 1–4 oraz wstrzymane; może filtrować po kliencie i sortować po liczbie dni po terminie lub kwocie. Faktury zapłacone i anulowane są dostępne w osobnym widoku historii. Priority: must-have
  > Socrates: Counter-argument considered: "brak sortowania/filtrowania per klient utrudnia czytelność przy większej liczbie klientów". Resolution: rozszerzono FR o filtrowanie/sortowanie per klient.
  > Rewizja 2026-09-16: doprecyzowano grupy, kryteria filtrowania/sortowania i widok historii.
- FR-011: Użytkownik może wygenerować dla klienta treść ponaglenia (zgodnie z FR-008) i skopiować ją do schowka. Treść zawiera dla każdej pozycji numer, kwotę, termin, liczbę dni po terminie, odsetki i rekompensatę oraz sumę całkowitą. Priority: must-have
  > Socrates: Counter-argument considered: "bez faktycznej wysyłki wartość jest ograniczona — użytkownik i tak musi ręcznie wkleić i wysłać e-mail". Resolution: kept as written — wysyłka jest świadomie poza zakresem MVP (backlog).
  > Rewizja 2026-09-16: ponaglenie zawsze per klient (wcześniej sprzeczność z FR-008); doprecyzowano zawartość.
- FR-014: Użytkownik może edytować 4 szablony treści ponagleń (po jednym na ton etapu). Priority: must-have
  > Rewizja 2026-09-16: dodane — ton i treść ponagleń muszą być dopasowywalne do stylu komunikacji użytkownika.
- FR-012: Użytkownik widzi dashboard z prognozą wpływów na 30 dni: suma nieopłaconych faktur z terminem w ciągu 30 dni oraz osobno suma faktur już przeterminowanych (bez anulowanych, bez odsetek). Priority: nice-to-have
  > Socrates: Counter-argument considered: "prognoza bez historii spłacalności klienta może być zbyt optymistyczna". Resolution: kept as written — prosta prognoza terminowa jest świadomym kompromisem MVP; wagowanie wg historii trafia do backlogu.
  > Rewizja 2026-09-16: priorytet obniżony do nice-to-have (spójność z Secondary Success Criteria); prognoza obejmuje też faktury już zaległe.

## User Stories

### US-01: Użytkownik przegląda przeterminowane faktury i generuje ponaglenie

- **Given** zalogowany użytkownik ma klienta z przynajmniej jedną fakturą na etapie eskalacji 1–4
- **When** otwiera listę faktur i generuje ponaglenie dla tego klienta
- **Then** widzi fakturę w grupie właściwego etapu, a wygenerowana treść w tonie najwyższego etapu klienta jest gotowa do skopiowania do schowka

#### Acceptance Criteria
- Etap eskalacji wynika wyłącznie z liczby dni po terminie (wg czasu polskiego) i skonfigurowanych progów — bez ręcznej ingerencji.
- Jeśli klient ma kilka faktur na etapach 1–4, generowana jest jedna zbiorcza treść z listą pozycji; faktury wstrzymane i przed pierwszym progiem nie są w niej ujęte.
- Każda pozycja zawiera numer, kwotę, termin, dni po terminie, odsetki i rekompensatę (0 dla klienta z wyłączoną rekompensatą); treść kończy suma, kwoty zaokrąglone do grosza.

### US-02: Użytkownik oznacza fakturę jako zapłaconą

- **Given** zalogowany użytkownik ma przeterminowaną fakturę na dowolnym etapie eskalacji
- **When** oznacza ją jako zapłaconą, podając datę wpłaty
- **Then** faktura natychmiast znika z listy otwartych faktur i z ponagleń, a w historii widać ją z odsetkami naliczonymi do dnia wpłaty

#### Acceptance Criteria
- Faktura nie pojawia się w żadnej grupie listy otwartych faktur ani w treści ponaglenia klienta.
- Odsetki zapłaconej faktury nie rosną po dacie wpłaty.
- Jeśli była to ostatnia faktura klienta na etapach 1–4, dla klienta nie da się już wygenerować ponaglenia.

### US-03: Użytkownik wstrzymuje i wznawia eskalację faktury

- **Given** zalogowany użytkownik ma przeterminowaną fakturę, o której negocjuje z klientem
- **When** wstrzymuje jej eskalację, a później ją wznawia
- **Then** w czasie wstrzymania faktura jest w grupie „wstrzymane” i poza ponagleniami, a po wznowieniu trafia na etap wynikający z aktualnej liczby dni po terminie

#### Acceptance Criteria
- W czasie wstrzymania odsetki nadal rosną.
- W czasie wstrzymania można edytować termin i kwotę faktury; po wznowieniu znów są zablokowane, jeśli faktura jest po terminie.
- Wznowienie nie resetuje licznika dni — etap może „przeskoczyć” o kilka poziomów.

## Business Logic

Na podstawie liczby dni od terminu płatności aplikacja klasyfikuje każdą nieopłaconą fakturę do jednego z czterech etapów eskalacji, wylicza należne odsetki i rekompensatę oraz generuje dopasowaną do etapu treść ponaglenia, grupując wszystkie zaległości jednego klienta w jedną wiadomość.

Reguła konsumuje jako wejście: kwotę i termin płatności faktury, datę wpłaty (jeśli jest), dzisiejszą datę wg czasu polskiego, stan wstrzymania faktury, przełącznik rekompensaty klienta oraz ustawienia użytkownika — dni 4 progów (domyślnie +3/+7/+14/+30), roczną stopę odsetek i 3 progi kwotowe rekompensaty w PLN. Faktura po terminie, ale przed pierwszym progiem, nie ma etapu; faktura po ostatnim progu pozostaje na etapie 4; faktura wstrzymana nie ma etapu do czasu wznowienia. Zmiana ustawień natychmiast zmienia wynik dla wszystkich otwartych faktur.

Odsetki są proste: kwota × roczna stopa × dni po terminie / 365, liczone od dnia po terminie do dziś (lub do daty wpłaty), także w czasie wstrzymania. Rekompensata to kwota z progu odpowiadającego wartości faktury, naliczana tylko klientom z włączonym przełącznikiem. Wszystkie kwoty zaokrąglane są do grosza (połowa w górę).

Wyjściem reguły jest: stan/etap faktury, kwota odsetek i rekompensaty oraz — per klient — treść ponaglenia obejmująca faktury na etapach 1–4, w tonie najwyższego z tych etapów, zbudowana z edytowalnego szablonu. Użytkownik spotyka tę regułę na liście faktur pogrupowanej po stanach oraz przy generowaniu treści ponaglenia do skopiowania.

## Non-Functional Requirements

- Dane klientów i faktur są widoczne wyłącznie dla właściciela konta, który je wprowadził — nigdy dla innych użytkowników systemu.
- Wszystkie kwoty prezentowane użytkownikowi i w ponagleniach są dokładne do grosza (0,01 PLN).
- Granica dnia (liczba dni po terminie) wyznaczana jest wg czasu polskiego — użytkownik w Polsce nie widzi zmiany etapu w innym momencie niż o północy czasu lokalnego.
- Interfejs i treści ponagleń są w języku polskim.

## Non-Goals

- Integracje z systemami księgowymi i import CSV — dane wprowadzane wyłącznie ręcznie w MVP; import/integracje to backlog.
- Faktyczna wysyłka e-mail/SMS — aplikacja generuje treść do skopiowania, nie wysyła wiadomości samodzielnie.
- Generowanie PDF, obsługa VAT, wiele walut — faktury pozostają uproszczonym rekordem bez tych funkcji księgowych.
- Zespoły i role (multi-tenant) — produkt pozostaje single-tenant, jedno konto = jeden właściciel, bez współdzielenia dostępu.
- Częściowe wpłaty — faktura jest nieopłacona albo zapłacona w całości; częściowe spłaty to backlog.
- Historia zmian stopy ustawowej — aplikacja stosuje jedną stopę wpisaną przez użytkownika dla całego okresu opóźnienia.
- Reset hasła — wymaga wysyłki e-mail, która jest poza MVP; backlog.

## Quality cross-check

Wszystkie elementy kontroli jakości obecne: Access Control, Business Logic (reguła jednozdaniowa), Project artifacts, Timeline-cost ack (mvp_weeks: 3), Non-Goals. Preserved behavior nie dotyczy (greenfield). Brak luk.

Rewizja 2026-09-16: przegląd spójności ujawnił i rozstrzygnął niedookreślone reguły (stan przed pierwszym progiem, wzór odsetek, rekompensata B2B, zakres ponaglenia per klient, rejestracja konta, klucz duplikatu, blokada edycji, wznowienie wstrzymania, zawartość listy, priorytet prognozy). Uwaga dla dalszych kroków: MVP ma 13 FR must-have przy budżecie 3 tygodni po godzinach — zakres jest ciasny; w razie poślizgu kandydatami do ograniczenia są FR-014 (edytowalne szablony) i sortowanie w FR-010.
