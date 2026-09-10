import type { Book } from "../types";
import { useEffect, useState } from "preact/hooks";
import { resolvePageImage } from "../lib/storage";
import { exportBookPdf } from "../lib/pdf";

interface Props {
  books: Book[];
  loading: boolean;
  error: string;
  onRead: (book: Book) => void;
  onNew: () => void;
  onEdit: (book: Book) => void;
}

function Cover({ book }: { book: Book }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let url = "";
    let cancelled = false;
    const page = book.pages.find((p) => p.src);
    if (!page) return;
    resolvePageImage(book, page)
      .then((u) => { if (!cancelled) { url = u; setSrc(u); } })
      .catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [book]);
  return src ? <img class="cover" src={src} alt="" loading="lazy" /> : <div class="cover cover-empty">🎨</div>;
}

export function Library({ books, loading, error, onRead, onNew, onEdit }: Props) {
  const [busyId, setBusyId] = useState("");
  const [pdfError, setPdfError] = useState("");

  const exportPdf = async (book: Book) => {
    setBusyId(book.id);
    setPdfError("");
    try {
      await exportBookPdf(book);
    } catch (e) {
      setPdfError(String((e as Error)?.message ?? e));
    } finally {
      setBusyId("");
    }
  };

  if (loading) return <div class="empty-state">Åbner biblioteket…</div>;
  if (error) return <div class="empty-state error">Biblioteket kunne ikke indlæses: {error}</div>;

  return (
    <div class="library">
      {books.map((book) => (
        <div class="book-card" key={book.id}>
          <div class="book-card-media" onClick={() => onRead(book)}>
            <Cover book={book} />
          </div>
          <div class="book-card-body">
            <h2 onClick={() => onRead(book)}>{book.title}</h2>
            <p class="meta">
              {book.childName}
              {book.childAge ? `, ${book.childAge} år` : ""} · {book.pages.length} opslag
              {book.builtin ? " · medfølgende" : ""}
            </p>
            {book.note ? <p class="note">{book.note}</p> : null}
            <div class="actions">
              <button class="btn primary" onClick={() => onRead(book)}>Læs</button>
              <button class="btn" disabled={busyId === book.id} onClick={() => void exportPdf(book)}>
                {busyId === book.id ? "Laver PDF…" : "PDF til print"}
              </button>
              {!book.builtin && (
                <button class="btn ghost" onClick={() => onEdit(book)}>Redigér</button>
              )}
            </div>
          </div>
        </div>
      ))}
      {pdfError ? <p class="inline-error">{pdfError}</p> : null}
      <button class="new-book-cta" onClick={onNew}>
        <span class="cta-plus">＋</span> Skab en ny bog
      </button>
    </div>
  );
}
