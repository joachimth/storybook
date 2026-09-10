import { useEffect, useRef, useState } from "preact/hooks";
import type { Book, SavedCast, StorySuggestion } from "../types";
import type { StoryBible } from "../lib/openai";
import { clearBookImages, deleteCast, getImage, imageKey, listCasts, putImage, saveBook, saveCastRecord } from "../lib/storage";
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
  /** Sæt = redigering af en eksisterende bog i stedet for en ny. */
  editing?: Book;
}

type Step = "form" | "suggest" | "pages" | "bible" | "images";

export function NewBook({ onSaved, editing }: Props) {
  const [step, setStep] = useState<Step>(editing ? "pages" : "form");
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
  /** Gemte rollebesætninger til genbrug på tværs af bøger. */
  const [casts, setCasts] = useState<SavedCast[]>([]);
  const [castName, setCastName] = useState("");
  const [castSaved, setCastSaved] = useState(false);
  const [castDeleteConfirm, setCastDeleteConfirm] = useState<string | null>(null);

  const hasKey = !!getApiKey();

  const refreshCasts = () => {
    listCasts().then(setCasts).catch(() => {});
  };

  useEffect(() => {
    if (step === "bible") refreshCasts();
  }, [step]);

  /** Brug en gemt rollebesætning: bibel + cast-ark kopieres ind i denne bog. */
  const applyCast = async (cast: SavedCast) => {
    setError("");
    try {
      setBible({ ...cast.bible, characters: [...cast.bible.characters] });
      sheetBlob.current = null;
      if (cast.sheetSrc && cast.sheetSrc.startsWith("idb:")) {
        const blob = await getImage(cast.sheetSrc.slice(4));
        if (blob) sheetBlob.current = blob;
      }
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
      setSheetUrl(sheetBlob.current ? URL.createObjectURL(sheetBlob.current) : "");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  };

  /** Gem nuværende bibel + cast-ark som genbrugelig rollebesætning. */
  const saveCastPreset = async () => {
    if (!bible || !sheetBlob.current) {
      setError("Lav først billedbiblen + cast-arket, så der er noget at gemme.");
      return;
    }
    setError("");
    try {
      const id = crypto.randomUUID();
      const cast: SavedCast = {
        id,
        name: castName.trim() || bible.characters[0]?.split(",")[0]?.trim() || "Min rollebesætning",
        bible: { ...bible, characters: [...bible.characters] },
        sheetSrc: `idb:cast:${id}:sheet`,
        createdAt: new Date().toISOString(),
      };
      await saveCastRecord(cast, sheetBlob.current);
      setCastName("");
      setCastSaved(true);
      setTimeout(() => setCastSaved(false), 2000);
      refreshCasts();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  };

  const removeCast = async (cast: SavedCast) => {
    if (castDeleteConfirm !== cast.id) {
      setCastDeleteConfirm(cast.id);
      return;
    }
    setCastDeleteConfirm(null);
    try {
      await deleteCast(cast);
      refreshCasts();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  };

  /** Redigeringstilstand: indlæs bogens tekst, bibel, cast-ark og billeder fra lageret. */
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      setTitel(editing.title);
      setNavn(editing.childName);
      setAlder(editing.childAge ?? 5);
      setSider(editing.pages.map((p) => p.texts[0] ?? ""));
      setPrompts(editing.pages.map((p) => p.imagePrompt ?? ""));
      setImages(new Array(editing.pages.length).fill(null));
      setBible(editing.bible ?? null);
      for (let i = 0; i < editing.pages.length; i++) {
        const p = editing.pages[i];
        if (p.src && p.src.startsWith("idb:")) {
          const blob = await getImage(p.src.slice(4));
          if (blob && !cancelled) {
            imageBlobs.current.set(i, blob);
            const u = URL.createObjectURL(blob);
            urls.push(u);
            setImages((prev) => { const n = [...prev]; n[i] = u; return n; });
          }
        }
      }
      if (editing.sheetSrc && editing.sheetSrc.startsWith("idb:")) {
        const blob = await getImage(editing.sheetSrc.slice(4));
        if (blob && !cancelled) {
          sheetBlob.current = blob;
          const u = URL.createObjectURL(blob);
          urls.push(u);
          setSheetUrl(u);
        }
      }
    })().catch(() => setError("Kunne ikke indlæse bogen til redigering."));
    return () => { cancelled = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [editing]);

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
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
      setSheetUrl("");
      sheetBlob.current = null;
      imageBlobs.current.clear();
      setStep("pages");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy("");
    }
  };

  /** Billedbibel + cast-ark: sikrer samme karakterer, verden og palette på alle sider. */
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
      const id = editing ? editing.id : crypto.randomUUID();
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
        createdAt: editing ? editing.createdAt : new Date().toISOString(),
      };
      if (editing) await clearBookImages(id);
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
      {editing && (
        <div class="edit-banner">
          Redigerer “{editing.title}” — ret teksten, biblen eller billeder og gem.
        </div>
      )}

      {!editing && (
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
          <p class="hint">Nøglen ligger kun i din browsers lager og sendes udelukkende til api.openai.com. Hele bogens billeder koster {estimateImageCost(antalSider + 1)} (inkl. cast-ark).</p>
        </div>
      )}

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
          {hasKey && sider.every((s) => s.trim()) && !editing && (
            <button
              class="btn primary"
              disabled={busy !== ""}
              onClick={() => void doStory(titel, sider.join(" "), navn || "barnet", alder, antalSider)}
            >
              {busy === "story" ? "Skriver…" : "Lad AI omskriv mine sider til én sammenhængende historie"}
            </button>
          )}
          <div class="actions">
            {!editing && <button class="btn ghost" onClick={() => setStep("form")}>Tilbage</button>}
            <button class="btn primary" disabled={!sider.some((s) => s.trim())} onClick={() => setStep("bible")}>
              Videre til billedbibel
            </button>
          </div>
        </section>
      )}

      {step === "bible" && (
        <section class="panel">
          <h2>4 · Billedbibel{editing ? " (redigerer)" : ""}</h2>
          <p class="hint">
            Biblen låser ALLE karakterer i historien — også trolde, dyr og andre
            fantasivæsner, selv de kun optræder på én side — plus verden og
            palette. Cast-arket bruges som reference til alle illustrationer, så
            alle figurer ser ens ud hele bogen igennem. Du kan rette, fjerne og
            tilføje karakterer, eller tegne arket igen.
          </p>
          {hasKey ? (
            <>
              <div class="actions">
                <button class="btn primary" disabled={busy !== ""} onClick={() => void doBible()}>
                  {busy === "bible" ? "Skaber bibel + cast-ark…" : bible ? "Beregn biblen igen" : "Skab billedbibel + cast-ark"}
                </button>
                {bible && (
                  <button class="btn" disabled={busy !== ""} onClick={() => void doBible(true)}>
                    {busy === "sheet" ? "Tegner…" : "Tegn cast-ark igen"}
                  </button>
                )}
              </div>
              {bible && (
                <>
                  {bible.characters.map((c, i) => (
                    <div class="field" key={i}>
                      <label for={`karakter-${i}`}>Karakter {i + 1}</label>
                      <div class="cast-edit">
                        <textarea
                          id={`karakter-${i}`}
                          rows={2}
                          value={c}
                          placeholder=" fx: 5-årig pige, rødt krøllet hår, lyserød kjole, gul krone…"
                          onInput={(e) => setBible({ ...bible, characters: bible.characters.map((x, j) => (j === i ? (e.target as HTMLTextAreaElement).value : x)) })}
                        />
                        {bible.characters.length > 1 && (
                          <button class="btn small" onClick={() => setBible({ ...bible, characters: bible.characters.filter((_, j) => j !== i) })}>Fjern</button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button class="btn small" onClick={() => setBible({ ...bible, characters: [...bible.characters, ""] })}>
                    + Tilføj karakter
                  </button>
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
                  <img src={sheetUrl} alt="Cast-reference-ark" />
                  <p class="hint">Cast-ark med alle karakterer — bruges som reference til alle sider.</p>
                </div>
              )}
            </>
          ) : (
            <p class="hint">Uden API-nøgle springes konsistens-genereringen over — alle illustrationer genereres så uden reference.</p>
          )}

          <div class="castlib">
            <h3>Genbrug rollebesætning</h3>
            <p class="hint">Gemte karakterer, verdener og cast-ark kan bruges igen i nye bøger — fx et helt univers med samme figurer.</p>
            {casts.length === 0 ? (
              <p class="hint">Ingen gemte rollebesætninger endnu. Lav biblen ovenfor og gem den her.</p>
            ) : (
              casts.map((c) => (
                <div class="castrow" key={c.id}>
                  <button class="btn" onClick={() => void applyCast(c)}>Anvend “{c.name}”</button>
                  <button class="btn small" onClick={() => void removeCast(c)}>
                    {castDeleteConfirm === c.id ? "Sikker?" : "Slet"}
                  </button>
                </div>
              ))
            )}
            {bible && sheetUrl && (
              <div class="keyrow">
                <input
                  type="text"
                  placeholder="Navn, fx Sophie-universet"
                  value={castName}
                  onInput={(e) => setCastName((e.target as HTMLInputElement).value)}
                />
                <button class="btn" onClick={() => void saveCastPreset()}>
                  {castSaved ? "Gemt ✓" : "Gem til genbrug"}
                </button>
              </div>
            )}
          </div>

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
          <h2>5 · Illustrationer{editing ? " (redigerer)" : ""}</h2>
          <p class="hint">
            {hasKey && bible
              ? "Alle billeder genereres ud fra biblen og cast-arket, så karakterer, farver og ting matcher hele bogen igennem."
              : hasKey
                ? "Tip: lav billedbiblen først — uden den kan karakterer og farver variere fra side til side."
                : "Uden API-nøgle kan du gemme bogen med tekst og tilføje illustrationer senere."}
            Teksten placeres altid i samme bånd nederst på siden.
          </p>
          <div class="actions">
            <button class="btn primary" disabled={!hasKey || busy.startsWith("images")} onClick={() => void generateAll()}>
              {busy.startsWith("images") ? `Billede ${busy.split("-")[1] ?? ""} af ${sider.length}…` : `Generér alle billeder (${estimateImageCost(sider.length)})`}
            </button>
            <button class="btn primary" disabled={busy !== ""} onClick={() => void doSave()}>
              {busy === "save" ? "Gemmer…" : editing ? "Gem ændringerne" : "Gem bogen"}
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
