#!/usr/bin/env python3
"""
Færdiggør 'Prinsesse Sophie på eventyr':

1. Genererer et nyt opslag 5 med gpt-image-1 (edits) ud fra de eksisterende
   opslag 3-4 som typereferencer, så stil og figurer matcher. Det nye opslag
   løser plot-hullet: den lille røde prik på bakken viser sig at være en
   babydrage, der har mistet sin mor.
2. Samler den endelige Pixum-PDF (15x15 cm) med det nye opslag indsat.

Forudsætninger:
  - OPENAI_API_KEY i miljøet (eller --key-fil), kontoen skal have credits.
  - pip install pymupdf httpx   (eller brug --curl som falder tilbage på curl)

Brug:
  python3 finish_sophie_book.py --images-dir public/books/prinsesse-sophie \
      --out Prinsesse_Sophie_billedbog_v2.pdf

Billederne spread1..7.jpg i images-dir skal være de komprimerede opslag
(repoets public-mappe). Det nye opslag gemmes som spread5_new.png og PDF'en
samles med opslag 1-4, nyt 5, 6-7.
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile

try:
    import fitz  # pymupdf
except ImportError:
    sys.exit("pip install pymupdf")

PROMPT = (
    "Create a two-page children's picture book spread in EXACTLY the same "
    "soft watercolor style, same characters and same text layout as the "
    "reference images. Same young princess: orange-red hair, small golden "
    "crown, coral-pink dress. Same friendly green dragon. LEFT PAGE: Sophie "
    "and the green dragon climb a grassy hill and discover that the little "
    "red dot is a tiny, cute, bright-red baby dragon sitting alone and "
    "looking sad and lost. RIGHT PAGE: Sophie and the green dragon happily "
    "lead the baby dragon home to its smiling red mother dragon on a sunny "
    "hill, and Sophie waves goodbye. Render the Danish text at the top of "
    "each page in the same storybook lettering style as the references. The "
    "exact Danish text for the LEFT page top: 'Den r\u00f8de prik var en lille "
    "babydrage, der havde mistet sin mor.' The exact Danish text for the "
    "RIGHT page top: 'Sophie og dragen fulgte babydragen hjem, og s\u00e5 "
    "vinkede de farvel.' Do not add any other text anywhere. No watermark."
)

# 425.2 x 425.2 pt = 150 x 150 mm; billedbånd 425.2 x 283.46 pt ved y=70.87
PAGE_W, PAGE_H = 425.2, 425.2
IMG_RECT = fitz.Rect(0, 70.87, 425.2, 354.33)


def generate_spread(refs: list[str], out_png: str, key: str) -> None:
    cmd = [
        "curl", "-sS", "https://api.openai.com/v1/images/edits",
        "-H", f"Authorization: Bearer {key}",
        "-F", "model=gpt-image-1",
    ]
    for r in refs:
        cmd += ["-F", f"image[]=@{r}"]
    cmd += [
        "-F", "size=1536x1024",
        "-F", "quality=high",
        "-F", f"prompt={PROMPT}",
    ]
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        resp_path = tf.name
    subprocess.run(cmd, check=True, stdout=open(resp_path, "wb"))
    data = json.load(open(resp_path))
    os.unlink(resp_path)
    if "error" in data:
        sys.exit(f"OpenAI-fejl: {data['error'].get('message')}")
    b64 = data["data"][0]["b64_json"]
    with open(out_png, "wb") as f:
        f.write(base64.b64decode(b64))
    print(f"Nyt opslag gemt: {out_png}")


def build_pdf(images: list[str], out_pdf: str) -> None:
    doc = fitz.open()
    for img in images:
        page = doc.new_page(width=PAGE_W, height=PAGE_H)
        page.insert_image(IMG_RECT, filename=img)
    doc.save(out_pdf, deflate=True)
    print(f"PDF gemt: {out_pdf} ({len(images)} opslag)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images-dir", default="public/books/prinsesse-sophie")
    ap.add_argument("--out", default="Prinsesse_Sophie_billedbog_v2.pdf")
    args = ap.parse_args()

    key = os.environ.get("OPENAI_API_KEY", "")
    if not key:
        sys.exit("S\u00e6t OPENAI_API_KEY i milj\u00f8et f\u00f8rst.")

    d = args.images_dir
    refs = [os.path.join(d, "spread3.jpg"), os.path.join(d, "spread4.jpg")]
    new_spread = os.path.join(d, "spread5_new.png")
    if not os.path.exists(new_spread):
        generate_spread(refs, new_spread, key)

    order = []
    for n in [1, 2, 3, 4, "5_new", 6, 7]:
        name = f"spread{n}.png" if isinstance(n, str) else f"spread{n}.jpg"
        path = os.path.join(d, name)
        if not os.path.exists(path):
            sys.exit(f"Mangler {path}")
        order.append(path)
    build_pdf(order, args.out)


if __name__ == "__main__":
    main()
