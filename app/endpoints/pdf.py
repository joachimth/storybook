from fastapi import APIRouter
from app.config import CONFIG
from app.models import BookData
import os
import json
import re
from PIL import Image, ImageDraw, ImageFont
from fpdf import FPDF

router = APIRouter()

# Brug punktstørrelse og konverter til pixels ud fra DPI
pt_size = 16
FONT_SIZE = int(pt_size * CONFIG["dpi"] / 72)
MARGIN_MM = 12
IMG_PX = CONFIG["image_size_px"]
PDF_MM = CONFIG["pdf_size_mm"]

# Indlæs font (Unicode-venlig til både billede og PDF)
try:
    font = ImageFont.truetype(CONFIG["font_path"], size=FONT_SIZE)
except Exception as e:
    print("Fejl ved indlæsning af font:", e)
    font = ImageFont.load_default()

class UnicodePDF(FPDF):
    def __init__(self):
        super().__init__(orientation='P', unit='mm', format=(PDF_MM, PDF_MM))
        self.add_font("Custom", fname=CONFIG["font_path"], uni=True)
        self.set_font("Custom", size=pt_size)

def add_text_to_image(img_path: str, text: str) -> str:
      try:
            img = Image.open(img_path).convert("RGB")
            draw = ImageDraw.Draw(img)

            # Fjern evt. "Side x:" fra starten af teksten
            if text.lower().startswith("side "):
                text = ":".join(text.split(":")[1:]).strip()

            bbox = draw.textbbox((0, 0), text, font=font)
            w = bbox[2] - bbox[0]
            h = bbox[3] - bbox[1]

            x = (IMG_PX - w) // 2
            y = IMG_PX - h - int(MARGIN_MM * CONFIG["dpi"] / 25.4)

            draw.text((x, y), text, fill="black", font=font)
            new_path = img_path.replace(".png", "_text.png")
            img.save(new_path)
            return new_path
      except Exception as e:
            raise ValueError(f"Kunne ikke tilføje tekst til billede {img_path}: {str(e)}")

@router.post("/")
def generate_pdf():
      try:
            json_path = os.path.join(CONFIG["output_folder"], "book_data.json")
            if not os.path.exists(json_path):
                return {"error": "Ingen gemt bogdata fundet."}

            with open(json_path, "r", encoding="utf-8") as f:
                book = BookData(**json.load(f))

            image_dir = os.path.join(CONFIG["output_folder"], "images")
            safe_title = re.sub(r'[\\/*?:"<>|]', "", book.title)
            pdf_path = os.path.join(CONFIG["output_folder"], f"{safe_title}_{book.first_name}_15x15_final.pdf")

            pdf = UnicodePDF()

            for i, page in enumerate(book.pages):
                base_img_path = os.path.join(image_dir, f"image_{i:02}.png")
                if not os.path.exists(base_img_path):
                    continue
                img_with_text = add_text_to_image(base_img_path, page.text)
                pdf.add_page()
                pdf.image(img_with_text, x=0, y=0, w=PDF_MM, h=PDF_MM)

            # Dedikation nederst på sidste side
            pdf.add_page()
            pdf.set_auto_page_break(False)
            pdf.set_xy(0, PDF_MM - 15)

            dedication_text = book.dedication.replace("love", "❤️")
            pdf.set_font("Custom", size=pt_size-4)
            pdf.set_text_color(r=190,g=0,b=0)
            pdf.multi_cell(w=PDF_MM, h=10, txt=dedication_text, align="C")

            pdf.output(pdf_path)
            return {"message": "PDF genereret", "pdf_path": pdf_path}
      except Exception as e:
            return {"error": f"Fejl ved PDF-generering: {str(e)}"}
