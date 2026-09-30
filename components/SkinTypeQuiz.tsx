"use client";

import { useState } from "react";
import { SKIN_QUIZ, scoreQuiz, type QuizResult } from "@/lib/skinQuiz";

interface SkinTypeQuizProps {
  onComplete: (result: QuizResult) => void;
}

export default function SkinTypeQuiz({ onComplete }: SkinTypeQuizProps) {
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(SKIN_QUIZ.length).fill(null)
  );

  const allAnswered = answers.every((a) => a !== null);

  function selectAnswer(qIndex: number, optionIndex: number) {
    setAnswers((prev) => {
      const next = [...prev];
      next[qIndex] = optionIndex;
      return next;
    });
  }

  function handleSubmit() {
    if (!allAnswered) return;
    onComplete(scoreQuiz(answers as number[]));
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6 space-y-5">
      <div>
        <p className="font-display text-lg text-ink">Skin Type Assessment</p>
        <p className="text-sm text-ink/60 mt-1">
          Answer based on how your skin usually behaves. There are no right or
          wrong answers — choose whichever option best describes your skin.
        </p>
      </div>

      {SKIN_QUIZ.map((q, qIndex) => (
        <div key={qIndex}>
          <p className="text-xs font-mono uppercase tracking-wide text-muted mb-1">
            Question {qIndex + 1} — {q.heading}
          </p>
          <p className="text-sm font-medium text-ink mb-2">{q.question}</p>
          <div className="space-y-1.5">
            {q.options.map((opt, oIndex) => {
              const selected = answers[qIndex] === oIndex;
              return (
                <button
                  key={oIndex}
                  onClick={() => selectAnswer(qIndex, oIndex)}
                  className={`focus-ring w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                    selected
                      ? "border-ink bg-ink text-paper"
                      : "border-line bg-panel text-ink/80 hover:border-ink/40"
                  }`}
                >
                  <span className="block text-sm font-medium">{opt.title}</span>
                  <span
                    className={`block text-xs mt-0.5 ${
                      selected ? "text-paper/75" : "text-ink/55"
                    }`}
                  >
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered}
        className="focus-ring w-full rounded-full bg-ink text-paper py-2.5 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        See quiz result
      </button>
    </div>
  );
}
