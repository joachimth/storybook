from fastapi import APIRouter
from app.models import SuggestionInput
from app.config import CONFIG
import openai

router = APIRouter()
client = openai.OpenAI(api_key=CONFIG["openai_api_key"])

@router.post("/")
def generate_suggestions(data: SuggestionInput):
    navn = data.navn or CONFIG["default_barnets_navn"]
    alder = data.alder or CONFIG["default_barnets_alder"]

    prompt = f"""Lav tre forskellige forslag til korte, søde børnebøger til en {alder}-årig pige ved navn {navn}.

Hver historie skal have:
- En bogtitel (maks 5 ord)
- En meget kort beskrivelse (1 sætning)
- En rolig, eventyrlig og fantasifuld handling
- En tryg og glædelig slutning
- Hovedpersonen skal kun omtales som {navn} i historien (ikke fulde navn)

Skriv som en liste:
1. Titel: ...
   Handling: ...
2. Titel: ...
   Handling: ...
3. Titel: ...
   Handling: ...
"""

    chat_response = client.chat.completions.create(
        model=CONFIG["model"],
        messages=[
            {"role": "system", "content": "Du er en kreativ børnebogsforfatter."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.8
    )

    return {"suggestions": chat_response.choices[0].message.content}
