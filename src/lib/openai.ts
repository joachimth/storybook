import type { StorySuggestion } from "../types";

const API = "https://api.openai.com/v1";
const KEY_STORAGE = "sb_openai_key";

export function getApiKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? "";
}

export function setApiKey(key: string): void {
  if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
  else localStorage.removeItem(KEY_STORAGE);
}

async function chatJson(system: string, user: string, temperature = 0.9): Promise<Record<string, unknown>> {
  const key = getApiKey();
  if (!key) throw new Error("Ingen API-nøgle. Indtast den øverst under 'Ny bog'.");
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? `OpenAI-fejl (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(data.choices[0].message.content) as Record<string, unknown>;
}

export async function suggestStories(navn: string, alder: number): Promise<StorySuggestion[]> {
  const o = await chatJson(
    "Du er en erfaren dansk børnebogsforfatter. Du svarer altid med gyldig JSON.",
    `Giv 3 forskellige forslag til en personlig billedbog til ${navn}, ${alder} år. Hver handling skal have en tydelig begyndelse, et spændende midte og en god afslutning hvor alle løfter i historien løses. JSON-format: {"forslag":[{"titel":"...","handling":"2-3 sætninger"}]}`
  );
  const list = (o.forslag as StorySuggestion[]) ?? [];
  if (!Array.isArray(list) || list.length === 0) throw new Error("Ingen forslag i svaret");
  return list.slice(0, 3);
}

export async function writeStory(
  titel: string,
  handling: string,
  navn: string,
  alder: number,
  antalSider: number
): Promise<string[]> {
  const o = await chatJson(
    "Du er en erfaren dansk børnebogsforfatter. Du skriver korte, kærlige sætninger et barn kan forstå. Du svarer altid med gyldig JSON.",
    `Skriv billedbogen "${titel}" til ${navn}, ${alder} år, ud fra denne handling: ${handling}
Regler: præcis ${antalSider} sider, én kort sætning pr. side, samme hovedperson hele vejen, og ALLE løfter/noget mystisk der introduceres skal forklares igen før slutningen. Slut med en varm, god afslutning.
JSON-format: {"sider":["sætning side 1","sætning side 2",...]}`
  );
  const sider = (o.sider as string[]) ?? [];
  if (!Array.isArray(sider) || sider.length === 0) throw new Error("Ingen sider i svaret");
  return sider.map((s) => String(s).trim());
}

/** ------------------ Billedbibel: rollebesætning, verden, palette ------------------ */

export interface StoryBible {
  /** ALLE gennemgående karakterer — hovedpersonen først. Hver beskrivelse låser personens udseende. */
  characters: string[];
  world: string;
  palette: string;
}

export async function buildStoryBible(titel: string, sider: string[]): Promise<StoryBible> {
  const o = await chatJson(
    "You are an art director for children's picture books. You ensure every illustration in a book looks like it came from the same hand. You answer with valid JSON only.",
    `Book title: "${titel}". The story pages:
${sider.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Build a visual bible that an illustrator can follow so EVERY page looks consistent:
- characters: a list with EVERY recurring character in the story (the main child first, then everyone/anything that appears on more than one page: friends, siblings, animals, dragons, toys...). For each: 1-2 sentences with the exact physical look (age, hair color and style, skin, clothes, shoes, accessories, and for creatures: color, size, friendly/scary look). Each must be identical on every page they appear.
- world: the recurring setting(s) and the key props/objects that appear more than once, described so they keep the same shape and color every time.
- palette: 5-6 specific colors (names) used throughout the entire book.

JSON format: {"characters":["...","..."],"world":"...","palette":"..."}`,
    0.5
  );
  const bible = o as unknown as StoryBible;
  if (!Array.isArray(bible.characters) || bible.characters.length === 0 || !bible.world || !bible.palette) {
    throw new Error("Ufuldstændig billedbibel i svaret");
  }
  return { ...bible, characters: bible.characters.map((c) => String(c).trim()) };
}

/** ------------------ Billedgenerering ------------------ */

const STYLE =
  "Soft watercolor children's picture book illustration, warm pastel palette, gentle rounded shapes, cozy and kind atmosphere. No text, no letters, no watermark anywhere.";

function b64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

async function readImageResponse(res: Response): Promise<Blob> {
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? `OpenAI-fejl (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { data: { b64_json: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("Intet billede i svaret");
  return b64ToBlob(b64);
}

/** Reference-ark med HELE rollebesætningen + tilbagevendende rekvisitter. Bruges som reference til ALLE sider. */
export async function generateCharacterSheet(bible: StoryBible): Promise<Blob> {
  const key = getApiKey();
  if (!key) throw new Error("Ingen API-nøgle. Indtast den øverst under 'Ny bog'.");
  const cast = bible.characters
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");
  const prompt = `Children's picture book character reference sheet with MULTIPLE characters, ${STYLE}
The full cast of the book, every character drawn full body, standing, front view, smiling, side by side in a row on a plain warm cream background:
${cast}
Below the characters, the recurring props from the story, each drawn once, clearly and simply: ${bible.world}
Use exactly this palette throughout: ${bible.palette}`;
  const res = await fetch(`${API}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", quality: "medium" }),
  });
  return readImageResponse(res);
}

/** Illustrerer én side. Med cast-arket som reference giver gpt-image-1 edits ens karakterer, stil og palette hele bogen igennem. */
export async function illustratePage(scene: string, bible: StoryBible, sheet?: Blob): Promise<Blob> {
  const key = getApiKey();
  if (!key) throw new Error("Ingen API-nøgle. Indtast den øverst under 'Ny bog'.");
  const cast = bible.characters.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const prompt = `Children's picture book illustration, ${STYLE}
${sheet ? "Match the attached reference sheet EXACTLY: same character designs, same watercolor style, same palette. Only the characters that belong in this scene appear. " : ""}The cast (each character identical on every page they appear in):
${cast}
World and recurring props (same shapes and colors every time): ${bible.world}
Palette: ${bible.palette}
Scene for this page: ${scene}
Composition: one single page. Keep the lower sixth of the image calm and uncluttered (soft ground or sky) — the story text will be placed there later.`;

  if (sheet) {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("image[]", sheet, "character_sheet.png");
    form.append("size", "1024x1024");
    form.append("quality", "medium");
    form.append("prompt", prompt);
    const res = await fetch(`${API}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    return readImageResponse(res);
  }
  const res = await fetch(`${API}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", quality: "medium" }),
  });
  return readImageResponse(res);
}

/** Engelske scene-beskrivelser pr. side (biblen sørger for konsistensen; disse sørger for præcise motiver). */
export async function illustrationPrompts(sider: string[]): Promise<string[]> {
  const o = await chatJson(
    "You are an art director for children's picture books. You answer with valid JSON only.",
    `For each story page below, write ONE concise English scene description (1-2 sentences) describing what is happening, where, and the character's expression/pose. Do not describe style or colors (they are handled separately).
Pages:
${sider.map((s, i) => `${i + 1}. ${s}`).join("\n")}
JSON format: {"prompts":["scene for page 1","scene for page 2",...]}`,
    0.7
  );
  const prompts = (o.prompts as string[]) ?? [];
  if (!Array.isArray(prompts) || prompts.length !== sider.length) {
    throw new Error("Forkert antal prompts i svaret");
  }
  return prompts.map((p) => String(p).trim());
}

/** Cirka-pris for billedgenerering (gpt-image-1, medium, 1024x1024 ≈ $0,04/stk). */
export function estimateImageCost(count: number): string {
  return `ca. $${(count * 0.042).toFixed(2)}`;
}
