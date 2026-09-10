import { useEffect, useState } from "preact/hooks";
import type { Book } from "../types";
import { resolvePageImage } from "../lib/storage";
import { exportBookPdf } from "../lib/pdf";

interface Props {
  book: Book;
  onClose: () => void;
}

export function Reader({ book, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const page = book.pages[index];

  useEffect(() => {
    let url = "";
    let cancelled = false;
    setSrc("");
    if (!page.src) return;
    resolvePageImage(book, page)
      .then((u) => { if (!cancelled) { url = u; setSrc(u); } })
      .catch((e) => { if (!cancelled) setError(String((e as Error)?.message ?? e)); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [book, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, book.pages.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [book, onClose]);

  let touchX = 0;
  const onTouchStart = (e: TouchEvent) => { touchX = e.touches[0].clientX; };
  const onTouchEnd = (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (dx < -50) setIndex((i) => Math.min(i + 1, book.pages.length - 1));
    if (dx > 50) setIndex((i) => Math.max(i - 1, 0));
  };

  const doExport = async () => {
    setBusy(true);
    setError("");
    try {
      await exportBookPdf(book);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="reader" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header class="reader-top">
        <button class="iconbtn" onClick={onClose} aria-label="Luk">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div class="reader-title">{book.title}</div>
        <button class="iconbtn" onClick={() => void doExport()} disabled={busy} aria-label="Eksporter PDF">
          {busy ? "…" : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
          )}
        </button>
      </header>

      <div class="reader-stage">
        {src ? (
          <img class={page.layout === "spread" ? "page-img spread" : "page-img square"} src={src} alt={page.texts.join(" ")} />
        ) : (
          <div class="page-img placeholder">{page.src ? "Henter siden…" : "Ingen illustration endnu"}</div>
        )}
      </div>

      <div class="reader-caption">
        {page.texts.filter(Boolean).map((t, i) => <p key={i}>{t}</p>)}
      </div>

      {error ? <p class="inline-error">{error}</p> : null}

      <footer class="reader-nav">
        <button class="navbtn" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Forrige">‹</button>
        <div class="dots">
          {book.pages.map((_, i) => (
            <button
              key={i}
              class={"dot" + (i === index ? " on" : "")}
              onClick={() => setIndex(i)}
              aria-label={`Side ${i + 1}`}
            />
          ))}
        </div>
        <button class="navbtn" disabled={index === book.pages.length - 1} onClick={() => setIndex(index + 1)} aria-label="Næste">›</button>
      </footer>
    </div>
  );
}
