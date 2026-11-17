import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { grantSuccessPremium } from "@/lib/success.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/succes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Succès — Au stop de madame" },
      { name: "description", content: "Votre accès premium Au stop de madame est activé." },
      { property: "og:title", content: "Succès — Au stop de madame" },
      { property: "og:description", content: "Votre accès premium Au stop de madame est activé." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  const grant = useServerFn(grantSuccessPremium);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let off = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        navigate({ to: "/auth", search: { redirect: "/succes" }, replace: true });
        return;
      }
      try {
        await grant();
        await qc.invalidateQueries({ queryKey: ["access"] });
        if (!off) setState("done");
      } catch {
        if (!off) setState("error");
      }
    });
    return () => {
      off = true;
    };
  }, [grant, navigate, qc]);

  return (
    <main className="bg-app flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-brand-card/90 p-6 text-center shadow-lg">
        {state === "loading" && <p className="text-sm text-muted-foreground">Activation de votre accès premium…</p>}
        {state === "done" && (
          <>
            <h1 className="text-2xl font-bold text-brand-gold">Félicitations !</h1>
            <p className="mt-2 text-sm text-muted-foreground">Votre accès premium est activé.</p>
            <Button asChild variant="cta" className="mt-5 w-full">
              <Link to="/au-stop-de-madame/app">Aller au tableau de bord</Link>
            </Button>
          </>
        )}
        {state === "error" && <p className="text-sm text-destructive">L'activation a échoué. Rechargez la page.</p>}
      </div>
    </main>
  );
}
