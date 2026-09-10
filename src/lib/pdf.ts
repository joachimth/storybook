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
        doc.addImage(data, fmt, 0, 0, 150, 150);
      }
      const text = page.texts.filter(Boolean).join(" ");
      if (text) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(13);
        doc.setTextColor(54, 42, 33);
        if (url) {
          // Fast tekstbånd i nederste sjettedel — altid samme placering på alle sider
          doc.setFillColor(246, 239, 225);
          doc.rect(0, 123, 150, 27, "F");
          const lines = doc.splitTextToSize(text, 136) as string[];
          const spacing = 5.6;
          const bandCenter = 136.5;
          const firstBaseline = bandCenter + ((lines.length - 1) * spacing) / 2;
          doc.text(lines, 75, firstBaseline, { align: "center" });
        } else {
          const lines = doc.splitTextToSize(text, 126) as string[];
          const firstBaseline = 75 + ((lines.length - 1) * 5.6) / 2;
          doc.text(lines, 75, firstBaseline, { align: "center" });
        }
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
