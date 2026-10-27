"use client";

import { useState } from "react";
import ResultPanel from "./ResultPanel";
import { CLASS_META, type SkinClass } from "@/lib/constants";
import type { PredictionResult } from "@/lib/model";

interface ConfirmSkinTypeProps {
  imageSrc: string;
  skinResult: PredictionResult;
  onContinue: (finalType: SkinClass) => void;
  onStartOver: () => void;
}

type SkinTypeChoice = SkinClass | "unsure";

const CHOICES: { type: SkinTypeChoice; label: string; description: string; tone: string }[] = [
  { type: "oily", label: "Oily", description: "Produces more oil, prone to shine and breakouts.", tone: "oily" },
  { type: "normal", label: "Normal", description: "Balanced oil and moisture levels.", tone: "normal" },
  { type: "dry", label: "Dry", description: "Feels tight, may be flaky or rough.", tone: "dry" },
  { type: "unsure", label: "I’m not sure", description: "Let’s continue with the AI detected type.", tone: "unsure" },
];

function SkinIcon({ tone }: { tone: string }) {
  return (
    <span className={`skin-choice-icon skin-choice-icon-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 3.5C9.4 7.1 6.5 10.2 6.5 14a5.5 5.5 0 0 0 11 0c0-3.8-2.9-6.9-5.5-10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.5 14.5c.2 1.3 1.1 2.1 2.5 2.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default function ConfirmSkinType({
  imageSrc,
  skinResult,
  onContinue,
  onStartOver,
}: ConfirmSkinTypeProps) {
  const [selectedType, setSelectedType] = useState<SkinTypeChoice>(skinResult.topClass);
  const predictedType = CLASS_META[skinResult.topClass];
  const effectiveType = selectedType === "unsure" ? skinResult.topClass : selectedType;

  return (
    <main className="skin-confirm-page animate-fadeUp">
      <section className="skin-confirm-card" aria-label="Confirm your skin type">
        <div className="skin-confirm-result">
          <ResultPanel result={skinResult} imageSrc={imageSrc} showConfidenceDetails={false} />

          <div className="skin-ai-note" role="note">
            <span className="skin-ai-note-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M9 4.5a3 3 0 0 0-3 3v.3a3.5 3.5 0 0 0-1 6.7v.5a3 3 0 0 0 4 2.8V4.5Zm6 0a3 3 0 0 1 3 3v.3a3.5 3.5 0 0 1 1 6.7v.5a3 3 0 0 1-4 2.8V4.5ZM9 4.5a3 3 0 0 1 6 0v15a3 3 0 0 1-6 0v-15Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M7.5 10.5H9m6 0h1.5M7.5 14H9m6 0h1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <span>
              <strong>Detected by AI</strong>
              <span>This result is based on your uploaded photo. You can select another skin type below if a different type feels more accurate.</span>
            </span>
          </div>
        </div>

        <section className="skin-choice-section" aria-labelledby="skin-choice-title">
          <div className="skin-choice-heading">
            <span className="skin-choice-heading-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="7.5" r="4" stroke="currentColor" strokeWidth="1.7" />
                <path d="M4.5 20c.7-3.7 3.5-5.5 7.5-5.5s6.8 1.8 7.5 5.5H4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              </svg>
            </span>
            <span>
              <h2 id="skin-choice-title">What is your skin type?</h2>
              <p>You can choose the skin type detected by AI or select your own if you’re unsure.</p>
            </span>
          </div>

          <div className="skin-choice-grid" role="group" aria-labelledby="skin-choice-title">
            {CHOICES.map((choice) => {
              const selected = selectedType === choice.type;
              return (
                <button
                  key={choice.type}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedType(choice.type)}
                  className={`skin-choice-card${selected ? " selected" : ""}`}
                >
                  <SkinIcon tone={choice.tone} />
                  <strong>{choice.label}</strong>
                  <span className="skin-choice-description">{choice.description}</span>
                  <span className="skin-choice-radio" aria-hidden="true">
                    {selected && <span />}
                  </span>
                  {choice.type === "unsure" && (
                    <span className="sr-only">Continue with {predictedType.label}, the AI detected type</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <div className="skin-confirm-actions">
          <button type="button" onClick={() => onContinue(effectiveType)} className="skin-confirm-button focus-ring">
            Confirm &amp; Continue to Acne Scan
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" onClick={onStartOver} className="skin-confirm-start-over focus-ring">
            Start over with a different photo
          </button>
        </div>
      </section>
    </main>
  );
}
