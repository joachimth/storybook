from fastapi import APIRouter
from app.models import StorySelection, BookData, Page
from app.config import CONFIG
import openai
import os
import json

router = APIRouter()
client = openai.OpenAI(api_key=CONFIG["openai_api_key"])


@router.post("/")
def generate_full_story(data: StorySelection):
    first_name = data.navn.strip().split()[0]
    full_name = data.navn.strip()
    antal_sider = CONFIG["default_pages"]

    story_prompt = f"""Du skal skrive en komplet børnebog med {antal_sider} sider til en {data.alder}-årig pige.

Titel: {data.valgt_titel}
Hovedperson: {first_name}
Beskrivelse: {data.valgt_handling}

Skriv én kort, enkel og kærlig sætning pr. side – én for hver af de {antal_sider} sider.
Historien skal være rolig, fantasifuld og ende trygt.
Brug kun navnet {first_name} i teksten – aldrig hele navnet.
Returnér resultatet som en JSON-liste med tekststrenge, én pr. side. Eks: ["Side 1 tekst", "Side 2 tekst", ...]
"""

    try:
        response = client.chat.completions.create(
            model=CONFIG["model"],
            messages=[
                {"role": "system", "content": "Du er en kreativ børnebogsforfatter."},
                {"role": "user", "content": story_prompt},
            ],
            temperature=0.7,
        )
    except Exception as e:
        return {"error": f"OpenAI-kald fejlede: {e}"}

    raw = response.choices[0].message.content

    # Strip markdown code fences if GPT wraps the JSON
    stripped = raw.strip()
    if stripped.startswith("```"):
        stripped = "\n".join(stripped.split("\n")[1:])
        stripped = stripped.rstrip("`").strip()

    pages: list[Page] = []
    try:
        pages_text = json.loads(stripped)
        for item in pages_text:
            if isinstance(item, str):
                pages.append(Page(text=item.strip()))
            elif isinstance(item, dict) and "text" in item:
                pages.append(Page(text=item["text"].strip()))
            elif isinstance(item, dict):
                first_value = next(iter(item.values()), "")
                pages.append(Page(text=str(first_value).strip()))
            else:
                pages.append(Page(text=str(item).strip()))
    except json.JSONDecodeError:
        # Fallback: treat numbered lines as pages
        lines = [line.strip() for line in raw.strip().split("\n") if line.strip()]
        pages = [Page(text=line.split(". ", 1)[-1].strip()) for line in lines]

    if not pages:
        return {"error": "Ingen sider kunne parses fra GPT-svaret."}

    book = BookData(
        title=data.valgt_titel,
        first_name=first_name,
        full_name=full_name,
        age=data.alder,
        pages=pages,
        dedication=f"Made with love for {full_name}",
    )

    os.makedirs(CONFIG["output_folder"], exist_ok=True)
    json_path = os.path.join(CONFIG["output_folder"], "book_data.json")

    # Pydantic v1/v2 compat
    book_data = book.model_dump() if hasattr(book, "model_dump") else book.dict()
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(book_data, f, ensure_ascii=False, indent=2)

    return {"message": "Historie genereret og gemt", "json_path": json_path}
