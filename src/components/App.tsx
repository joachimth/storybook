import { useEffect, useState } from "preact/hooks";
import type { Book } from "../types";
import { listUserBooks, loadBuiltinBook } from "../lib/storage";
import { Library } from "./Library";
import { NewBook } from "./NewBook";
import { Reader } from "./Reader";

type Tab = "library" | "new";

export function App() {
  const [tab, setTab] = useState<Tab>("library");
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [readerBook, setReaderBook] = useState<Book | null>(null);

  const refresh = () => {
    setLoading(true);
    Promise.all([loadBuiltinBook("prinsesse-sophie").catch(() => null), listUserBooks()])
      .then(([builtin, user]) => {
        setBooks([...(builtin ? [builtin] : []), ...user]);
        setError("");
      })
      .catch((e: unknown) => setError(String((e as Error)?.message ?? e)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  if (readerBook) {
    return <Reader book={readerBook} onClose={() => setReaderBook(null)} />;
  }

  return (
    <div class="shell">
      <header class="masthead">
        <h1>Billedbogs&shy;værkstedet</h1>
        <p class="tagline">Personlige børnebøger, klar til at læse og trykke</p>
      </header>

      {tab === "library" && (
        <Library
          books={books}
          loading={loading}
          error={error}
          onRead={(b) => setReaderBook(b)}
          onNew={() => setTab("new")}
        />
      )}
      {tab === "new" && <NewBook onSaved={() => { refresh(); setTab("library"); }} />}

      <nav class="bottomnav">
        <button class={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2Zm0 0a2 2 0 0 1 2-2h13"/><path d="M9 7h6M9 11h4"/></svg>
          <span>Bøger</span>
        </button>
        <button class={tab === "new" ? "active" : ""} onClick={() => setTab("new")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>
          <span>Ny bog</span>
        </button>
      </nav>
    </div>
  );
}
