import { useRef, useState } from "preact/hooks";
import type { Book, StorySuggestion } from "../types";
import { imageKey, putImage, saveBook } from "../lib/storage";
import {
  estimateImageCost,
  generateIllustration,
  getApiKey,
  illustrationPrompts,
  setApiKey,
  suggestStories,
  writeStory,
} from "../lib/openai";

interface Props {
  onSaved: () => void;
}

type Step = "form" | "suggest" | "pages" | "images";

const STYLE_NOTE =
  "soft watercolor children's book illustration, warm pastel palette, gentle rounded shapes, cozy and kind atmosphere";

export function NewBook({ onSaved }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [navn, setNavn] = useState("");
  const [alder, setAlder] = useState(5);
  const [antalSider, setAntalSider] = useState(14);
  const [titel, setTitel] = useState("");
  const [sider, setSider] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [images, setImages] = useState<(string | null)[]>([]);
  const imageBlobs = useRef<Map<number, Blob>>(new Map());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [keyInput, setKeyInput] = useState(getApiKey());
  const [keySaved, setKeySaved] = useState(false);

  const hasKey = !!getApiKey();

  const saveKey = () => {
    setApiKey(keyInput);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const doSuggest = async () => {
    setBusy("suggest");
    setError("");
    try {
      const list = await suggestStories(navn || "barnet", alder);
      setSuggestionsList(list);
      setStep("suggest");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  };
  const [suggestionsList, setSuggestionsList] = useState<StorySuggestion[]>([]);

  const doStory = async (
    t: string,
    h: string,
    n: string = navn,
    a: number = alder,
    count: number = antalSider
  ) => {
    setBusy("story");
    setError("");
    try {
      const list = await writeStory(t, h, n || "barnet", a, count);
      setTitel(t);
      setSider(list);
      setImages(new Array(list.length).fill(null));
      setStep("pages");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  };

  const doPrompts = async () => {
    setBusy("prompts");
    setError("");
    try {
      const list = await illustrationPrompts(sider, STYLE_NOTE);
      setPrompts(list);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  };

  const generateOne = async (i: number) => {
    const prompt = prompts[i] || `Children's book watercolor illustration of: ${sider[i]}. ${STYLE_NOTE}. No text in the image.`;
    const blob = await generateIllustration(prompt);
    imageBlobs.current.set(i, blob);
    const url = URL.createObjectURL(blob);
    setImages((prev) => { const next = [...prev]; next[i] = url; return next; });
  };

  const generateAll = async () => {
    setBusy("images");
    setError("");
    try {
      if (prompts.length !== sider.length) await doPrompts();
      for (let i = 0; i < sider.length; i++) {
        if (!imageBlobs.current.has(i)) {
          setBusy(`images-${i + 1}`);
          await generateOne(i);
        }
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  };

  const regenerate = async (i: number) => {
    setBusy(`regen-${i}`);
    setError("");
    try {
      await generateOne(i);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  };

  const doSave = async () => {
    setBusy("save");
    setError("");
    try {
      const id = crypto.randomUUID();
      const book: Book = {
        id,
        title: titel || `${navn || "Min"}s bog`,
        childName: navn,
        childAge: alder,
        dedication: `made with love for ${navn}`,
        pages: sider.map((text, i) => ({
          texts: [text],
          layout: "square" as const,
          src: imageBlobs.current.has(i) ? `idb:${imageKey(id, i)}` : undefined,
          imagePrompt: prompts[i],
        })),
        createdAt: new Date().toISOString(),
      };
      for (const [i, blob] of imageBlobs.current) {
        await putImage(imageKey(id, i), blob);
      }
      await saveBook(book);
      onSaved();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div class="newbook">
      <div class="keybox">
        <label for="apikey">OpenAI API-nøgle (til AI-forslag og billeder)</label>
        <div class="keyrow">
          <input
            id="apikey"
            type="password"
            inputmode="text"
            placeholder={hasKey ? "Nøgle gemt ✓ – skriv for at udskifte" : "sk-…"}
            value={keyInput}
            onInput={(e) => setKeyInput((e.target as HTMLInputElement).value)}
          />
          <button class="btn" onClick={saveKey}>{keySaved ? "Gemt ✓" : "Gem"}</button>
        </div>
        <p class="hint">Nøglen ligger kun i din browsers lager og sendes udelukkende til api.openai.com. Billeder koster {estimateImageCost(antalSider)} for hele bogen.</p>
      </div>

      {step === "form" && (
        <section class="panel">
          <h2>1 · Om bogen</h2>
          <div class="field">
            <label for="navn">Barnets navn</label>
            <input id="navn" type="text" value={navn} onInput={(e) => setNavn((e.target as HTMLInputElement).value)} placeholder=" fx Sophie" />
          </div>
          <div class="fieldrow">
            <div class="field">
              <label for="alder">Alder</label>
              <input id="alder" type="number" inputmode="numeric" min="1" max="12" value={alder} onInput={(e) => setAlder(Number((e.target as HTMLInputElement).value))} />
            </div>
            <div class="field">
              <label for="sider">Antal sider</label>
              <input id="sider" type="number" inputmode="numeric" min="8" max="24" value={antalSider} onInput={(e) => setAntalSider(Number((e.target as HTMLInputElement).value))} />
            </div>
          </div>
          <div class="actions">
            <button class="btn primary" disabled={!hasKey || busy === "suggest"} onClick={() => void doSuggest()}>
              {busy === "suggest" ? "Tænker…" : "Få 3 historieforslag"}
            </button>
            <button class="btn" onClick={() => { setSider(new Array(antalSider).fill("")); setImages(new Array(antalSider).fill(null)); setStep("pages"); }}>
              Skriv selv
            </button>
          </div>
        </section>
      )}

      {step === "suggest" && (
        <section class="panel">
          <h2>2 · Vælg forslag</h2>
          {suggestionsList.map((s, i) => (
            <button class="suggestion" key={i} onClick={() => void doStory(s.titel, s.handling)}>
              <strong>{s.titel}</strong>
              <span>{s.handling}</span>
            </button>
          ))}
          <button class="btn ghost" onClick={() => setStep("form")}>Tilbage</button>
        </section>
      )}

      {step === "pages" && (
        <section class="panel">
          <h2>3 · Historien</h2>
          <div class="field">
            <label for="titel">Titel</label>
            <input id="titel" type="text" value={titel} onInput={(e) => setTitel((e.target as HTMLInputElement).value)} />
          </div>
          {sider.map((text, i) => (
            <div class="field" key={i}>
              <label for={`side-${i}`}>Side {i + 1}</label>
              <textarea
                id={`side-${i}`}
                rows={2}
                value={text}
                placeholder={i === 0 ? "Der var engang…" : ""}
                onInput={(e) => setSider((prev) => { const next = [...prev]; next[i] = (e.target as HTMLTextAreaElement).value; return next; })}
              />
            </div>
          ))}
          {hasKey && sider.every((s) => s.trim()) && (
            <button
              class="btn primary"
              disabled={busy !== ""}
              onClick={() => void doStory(titel, sider.join(" "), navn || "barnet", alder, antalSider)}
            >
              {busy === "story" ? "Skriver…" : "Lad AI omskriv mine sider til én sammenhængende historie"}
            </button>
          )}
          <div class="actions">
            <button class="btn ghost" onClick={() => setStep("form")}>Tilbage</button>
            <button class="btn primary" disabled={!sider.some((s) => s.trim())} onClick={() => { if (prompts.length !== sider.length && hasKey) void doPrompts(); setStep("images"); }}>
              Videre til billeder
            </button>
          </div>
        </section>
      )}

      {step === "images" && (
        <section class="panel">
          <h2>4 · Illustrationer</h2>
          <p class="hint">
            {hasKey
              ? `Generér alle ${sider.length} billeder (${estimateImageCost(sider.length)}) eller ét ad gangen. Du kan også gemme bogen nu og generere senere.`
              : "Uden API-nøgle kan du gemme bogen med tekst og tilføje illustrationer senere."}
          </p>
          <div class="actions">
            <button class="btn primary" disabled={!hasKey || busy.startsWith("images")} onClick={() => void generateAll()}>
              {busy.startsWith("images") ? `Billede ${busy.split("-")[1] ?? ""} af ${sider.length}…` : `Generér alle billeder (${estimateImageCost(sider.length)})`}
            </button>
            <button class="btn primary" disabled={busy !== ""} onClick={() => void doSave()}>
              {busy === "save" ? "Gemmer…" : "Gem bogen"}
            </button>
          </div>
          <div class="page-grid">
            {sider.map((text, i) => (
              <div class="page-cell" key={i}>
                {images[i] ? (
                  <img src={images[i] as string} alt={`Side ${i + 1}`} />
                ) : (
                  <div class="cell-empty">{busy === `regen-${i}` ? "Tegner…" : "Ingen illustration"}</div>
                )}
                <p>{text}</p>
                {hasKey && (
                  <button class="btn small" disabled={busy !== ""} onClick={() => void regenerate(i)}>
                    {images[i] ? "Tegn igen" : "Tegn"}
                  </button>
                )}
              </div>
            ))}
          </div>
          <button class="btn ghost" onClick={() => setStep("pages")}>Tilbage til teksten</button>
        </section>
      )}

      {error ? <p class="inline-error">{error}</p> : null}
    </div>
  );
}
