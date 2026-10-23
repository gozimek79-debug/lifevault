# LifeVault – Cichy Asystent Domu i Firmy

**Home Vault** skanuje fakturę, paragon albo gwarancję, trzyma plik w sejfie i przypomina 30, 7 i 1 dzień przed końcem gwarancji. **Czytnik dokumentów** bierze zdjęcie albo PDF, tłumaczy go prostym językiem i składa szkic odpowiedzi. Aplikacja jest mobilną PWA. Firma (Micro-Ops) jest osobnym, leniwym modułem i na tym etapie pokazuje „wkrótce”.

Nie ma Stripe, programu partnerskiego ani zadań głosowych. W schemacie SQL są tylko puste kolumny na później.

## Jak uruchomić

Potrzebny jest Node.js 20 albo nowszy (sprawdzone na 24).

```bash
cd "c:\Users\48661\Desktop\Autonomiczny model"
npm install
npm run dev
```

Vite poda lokalny adres. Na telefonie w tej samej sieci można użyć adresu z karty sieciowej, jeśli odpalisz `npm run dev -- --host`.

```bash
npm test
npm run build
npm run preview
```

`npm test` sprawdza parser pól, daty przypomnień, odjęcie kredytu i złożenie flag z JSON modelu. `npm run build` odpala ścisły `tsc -b` i buduje PWA.

Skopiuj `.env.example` do `.env`, gdy chcesz podłączyć chmurę. Pliku `.env` nie commitujemy. Bez żadnych kluczy aplikacja działa w trybie demo.

## Zmienne

Przeglądarka widzi tylko nazwy `VITE_`. Klucze modeli nie mają tego przedrostka i nie wolno ich tam wkładać.

| Zmienna | Gdzie | Po co |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | przeglądarka | Adres projektu. Pusta = demo. |
| `VITE_SUPABASE_ANON_KEY` | przeglądarka | Klucz anon. Oba pola muszą być ustawione, inaczej zostaje demo. |
| `VITE_EXTRACT_FUNCTION_URL` | przeglądarka | Adres funkcji `extract-document`. Pusty = Tesseract w przeglądarce. Czytnik użyje jej też, gdy nie ma osobnego adresu analizy. |
| `VITE_AI_EXTRACT_URL` | przeglądarka | Opcjonalny adres analizy czytnika. Pusty = `VITE_EXTRACT_FUNCTION_URL`, a bez obu heurystyki na urządzeniu. |
| `VITE_MANUAL_SEARCH_API_URL` | przeglądarka | Opcjonalne API, które zwraca JSON `{ "url": "https://..." }`. |
| `VITE_VAPID_PUBLIC_KEY` | przeglądarka | Publiczny klucz Web Push. Pusty = tylko lokalne powiadomienia. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | sekrety funkcji | Nigdy w Vite. |
| `EXTRACT_PROVIDER` | funkcja | `openai` albo `anthropic`. |
| `OPENAI_VISION_MODEL` / `ANTHROPIC_VISION_MODEL` | funkcja | Opcjonalne nazwy modeli. |
| `EXTRACT_REQUIRE_JWT` | funkcja | `true` wymaga sesji Supabase. |

Funkcję wgrywa się z katalogu `supabase/functions/extract-document`. Migracja jest w `supabase/migrations`.

## Architektura

- `src/modules/registry.ts` ładuje leniwie `home`, `micro-ops` i `docs`. Kolejny etap podmienia swój moduł, pulpit zostaje.
- Język PL (domyślny) i EN są w `src/i18n`. W ustawieniach jest też jasny/ciemny motyw i skala tekstu, zapisywana lokalnie. Przyciski rosną razem z czcionką.
- Wejście: e-mail oraz przycisk Google. Przy Supabase to prawdziwe Auth. Bez kluczy powstaje lokalna sesja demo (przycisk Google nie łączy się z Google).
- Rodzina: gospodarstwo i zaproszenie po e-mailu. W demo wpis zostaje w IndexedDB. Przy Supabase funkcja `invite_household_member` zapisuje członka ze statusem `pending`. Sam list e-mail na tym etapie nie wychodzi, bo klucz anon nie wysyła poczty.
- Skany, notatki i kolejka synchronizacji są w IndexedDB (`src/lib/db.ts`). Kolejka rusza tylko wtedy, gdy Supabase jest skonfigurowane: przy zapisie, po powrocie sieci i przez Background Sync.
- Plik jest szyfrowany w przeglądarce zanim trafi do IndexedDB albo Storage.
- Przypomnienia liczy `src/lib/reminder-dates.ts`. Service worker (`src/sw.ts`) trzyma harmonogram i pokazuje powiadomienie, gdy przeglądarka pozwoli mu wstać.
- PDF do eksportu składa `pdf-lib` z fontem DejaVu (polskie znaki). Licencja fontu: `src/assets/DejaVu-LICENSE.txt`.

## Przepływ skanu

Tak działa ekran Dom, nie makieta:

1. Na pulpicie otwierasz kafelek **Dom**.
2. Wybierasz **Skanuj dokument**, robisz zdjęcie albo wskazujesz plik (obraz lub PDF).
3. Widzisz podgląd. **Powtórz** wraca do wyboru pliku.
4. **Odczytaj**. Jeśli jest `VITE_EXTRACT_FUNCTION_URL`, sieć i plik nie jest większy niż 8 MB, aplikacja wysyła go do `extract-document`. Klucz modelu zostaje w funkcji. Gdy funkcji nie ma, sieć padnie albo funkcja odmówi, obraz idzie do tesseract.js (`pol+eng`), a tekst do parsera pól. PDF bez działającej funkcji nie jest zgadywany z nazwy: formularz zostaje pusty do ręcznego uzupełnienia. Do OCR obraz jest zmniejszany; w sejfie ląduje oryginał.
5. Poprawiasz formularz: koniec gwarancji, cenę, producenta, model, numer seryjny, sprzedawcę, typ dokumentu, datę zakupu i notatkę. Każde pole da się zmienić. Pod spodem widać rozpoznany tekst.
6. **Szukaj instrukcji** pyta `VITE_MANUAL_SEARCH_API_URL`, jeśli jest, i oczekuje JSON z adresem `https`. W przeciwnym razie zapisuje gotowy link do wyszukiwarki. Możesz dołączyć własny PDF. Aplikacja nie pobiera i nie scrapuje stron.
7. **Zapisz w sejfie**. Plik (i ewentualna instrukcja) jest szyfrowany AES-256-GCM. Rekord trafia do IndexedDB.
8. Gdy Supabase jest skonfigurowane, wpis dostaje stan „czeka na wysyłkę” i wpada do kolejki. Bez kluczy zostaje tylko na urządzeniu.
9. Z daty końca gwarancji powstają trzy przypomnienia: 30, 7 i 1 dzień wcześniej, o 9:00 czasu lokalnego. Service worker dostaje harmonogram. Termin w najbliższej dobie może odpalić timer, póki worker żyje. Dalsze terminy są sprawdzane przy otwarciu aplikacji i przy Periodic Background Sync, jeśli przeglądarka go da. Termin starszy niż 12 godzin nie wyskakuje hurtem przy zapisie starej gwarancji. **Włącz powiadomienia** na liście przypomnień pyta o zgodę. Web Push zapisuje się dopiero z `VITE_VAPID_PUBLIC_KEY`; bez niego zostaje lokalna rezerwacja.
10. Z karty dokumentu: PDF, szkic e-mail, a z listy przypomnień plik ICS i link do Kalendarza Google. **Zgłoś usterkę** składa opis i wybrane dokumenty do PDF oraz do szkicu mailto.

Pierwszy odczyt Tesseracta ściąga dane językowe (hosty cache’owane przez service worker). Po tym odczyt obrazu działa offline. Całkowicie offline za pierwszym razem formularz i tak da się wypełnić ręcznie.

## Przepływ czytnika dokumentów

Tak działa kafelek **Dokumenty**, nie makieta. Dom zostaje bez zmian.

1. Na pulpicie otwierasz **Dokumenty**. Na górze widać saldo kredytów.
2. Wybierasz język analizy: polski, angielski, ukraiński albo niemiecki. To nie jest język przycisków. Przyciski zostają po polsku albo angielsku z ustawień. Wybór zostaje w tej przeglądarce.
3. Robisz zdjęcie albo wskazujesz obraz albo PDF.
4. Widzisz podgląd. **Analizuj** kosztuje 1 kredyt. Przy zerze zamiast analizy jest ekran „Brak kredytów”.
5. Gdy ustawisz `VITE_AI_EXTRACT_URL` albo `VITE_EXTRACT_FUNCTION_URL`, jest sieć i plik ma do 8 MB, aplikacja prosi model o JSON: streszczenie, słownik (słowo i zwykłe wyjaśnienie), czerwone flagi (cytat, dlaczego to ważne, waga, opcjonalna ramka 0–1 na stronie) i szkic odpowiedzi. Język tego JSON to język z kroku 2. Klucz modelu zostaje w funkcji. Stary tryb faktury w `extract-document` nie zmienia się: czytnik wysyła `purpose: "reader"`.
6. Bez adresu, offline albo gdy model nie odda czytelnego JSON, obraz idzie do tesseract.js (`pol+eng`). PDF bez modelu: aplikacja wyciąga tekst z nieskompresowanych napisów w pliku. Potem lokalne reguły szukają terminów, kar, kwot i akapitów w innym języku. Taki wynik nie ma ramek na stronie.
7. Podgląd obrazu rysuje kolorowe markery tam, gdzie flaga ma ramkę (wysoka czerwień, średnia bursztyn, niska zieleń). Flaga bez ramki i tak jest na liście, a jej cytat jest zaznaczony w panelu tekstu.
8. Szkic odpowiedzi da się poprawić. **Pobierz PDF** i **Szkic e-mail** działają tak jak przy dokumencie w domu.

## Kredyty

Jedna analiza kosztuje **1** kredyt. Nowe gospodarstwo demo startuje z **3**. Gospodarstwo założone wcześniej dostaje te 3 przy pierwszym otwarciu czytnika, raz. Przy **0** analiza nie startuje: widać ekran braku kredytów.

**Dokup kredyty** w demo dopisuje pakiet testowy **5** kredytów. Obok przycisku jest wprost: płatność nie działa, nie ma Stripe i nie ma prawdziwej opłaty. Aplikacja nie woła Stripe.

Saldo jest na gospodarstwo. Lokalnie leży w IndexedDB (konta i księga). W Postgresie są tabele `credit_accounts` i `credit_ledger` oraz funkcje `ensure_credit_account`, `spend_analysis_credit`, `grant_test_pack` i `refund_analysis_credit`. Zapis idzie przez te funkcje. Członek widzi tylko swoje gospodarstwo. Gdy analiza padnie po pobraniu kredytu, kredyt wraca. Drugi zwrot z rzędu nic nie dodaje.

## Model klucza

- Hasło sejfu jest tylko argumentem funkcji na czas wyprowadzenia klucza. Nie zapisujemy go w `localStorage`, IndexedDB, logach ani w żądaniach.
- Z hasła i losowej soli (16 bajtów) powstaje klucz AES-256-GCM: PBKDF2-SHA-256, 210 000 iteracji. Klucz jest `non-extractable` i żyje w pamięci karty do blokady, wylogowania albo odświeżenia.
- W IndexedDB leży sól i weryfikator (zaszyfrowane stałe zdanie). To pozwala poznać złe hasło bez przechowywania hasła.
- Każdy plik ma własne, losowe IV o długości 12 bajtów. Do chmury idzie sam szyfrogram. Obok niego są metadane: algorytm, KDF, liczba iteracji, sól i IV. To nie jest klucz.
- Ten sam plik otworzysz na innym urządzeniu tylko tym samym hasłem. Zgubione hasło oznacza utratę plików. Odzyskiwania nie ma, bo nie trzymamy kopii klucza.
- Tekst OCR i pola formularza są jawne lokalnie i w Postgresie, żeby działało szukanie (`tsvector`) i przypomnienia. Szyfrowany jest plik źródłowy. Zgoda RODO jest przed wejściem; wersja `2026-10-23` ląduje w IndexedDB i, przy Supabase, w tabeli `consents`.

## Co działa od razu, a co czeka

Działa bez kluczy: zgoda, demo logowanie, hasło sejfu, skan, Tesseract i parser, formularz, szyfrowany zapis, lista, szukanie lokalne, przypomnienia 30/7/1, ICS, link do Kalendarza Google, PDF, szkic e-mail, zgłoszenie usterki, rodzina zapisana lokalnie, motyw, język, skala tekstu, PWA, czytnik dokumentów (Tesseract i heurystyki, 3 kredyty na start, pakiet testowy bez płatności).

Czeka na konfigurację:

- Supabase: prawdziwe konto e-mail i Google, gospodarstwo w Postgresie, zaproszenie jako wiersz, synchronizacja szyfrogramu i pól, indeks pełnotekstowy.
- `extract-document` oraz klucz OpenAI albo Anthropic: odczyt wizyjny faktury po stronie serwera. PDF w trybie faktury funkcja odsyła do ręcznego uzupełnienia. Ten sam adres z `purpose: "reader"` (albo `VITE_AI_EXTRACT_URL`) oddaje streszczenie, flagi i szkic w wybranym języku.
- `VITE_MANUAL_SEARCH_API_URL`: adres instrukcji z Twojego API. Bez tego jest tylko link wyszukiwania i własny plik.
- `VITE_VAPID_PUBLIC_KEY`: subskrypcja Web Push. Bez niej zostają lokalne powiadomienia w service workerze.
- Wysyłka e-maila zaproszenia: nie ma jej w tym etapie.

RLS jest w migracji: członek widzi tylko swoje gospodarstwo. Ścieżka zapisu domu i zaproszeń idzie przez funkcje `create_household`, `invite_household_member` i `accept_household_invite`.
