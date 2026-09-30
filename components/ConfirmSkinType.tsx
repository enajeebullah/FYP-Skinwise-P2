"use client";

import { useState } from "react";
import ResultPanel from "./ResultPanel";
import SkinTypeQuiz from "./SkinTypeQuiz";
import { CLASS_META, CLASS_ORDER, type SkinClass } from "@/lib/constants";
import type { PredictionResult } from "@/lib/model";
import type { QuizResult } from "@/lib/skinQuiz";

interface ConfirmSkinTypeProps {
  imageSrc: string;
  skinResult: PredictionResult;
  onContinue: (finalType: SkinClass) => void;
  onStartOver: () => void;
}

// A prediction is "borderline" if the top two classes are close — that's
// exactly when a quick self-report question is most useful, since the CNN
// itself wasn't clearly confident either way.
const BORDERLINE_GAP = 0.2;

export default function ConfirmSkinType({
  imageSrc,
  skinResult,
  onContinue,
  onStartOver,
}: ConfirmSkinTypeProps) {
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [selectedType, setSelectedType] = useState<SkinClass>(skinResult.topClass);

  const sorted = CLASS_ORDER.map((c) => skinResult.scores[c]).sort((a, b) => b - a);
  const gap = sorted[0] - sorted[1];
  const isBorderline = gap < BORDERLINE_GAP;

  function handleQuizComplete(result: QuizResult) {
    setQuizResult(result);
    // Default the selection to something sensible so "Continue" always has
    // a valid value even before the user picks explicitly:
    //  - clear winner that matches the scan → nothing to resolve
    //  - clear winner that differs → default to the quiz's answer
    //  - a tie → default to the scan's own result until the user decides
    if (result.winner) {
      setSelectedType(result.winner);
    }
    setShowQuiz(false);
  }

  const isTie = quizResult !== null && quizResult.winner === null;
  const agrees = quizResult !== null && quizResult.winner === skinResult.topClass;
  const disagreesCleanly =
    quizResult !== null && quizResult.winner !== null && quizResult.winner !== skinResult.topClass;

  // Every type that's "in play" once there's a tie or a scan/quiz mismatch —
  // deduplicated, so the user picks from a single clear set of buttons
  // regardless of whether this came from a 2-way disagreement or an N-way tie.
  const candidates: SkinClass[] = quizResult
    ? Array.from(
        new Set<SkinClass>([
          skinResult.topClass,
          ...(quizResult.winner ? [quizResult.winner] : quizResult.tiedTypes),
        ])
      )
    : [];

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 space-y-6 animate-fadeUp">
      <ResultPanel result={skinResult} imageSrc={imageSrc} />

      {isBorderline && !quizResult && (
        <div className="rounded-2xl border border-line bg-paper p-5 flex items-start gap-3">
          <span className="text-lg leading-none mt-0.5">🤔</span>
          <div>
            <p className="text-sm font-medium text-ink">
              The model wasn&rsquo;t fully confident on this one
            </p>
            <p className="text-sm text-ink/70 mt-1">
              {CLASS_META[CLASS_ORDER.find((c) => skinResult.scores[c] === sorted[0])!].label} and{" "}
              {CLASS_META[CLASS_ORDER.find((c) => skinResult.scores[c] === sorted[1])!].label} scored
              close together. A quick 4-question check can help confirm which fits better.
            </p>
            <button
              onClick={() => setShowQuiz(true)}
              className="focus-ring mt-3 text-sm font-medium underline underline-offset-4"
            >
              Take the quick quiz
            </button>
          </div>
        </div>
      )}

      {!isBorderline && !quizResult && !showQuiz && (
        <button
          onClick={() => setShowQuiz(true)}
          className="focus-ring text-sm text-ink/60 hover:text-ink underline underline-offset-4"
        >
          Not sure this is right? Take a quick quiz to double-check
        </button>
      )}

      {showQuiz && <SkinTypeQuiz onComplete={handleQuizComplete} />}

      {quizResult && agrees && (
        <div className="rounded-2xl border border-line bg-paper p-5">
          <p className="text-sm text-ink">
            <span className="text-normal font-medium">✓ Quiz confirms it</span> — your answers
            also point to <strong>{CLASS_META[quizResult.winner!].label.toLowerCase()}</strong> skin.
          </p>
        </div>
      )}

      {quizResult && disagreesCleanly && (
        <div className="rounded-2xl border border-line bg-paper p-5">
          <p className="text-sm text-ink mb-3">
            Your quiz answers point to{" "}
            <strong>{CLASS_META[quizResult.winner!].label.toLowerCase()}</strong> skin, which
            differs from the scan&rsquo;s top result (
            {CLASS_META[skinResult.topClass].label.toLowerCase()}). Which would you like to use
            for your routine?
          </p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((option) => (
              <button
                key={option}
                onClick={() => setSelectedType(option)}
                className={`focus-ring rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                  selectedType === option
                    ? "bg-ink text-paper border-ink"
                    : "border-line text-ink/70 hover:border-ink/40"
                }`}
              >
                {CLASS_META[option].label}
                {option === skinResult.topClass ? " (scan)" : " (quiz)"}
              </button>
            ))}
          </div>
        </div>
      )}

      {quizResult && isTie && (
        <div className="rounded-2xl border border-line bg-paper p-5">
          <p className="text-sm text-ink mb-3">
            Your quiz answers were <strong>tied</strong> between{" "}
            {quizResult.tiedTypes.map((t) => CLASS_META[t].label).join(" and ")} (
            {quizResult.totals[quizResult.tiedTypes[0]]} points each) — the quiz alone
            couldn&rsquo;t distinguish between them. Please choose which feels most accurate,
            alongside the scan&rsquo;s own result.
          </p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((option) => (
              <button
                key={option}
                onClick={() => setSelectedType(option)}
                className={`focus-ring rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                  selectedType === option
                    ? "bg-ink text-paper border-ink"
                    : "border-line text-ink/70 hover:border-ink/40"
                }`}
              >
                {CLASS_META[option].label}
                {option === skinResult.topClass
                  ? " (scan)"
                  : quizResult.tiedTypes.includes(option)
                  ? " (quiz — tied)"
                  : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <button
          onClick={() => onContinue(selectedType)}
          className="focus-ring w-full sm:w-auto rounded-full bg-ink text-paper px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Confirm {CLASS_META[selectedType].label.toLowerCase()} skin & continue to acne scan
        </button>
        <button
          onClick={onStartOver}
          className="focus-ring text-sm font-medium text-ink/60 hover:text-ink underline underline-offset-4"
        >
          Start over with a different photo
        </button>
      </div>
    </div>
  );
}
