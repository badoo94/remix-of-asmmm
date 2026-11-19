import type { AiPage } from "./ai.functions";

const FIT_PT = 27;

/** Builds an off-screen A4 page (real CSS classes) to measure whether a body fits its cadre at 27 pt. */
function makeProbe(page: AiPage) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
  const blank = page.type === "blank";
  const showChap = page.type === "chapter" || page.type === "full";
  const showSous = page.type === "subchapter" || page.type === "full";
  const header = blank
    ? ""
    : `<div class="header-outside">${page.type === "full" && page.partie ? `<div class="mp-partie">${page.partie}</div>` : ""}${
        showChap ? `${page.chapitre ? `<div class="mp-badge">${page.chapitre}</div>` : ""}${page.titre ? `<div class="mp-titre">${page.titre}</div>` : ""}` : ""
      }${showSous && page.sousChapitre ? `<div class="mp-sous">${page.sousChapitre}</div>` : ""}</div>`;
  host.innerHTML = `<div class="mp-page"><div class="mp-zone">${header}<div class="${blank ? "mp-blank" : "cadre"}" style="font-size:${FIT_PT}pt"><div class="w-full"></div></div></div></div>`;
  document.body.appendChild(host);
  const frame = host.querySelector<HTMLElement>(blank ? ".mp-blank" : ".cadre")!;
  const inner = frame.firstElementChild as HTMLElement;
  const fits = (html: string) => {
    inner.innerHTML = html;
    return frame.scrollHeight <= frame.clientHeight + 1;
  };
  return { fits, done: () => host.remove() };
}

function outer(n: Node) {
  if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? "").trim() ? `<p>${n.textContent}</p>` : "";
  return (n as Element).outerHTML ?? "";
}

/** Splits one oversized block by words; returns [part that fits, rest]. */
function splitBlock(html: string, prefix: string, fits: (h: string) => boolean): [string, string] {
  const tpl = document.createElement("div");
  tpl.innerHTML = html;
  const el = tpl.firstElementChild;
  const tag = el?.tagName.toLowerCase() ?? "p";
  const attrs = el ? Array.from(el.attributes).map((a) => ` ${a.name}="${a.value.replace(/"/g, "&quot;")}"`).join("") : "";
  const words = (el?.innerHTML ?? html).split(/(\s+)/);
  let lo = 0, hi = words.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(prefix + `<${tag}${attrs}>${words.slice(0, mid).join("")}</${tag}>`)) lo = mid;
    else hi = mid - 1;
  }
  if (lo === 0) return ["", html];
  return [`<${tag}${attrs}>${words.slice(0, lo).join("")}</${tag}>`, `<${tag}${attrs}>${words.slice(lo).join("").trimStart()}</${tag}>`];
}

/**
 * Validation step of the AI pipeline: any page whose text overflows its cadre at 27 pt is cut
 * and continued on "frame" continuation pages, so every frame is full and nothing shrinks.
 */
export function fitPagesAt27(pages: AiPage[]): AiPage[] {
  if (typeof document === "undefined") return pages;
  const out: AiPage[] = [];
  for (const page of pages) {
    let current: AiPage = page;
    let guard = 0;
    while (guard++ < 200) {
      const probe = makeProbe(current);
      try {
        if (probe.fits(current.body)) {
          out.push(current);
          break;
        }
        const tpl = document.createElement("div");
        tpl.innerHTML = current.body;
        const blocks = Array.from(tpl.childNodes).map(outer).filter(Boolean);
        let kept = "";
        let i = 0;
        for (; i < blocks.length; i++) {
          if (probe.fits(kept + blocks[i])) kept += blocks[i];
          else break;
        }
        let rest = blocks.slice(i);
        if (i < blocks.length) {
          const [head, tail] = splitBlock(blocks[i]!, kept, probe.fits);
          if (head) {
            kept += head;
            rest = [tail, ...blocks.slice(i + 1)];
          } else if (!kept) {
            out.push(current); // a single unsplittable element: keep as is
            break;
          }
        }
        out.push({ ...current, body: kept });
        current = { type: "frame", partie: "", chapitre: "", titre: "", sousChapitre: "", body: rest.join("") };
        if (!current.body.trim()) break;
      } finally {
        probe.done();
      }
    }
  }
  return out;
}
