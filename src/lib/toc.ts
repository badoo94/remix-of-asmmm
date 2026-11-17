/** Normalises a heading for comparison: no tags, accents, punctuation or case. */
export function normTitle(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface SectionPage {
  type: string;
  partie: string;
  chapitre: string;
  titre: string;
  sous_chapitre: string;
}

/** 1-based number of the page that opens the section named `target`, or null. Exact match wins, then prefix/containment. */
export function findSectionPage(pages: SectionPage[], target: string): number | null {
  const t = normTitle(decodeURIComponent(target));
  if (!t) return null;
  const heads = pages.map((p) => [p.partie, p.chapitre, p.titre, p.sous_chapitre, `${p.chapitre} ${p.titre}`].map(normTitle).filter(Boolean));
  let i = heads.findIndex((h) => h.includes(t));
  if (i < 0) i = heads.findIndex((h) => h.some((x) => x.length > 2 && (x.startsWith(t) || t.startsWith(x) || t.includes(x))));
  return i < 0 ? null : i + 1;
}
