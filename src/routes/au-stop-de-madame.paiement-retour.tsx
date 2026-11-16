import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { confirmMonerooPayment } from "@/lib/payment.functions";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/au-stop-de-madame/paiement-retour")({
  head: () => ({
    meta: [
      { title: "Paiement — Au stop de madame" },
      { name: "description", content: "Vérification de votre paiement premium." },
      { property: "og:title", content: "Paiement — Au stop de madame" },
      { property: "og:description", content: "Vérification de votre paiement premium." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentReturn,
});

/** Landing page of the payment popup: verifies the payment, tells the app, then closes itself. */
function PaymentReturn() {
  const { user, ready } = useSession();
  const confirm = useServerFn(confirmMonerooPayment);
  const [state, setState] = useState<"checking" | "ok" | "failed">("checking");

  useEffect(() => {
    if (!ready) return;
    const paymentId = new URLSearchParams(window.location.search).get("paymentId");
    const finish = (ok: boolean) => {
      setState(ok ? "ok" : "failed");
      window.opener?.postMessage({ type: "asm-payment-done", ok }, window.location.origin);
      if (window.opener) window.setTimeout(() => window.close(), ok ? 1800 : 4000);
    };
    if (!user || !paymentId) return finish(false);
    confirm({ data: { paymentId } })
      .then((r) => finish(r.ok))
      .catch(() => finish(false));
  }, [ready, user, confirm]);

  return (
    <div className="bg-app flex min-h-screen items-center justify-center p-6 text-center">
      <div className="max-w-sm space-y-2">
        <h1 className="text-lg font-bold">
          {state === "checking" ? "Vérification du paiement…" : state === "ok" ? "Paiement confirmé !" : "Paiement non confirmé"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {state === "checking"
            ? "Merci de patienter quelques secondes."
            : state === "ok"
              ? "Bienvenue dans l'offre premium. Cette fenêtre va se fermer."
              : "Le paiement n'a pas pu être validé. Vous pouvez fermer cette fenêtre et réessayer."}
        </p>
        {state !== "checking" && (
          <button type="button" className="mt-3 rounded-xl bg-cta px-4 py-2 text-sm font-bold text-brand-ink" onClick={() => window.close()}>
            Fermer
          </button>
        )}
      </div>
    </div>
  );
}
