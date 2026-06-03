# Audit: storybook

**Dato:** 2026-06-03
**Revisor:** Kit
**Repo:** joachimth/storybook

---

## Oversigt

FastAPI backend + Tkinter GUI til generering af personlige børnebøger med GPT-4 og DALL-E. Tekst composites ind på akvarelillustrationer og eksporteres som trykklar 15×15 cm PDF til Pixum.

---

## Fundne problemer

### KRITISK - `config.yaml` brugte GitHub Actions secrets-syntax

**Fil:** `config.yaml`

Felterne `openai_api_key` og `default_barnets_navn` indeholdt `${{ secrets.OPENAI_KEY }}` og `${{ secrets.DEFAULT_NAME }}`. Det er GitHub Actions template-syntax og evalueres **ikke** lokalt - de literal strings ville bruges som API-nøgle, hvilket medfører øjeblikkeligt crash ved første OpenAI-kald.

**Rettelse:** Felterne sat til tomme defaults. `config.py` er opdateret til at override fra env vars (`OPENAI_API_KEY`, `DEFAULT_NAME`). `.env.example` tilføjet. `python-dotenv` integreret.

---

### KRITISK - `story.py` hadde syntaxfejl fra tidligere commit

**Fil:** `app/endpoints/story.py`

Commit `153a8d5` ("fix: critical Pydantic v2 compatibility + comprehensive error handling") indførte en brudt try/except-blok med forkert indrykning. `raw = response.choices[0].message.content` og al efterfølgende kode lå udenfor try-blokken med forkert indrykningsniveau - `IndentationError` ved import.

**Rettelse:** Filen omskrevet fra bunden med korrekt struktur. Tilføjet: JSON code-fence stripping (GPT wrapper markdown), guard mod tomme page-lister, eksplicit fejlretur ved OpenAI-fejl.

---

### MEDIUM - `config.py` brugte relativ sti til `config.yaml`

**Fil:** `app/config.py`

`open("config.yaml", ...)` - relativ sti, breaker hvis appen startes fra anden mappe end projektets rod.

**Rettelse:** Stien resolves nu relativt til `__file__`: `Path(__file__).parent.parent / "config.yaml"`.

---

### MEDIUM - `book.dict()` i `story.py` (Pydantic v2 deprecated)

**Fil:** `app/endpoints/story.py`

Pydantic v2 deprecerede `.dict()` til fordel for `.model_dump()`. Commit `153a8d5` rettede `images.py` men glemte `story.py`.

**Rettelse:** Compat-wrapper tilføjet: `book.model_dump() if hasattr(book, "model_dump") else book.dict()`.

---

### MEDIUM - Ingen requests timeout i GUI

**Fil:** `gui.py`

`requests.post(f"{BASE_URL}/generate_images")` og `/export_pdf` kaldte uden timeout. Billedgenerering (14 DALL-E kald) kan tage 5-10 min - uden timeout fryser GUI'en ubegrænset ved netværksfejl.

**Rettelse:** Timeouts tilføjet: `timeout=(30, 900)` for billeder, `timeout=(30, 120)` for PDF.

---

### MEDIUM - `vis_billeder` viste `_text.png` composites

**Fil:** `gui.py`

`/generate_images` gemmer `image_00.png`. `/export_pdf` gemmer `image_00_text.png` (med tekst composited). GUI'en viste begge - dobbelt så mange thumbnails som forventet, halvdelen med tekst.

**Rettelse:** Filter tilføjet: `not filename.endswith("_text.png")`.

---

### MEDIUM - `extract_forslag` fragil parsing

**Fil:** `gui.py`

`range(0, len(lines), 3)` antog præcis 3 linjer pr. forslag inkl. blank linje. Hvis GPT returnerer forslagene uden blank linjer (`range(0, 6, 3)` = [0,3] for 6 linjer med 2 forslag pr. 2 linjer), misses det 3. forslag.

**Rettelse:** Erstattet med regex der matcher `Titel: ...` efterfulgt af `Handling: ...` uanset linjespacing.

---

### MINOR - `opencv-python` i requirements (inkluderer GUI-komponenter)

**Fil:** `requirements.txt`

`opencv-python` (~100 MB+) inkluderer Qt-bindings og andre GUI-komponenter der ikke bruges server-side. `opencv-python-headless` er den korrekte variant.

**Rettelse:** Erstattet med `opencv-python-headless`.

---

### MINOR - Ingen `.gitignore`

`output/`-mappen (med genererede billeder og PDF'er) og `.env` (med API-nøgle) ville blive committed uden en `.gitignore`.

**Rettelse:** `.gitignore` tilføjet med `output/`, `.env`, `__pycache__/`, m.m.

---

## Tilføjede filer

| Fil | Beskrivelse |
|---|---|
| `.gitignore` | Excluder output/, .env, __pycache__ |
| `.env.example` | Template til OPENAI_API_KEY + DEFAULT_NAME |
| `.github/workflows/ci.yml` | CI: lint (ruff) + import-check + screenshot-automation |
| `capture-screenshots.py` | Playwright screenshot af `/docs` og `/redoc` |
| `screenshots/01_api_docs.png` | Swagger UI screenshot |
| `screenshots/02_api_redoc.png` | ReDoc screenshot |
| `AUDIT.md` | Denne fil |

---

## Status efter rettelser

- Import-check: ✅ `from app.main import app` kører uden fejl
- Server start: ✅ Uvicorn starter og svarer 200 på `/docs`
- CI: ✅ `.github/workflows/ci.yml` tilføjet (lint + import + screenshots)
