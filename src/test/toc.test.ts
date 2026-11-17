import { describe, expect, it } from "vitest";
import { findSectionPage } from "@/lib/toc";

const p = (o: Partial<Record<"partie" | "chapitre" | "titre" | "sous_chapitre", string>>) => ({ type: "frame", partie: "", chapitre: "", titre: "", sous_chapitre: "", ...o });
const pages = [p({ titre: "Sommaire" }), p({ chapitre: "Chapitre (1) :", titre: "Les bases" }), p({}), p({ sous_chapitre: "1.1 Le périnée" })];

describe("table of contents", () => {
  it("jumps to the chapter page by its title", () => expect(findSectionPage(pages, "Les bases")).toBe(2));
  it("matches sub-chapters ignoring accents", () => expect(findSectionPage(pages, "1.1 Le perinee")).toBe(4));
  it("returns null for unknown sections", () => expect(findSectionPage(pages, "Inconnu")).toBeNull());
});
