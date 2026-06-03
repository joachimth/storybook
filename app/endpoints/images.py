from fastapi import APIRouter
from app.config import CONFIG
from app.models import BookData
import os
import json
import openai
from PIL import Image
from io import BytesIO
import base64
import cv2
import numpy as np

router = APIRouter()
client = openai.OpenAI(api_key=CONFIG["openai_api_key"])

def upscale_image_opencv(pil_img: Image.Image, target_size=1772) -> Image.Image:
    img_np = np.array(pil_img)
    upscaled_np = cv2.resize(img_np, (target_size, target_size), interpolation=cv2.INTER_CUBIC)
    return Image.fromarray(upscaled_np)

def generate_image(prompt: str) -> Image.Image:
    response = client.images.generate(
        prompt=prompt,
        size="1024x1024",
        response_format="b64_json",
        n=1
    )
    image_data = base64.b64decode(response.data[0].b64_json)
    image = Image.open(BytesIO(image_data))
    return upscale_image_opencv(image)

@router.post("/")
def generate_images():
      try:
            json_path = os.path.join(CONFIG["output_folder"], "book_data.json")
            if not os.path.exists(json_path):
                return {"error": "Ingen gemt historie fundet."}

            with open(json_path, "r", encoding="utf-8") as f:
                book = BookData(**json.load(f))

            image_dir = os.path.join(CONFIG["output_folder"], "images")
            os.makedirs(image_dir, exist_ok=True)

            for i, page in enumerate(book.pages):
                # New improved prompt that combines story context with the specific style requirements
                english_prompt = f"A print-ready children's book illustration in a clean digital watercolor-inspired style. Featuring {book.first_name} (a young girl with light brown hair in a pink dress with white lace) {page.text}. The background is simple and magical, without texture or visual noise. All lines are clean, colors are soft, and the composition is calm and balanced. No paper-like effects or rough brush strokes. Single-page spread (1772x1772px). Leave room at the bottom center for child-friendly sans-serif text."
                
                image = generate_image(english_prompt)
                image_path = os.path.join(image_dir, f"image_{i:02}.png")
                image.save(image_path)
                book.pages[i].image_prompt = english_prompt

            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(book.model_dump(), f, ensure_ascii=False, indent=2)

            return {"message": f"{len(book.pages)} billeder genereret og opskaleret i {image_dir}"}
      except Exception as e:
            return {"error": f"Fejl ved billedgenerering: {str(e)}"}