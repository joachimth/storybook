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

export async function illustrationPrompts(sider: string[], styleNote: string): Promise<string[]> {
  const o = await chatJson(
    "You are an art director for children's picture books. You answer with valid JSON only.",
    `For each story page below, write ONE concise English illustration prompt (1-2 sentences). Style: ${styleNote}. Keep the main character consistent across all prompts. No text or letters in the images.
Pages:
${sider.map((s, i) => `${i + 1}. ${s}`).join("\n")}
JSON format: {"prompts":["prompt for page 1","prompt for page 2",...]}`,
    0.7
  );
  const prompts = (o.prompts as string[]) ?? [];
  if (!Array.isArray(prompts) || prompts.length !== sider.length) {
    throw new Error("Forkert antal prompts i svaret");
  }
  return prompts.map((p) => String(p).trim());
}

export async function generateIllustration(prompt: string): Promise<Blob> {
  const key = getApiKey();
  if (!key) throw new Error("Ingen API-nøgle. Indtast den øverst under 'Ny bog'.");
  const res = await fetch(`${API}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "medium",
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? `OpenAI-fejl (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { data: { b64_json: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("Intet billede i svaret");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

/** Cirka-pris for billedgenerering (gpt-image-1, medium, 1024x1024 ≈ $0,04/stk). */
export function estimateImageCost(count: number): string {
  return `ca. $${(count * 0.042).toFixed(2)}`;
}
