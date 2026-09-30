export type SkinClass = "dry" | "normal" | "oily";

// Must match the class_indices.json produced during training:
// {"dry": 0, "normal": 1, "oily": 2}
export const CLASS_ORDER: SkinClass[] = ["dry", "normal", "oily"];

export const CLASS_META: Record<
  SkinClass,
  { label: string; blurb: string; hex: string; position: number }
> = {
 dry: {
label: "Dry",
blurb:
"Dry skin can lose moisture more easily. Routines focus on gentle cleansing and moisturizing to support hydration and skin comfort.",
hex: "#C6875A",
position: 0,
},

normal: {
label: "Normal",
blurb:
"Normal skin has a balanced level of oil and moisture. Routines focus on maintaining hydration, skin comfort, and daily sun protection.",
hex: "#6F9A6A",
position: 0.5,
},

oily: {
label: "Oily",
blurb:
"Oily skin produces more natural oil and may appear shiny during the day. Routines focus on lightweight hydration and gentle oil control.",
hex: "#2F7189",
position: 1,
},

};


// ─── Acne lesion detector (YOLO11m, exported to ONNX) ───────────────────────
// Matches the metadata embedded in acne_detector.onnx at export time:
// imgsz [640, 640], names {0: comedone, 1: nodules, 2: papules, 3: pustules}
export type AcneClass = "comedone" | "nodules" | "papules" | "pustules";


// ── Face detector (Ultra-Light-Fast-Generic-Face-Detector-1MB, RFB-320, MIT
// licensed) — a real, pretrained face-detection ONNX model used to check
// "is there actually a face in this photo?" before running the skin-type
// and acne models on it. Source: https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB

// ─── Facial landmark detector (PIPNet, 68-point 300W scheme) ──────────────
// Used to split detected acne lesions into left/right face halves for
// Hayashi's half-face grading (see lib/landmarks.ts, lib/hayashi.ts). The
// user still confirms/corrects every count before it affects scoring.
// Source: https://github.com/yakhyo/pipnet-onnx (MIT licensed).
// Crop padding around the face-detector's box before feeding it to the
// landmark model — matches the upstream PIPNet reference implementation's
// own asymmetric crop: +10% left/right/bottom, but the TOP edge moves
// INWARD (down) by 10%, since face-detector boxes are usually already
// tight around the eyebrows and PIPNet's own reference crop expects that.

// If the gap between the top-2 predicted skin-type classes is smaller
// than this, the model is effectively "guessing" between two classes
// rather than confidently picking one — a signal that the photo may not
// be a clear, real human-skin close-up (e.g. an animal face, an object,
// heavy makeup/filters), even when the face detector itself is fooled.
// This doesn't block the scan — it's a warning, since a genuinely
// borderline human skin-type call can also have a small margin.
export const SKIN_LOW_MARGIN_THRESHOLD = 0.15;

// Minimum fraction of face-box pixels that must classify as human
// skin-colour (Kovac et al. 2003 rule — see lib/skinToneCheck.ts) for the
// photo to proceed. Calibrated against real data: a control human face
// photo scored ~52% under this rule, while a monkey-face photo that
// fooled the face-shape detector (confidence 0.998) scored only ~12%.
// 0.25 sits well below real faces and well above the tested false
// positive, with margin for lighting/hair/shadow variation.
export const ACNE_CLASS_ORDER: AcneClass[] = [
  "comedone",
  "nodules",
  "papules",
  "pustules",
];

export const ACNE_CLASS_META: Record<
  AcneClass,
  { label: string; hex: string }
> = {
  comedone: { label: "Comedone", hex: "#D9A441" },
  nodules: { label: "Nodule", hex: "#B23A48" },
  papules: { label: "Papule", hex: "#E07A5F" },
  pustules: { label: "Pustule", hex: "#8E4585" },
};

// Confidence / NMS thresholds used by the FastAPI inference service.
export const ACNE_CONF_THRESHOLD = 0.35;
export const ACNE_IOU_THRESHOLD = 0.45;

// ─── Severity grading ───────────────────────────────────────────────────
// SkinWISE grades acne severity using TWO independent, published, count-
// based methods, applied to user-CONFIRMED lesion counts (never raw YOLO
// output directly — see lib/reviewCounts.ts):
//
//   1. Hayashi (2008) — a lesion-count signal based on half-face
//      papule+pustule counts, mapped to the app's supported severity tiers.
//      See lib/hayashi.ts.
//   2. NICE NG198 (2021) — a 2-category clinical escalation flag
//      (Mild-to-Moderate / Moderate-to-Severe), based on whole-face
//      inflammatory lesion + nodule counts. See lib/nice.ts.
//
// These signals answer different questions and are combined by
// lib/overallSeverity.ts into the single Clear/Mild/Moderate/Severe value.
// GAGS (Doshi et al. 1997), used in an earlier version of this project,
// has been fully replaced by this approach.

// ─── Safety / contraindication profile ─────────────────────────────────────
// A short, editable set of self-reported flags that pause the FULL
// PERSONALISED ROUTINE — cleanser, moisturizer, SPF, and active-treatment
// guidance (not the analysis itself, i.e. skin type + acne detection still
// run normally) when set. Intentionally simple: any flag being true pauses
// the whole routine uniformly, rather than trying to clinically match
// specific flags to specific product categories — that level of precision
// isn't something this project can defensibly claim.
export interface SafetyFlags {
  pregnantOrBreastfeeding: boolean;
  onIsotretinoin: boolean;
  openWoundOrInfection: boolean;
  knownActiveAllergy: boolean;
  under15: boolean;
}

export const DEFAULT_SAFETY_FLAGS: SafetyFlags = {
  pregnantOrBreastfeeding: false,
  onIsotretinoin: false,
  openWoundOrInfection: false,
  knownActiveAllergy: false,
  under15: false,
};

export const SAFETY_FLAG_META: Record<keyof SafetyFlags, { label: string; reason: string }> = {
  pregnantOrBreastfeeding: {
    label: "Pregnant or breastfeeding",
    reason: "You indicated you're pregnant or breastfeeding — some actives (like retinoids) aren't recommended during this time.",
  },
  onIsotretinoin: {
    label: "Currently on isotretinoin (Accutane)",
    reason: "You indicated you're currently on isotretinoin — combining it with additional actives isn't recommended without a doctor's guidance.",
  },
  openWoundOrInfection: {
    label: "Open wound or active skin infection",
    reason: "You indicated an open wound or active infection is present — active treatments are paused until that's healed or assessed.",
  },
  knownActiveAllergy: {
    label: "Known allergy/reaction to common actives",
    reason: "You indicated a known allergy or reaction to common actives (benzoyl peroxide, salicylic acid, or retinoids).",
  },
  under15: {
    label: "Under 15 years old",
    reason: "You indicated the person is under 15 years old — a personalised routine isn't provided; please consult a pediatrician or dermatologist first.",
  },
};

export function hasAnySafetyFlag(flags: SafetyFlags): boolean {
  return Object.values(flags).some(Boolean);
}

export function activeSafetyReasons(flags: SafetyFlags): string[] {
  return (Object.keys(flags) as (keyof SafetyFlags)[])
    .filter((key) => flags[key])
    .map((key) => SAFETY_FLAG_META[key].reason);
}
