import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Film, Maximize2, Minimize2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CARD_COLORS, newCard, newMediaCard, newTextLine, type CustomCard } from "@/lib/method";
import { useDismissedCards } from "@/lib/dismissed-cards";
import { uploadMedia } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** A "carte personnalisée": video/GIF background, texts that follow each other, and a button that swipes the card away. */
function MediaCard({ card, interactive, onButton }: { card: CustomCard; interactive: boolean; onButton: () => void }) {
  const texts = (card.texts ?? []).filter((t) => t.text.trim());
  const [i, setI] = useState(0);
  const current = texts.length ? texts[i % texts.length] : undefined;

  useEffect(() => {
    if (texts.length < 2) return;
    const ms = Math.max(0.5, Number(current?.seconds) || 4) * 1000;
    const t = setTimeout(() => setI((n) => (n + 1) % texts.length), ms);
    return () => clearTimeout(t);
  }, [i, texts.length, current?.seconds]);

  return (
    <div className={cn("cp-media", !interactive && "pointer-events-none")}>
      {card.mediaUrl ? (
        card.mediaType === "video" ? (
          <video className="cp-media-bg" src={card.mediaUrl} autoPlay muted loop playsInline />
        ) : (
          <img className="cp-media-bg" src={card.mediaUrl} alt="" />
        )
      ) : (
        <div className="cp-media-bg cp-media-empty">
          <Film className="h-10 w-10" />
        </div>
      )}
      <div className="cp-media-shade" />
      <div className="cp-media-body">
        {current && (
          <p key={`${current.id}-${i}`} className="cp-media-text">
            {current.text}
          </p>
        )}
        <button type="button" className="cp-media-btn" onClick={onButton}>
          {card.buttonText?.trim() || "Continuer"}
        </button>
      </div>
    </div>
  );
}

/** Nearest vertically scrollable ancestor of `el`, else the whole page. */
function scrollParent(el: HTMLElement | null): HTMLElement | Window {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return window;
}

/**
 * Held double tap/click + vertical drag over the cards scrolls the whole site,
 * never the inside of a card. Horizontal gestures still swipe between cards.
 * Works on the carousel and inside each card's iframe document.
 */
function bridgeScroll(target: Document | HTMLElement, carousel: HTMLElement) {
  // One-finger / wheel scrolling stays native (card content scrolls, horizontal swipes change card).
  // Double tap (or double click) held, then dragged vertically, scrolls the whole site.
  const page = () => scrollParent(carousel);
  let lastDown = 0;
  let lastX = 0;
  let lastDY = 0;
  let dragY: number | null = null;
  const begin = (x: number, y: number) => {
    const now = Date.now();
    const isDouble = now - lastDown < 350 && Math.abs(x - lastX) < 40 && Math.abs(y - lastDY) < 40;
    lastDown = now;
    lastX = x;
    lastDY = y;
    dragY = isDouble ? y : null;
  };
  const move = (y: number, e: Event) => {
    if (dragY === null) return;
    e.preventDefault();
    page().scrollBy({ top: dragY - y, behavior: "instant" as ScrollBehavior });
    dragY = y;
  };
  const end = () => (dragY = null);
  const onTouchStart = (e: Event) => {
    const t = (e as TouchEvent).touches;
    if (t.length !== 1 || !t[0]) {
      end();
      return;
    }
    begin(t[0].clientX, t[0].clientY);
  };
  const onTouchMove = (e: Event) => {
    const t = (e as TouchEvent).touches[0];
    if (t) move(t.clientY, e);
  };
  const onMouseDown = (e: Event) => {
    const m = e as MouseEvent;
    if (m.button !== 0) return;
    begin(m.clientX, m.clientY);
    if (dragY !== null) e.preventDefault(); // no text selection while dragging the site
  };
  const onMouseMove = (e: Event) => move((e as MouseEvent).clientY, e);
  const onWheel = (e: Event) => {
    if (dragY === null) return; // held double click + wheel also scrolls the site
    e.preventDefault();
    page().scrollBy({ top: (e as WheelEvent).deltaY, behavior: "instant" as ScrollBehavior });
  };
  const opts = { passive: false } as AddEventListenerOptions;
  const pairs: [string, (e: Event) => void][] = [
    ["touchstart", onTouchStart],
    ["touchmove", onTouchMove],
    ["touchend", end],
    ["touchcancel", end],
    ["mousedown", onMouseDown],
    ["mousemove", onMouseMove],
    ["mouseup", end],
    ["mouseleave", end],
    ["wheel", onWheel],
  ];
  pairs.forEach(([k, f]) => target.addEventListener(k, f, opts));
  return () => pairs.forEach(([k, f]) => target.removeEventListener(k, f, opts));
}

/** The "Page personnalisée" web carousel: one card per HTML snippet (iframe) or media card. */
export function CustomCarousel({ cards, interactive = true }: { cards: CustomCard[]; interactive?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState<string | null>(null);
  const { dismissed, dismiss } = useDismissedCards();
  // In the editor every card stays visible; readers no longer see the cards they closed.
  const visible = interactive ? cards.filter((c) => !dismissed.has(c.id)) : cards;

  const onScroll = () => {
    const el = wrap.current;
    const first = el?.querySelector<HTMLElement>(".cp-card");
    if (!el || !first) return;
    setActive(Math.round(el.scrollLeft / (first.offsetWidth || 1)));
  };

  useEffect(onScroll, [visible.length]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    return bridgeScroll(el, el);
  }, []);

  const iframeCleanups = useRef(new Map<HTMLIFrameElement, () => void>());
  useEffect(() => () => iframeCleanups.current.forEach((f) => f()), []);
  const bridgeFrame = (frame: HTMLIFrameElement) => {
    const doc = frame.contentDocument;
    if (!doc || !wrap.current) return;
    iframeCleanups.current.get(frame)?.();
    iframeCleanups.current.set(frame, bridgeScroll(doc, wrap.current));
  };

  const goTo = (i: number) => {
    const card = wrap.current?.querySelectorAll<HTMLElement>(".cp-card")[i];
    card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  return (
    <div className="cp-root">
      <div ref={wrap} className="cp-carousel" onScroll={onScroll}>
        <div className="cp-track">
          {visible.map((card, i) => (
            <div
              key={card.id}
              className={cn("cp-card", leaving === card.id && "is-leaving")}
              style={{ ["--cp-color" as string]: card.color || CARD_COLORS[i % CARD_COLORS.length] }}
              onAnimationEnd={(e) => {
                if (e.target !== e.currentTarget || leaving !== card.id) return;
                setLeaving(null);
                dismiss(card.id);
              }}
            >
              <span className="cp-beam" />
              {card.kind === "media" ? (
                <MediaCard card={card} interactive={interactive} onButton={() => !leaving && setLeaving(card.id)} />
              ) : (
                <iframe
                  title={`Carte ${i + 1}`}
                  className={cn("cp-frame", !interactive && "pointer-events-none")}
                  srcDoc={card.html}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  onLoad={(e) => bridgeFrame(e.currentTarget)}
                />
              )}
            </div>
          ))}
          {visible.length === 0 && <p className="cp-done">Vous avez parcouru toutes les cartes de cette page.</p>}
        </div>
      </div>
      {visible.length > 1 && (
        <div className="cp-dots">
          {visible.map((c, i) => (
            <button key={c.id} type="button" aria-label={`Carte ${i + 1}`} className={cn("cp-dot", i === active && "is-active")} onClick={() => goTo(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Full-screen view of a custom page, like a regular web page. */
export function CustomPageFullscreen({ cards, onClose }: { cards: CustomCard[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // CSS-only fullscreen: native requestFullscreen makes some phones rotate to landscape.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div ref={box} className="fixed inset-0 z-[90] h-[100dvh] w-full bg-background">
      <CustomCarousel cards={cards} />
      <button
        type="button"
        aria-label="Réduire"
        onClick={onClose}
        className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-page-ink text-page shadow-lg"
      >
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  );
}

/** Serialises an edited iframe document back to HTML, without the editing attributes. */
function docToHtml(doc: Document): string {
  doc.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
  doc.getElementById("asm-inline-edit-style")?.remove();
  const dt = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : "<!DOCTYPE html>";
  return `${dt}\n${doc.documentElement.outerHTML}`;
}

/**
 * Full-window inline editor of a custom page: every card's text is directly editable
 * (contenteditable) and one button saves all the changes.
 */
export function CustomPageInlineEditor({
  cards,
  saving,
  onSave,
  onClose,
}: {
  cards: CustomCard[];
  saving: boolean;
  onSave: (cards: CustomCard[]) => void;
  onClose: () => void;
}) {
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const media = useRef(new Map<string, HTMLElement>());
  const [bigId, setBigId] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const enableEditing = (frame: HTMLIFrameElement) => {
    const doc = frame.contentDocument;
    if (!doc?.body) return;
    doc.body.setAttribute("contenteditable", "true");
    const st = doc.createElement("style");
    st.id = "asm-inline-edit-style";
    st.textContent = "[contenteditable]:focus{outline:2px dashed #b38652;outline-offset:-2px}";
    doc.head?.appendChild(st);
  };

  function save() {
    const next = cards.map((card) => {
      if (card.kind === "media") {
        const root = media.current.get(card.id);
        if (!root) return card;
        const texts = (card.texts ?? []).map((t) => {
          const el = root.querySelector<HTMLElement>(`[data-text-id="${t.id}"]`);
          return el ? { ...t, text: el.innerText.trim() } : t;
        });
        const btn = root.querySelector<HTMLElement>("[data-button]");
        return btn ? { ...card, texts, buttonText: btn.innerText.trim() } : { ...card, texts };
      }
      const frame = frames.current.get(card.id);
      const doc = frame?.contentDocument;
      if (!doc) return card;
      const clone = doc.cloneNode(true) as Document;
      return { ...card, html: docToHtml(clone) };
    });
    onSave(next);
  }

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-reader">
      <div className="flex items-center justify-between gap-2 border-b border-page-ink/10 bg-page px-4 py-2 text-page-ink">
        <span className="text-sm font-medium">Édition directe · cliquez dans un texte pour le modifier</span>
        <div className="flex items-center gap-2">
          <Button variant="page" onClick={save} disabled={saving}>
            <Save /> {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </Button>
          <button
            type="button"
            aria-label="Fermer l'édition"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-page-ink text-page"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        {cards.length === 0 && <p className="text-center text-sm text-muted-foreground">Cette page n'a pas encore de carte.</p>}
        {cards.map((card, i) => (
          <div
            key={card.id}
            className={
              bigId === card.id
                ? "fixed inset-0 z-[96] h-screen w-screen overflow-hidden"
                : "relative mx-auto h-[85vh] w-full max-w-3xl overflow-hidden rounded-[36px]"
            }
            style={{ ["--cp-color" as string]: card.color || CARD_COLORS[i % CARD_COLORS.length] }}
          >
            <button
              type="button"
              aria-label={bigId === card.id ? "Réduire la carte" : "Agrandir la carte en plein écran"}
              onClick={() => setBigId(bigId === card.id ? null : card.id)}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-page-ink/80 text-page shadow"
            >
              {bigId === card.id ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            {card.kind === "media" ? (
              <div ref={(el) => void (el ? media.current.set(card.id, el) : media.current.delete(card.id))} className="cp-media">
                {card.mediaUrl ? (
                  card.mediaType === "video" ? (
                    <video className="cp-media-bg" src={card.mediaUrl} autoPlay muted loop playsInline />
                  ) : (
                    <img className="cp-media-bg" src={card.mediaUrl} alt="" />
                  )
                ) : (
                  <div className="cp-media-bg cp-media-empty">
                    <Film className="h-10 w-10" />
                  </div>
                )}
                <div className="cp-media-shade" />
                <div className="cp-media-body gap-3">
                  {(card.texts ?? []).map((t) => (
                    <p key={t.id} data-text-id={t.id} className="cp-media-text outline-dashed outline-1 outline-offset-4" contentEditable suppressContentEditableWarning>
                      {t.text}
                    </p>
                  ))}
                  <span data-button className="cp-media-btn" contentEditable suppressContentEditableWarning>
                    {card.buttonText?.trim() || "Continuer"}
                  </span>
                </div>
              </div>
            ) : (
              <iframe
                ref={(el) => void (el ? frames.current.set(card.id, el) : frames.current.delete(card.id))}
                title={`Carte ${i + 1} (édition)`}
                className="cp-frame"
                srcDoc={card.html}
                sandbox="allow-same-origin allow-forms"
                onLoad={(e) => enableEditing(e.currentTarget)}
              />
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** Settings of one media card: video/GIF upload, timed texts, button label. */
function MediaCardFields({ card, index, onChange, onDelete }: { card: CustomCard; index: number; onChange: (c: CustomCard) => void; onDelete: () => void }) {
  const [uploading, setUploading] = useState(false);
  const texts = card.texts ?? [];

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const t = toast.loading("Téléversement…");
    try {
      const url = await uploadMedia(file);
      onChange({ ...card, mediaUrl: url, mediaType: file.type.startsWith("video/") ? "video" : "image" });
      toast.success("Fichier ajouté à la carte", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du téléversement", { id: t });
    } finally {
      setUploading(false);
    }
  }

  const setText = (id: string, patch: Partial<{ text: string; seconds: number }>) =>
    onChange({ ...card, texts: texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  return (
    <div className="cp-group">
      <div className="mb-3 flex items-center justify-between gap-2">
        <label>Carte {index + 1} (Carte personnalisée)</label>
        <button type="button" className="cp-btn-del shrink-0" onClick={onDelete}>
          Supprimer cette carte
        </button>
      </div>

      <span className="cp-sub">Vidéo ou GIF</span>
      <div className="mb-4 flex items-center gap-3">
        {card.mediaUrl &&
          (card.mediaType === "video" ? (
            <video src={card.mediaUrl} muted playsInline className="h-16 w-12 rounded-md bg-black object-cover" />
          ) : (
            <img src={card.mediaUrl} alt="" className="h-16 w-12 rounded-md bg-black object-cover" />
          ))}
        <label className="cp-btn-file">
          {uploading ? "Téléversement…" : card.mediaUrl ? "Changer le fichier" : "Choisir un fichier"}
          <input type="file" accept="video/*,image/gif,image/*" className="sr-only" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>

      <span className="cp-sub">Textes (chacun laisse place au suivant après sa durée)</span>
      <div className="mb-3 space-y-3">
        {texts.map((t, ti) => (
          <div key={t.id} className="cp-text-row">
            <textarea
              aria-label={`Texte ${ti + 1}`}
              value={t.text}
              placeholder={`Texte ${ti + 1}`}
              onChange={(e) => setText(t.id, { text: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <label className="cp-sec">
                Durée
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={t.seconds}
                  onChange={(e) => setText(t.id, { seconds: parseFloat(e.target.value) || 0 })}
                />
                s
              </label>
              <button
                type="button"
                aria-label={`Supprimer le texte ${ti + 1}`}
                className="ml-auto text-[#e74c3c]"
                onClick={() => onChange({ ...card, texts: texts.filter((x) => x.id !== t.id) })}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="cp-btn-text mb-4" onClick={() => onChange({ ...card, texts: [...texts, newTextLine()] })}>
        <Plus className="h-4 w-4" /> Texte
      </button>

      <span className="cp-sub">Libellé du bouton</span>
      <input
        type="text"
        className="cp-input"
        value={card.buttonText ?? ""}
        placeholder="Continuer"
        onChange={(e) => onChange({ ...card, buttonText: e.target.value })}
      />
    </div>
  );
}

/** Configuration popup of a custom page (same panel as the original "/set" view). */
export function CustomPageDialog({
  cards,
  open,
  saving,
  onApply,
  onPublish,
  onClose,
}: {
  cards: CustomCard[];
  open: boolean;
  saving: boolean;
  onApply: (cards: CustomCard[]) => void;
  onPublish: (cards: CustomCard[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CustomCard[]>(cards);

  useEffect(() => {
    if (open) setDraft(cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const close = () => {
    onApply(draft);
    onClose();
  };
  const replace = (c: CustomCard) => setDraft((d) => d.map((x) => (x.id === c.id ? c : x)));
  const remove = (id: string) => setDraft((d) => d.filter((c) => c.id !== id));

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-page-ink/50 p-3 backdrop-blur-sm" onClick={close}>
      <div
        role="dialog"
        aria-label="Configuration dynamique des Cartes"
        className="cp-set relative max-h-[92vh] w-full max-w-[800px] overflow-y-auto rounded-2xl px-5 py-7"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" aria-label="Fermer" onClick={close} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-page-ink text-page">
          <X className="h-4 w-4" />
        </button>
        <h2 className="pr-10">Configuration dynamique des Cartes</h2>
        <p className="cp-intro">
          Ajoutez de nouvelles cartes avec le bouton <b>+</b> et renseignez leur code HTML pour le rendu Web, ou ajoutez une carte personnalisée
          (vidéo/GIF, textes et bouton). Vos modifications seront synchronisées sur tous les appareils.
        </p>

        <div className="mb-7 flex flex-wrap gap-3">
          <button type="button" className="cp-btn-add" onClick={() => setDraft((d) => [...d, newCard(d.length)])}>
            + Ajouter une carte
          </button>
          <button type="button" className="cp-btn-add cp-btn-media" onClick={() => setDraft((d) => [...d, newMediaCard(d.length)])}>
            + Ajouter une carte personnalisée
          </button>
          <button type="button" className="cp-btn-save" disabled={saving} onClick={() => onPublish(draft)}>
            {saving ? "Publication..." : "Enregistrer & Publier globalement"}
          </button>
        </div>

        {draft.length === 0 && <p className="cp-intro">Aucune carte. Ajoutez-en une avec les boutons ci-dessus.</p>}
        {draft.map((card, i) =>
          card.kind === "media" ? (
            <MediaCardFields key={card.id} card={card} index={i} onChange={replace} onDelete={() => remove(card.id)} />
          ) : (
            <div key={card.id} className="cp-group">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label htmlFor={`card-${card.id}`}>Carte {i + 1} (Code HTML / Rendu Web)</label>
                <button type="button" className="cp-btn-del shrink-0" onClick={() => remove(card.id)}>
                  Supprimer cette carte
                </button>
              </div>
              <textarea
                id={`card-${card.id}`}
                value={card.html}
                placeholder="Ex: <div style='padding:20px;'><h1>Mon Titre</h1></div>"
                onChange={(e) => replace({ ...card, html: e.target.value })}
              />
            </div>
          ),
        )}
      </div>
    </div>,
    document.body,
  );
}
