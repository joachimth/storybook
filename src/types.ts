export type PageLayout = "spread" | "square";

export interface BookPage {
  /** Tekst pr. panel (spread = 2, square = 1). Tom hvis teksten er malet ind i billedet. */
  texts: string[];
  layout: PageLayout;
  /** Builtin: filnavn i bogens mappe. Egen bog: "idb:<key>". */
  src?: string;
  /** Engelsk billedprompt til (re)generering. */
  imagePrompt?: string;
}

export interface Book {
  id: string;
  title: string;
  childName: string;
  childAge?: number;
  dedication?: string;
  builtin?: boolean;
  note?: string;
  /** Fast billedbibel så alle illustrationer matcher: ALLE gennemgående karakterer, verden og palette. */
  bible?: { characters: string[]; world: string; palette: string };
  /** idb-nøgle til personreference-arket ("idb:<key>"). */
  sheetSrc?: string;
  pages: BookPage[];
  createdAt: string;
}

export interface StorySuggestion {
  titel: string;
  handling: string;
}

/** Gemt rollebesætning til genbrug på tværs af bøger. */
export interface SavedCast {
  id: string;
  name: string;
  bible: { characters: string[]; world: string; palette: string };
  /** idb-nøgle til cast-arket ("idb:cast:<id>:sheet"). */
  sheetSrc?: string;
  createdAt: string;
}
