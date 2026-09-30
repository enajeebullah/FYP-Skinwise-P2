import type { AcneDetectionResult } from "./acneModel";
import type { PredictionResult } from "./model";
import type { Point } from "./landmarks";

export interface FaceBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SkinAnalysisResponse {
  status: "ok" | "no_face" | "not_human_skin";
  faceBoxPx: FaceBox | null;
  skinResult: PredictionResult | null;
  skinInferenceMs: number;
}

export interface AcneAnalysisResponse {
  acneResult: AcneDetectionResult;
  landmarks: Point[] | null;
  landmarkWarning: string | null;
  acneInferenceMs: number;
}

async function imageFile(imageDataUrl: string): Promise<File> {
  const response = await fetch(imageDataUrl);
  if (!response.ok) {
    throw new Error("The selected image could not be prepared for analysis.");
  }
  const blob = await response.blob();
  return new File([blob], "skin-scan", {
    type: blob.type || "image/jpeg",
  });
}

async function postImage<T>(
  stage: "skin" | "acne",
  imageDataUrl: string,
  fields: Record<string, string> = {}
): Promise<T> {
  const form = new FormData();
  form.append("image", await imageFile(imageDataUrl));
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }

  const response = await fetch(`/api/inference/${stage}`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { detail?: string }
      | null;
    throw new Error(body?.detail ?? `SkinWISE AI service returned ${response.status}.`);
  }

  return (await response.json()) as T;
}

export function analyzeSkin(imageDataUrl: string): Promise<SkinAnalysisResponse> {
  return postImage<SkinAnalysisResponse>("skin", imageDataUrl);
}

export function analyzeAcne(
  imageDataUrl: string,
  faceBox: FaceBox | null
): Promise<AcneAnalysisResponse> {
  return postImage<AcneAnalysisResponse>("acne", imageDataUrl, {
    face_box: faceBox ? JSON.stringify(faceBox) : "",
  });
}
