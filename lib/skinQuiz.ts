import type { SkinClass } from "./constants";

export interface QuizOption {
  title: string;
  description: string;
  points: Partial<Record<SkinClass, number>>;
}

export interface QuizQuestion {
  heading: string;
  question: string;
  options: QuizOption[];
}

// "Final SkinWISE Skin-Type Questionnaire" — a classic dermatology
// self-assessment style, the same kind used by most skincare-brand
// "what's your skin type" quizzes. This is a well-established, non-clinical
// self-report method (not sourced from a specific paper) meant to
// complement the CNN, not replace it.
//
// Question 2 was deliberately changed from "breakout frequency" to "pore
// visibility" — acne itself is already detected separately by the YOLO11m
// model, so asking about breakouts here would be redundant. Pore size is a
// classic, acne-independent skin-type indicator (small pores → drier skin,
// enlarged/visible pores → oilier skin), so it adds a genuinely new signal.
export const SKIN_QUIZ: QuizQuestion[] = [
  {
    heading: "Midday Skin Feel",
    question: "By midday, how does your skin usually feel?",
    options: [
      {
        title: "Dry & Tight",
        description: "Your skin feels tight, flaky, or slightly rough.",
        points: { dry: 2 },
      },
      {
        title: "Balanced & Comfortable",
        description: "Your skin feels comfortable with little or no shine.",
        points: { normal: 2 },
      },
      {
        title: "Shiny & Oily",
        description: "Your skin looks or feels shiny, especially around the forehead and nose.",
        points: { oily: 2 },
      },
    ],
  },
  {
    heading: "Pore Visibility",
    question: "How visible are the pores on your face?",
    options: [
      {
        title: "Barely Visible",
        description: "Your pores are very small and difficult to notice.",
        points: { dry: 2 },
      },
      {
        title: "Moderately Visible",
        description: "Your pores are noticeable but not very prominent.",
        points: { normal: 2 },
      },
      {
        title: "Large & Visible",
        description: "Your pores are clearly visible, especially around the nose.",
        points: { oily: 2 },
      },
    ],
  },
  {
    heading: "After Cleansing",
    question: "How does your skin feel 30–60 minutes after washing your face?",
    options: [
      {
        title: "Tight or Uncomfortable",
        description: "Your skin feels dry, tight, or uncomfortable.",
        points: { dry: 2 },
      },
      {
        title: "Clean & Comfortable",
        description: "Your skin feels clean, comfortable, and balanced.",
        points: { normal: 2 },
      },
      {
        title: "Oily Again",
        description: "Your skin becomes noticeably oily again within an hour.",
        points: { oily: 2 },
      },
    ],
  },
  {
    heading: "Moisturizer Feel",
    question: "How does a regular moisturizer usually feel on your skin?",
    options: [
      {
        title: "Absorbs Quickly, Still Feels Dry",
        description: "The moisturizer absorbs quickly, but your skin still feels dry.",
        points: { dry: 2 },
      },
      {
        title: "Comfortable & Balanced",
        description: "The moisturizer absorbs well and leaves your skin feeling balanced.",
        points: { normal: 2 },
      },
      {
        title: "Greasy or Heavy",
        description: "The moisturizer tends to sit on your skin and feels greasy fairly quickly.",
        points: { oily: 2 },
      },
    ],
  },
];

export interface QuizResult {
  /** The single highest-scoring type, or null if two or more types tied for first. */
  winner: SkinClass | null;
  /** The type(s) with the highest score — length > 1 means a tie. */
  tiedTypes: SkinClass[];
  totals: Record<SkinClass, number>;
}

/**
 * Scores the quiz and explicitly reports ties rather than silently picking
 * a winner. A tie (e.g. Normal and Oily both scoring 4) genuinely means the
 * quiz didn't distinguish between those two types — the app should not
 * quietly break the tie on its own, since that would be exactly the kind
 * of "opaque decision" this project set out to avoid. When winner is null,
 * the UI presents all tied types (plus the scan's own result) so the user
 * makes the final call themselves.
 */
export function scoreQuiz(selectedOptionIndexes: number[]): QuizResult {
  const totals: Record<SkinClass, number> = { dry: 0, normal: 0, oily: 0 };

  selectedOptionIndexes.forEach((optionIndex, questionIndex) => {
    const option = SKIN_QUIZ[questionIndex]?.options[optionIndex];
    if (!option) return;
    for (const [type, points] of Object.entries(option.points)) {
      totals[type as SkinClass] += points ?? 0;
    }
  });

  const maxScore = Math.max(...Object.values(totals));
  const tiedTypes = (Object.keys(totals) as SkinClass[]).filter(
    (type) => totals[type] === maxScore
  );

  return {
    winner: tiedTypes.length === 1 ? tiedTypes[0] : null,
    tiedTypes,
    totals,
  };
}
