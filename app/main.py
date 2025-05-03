from fastapi import FastAPI
from app.endpoints import suggestions, story, images, pdf

app = FastAPI(title="Børnebog Generator API")

app.include_router(suggestions.router, prefix="/generate_suggestions", tags=["Bogforslag"])
app.include_router(story.router, prefix="/generate_story", tags=["Historiegenerering"])
app.include_router(images.router, prefix="/generate_images", tags=["Billedgenerering"])
app.include_router(pdf.router, prefix="/export_pdf", tags=["PDF"])
