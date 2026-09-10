from pydantic import BaseModel
from typing import List, Optional

class SuggestionInput(BaseModel):
    navn: Optional[str] = None
    alder: Optional[int] = None

class StorySelection(BaseModel):
    valgt_titel: str
    valgt_handling: str
    navn: str
    alder: int

class Page(BaseModel):
    text: str
    image_prompt: Optional[str] = None

class BookData(BaseModel):
    title: str
    first_name: str
    full_name: str
    age: int
    pages: List[Page]
    dedication: Optional[str] = "Made with love"
