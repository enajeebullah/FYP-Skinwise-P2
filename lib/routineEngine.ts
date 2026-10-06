import type { SkinClass, SafetyFlags } from "./constants";
import { activeSafetyReasons } from "./constants";
import type { WeatherData } from "./weather";
import type { AcnePattern } from "./acnePattern";
import type { OverallSeverity } from "./overallSeverity";

export interface AcneCareItem {
  ingredient: string;
  reason: string;
  /** Optional practical usage note (e.g. frequency to reduce irritation
   *  risk) — shown separately from `reason`, which explains WHY the
   *  ingredient was chosen, not HOW to use it. */
  usageTip?: string;
  /**
   * When this ingredient should be applied — used by the Routine page to
   * split steps into Morning/Evening sequences (never applied at the
   * same time as another active on the same half-day, to reduce
   * irritation and avoid actives deactivating each other).
   *   - Adapalene (topical retinoid) → "PM" (sun-sensitising)
   *   - Benzoyl peroxide (alone)     → "AM"
   *   - Azelaic acid (alone or as a dry-skin substitute for BPO) → "AM"
   *   - "Adapalene + Benzoyl peroxide" (ONE fixed-combination product,
   *     not two separate steps) → "PM", applied once
   */
  timeOfDay: "AM" | "PM";
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
 * Type. No cell is a fixed "always these ingredients" list; each is
 * chosen and disclosed individually (see README.md's full traceability
 * table):
 *
 *   - Mild → a SINGLE topical agent (AAD 2024's general severity-ladder
 *     principle: mild acne doesn't need combination therapy).
 *   - Moderate → a topical COMBINATION. Where the combination is
 *     Adapalene+Benzoyl peroxide, that pairing is NICE NG198's own
 *     literal "any severity" first-line option — it is NOT invented,
 *     and is applied UNIFORMLY across every moderate pattern (comedonal,
 *     inflammatory, mixed), not just inflammatory — there's no clinical
 *     basis to treat moderate-comedonal differently from
 *     moderate-inflammatory/mixed on this specific point.
 *   - Dry skin substitutes Benzoyl peroxide for Azelaic acid, at BOTH
 *     Mild and Moderate, for EVERY pattern — one single, consistent
 *     substitution rule. This is a SkinWISE clinical-reasoning extension
 *     (BPO's drying/irritant profile is well documented, and NICE itself
 *     lists azelaic acid as a valid alternative when a first-line option
 *     isn't tolerated) — not a NICE-specified skin-type rule, since NICE
 *     doesn't stratify by cosmetic skin type at all. Disclosed as such.
 *   - Salicylic acid is deliberately NOT used as a primary choice — a
 *     Cochrane review found it a less effective comedolytic agent than
 *     topical retinoids, so it isn't given equal footing with Adapalene.
 *   - Severe → no ingredients at all; see generateRoutine() below.
 *
 * Every item also carries a `timeOfDay` ("AM" | "PM") — see the
 * AcneCareItem interface above — so the Routine page can split a
 * two-ingredient combination (e.g. Adapalene + Azelaic acid) into
 * separate Morning/Evening steps instead of applying both actives at
 * once, while a genuine single fixed-combination PRODUCT (Adapalene +
 * Benzoyl peroxide) stays as one PM step.
 */
function acneCareForNonSevere(
  pattern: AcnePattern,
  severity: Exclude<OverallSeverity, "severe">,
  skinType: SkinClass
): AcneCareItem[] {
  const dry = skinType === "dry";

  if (pattern === "clear") return [];

  if (severity === "mild") {
    if (pattern === "comedonal_dominant" || pattern === "mixed") {
      return [
        {
          ingredient: "Adapalene (topical retinoid)",
          reason:
            "A single evidence-supported topical retinoid is generally sufficient for a mild, comedonal-leaning pattern — AAD guidance reserves combination therapy for moderate acne and above.",
          usageTip: dry ? "Start with every other night to reduce irritation risk on dry skin." : undefined,
          timeOfDay: "PM",
        },
      ];
    }
    // inflammatory_dominant
    if (dry) {
      return [
        {
          ingredient: "Azelaic acid",
          reason:
            "Azelaic acid is used here instead of benzoyl peroxide because the predicted skin type is Dry — benzoyl peroxide's drying/irritant profile makes it a less comfortable single-agent choice on dry skin.",
          timeOfDay: "AM",
        },
      ];
    }
    return [
      {
        ingredient: "Benzoyl peroxide",
        reason:
          "A single agent is generally sufficient for a mild, inflammatory-leaning pattern. Benzoyl peroxide is an evidence-supported monotherapy option for acne.",
        timeOfDay: "AM",
      },
    ];
  }

  // moderate — ONE substitution rule (dry → azelaic), applied uniformly
  // across every pattern, rather than special-casing comedonal.
  if (dry) {
    return [
      {
        ingredient: "Adapalene (topical retinoid)",
        reason: "First-line topical retinoid, combined with a second topical for moderate acne.",
        timeOfDay: "PM",
      },
      {
        ingredient: "Azelaic acid",
        reason:
          "Used in place of benzoyl peroxide because the predicted skin type is Dry, to reduce the irritation risk of a two-active combination.",
        timeOfDay: "AM",
      },
    ];
  }
  return [
    {
      ingredient: "Adapalene + Benzoyl peroxide (fixed combination)",
      reason: "This first-line fixed-combination option is well-matched to moderate acne, regardless of comedonal or inflammatory emphasis.",
      timeOfDay: "PM",
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

  // ── Moisturizer (SKIN TYPE FIRST, humidity as a modifier — not the
  // other way around. Dry skin always gets a richer base regardless of
  // humidity, since barrier issues aren't resolved by ambient moisture
  // alone. Oily skin never jumps to a heavy cream just because humidity
  // is low, since that risks clogging acne-prone pores — it gets an
  // in-between "hydrating gel-cream" instead. Only Normal skin lets
  // humidity fully decide between a lotion and a richer cream.) ─────────
  let moisturizer: string;
  let moisturizerReason: string;
  const humidity = weather?.humidityPct;

  if (skinType === "dry") {
    moisturizer = "More hydrating, ceramide-based cream moisturizer";
    moisturizerReason =
      humidity !== undefined && humidity >= 50
        ? `Because the predicted skin type is ${skinLabel}, a richer formula is still generally suitable even in today's higher humidity (${humidity}%) — dry skin's barrier needs aren't fully met by ambient moisture alone.`
        : humidity !== undefined && humidity < 35
        ? `Because the predicted skin type is ${skinLabel} and current humidity is low (${humidity}%), a more hydrating formula is generally suitable to help support the skin's moisture barrier.`
        : `Because the predicted skin type is ${skinLabel}, a more hydrating formula is generally suitable to help support the skin's moisture barrier.`;
  } else if (skinType === "oily") {
    if (humidity !== undefined && humidity < 35) {
      moisturizer = "Lightweight, hydrating gel-cream (oil-free)";
      moisturizerReason = `Current humidity is low (${humidity}%), but the predicted skin type is ${skinLabel} — a lightweight, hydrating gel-cream adds moisture without the heaviness of a rich cream, which could clog pores on oily, acne-prone skin.`;
    } else {
      moisturizer = "Lightweight, oil-free / non-comedogenic gel moisturizer";
      moisturizerReason =
        humidity !== undefined
          ? `Because the predicted skin type is ${skinLabel} and current humidity is ${humidity}%, a lightweight, oil-free formula is generally suitable to avoid adding unnecessary oil.`
          : `Because the predicted skin type is ${skinLabel}, a lightweight, oil-free formula is generally suitable.`;
    }
  } else {
    // Normal skin — humidity genuinely decides here
    if (humidity !== undefined && humidity < 35) {
      moisturizer = "More hydrating, ceramide-based cream moisturizer";
      moisturizerReason = `Current humidity is low (${humidity}%) — a more hydrating formula is generally suitable to help support the skin's moisture barrier.`;
    } else {
      moisturizer = "Lightweight, non-comedogenic lotion moisturizer";
      moisturizerReason =
        "Given a balanced skin type and current weather conditions, a standard non-comedogenic lotion is generally suitable to maintain hydration without excess weight.";
    }
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
          reason:
            "No active comedonal or inflammatory lesions were confirmed, so no acne-specific ingredient guidance is needed right now. Continue your regular cleanser, moisturizer, and sunscreen routine.",
          timeOfDay: "AM",
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
    finalAcneCare = [{ ingredient: "Recommendation paused", reason: pauseNotice, timeOfDay: "AM" }];
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