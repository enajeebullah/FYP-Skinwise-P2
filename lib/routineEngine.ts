import type { SkinClass, SafetyFlags } from "./constants";
import { hasAnySafetyFlag, activeSafetyReasons } from "./constants";
import type { WeatherData } from "./weather";
import type { AcnePattern } from "./acnePattern";
import type { OverallSeverity } from "./overallSeverity";

export interface AcneCareItem {
  ingredient: string;
  reason: string;
}

export interface Routine {
  cleanser: string;
  moisturizer: string;
  sunscreen: string;
  acneCare: AcneCareItem[];
  reasons: {
    cleanser: string;
    moisturizer: string;
    sunscreen: string;
  };
  /** Flattened, in the same order as the routine fields — kept for the PDF report. */
  explanations: string[];
  /** True when the full personalised routine was withheld due to a safety flag. */
  recommendationPaused: boolean;
  /** Human-readable reasons for the pause, if any. */
  pausedReasons: string[];
  /** True when Overall Severity reached "severe" — supportive skincare is
   *  still shown, but no acne-care ingredient guidance is given. */
  professionalEvaluationRecommended: boolean;
  professionalEvaluationReason: string | null;
  /** Nodule-specific caution note (lib/overallSeverity.ts), shown
   *  alongside whatever ingredient guidance (or lack of it) applies. */
  noduleNote: string | null;
}

interface RoutineInput {
  skinType: SkinClass;
  acnePattern: AcnePattern;
  overallSeverity: OverallSeverity;
  noduleNote: string | null;
  weather: WeatherData | null;
  safetyFlags?: SafetyFlags;
}

const SKIN_TYPE_LABEL: Record<SkinClass, string> = {
  dry: "Dry",
  normal: "Normal",
  oily: "Oily",
};

/**
 * The acne-care ingredient matrix — Overall Severity × Pattern × Skin
 * Type. No cell is a fixed "always these 3 ingredients" list; each is
 * chosen and disclosed individually (see README.md's full traceability
 * table):
 *
 *   - Mild → a SINGLE topical agent (AAD 2024's general severity-ladder
 *     principle: mild acne doesn't need combination therapy).
 *   - Moderate → a topical COMBINATION. Where the combination is
 *     Adapalene+Benzoyl peroxide, that pairing is NICE NG198's own
 *     literal "any severity" first-line option (verified against the
 *     guideline's Table 1) — it is NOT invented.
 *   - Dry skin substitutes Benzoyl peroxide for Azelaic acid: this
 *     substitution is a SkinWISE clinical-reasoning extension (BPO's
 *     drying/irritant profile is well documented, and NICE itself lists
 *     azelaic acid as a valid alternative when a first-line option isn't
 *     tolerated) — not a NICE-specified skin-type rule, since NICE
 *     doesn't stratify by cosmetic skin type at all. Disclosed as such.
 *   - Salicylic acid is deliberately NOT used as a primary choice — a
 *     Cochrane review found it a less effective comedolytic agent than
 *     topical retinoids, so it isn't given equal footing with Adapalene.
 *   - Severe → no ingredients at all; see generateRoutine() below.
 */
function acneCareForNonSevere(
  pattern: AcnePattern,
  severity: Exclude<OverallSeverity, "severe">,
  skinType: SkinClass
): AcneCareItem[] {
  const dry = skinType === "dry";

  if (pattern === "clear") return [];

  if (severity === "clear" || severity === "mild") {
    if (pattern === "comedonal_dominant" || pattern === "mixed") {
      return [
        {
          ingredient: "Adapalene (topical retinoid)",
          reason: "A single evidence-supported topical retinoid is generally sufficient for a mild, comedonal-leaning pattern — AAD guidance reserves combination therapy for moderate acne and above.",
        },
      ];
    }
    // inflammatory_dominant
    if (dry) {
      return [
        {
          ingredient: "Azelaic acid",
          reason: "Azelaic acid is used here instead of benzoyl peroxide because the predicted skin type is Dry — benzoyl peroxide's drying/irritant profile makes it a less comfortable single-agent choice on dry skin.",
        },
      ];
    }
    return [
      {
        ingredient: "Benzoyl peroxide",
        reason: "A single agent is generally sufficient for a mild, inflammatory-leaning pattern. Benzoyl peroxide is an evidence-supported monotherapy option for acne.",
      },
    ];
  }

  // moderate
  if (pattern === "comedonal_dominant") {
    return [
      { ingredient: "Adapalene (topical retinoid)", reason: "First-line topical retinoid for the comedonal component of a moderate case." },
      { ingredient: "Azelaic acid", reason: "Added for its comedolytic and anti-inflammatory properties, giving a two-mechanism combination appropriate for moderate severity." },
    ];
  }
  // inflammatory_dominant or mixed
  if (dry) {
    return [
      { ingredient: "Adapalene (topical retinoid)", reason: "A first-line topical retinoid, combined with another topical treatment for moderate acne." },
      {
        ingredient: "Azelaic acid",
        reason: "Used in place of benzoyl peroxide because the predicted skin type is Dry, to reduce the irritation risk of a two-active combination.",
      },
    ];
  }
  return [
    {
      ingredient: "Adapalene + Benzoyl peroxide (fixed combination)",
      reason: "This first-line fixed-combination option is well-matched to a moderate, inflammatory-leaning pattern.",
    },
  ];
}

/**
 * SkinWISE recommendation engine.
 *
 * Skin type decides the BASE cleanser/moisturizer formulation, adjusted
 * by weather. Acne-care ingredient information is chosen from Overall
 * Severity (lib/overallSeverity.ts) AND the detected lesion pattern AND
 * skin type together (see acneCareForNonSevere() above) — never a single
 * fixed list. Overall Severity "severe" withdraws ingredient guidance
 * entirely in favour of a professional-evaluation recommendation;
 * SkinWISE never auto-prescribes oral antibiotics, isotretinoin, or any
 * systemic medication regardless of severity.
 */
export function generateRoutine({
  skinType,
  acnePattern,
  overallSeverity,
  noduleNote,
  weather,
  safetyFlags,
}: RoutineInput): Routine {
  const skinLabel = SKIN_TYPE_LABEL[skinType];

  // ── Cleanser (skin-type-based) ──────────────────────────────────────────
  let cleanser: string;
  let cleanserReason: string;
  if (skinType === "oily") {
    cleanser = "Gentle gel/foaming cleanser";
    cleanserReason = `Because the predicted skin type is ${skinLabel}, a gentle gel or foaming cleanser is generally suitable for helping manage excess sebum without over-stripping the skin.`;
  } else if (skinType === "dry") {
    cleanser = "Gentle, non-stripping cream cleanser";
    cleanserReason = `Because the predicted skin type is ${skinLabel}, a gentle, non-stripping cream cleanser is generally suitable to avoid unnecessary dryness or irritation.`;
  } else {
    cleanser = "Gentle balanced cleanser";
    cleanserReason = `Because the predicted skin type is ${skinLabel}, a gentle balanced cleanser is generally suitable for routine maintenance.`;
  }

  // ── Moisturizer (skin-type base, weather-adjusted) ───────────────────────
  let moisturizer: string;
  let moisturizerReason: string;
  const humidity = weather?.humidityPct;
  if (skinType === "oily" && (humidity === undefined || humidity >= 50)) {
    moisturizer = "Lightweight, oil-free / non-comedogenic gel moisturizer";
    moisturizerReason =
      humidity !== undefined
        ? `Because the predicted skin type is ${skinLabel} and current humidity is ${humidity}%, a lightweight, oil-free formula is generally suitable to avoid adding unnecessary oil in already humid air.`
        : `Because the predicted skin type is ${skinLabel}, a lightweight, oil-free formula is generally suitable.`;
  } else if (skinType === "dry" || (humidity !== undefined && humidity < 35)) {
    moisturizer = "More hydrating, ceramide-based cream moisturizer";
    moisturizerReason =
      humidity !== undefined && humidity < 35
        ? `Because current humidity is low (${humidity}%), a more hydrating formula is generally suitable to help support the skin's moisture barrier.`
        : `Because the predicted skin type is ${skinLabel}, a more hydrating formula is generally suitable to help support the skin's moisture barrier.`;
  } else {
    moisturizer = "Lightweight, non-comedogenic lotion moisturizer";
    moisturizerReason =
      "Given a balanced skin type and current weather conditions, a standard non-comedogenic lotion is generally suitable to maintain hydration without excess weight.";
  }

  // ── Sunscreen (skin type + UV) ────────────────────────────────────────────
  const currentHour = new Date().getHours();
  const isNightTime = currentHour < 6 || currentHour >= 20;
  let sunscreen: string;
  let sunscreenReason: string;
  const uv = weather?.uvIndex;

  if (isNightTime) {
    sunscreen = "Not needed right now (nighttime)";
    sunscreenReason =
      "It's currently nighttime, so sunscreen isn't needed right now. Apply a broad-spectrum, non-comedogenic SPF 30+ in the morning based on daytime UV conditions.";
  } else if (uv !== undefined && uv >= 6) {
    sunscreen = "Broad-spectrum SPF 50+, non-comedogenic, reapplied every 3 hours outdoors";
    sunscreenReason = `Current UV index is ${uv} (high) — combined with the predicted ${skinLabel.toLowerCase()} skin type, a non-comedogenic, broad-spectrum SPF 50+ with reapplication is generally suitable.`;
  } else {
    sunscreen = "Broad-spectrum SPF 30, non-comedogenic";
    sunscreenReason =
      uv !== undefined
        ? `Current UV index is ${uv} — combined with the predicted ${skinLabel.toLowerCase()} skin type, a non-comedogenic, broad-spectrum SPF 30 is generally suitable as a daily baseline.`
        : `A non-comedogenic, broad-spectrum SPF 30 is generally suitable daily, matched to the predicted ${skinLabel.toLowerCase()} skin type, regardless of visible UV conditions.`;
  }

  // ── Acne-care ingredient information ──────────────────────────────────────
  let acneCare: AcneCareItem[] = [];
  let professionalEvaluationRecommended = false;
  let professionalEvaluationReason: string | null = null;

  if (overallSeverity === "severe") {
    professionalEvaluationRecommended = true;
    professionalEvaluationReason =
      "Your Overall Severity has reached the Severe tier. SkinWISE provides supportive skincare guidance above and recommends professional dermatological evaluation rather than generating acne-care ingredient or medication guidance at this level.";
  } else {
    acneCare = acneCareForNonSevere(acnePattern, overallSeverity, skinType);
    if (acneCare.length === 0) {
      acneCare = [
        {
          ingredient: "No acne-care ingredient needed",
          reason: "No active comedonal or inflammatory lesions were confirmed, so no acne-specific ingredient guidance is needed right now. Continue your regular cleanser, moisturizer, and sunscreen routine.",
        },
      ];
    }
  }

  // ── Safety override ────────────────────────────────────────────────────────
  const flags = safetyFlags ?? null;
  const pausedReasons = flags ? activeSafetyReasons(flags) : [];
  const recommendationPaused = pausedReasons.length > 0;

  let finalCleanser = cleanser;
  let finalCleanserReason = cleanserReason;
  let finalMoisturizer = moisturizer;
  let finalMoisturizerReason = moisturizerReason;
  let finalSunscreen = sunscreen;
  let finalSunscreenReason = sunscreenReason;
  let finalAcneCare = acneCare;

  if (recommendationPaused) {
    const pauseNotice =
      "Your personalised routine is paused because of your Safety Profile: " +
      pausedReasons.join(" ") +
      " Your skin type and acne analysis above are unaffected — please consult a healthcare professional before starting a skincare routine.";

    finalCleanser = "Recommendation paused";
    finalCleanserReason = pauseNotice;
    finalMoisturizer = "Recommendation paused";
    finalMoisturizerReason = pauseNotice;
    finalSunscreen = "Recommendation paused";
    finalSunscreenReason = pauseNotice;
    finalAcneCare = [{ ingredient: "Recommendation paused", reason: pauseNotice }];
  }

  const reasons = {
    cleanser: finalCleanserReason,
    moisturizer: finalMoisturizerReason,
    sunscreen: finalSunscreenReason,
  };

  return {
    cleanser: finalCleanser,
    moisturizer: finalMoisturizer,
    sunscreen: finalSunscreen,
    acneCare: finalAcneCare,
    reasons,
    explanations: [
      finalCleanserReason,
      finalMoisturizerReason,
      finalSunscreenReason,
      ...finalAcneCare.map((a) => a.reason),
      ...(professionalEvaluationReason && !recommendationPaused ? [professionalEvaluationReason] : []),
      ...(noduleNote && !recommendationPaused ? [noduleNote] : []),
    ],
    recommendationPaused,
    pausedReasons,
    professionalEvaluationRecommended: recommendationPaused ? false : professionalEvaluationRecommended,
    professionalEvaluationReason: recommendationPaused ? null : professionalEvaluationReason,
    noduleNote: recommendationPaused ? null : noduleNote,
  };
}
