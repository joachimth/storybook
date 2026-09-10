# Billedbogsværkstedet (storybook)

Personlige børnebøger i akvarelstil — læs dem på telefonen og eksportér en
trykklar 15×15 cm PDF (Pixum softcover-format), direkte fra browseren.

**Live:** <https://joachimth.github.io/storybook/>

## Funktioner

- **Bibliotek** — alle bøger samlet; den medfølgende bog er *Prinsesse Sophie
  på eventyr* (7 opslag, akvarel).
- **Læs** — opslagssiden med swipe, pile og tastatur.
- **PDF-eksport** — 15×15 cm, spread-billeder som 150×100 mm bånd (identisk
  med de eksisterende Pixum-PDF'er), egne bøger får billede + tekst pr. side
  og en dedikationsside. Alt genereres klient-side med jsPDF.
- **Ny bog** — indtast navn + alder, få 3 AI-forslag eller skriv selv,
  redigér hver sætning, og lad gpt-image-1 illustrere én side ad gangen eller
  hele bogen. Billederne kan tegnes igen enkeltvis.
- **Dine data er dine** — egne bøger ligger i browserens IndexedDB; OpenAI-
  nøglen gemmes kun lokalt og sendes udelukkende til api.openai.com.

## Teknisk

- Vite + Preact + TypeScript, jsPDF til eksport.
- Bøger bundlet med app'en ligger i `public/books/<id>/` (`book.json` +
  billeder). Egen-bøger: IndexedDB (`books`, `images`).
- Billedegenerering: `gpt-image-1` (1024×1024, medium ≈ $0,04/stk),
  historie/forslag: `gpt-4o-mini`.

```bash
bun install
bun run dev      # lokal udvikling
bun run build    # typecheck + produktionsbuild (bruges af CI)
```

## Struktur

```
src/            # web-app (Preact)
  components/   # App, Library, Reader, NewBook
  lib/          # storage (IndexedDB), openai, pdf
public/books/   # bundede bøger (Sophies bog)
python-app/     # den oprindelige FastAPI+Tkinter-app (legacy, vedligeholdes ikke)
.github/workflows/deploy.yml   # CI + Pages-deploy
```

## Historik

- **v2.0 (sep 2026):** web-app på GitHub Pages, JavaScript/Preact. Python-app
  (GPT-4 + DALL-E + Tkinter, juni 2026) er flyttet til `python-app/` som
  legacy-reference — se `python-app/AUDIT.md`.
- Kendt issue i *Prinsesse Sophie*: opslag 5 efterlader "den lille røde prik"
  uforklaret (teksten er malet ind i billederne af billedmodellen, så den
  siden kræver et nyt billede med gpt-image-1 + references fra opslag 3-4).
  `python-app/tools/finish_sophie_book.py` klarer generering + samling af den
  endelige PDF når OpenAI-kontoen har credits.
