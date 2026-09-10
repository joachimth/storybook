import { jsPDF } from "jspdf";
import type { Book } from "../types";
import { resolvePageImage } from "./storage";

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kunne ikke hente billede (${res.status})`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[æå]/g, "a")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Eksporterer bogen som 15x15 cm PDF (Pixum softcover-format).
 * Spread-sider: billede som 150x100 mm bånd centreret (matcher de eksisterende bøger).
 * Square-sider: billede 130x130 mm med teksten under.
 */
export async function exportBookPdf(book: Book): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: [150, 150], orientation: "portrait", compress: true });
  for (let i = 0; i < book.pages.length; i++) {
    if (i > 0) doc.addPage([150, 150], "portrait");
    const page = book.pages[i];
    let url: string | null = null;
    try {
      url = page.src ? await resolvePageImage(book, page) : null;
    } catch {
      url = null; // side uden billede: tegn alligevel teksten
    }
    if (page.layout === "spread") {
      if (url) {
        const data = await toDataUrl(url);
        const fmt = data.startsWith("data:image/png") ? "PNG" : "JPEG";
        doc.addImage(data, fmt, 0, 25, 150, 100);
      }
    } else {
      if (url) {
        const data = await toDataUrl(url);
        const fmt = data.startsWith("data:image/png") ? "PNG" : "JPEG";
        doc.addImage(data, fmt, 10, 8, 130, 130);
      }
      const text = page.texts.filter(Boolean).join(" ");
      if (text) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(14);
        doc.setTextColor(60, 45, 35);
        const lines = doc.splitTextToSize(text, 126) as string[];
        const y = url ? 146 : 75;
        doc.text(lines, 75, y, { align: "center", baseline: "bottom" });
      }
    }
  }
  if (book.dedication) {
    doc.addPage([150, 150], "portrait");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(12);
    doc.setTextColor(130, 105, 85);
    doc.text(book.dedication, 75, 78, { align: "center" });
  }
  doc.save(`${slug(book.title) || "billedbog"}.pdf`);
}
