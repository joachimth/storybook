import { useRef, useState } from "preact/hooks";
import type { Book, StorySuggestion } from "../types";
import type { StoryBible } from "../lib/openai";
import { imageKey, putImage, saveBook } from "../lib/storage";
import {
  buildStoryBible,
  estimateImageCost,
  generateCharacterSheet,
  getApiKey,
  illustrationPrompts,
  illustratePage,
  setApiKey,
  suggestStories,
  writeStory,
} from "../lib/openai";

interface Props {
  onSaved: () => void;
}

type Step = "form" | "suggest" | "pages" | "bible" | "images";

export function NewBook({ onSaved }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [navn, setNavn] = useState("");
  const [alder, setAlder] = useState(5);
  const [antalSider, setAntalSider] = useState(14);
  const [titel, setTitel] = useState("");
  const [sider, setSider] = useState<string[]>([]);
  const [suggestionsList, setSuggestionsList] = useState<StorySuggestion[]>([]);
  const [bible, setBible] = useState<StoryBible | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const sheetBlob = useRef<Blob | null>(null);
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
      setPrompts([]);
      setBible(null);
      setSheetUrl("");
      sheetBlob.current = null;
      setStep("pages");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  };

  /** Billedbibel + personreference-ark: sikrer samme person, verden og palette på alle sider. */
  const doBible = async (regenSheetOnly = false) => {
    setBusy(regenSheetOnly ? "sheet" : "bible");
    setError("");
    try {
      let b = bible;
      if (!b || !regenSheetOnly) {
        b = await buildStoryBible(titel || `${navn}s bog`, sider);
        setBible(b);
      }
      const blob = await generateCharacterSheet(b);
      sheetBlob.current = blob;
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
      setSheetUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  };

  const doPrompts = async () => {
    const list = await illustrationPrompts(sider);
    setPrompts(list);
    return list;
  };

  const generateOne = async (i: number, promptList: string[]) => {
    if (!bible) throw new Error("Lav først billedbiblen");
    const scene = promptList[i] || sider[i];
    const blob = await illustratePage(scene, bible, sheetBlob.current ?? undefined);
    imageBlobs.current.set(i, blob);
    const url = URL.createObjectURL(blob);
    setImages((prev) => { const next = [...prev]; next[i] = url; return next; });
  };

  const generateAll = async () => {
    setBusy("images");
    setError("");
    try {
      let promptList = prompts;
      if (promptList.length !== sider.length) promptList = await doPrompts();
      for (let i = 0; i < sider.length; i++) {
        if (!imageBlobs.current.has(i)) {
          setBusy(`images-${i + 1}`);
          await generateOne(i, promptList);
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
      await generateOne(i, prompts);
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
      const sheetKey = imageKey(id, -1);
      const book: Book = {
        id,
        title: titel || `${navn || "Min"}s bog`,
        childName: navn,
        childAge: alder,
        dedication: `made with love for ${navn}`,
        bible: bible ?? undefined,
        sheetSrc: sheetBlob.current ? `idb:${sheetKey}` : undefined,
        pages: sider.map((text, i) => ({
          texts: [text],
          layout: "square" as const,
          src: imageBlobs.current.has(i) ? `idb:${imageKey(id, i)}` : undefined,
          imagePrompt: prompts[i],
        })),
        createdAt: new Date().toISOString(),
      };
      if (sheetBlob.current) await putImage(sheetKey, sheetBlob.current);
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
        <p class="hint">Nøglen ligger kun i din browsers lager og sendes udelukkende til api.openai.com. Hele bogens billeder koster {estimateImageCost(antalSider + 1)} (inkl. personark).</p>
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
            <button class="btn primary" disabled={!sider.some((s) => s.trim())} onClick={() => setStep("bible")}>
              Videre til billedbibel
            </button>
          </div>
        </section>
      )}

      {step === "bible" && (
        <section class="panel">
          <h2>4 · Billedbibel</h2>
          <p class="hint">
            Biblen låser person, verden og palette fast, og personarket bruges som reference til alle
            illustrationer — så figuren ser ens ud på hele bogen. Du kan rette teksten før du genererer.
          </p>
          {hasKey ? (
            <>
              <div class="actions">
                <button class="btn primary" disabled={busy !== ""} onClick={() => void doBible()}>
                  {busy === "bible" ? "Skaber bibel + personark…" : bible ? "Beregn biblen igen" : "Skab billedbibel + personark"}
                </button>
                {bible && (
                  <button class="btn" disabled={busy !== ""} onClick={() => void doBible(true)}>
                    {busy === "sheet" ? "Tegner…" : "Tegn personark igen"}
                  </button>
                )}
              </div>
              {bible && (
                <>
                  <div class="field">
                    <label for="bib-char">Hovedpersonen (ens på alle sider)</label>
                    <textarea id="bib-char" rows={2} value={bible.character}
                      onInput={(e) => setBible({ ...bible, character: (e.target as HTMLTextAreaElement).value })} />
                  </div>
                  <div class="field">
                    <label for="bib-world">Verden og tilbagevendende ting</label>
                    <textarea id="bib-world" rows={2} value={bible.world}
                      onInput={(e) => setBible({ ...bible, world: (e.target as HTMLTextAreaElement).value })} />
                  </div>
                  <div class="field">
                    <label for="bib-pal">Palette</label>
                    <input id="bib-pal" type="text" value={bible.palette}
                      onInput={(e) => setBible({ ...bible, palette: (e.target as HTMLInputElement).value })} />
                  </div>
                </>
              )}
              {sheetUrl && (
                <div class="sheet-preview">
                  <img src={sheetUrl} alt="Personreference-ark" />
                  <p class="hint">Personreference-ark — bruges som reference til alle sider.</p>
                </div>
              )}
            </>
          ) : (
            <p class="hint">Uden API-nøgle springes konsistens-genereringen over — alle illustrationer genereres så uden reference.</p>
          )}
          <div class="actions">
            <button class="btn ghost" onClick={() => setStep("pages")}>Tilbage til teksten</button>
            <button class="btn primary" disabled={!sider.some((s) => s.trim())} onClick={() => { if (prompts.length !== sider.length && hasKey) void doPrompts().catch((e) => setError(String((e as Error)?.message ?? e))); setStep("images"); }}>
              Videre til illustrationer
            </button>
          </div>
        </section>
      )}

      {step === "images" && (
        <section class="panel">
          <h2>5 · Illustrationer</h2>
          <p class="hint">
            {hasKey && bible
              ? "Alle billeder genereres ud fra biblen og personarket, så person, farver og ting matcher hele bogen igennem."
              : hasKey
                ? "Tip: gå tilbage og lav billedbiblen — uden den kan person og farver variere fra side til side."
                : "Uden API-nøgle kan du gemme bogen med tekst og tilføje illustrationer senere."}
            Teksten placeres altid i samme bånd nederst på siden.
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
          <button class="btn ghost" onClick={() => setStep("bible")}>Tilbage til billedbiblen</button>
        </section>
      )}

      {error ? <p class="inline-error">{error}</p> : null}
    </div>
  );
}
