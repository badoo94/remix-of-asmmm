import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/auth";
import { appSettingsQuery, DEFAULT_APP_CONFIG } from "@/lib/settings";
import { dayFromStart, dayPricesQuery, formatMoney, paymentUrlForDay, priceForDay } from "@/lib/premium-offer";
import { confirmMonerooPayment, startMonerooPayment } from "@/lib/payment.functions";

type Ctx = { startCheckout: (opts?: { url?: string | undefined }) => void; busy: boolean };
const PaymentCtx = createContext<Ctx>({ startCheckout: () => {}, busy: false });

export function usePremiumCheckout() {
  return useContext(PaymentCtx);
}

export function PaymentProvider({ children }: { children: ReactNode }) {
  const { user, profile, isPremium, refetch } = useAccess();
  const { data: settings = DEFAULT_APP_CONFIG } = useQuery(appSettingsQuery);
  const { data: prices = [] } = useQuery(dayPricesQuery);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const startMoneroo = useServerFn(startMonerooPayment);
  const confirmMoneroo = useServerFn(confirmMonerooPayment);
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [orderInfo, setOrderInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bigPay, setBigPay] = useState(false);

  // TOC link colors (admin settings); sub-chapter links ("1.1 …") are tagged data-level="sub".
  useEffect(() => {
    const root = document.documentElement.style;
    settings.tocChapterColor ? root.setProperty("--toc-chapter", settings.tocChapterColor) : root.removeProperty("--toc-chapter");
    settings.tocSubColor ? root.setProperty("--toc-sub", settings.tocSubColor) : root.removeProperty("--toc-sub");
    const tag = () =>
      document.querySelectorAll<HTMLAnchorElement>("a[data-goto]:not([data-level])").forEach((a) => {
        const t = (a.getAttribute("data-goto") || a.textContent || "").trim();
        a.dataset["level"] = /^(\d+\.\d+|sous[- ]chapitre)/i.test(t) ? "sub" : "chapter";
      });
    tag();
    const mo = new MutationObserver(tag);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [settings.tocChapterColor, settings.tocSubColor]);

  // Return from Moneroo checkout: verify and sync premium automatically.
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("paymentId");
    if (!params.get("moneroo") || !paymentId) return;
    confirmMoneroo({ data: { paymentId } })
      .then((r) => {
        if (r.ok) toast.success("Paiement confirmé : bienvenue dans l'offre premium !");
        else toast.error("Le paiement n'a pas été confirmé.");
        refetch();
        qc.invalidateQueries();
      })
      .catch(() => toast.error("Vérification du paiement impossible."))
      .finally(() => {
        const url = new URL(window.location.href);
        ["moneroo", "paymentId", "paymentStatus"].forEach((k) => url.searchParams.delete(k));
        window.history.replaceState({}, "", url.toString());
      });
  }, [user, confirmMoneroo, refetch, qc]);

  // Every payment runs in the in-page payment window; when it reports back, re-check premium status.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as { type?: string })?.type !== "asm-payment-done") return;
      refetch();
      qc.invalidateQueries();
      if ((e.data as { ok?: boolean }).ok) window.setTimeout(() => setExternalUrl(null), 1800);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [refetch, qc]);
  // Touching the payment form moves focus into the iframe: switch to a pure full-page view.
  useEffect(() => {
    if (!externalUrl) return;
    const onBlur = () =>
      window.setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement && document.activeElement.title === "Paiement") setBigPay(true);
      }, 0);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [externalUrl]);
  const closePayment = () => {
    setExternalUrl(null);
    setBigPay(false);
    refetch();
    qc.invalidateQueries();
  };

  const startCheckout = useCallback(
    async (opts?: { url?: string | undefined }) => {
      if (isPremium) {
        toast.success("Vous profitez déjà de l'offre premium.");
        return;
      }
      if (settings.paymentMode === "external") {
        const total = prices.length ? Math.max(...prices.map((p) => p.day)) : 1;
        const day = profile ? dayFromStart(new Date(profile.created_at), total) : 1;
        // Every CTA uses the visitor's current-day URL unless a specific one is given.
        const url = (opts?.url?.trim() || paymentUrlForDay(prices, day, settings.externalUrl)).trim();
        if (!url) {
          toast.error("Le lien de paiement n'est pas encore configuré.");
          return;
        }
        setExternalUrl(url);
        return;
      }
      if (!user || !profile) {
        toast.message("Connectez-vous pour obtenir l'offre premium.");
        navigate({ to: "/auth", search: { redirect: window.location.pathname } });
        return;
      }
      const total = prices.length ? Math.max(...prices.map((p) => p.day)) : 1;
      const amount = priceForDay(prices, dayFromStart(new Date(profile.created_at), total));
      setBusy(true);
      try {
        if (settings.paymentMode === "moneroo") {
          const returnUrl = `${window.location.origin}/au-stop-de-madame/paiement-retour`;
          const { checkoutUrl } = await startMoneroo({ data: { returnUrl } });
          setExternalUrl(checkoutUrl);
          return;
        }
        const { error } = await supabase
          .from("orders")
          .insert({ user_id: user.id, provider: "simple", amount, currency: settings.currency, status: "pending" });
        if (error) throw error;
        setOrderInfo(formatMoney(amount, settings.currency));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Paiement impossible");
      } finally {
        setBusy(false);
      }
    },
    [isPremium, settings, user, profile, prices, navigate, startMoneroo],
  );

  return (
    <PaymentCtx.Provider value={{ startCheckout, busy }}>
      {children}
      <Dialog open={!!externalUrl} onOpenChange={(o) => !o && closePayment()}>
        {/* Same size as the settings window, page behind stays sharp and visible on every side. */}
        <DialogContent
          overlayClassName="bg-transparent"
          style={bigPay ? { width: "100vw", height: "100dvh", maxWidth: "none", maxHeight: "none", borderRadius: 0, border: 0 } : { width: "min(48rem, calc(100vw - 2rem))", height: "calc(100dvh - 4rem)", maxWidth: "none", maxHeight: "none" }}
          className="flex flex-col gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl [&>button]:hidden"
        >
          {bigPay && (
            <button
              type="button"
              onClick={closePayment}
              aria-label="Fermer"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-foreground/70 text-background shadow-lg"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <div className={bigPay ? "hidden" : "flex items-center justify-between border-b border-border px-4 py-2"}>
            <DialogTitle className="text-sm font-semibold">Offre premium</DialogTitle>
            <DialogDescription className="sr-only">Page de paiement externe</DialogDescription>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => setBigPay((b) => !b)} aria-label={bigPay ? "Réduire" : "Agrandir en plein écran"}>
                {bigPay ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={closePayment} aria-label="Fermer">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {externalUrl && (
            <iframe
              title="Paiement"
              src={externalUrl}
              className="block min-h-0 w-full flex-1 bg-background"
              allow="payment *; clipboard-write"
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!orderInfo} onOpenChange={(o) => !o && setOrderInfo(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Commande enregistrée</DialogTitle>
          <DialogDescription>
            Votre commande premium à {orderInfo} est enregistrée. Votre accès premium s'activera automatiquement dès que
            le paiement sera validé.
          </DialogDescription>
          <Button variant="cta" onClick={() => setOrderInfo(null)}>
            Compris
          </Button>
        </DialogContent>
      </Dialog>
    </PaymentCtx.Provider>
  );
}
