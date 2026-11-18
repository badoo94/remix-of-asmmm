import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type PaymentMode = "external" | "simple" | "moneroo";
export type ExerciseKey = "classic" | "squat" | "belly";
export type PracticeRules = Record<"fr" | "en", Record<ExerciseKey, string>>;

export interface AppConfig {
  /** Name shown at the top of the dashboard. */
  appName: string;
  /** Header shows the logo image instead of the name when "logo" and a logo is set. */
  brandMode: "text" | "logo";
  logoUrl: string;
  promoBadge: string;
  promoSubtitle: string;
  useInternalContent: boolean;
  /** Show the Google / Lovable sign-in buttons on /auth. */
  googleLogin: boolean;
  lovableLogin: boolean;
  fontSize: number;
  footerText: string;
  paymentMode: PaymentMode;
  externalUrl: string;
  currency: string;
  secondsPerDay: number;
  introToday: string;
  /** Intro of the day right after today. */
  introTomorrow: string;
  /** Intro of the other days; {prix} = that day's price, {rang} = its rank ("3ème"). */
  introLater: string;
  /** Colors of clickable TOC entries (empty = theme gold). */
  tocChapterColor: string;
  tocSubColor: string;
  practiceRules: PracticeRules;
}

export interface AdminConfig {
  aiProvider: "lovable" | "gemini";
  geminiKey: string;
  geminiModel: string;
  aiInstruction: string;
  monerooSecretKey: string;
}

export const DEFAULT_PRACTICE_RULES: PracticeRules = {
  fr: {
    classic:
      "Pratique : contractez les muscles du plancher pelvien comme pour retenir un gaz, sans serrer les fesses, les cuisses ni le ventre. Maintenez la contraction pendant la durée indiquée, puis relâchez complètement pendant le temps de repos. Respirez normalement et ne bloquez pas votre souffle. Ne pratiquez pas en interrompant régulièrement le jet d’urine.",
    squat:
      "Pratique : placez-vous debout, les pieds écartés à la largeur des épaules. Descendez en squat lentement pendant le temps indiqué, puis remontez de façon contrôlée. Gardez les pieds au sol, le dos neutre et respirez sans bloquer votre souffle. Arrêtez si vous ressentez une douleur ou une pression inhabituelle.",
    belly:
      "Pratique : adoptez une position confortable et gardez les épaules détendues. Inspirez doucement en laissant le bas-ventre se gonfler, puis expirez en le laissant revenir naturellement. Suivez les durées et le nombre de cycles affichés, sans forcer ni pousser vers le bas. Respirez de façon fluide.",
  },
  en: {
    classic:
      "How to practice: gently contract the pelvic-floor muscles as if holding back gas, without tightening your buttocks, thighs or abdomen. Hold for the displayed time, then fully relax for the rest period. Breathe normally; do not hold your breath. Do not regularly practice by stopping urine flow.",
    squat:
      "How to practice: stand with your feet about shoulder-width apart. Lower into a squat slowly for the displayed time, then rise in a controlled way. Keep your feet grounded, your back neutral and your breathing steady. Stop if you feel pain or unusual pressure.",
    belly:
      "How to practice: choose a comfortable position and relax your shoulders. Breathe in gently while allowing your lower belly to expand, then breathe out and let it return naturally. Follow the displayed durations and cycles without straining or bearing down. Keep your breathing smooth.",
  },
};

export const DEFAULT_AI_INSTRUCTION = `Tu es un metteur en page. Tu ne crées PAS de design : tu répartis le texte du PDF fourni dans le layout "design template moderne" existant, page par page. Tu ajoutes autant de pages que nécessaire.

RÈGLE ABSOLUE : aucune reformulation, aucune correction. Le texte doit être recopié mot pour mot, avec la même ponctuation et les mêmes fautes éventuelles.

Types de pages disponibles (champ "type") :
- "blank" : page vierge sans cadre (texte centré, aucun titre externe).
- "frame" : page avec cadre uniquement (page de continuation).
- "chapter" : badge de chapitre + titre du chapitre au-dessus du cadre.
- "subchapter" : sous-chapitre (ex : 1.1, 1.2) au-dessus du cadre.
- "full" : partie + chapitre + sous-chapitre au-dessus du cadre.

Règles de mise en page :
- Structure uniforme A4 : zone de contenu fixe de 250mm au fond gris-bleu, pied de page "au-stop-de-madame.store" à gauche et "page X" à droite (géré automatiquement, ne pas l'écrire).
- Pages avec introduction de section : si la page marque le début d'une Partie, d'un Chapitre ou d'un Sous-chapitre, ces titres vont dans les champs "partie", "chapitre" (ex : "Chapitre (1) :"), "titre" (titre du chapitre) et "sousChapitre" — affichés au-dessus et à l'extérieur du cadre.
- Pages de continuation : le chapitre en cours ne doit plus être mentionné. Utilise "type":"frame" avec tous les champs de titre vides ; seul le cadre accueille la suite du texte.
- Uniformité stricte des cadres : chaque cadre a la même hauteur fixe et le texte de tous les cadres garde la même taille de police (27 pt, en Inter, justifié).
- Visibilité & Ajustement : Le contenu texte d'un cadre doit être entièrement visible à l'écran sans aucune partie cachée. Dans les cas où le contenu texte dans la zone d'en-tête externe d'un cadre (hors du cadre) est assez longue, pour éviter que le cadre se superpose au contenu d'en-tête, le cadre doit être réduit verticalement selon la taille prise par la zone d'en-tête.
- Remplissage maximal sous police 27 pt : répartis le texte en considérant une police de 27 pt (Inter, justifié). Chaque cadre est rempli jusqu'à sa capacité maximale de contenance sous cette police de 27 pt. Interdiction de créer une page avec seulement quelques lignes ou un court paragraphe si le chapitre continue. Seule exception : la dernière page d'un chapitre, qui accueille le reste du texte de fin de chapitre. Ajoute autant de pages que nécessaire plutôt que de surcharger un cadre.
- Table des matières : chaque entrée est alignée à gauche dans un paragraphe <p style="text-align: left;">...</p> ; insère un paragraphe vide <p>&nbsp;</p> avant chaque chapitre pour laisser une ligne d'espace. Chaque entrée (partie, chapitre, sous-chapitre) d'un sommaire doit être un lien <a data-goto="TITRE EXACT">TITRE EXACT</a>, où TITRE EXACT reprend mot pour mot le texte placé dans le champ "titre", "chapitre", "sousChapitre" ou "partie" de la page qui ouvre cette section. Le lecteur utilise ce lien pour amener l'utilisateur à la bonne page.
- Le corps ("body") est du HTML simple : un <p> par paragraphe, <strong> pour le gras, <u> pour le souligné, "• " en début de paragraphe pour une puce.

Réponds UNIQUEMENT en JSON :
{"pages":[{"type":"...","partie":"","chapitre":"","titre":"","sousChapitre":"","body":"<p>...</p>"}]}`;

/** Font size limits (pt): admin sets the default up to 27, readers adjust 18–27 locally. */
export const FONT_MIN = 18;
export const FONT_MAX = 27;
export const clampReaderFont = (n: number) => Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)));

/** Approximate characters that fit one A4 frame at a given size (calibrated ~1100 chars at 18 pt). */
export function pageCharBudget(fontPt: number): number {
  const size = Math.min(FONT_MAX, Math.max(8, fontPt || 18));
  return Math.round((1100 * (18 / size) ** 2) / 50) * 50;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  appName: "Au Stop de madame",
  brandMode: "text",
  logoUrl: "",
  promoBadge: "Super promo.",
  promoSubtitle: "Le prix augmente chaque jour",
  useInternalContent: true,
  googleLogin: true,
  lovableLogin: true,
  fontSize: 18,
  footerText: "au-stop-de-madame.store",
  paymentMode: "simple",
  externalUrl: "",
  currency: "EUR",
  secondsPerDay: 6,
  introToday: "Obtenez l'offre premium Aujourd'hui à :",
  introTomorrow: "Obtenez l'offre premium demain à :",
  introLater: "Le prix augmente à {prix} le {rang} jour",
  tocChapterColor: "",
  tocSubColor: "",
  practiceRules: DEFAULT_PRACTICE_RULES,
};

export const DEFAULT_ADMIN_CONFIG: AdminConfig = {
  aiProvider: "lovable",
  geminiKey: "",
  geminiModel: "gemini-2.5-flash",
  aiInstruction: DEFAULT_AI_INSTRUCTION,
  monerooSecretKey: "",
};

/** Former default of `introLater`, replaced by the per-day template. */
const LEGACY_INTRO_LATER = "Obtenez l'offre premium plus tard à :";

export function mergeAppConfig(raw: unknown): AppConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<AppConfig>;
  return {
    ...DEFAULT_APP_CONFIG,
    ...r,
    appName: r.appName?.trim() || DEFAULT_APP_CONFIG.appName,
    introLater: !r.introLater || r.introLater === LEGACY_INTRO_LATER ? DEFAULT_APP_CONFIG.introLater : r.introLater,
    practiceRules: {
      fr: { ...DEFAULT_PRACTICE_RULES.fr, ...(r.practiceRules?.fr ?? {}) },
      en: { ...DEFAULT_PRACTICE_RULES.en, ...(r.practiceRules?.en ?? {}) },
    },
  };
}

export function mergeAdminConfig(raw: unknown): AdminConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<AdminConfig>;
  return { ...DEFAULT_ADMIN_CONFIG, ...r, aiInstruction: r.aiInstruction || DEFAULT_AI_INSTRUCTION };
}

export const appSettingsQuery = queryOptions({
  queryKey: ["app_settings"],
  queryFn: async (): Promise<AppConfig> => {
    const { data, error } = await supabase.from("app_settings").select("config").eq("id", 1).maybeSingle();
    if (error) throw error;
    return mergeAppConfig(data?.config);
  },
  staleTime: 30_000,
});

export async function saveAppConfig(config: AppConfig) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ id: 1, config: config as unknown as Json, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function loadAdminConfig(): Promise<AdminConfig> {
  const { data, error } = await supabase.from("admin_settings").select("config").eq("id", 1).maybeSingle();
  if (error) throw error;
  return mergeAdminConfig(data?.config);
}

export async function saveAdminConfig(config: AdminConfig) {
  const { error } = await supabase
    .from("admin_settings")
    .upsert({ id: 1, config: config as unknown as Json, updated_at: new Date().toISOString() });
  if (error) throw error;
}
