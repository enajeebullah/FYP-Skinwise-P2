from __future__ import annotations

import io
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

from .landmarks_data import (
    NUM_LANDMARKS,
    NUM_NEIGHBORS,
    REVERSE_INDEX_1,
    REVERSE_INDEX_2,
    REVERSE_MAX_LEN,
)

logger = logging.getLogger("skinwise")

BASE_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = Path(os.getenv("SKINWISE_MODEL_DIR", BASE_DIR / "models"))
MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP"}

SKIN_CLASSES = ("dry", "normal", "oily")
ACNE_CLASSES = ("comedone", "nodules", "papules", "pustules")
FACE_CONFIDENCE_THRESHOLD = 0.7
FACE_NMS_IOU_THRESHOLD = 0.4
SKIN_TONE_MIN_PERCENTAGE = 0.25
ACNE_CONF_THRESHOLD = 0.35
ACNE_IOU_THRESHOLD = 0.45


class FaceBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class SkinResult(BaseModel):
    scores: dict[str, float]
    topClass: Literal["dry", "normal", "oily"]
    topConfidence: float


class SkinAnalysisResponse(BaseModel):
    status: Literal["ok", "no_face", "not_human_skin"]
    faceBoxPx: FaceBox | None = None
    skinResult: SkinResult | None = None
    skinInferenceMs: float


class AcneBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float
    score: float
    classId: int
    className: Literal["comedone", "nodules", "papules", "pustules"]


class AcneResult(BaseModel):
    boxes: list[AcneBox]
    counts: dict[str, int]
    total: int


class AcneAnalysisResponse(BaseModel):
    acneResult: AcneResult
    landmarks: list[dict[str, float]] | None
    landmarkWarning: str | None = None
    acneInferenceMs: float


class ModelService:
    def __init__(self, model_dir: Path) -> None:
        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        options.intra_op_num_threads = max(1, min(os.cpu_count() or 1, 4))

        self.skin_session = self._load_session(
            model_dir / "skinwise_mobilenetv2.onnx", options
        )
        self.acne_session = self._load_session(model_dir / "acne_detector.onnx", options)
        self.face_session = self._load_session(model_dir / "face_detector.onnx", options)
        self.landmark_session = self._load_session(model_dir / "landmark_detector.onnx", options)

    @staticmethod
    def _load_session(path: Path, options: ort.SessionOptions) -> ort.InferenceSession:
        if not path.is_file():
            raise FileNotFoundError(f"Required ONNX model not found: {path}")
        return ort.InferenceSession(
            str(path),
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )

    def analyze_skin(self, image: Image.Image) -> dict:
        started = time.perf_counter()
        face_box = self._detect_face(image)
        if face_box is None:
            return {
                "status": "no_face",
                "faceBoxPx": None,
                "skinResult": None,
                "skinInferenceMs": (time.perf_counter() - started) * 1000,
            }

        if not _looks_like_skin(image, face_box):
            return {
                "status": "not_human_skin",
                "faceBoxPx": face_box,
                "skinResult": None,
                "skinInferenceMs": (time.perf_counter() - started) * 1000,
            }

        resized = image.resize((224, 224), Image.Resampling.BILINEAR)
        pixels = np.asarray(resized, dtype=np.float32)
        pixels /= 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        tensor = ((pixels - mean) / std).transpose(2, 0, 1)[np.newaxis, ...]
        input_name = self.skin_session.get_inputs()[0].name
        logits = self.skin_session.run(None, {input_name: tensor})[0].reshape(-1)
        if logits.size < len(SKIN_CLASSES):
            raise RuntimeError("Skin model returned fewer scores than expected.")

        logits = logits[: len(SKIN_CLASSES)]
        probabilities = np.exp(logits - np.max(logits))
        probabilities /= np.sum(probabilities)
        scores = {
            name: float(probabilities[index])
            for index, name in enumerate(SKIN_CLASSES)
        }
        top_class = max(SKIN_CLASSES, key=scores.__getitem__)
        return {
            "status": "ok",
            "faceBoxPx": face_box,
            "skinResult": {
                "scores": scores,
                "topClass": top_class,
                "topConfidence": scores[top_class],
            },
            "skinInferenceMs": (time.perf_counter() - started) * 1000,
        }

    def analyze_acne(
        self, image: Image.Image, face_box: FaceBox | None
    ) -> dict:
        started = time.perf_counter()
        acne_result = self._detect_acne(image)
        landmarks = None
        landmark_warning = None
        if face_box is not None:
            try:
                landmarks = self._detect_landmarks(image, face_box)
            except Exception as exc:
                logger.exception("Landmark inference failed; manual review remains available.")
                landmark_warning = (
                    "Facial landmarks could not be calculated. Please enter and review "
                    "the lesion counts manually."
                )
        return {
            "acneResult": acne_result,
            "landmarks": landmarks,
            "landmarkWarning": landmark_warning,
            "acneInferenceMs": (time.perf_counter() - started) * 1000,
        }

    def _detect_face(self, image: Image.Image) -> FaceBox | None:
        resized = image.resize((320, 240), Image.Resampling.BILINEAR)
        pixels = np.asarray(resized, dtype=np.float32)
        tensor = ((pixels - 127.0) / 128.0).transpose(2, 0, 1)[np.newaxis, ...]
        input_name = self.face_session.get_inputs()[0].name
        output_names = [item.name for item in self.face_session.get_outputs()]
        output_values = self.face_session.run(output_names, {input_name: tensor})
        output = dict(zip(output_names, output_values))
        scores = np.asarray(output["scores"]).reshape(-1, 2)
        boxes = np.asarray(output["boxes"]).reshape(-1, 4)

        candidates = []
        for index in range(min(len(scores), len(boxes))):
            confidence = float(scores[index, 1])
            if confidence < FACE_CONFIDENCE_THRESHOLD:
                continue
            box = _clip_normalized_face_box(boxes[index])
            if box is not None:
                candidates.append((box, confidence))
        kept = _face_nms(candidates, FACE_NMS_IOU_THRESHOLD)
        if not kept:
            return None

        box, _ = kept[0]
        width, height = image.size
        return FaceBox(
            x1=float(box[0] * width),
            y1=float(box[1] * height),
            x2=float(box[2] * width),
            y2=float(box[3] * height),
        )

    def _detect_acne(self, image: Image.Image) -> dict:
        width, height = image.size
        scale = min(640 / width, 640 / height)
        new_width = round(width * scale)
        new_height = round(height * scale)
        pad_x = (640 - new_width) // 2
        pad_y = (640 - new_height) // 2

        resized = image.resize((new_width, new_height), Image.Resampling.BILINEAR)
        letterboxed = Image.new("RGB", (640, 640), (114, 114, 114))
        letterboxed.paste(resized, (pad_x, pad_y))
        pixels = np.asarray(letterboxed, dtype=np.float32) / 255.0
        tensor = pixels.transpose(2, 0, 1)[np.newaxis, ...]
        input_name = self.acne_session.get_inputs()[0].name
        output = self.acne_session.run(None, {input_name: tensor})[0]
        output = np.asarray(output)
        if output.ndim != 3 or output.shape[0] != 1 or output.shape[1] < 5:
            raise RuntimeError(f"Unexpected acne model output shape: {output.shape}.")

        num_classes = output.shape[1] - 4
        if num_classes != len(ACNE_CLASSES):
            raise RuntimeError(
                f"Expected {len(ACNE_CLASSES)} acne classes, got {num_classes}."
            )

        predictions = output[0]
        class_scores = predictions[4:, :]
        best_classes = np.argmax(class_scores, axis=0)
        best_scores = class_scores[best_classes, np.arange(class_scores.shape[1])]
        selected = np.flatnonzero(best_scores >= ACNE_CONF_THRESHOLD)
        boxes = []
        for anchor in selected:
            center_x, center_y, box_width, box_height = predictions[:4, anchor]
            class_id = int(best_classes[anchor])
            boxes.append(
                {
                    "x1": float((center_x - box_width / 2 - pad_x) / scale),
                    "y1": float((center_y - box_height / 2 - pad_y) / scale),
                    "x2": float((center_x + box_width / 2 - pad_x) / scale),
                    "y2": float((center_y + box_height / 2 - pad_y) / scale),
                    "score": float(best_scores[anchor]),
                    "classId": class_id,
                    "className": ACNE_CLASSES[class_id],
                }
            )

        kept = _acne_nms(boxes, ACNE_IOU_THRESHOLD)
        counts = {name: 0 for name in ACNE_CLASSES}
        for box in kept:
            counts[box["className"]] += 1
        return {"boxes": kept, "counts": counts, "total": len(kept)}

    def _detect_landmarks(
        self, image: Image.Image, face_box: FaceBox
    ) -> list[dict[str, float]]:
        width, height = image.size
        box_width = face_box.x2 - face_box.x1
        box_height = face_box.y2 - face_box.y1
        x1 = max(0, int(np.floor(face_box.x1 - box_width * 0.1)))
        y1 = max(0, int(np.floor(face_box.y1 + box_height * 0.1)))
        x2 = min(width - 1, int(np.floor(face_box.x2 + box_width * 0.1)))
        y2 = min(height - 1, int(np.floor(face_box.y2 + box_height * 0.1)))
        crop_width = x2 - x1 + 1
        crop_height = y2 - y1 + 1
        if crop_width <= 0 or crop_height <= 0:
            return []

        crop = image.crop((x1, y1, x2 + 1, y2 + 1)).resize(
            (256, 256), Image.Resampling.BILINEAR
        )
        pixels = np.asarray(crop, dtype=np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        tensor = ((pixels - mean) / std).transpose(2, 0, 1)[np.newaxis, ...]
        input_name = self.landmark_session.get_inputs()[0].name
        output_names = [item.name for item in self.landmark_session.get_outputs()]
        output_values = self.landmark_session.run(output_names, {input_name: tensor})
        output = dict(zip(output_names, output_values))

        feat_size = 8
        grid_size = feat_size * feat_size
        cls_map = np.asarray(output["cls_map"]).reshape(NUM_LANDMARKS, grid_size)
        offset_x = np.asarray(output["offset_x"]).reshape(NUM_LANDMARKS, grid_size)
        offset_y = np.asarray(output["offset_y"]).reshape(NUM_LANDMARKS, grid_size)
        nb_x = np.asarray(output["nb_x"]).reshape(
            NUM_LANDMARKS, NUM_NEIGHBORS, grid_size
        )
        nb_y = np.asarray(output["nb_y"]).reshape(
            NUM_LANDMARKS, NUM_NEIGHBORS, grid_size
        )

        pred_x = np.empty(NUM_LANDMARKS, dtype=np.float32)
        pred_y = np.empty(NUM_LANDMARKS, dtype=np.float32)
        nb_pred_x = np.empty((NUM_LANDMARKS, NUM_NEIGHBORS), dtype=np.float32)
        nb_pred_y = np.empty_like(nb_pred_x)
        for landmark in range(NUM_LANDMARKS):
            grid_index = int(np.argmax(cls_map[landmark]))
            column = grid_index % feat_size
            row = grid_index // feat_size
            pred_x[landmark] = (column + offset_x[landmark, grid_index]) / feat_size
            pred_y[landmark] = (row + offset_y[landmark, grid_index]) / feat_size
            nb_pred_x[landmark] = (
                column + nb_x[landmark, :, grid_index]
            ) / feat_size
            nb_pred_y[landmark] = (row + nb_y[landmark, :, grid_index]) / feat_size

        points = []
        for landmark in range(NUM_LANDMARKS):
            sum_x = float(pred_x[landmark])
            sum_y = float(pred_y[landmark])
            count = 1
            for index in range(REVERSE_MAX_LEN):
                flat_index = landmark * REVERSE_MAX_LEN + index
                source_landmark = REVERSE_INDEX_1[flat_index]
                source_neighbor = REVERSE_INDEX_2[flat_index]
                sum_x += float(nb_pred_x[source_landmark, source_neighbor])
                sum_y += float(nb_pred_y[source_landmark, source_neighbor])
                count += 1
            points.append(
                {
                    "x": (sum_x / count) * crop_width + x1,
                    "y": (sum_y / count) * crop_height + y1,
                }
            )
        return points


def _face_nms(
    candidates: list[tuple[np.ndarray, float]], threshold: float
) -> list[tuple[np.ndarray, float]]:
    kept: list[tuple[np.ndarray, float]] = []
    for candidate in sorted(candidates, key=lambda item: item[1], reverse=True):
        if all(_iou(candidate[0], existing[0]) < threshold for existing in kept):
            kept.append(candidate)
    return kept


def _acne_nms(boxes: list[dict], threshold: float) -> list[dict]:
    kept: list[dict] = []
    for class_id in range(len(ACNE_CLASSES)):
        active = sorted(
            (box for box in boxes if box["classId"] == class_id),
            key=lambda box: box["score"],
            reverse=True,
        )
        while active:
            best = active.pop(0)
            kept.append(best)
            active = [
                box for box in active if _iou(best, box) <= threshold
            ]
    return kept


def _iou(first, second) -> float:
    if isinstance(first, dict):
        first = (first["x1"], first["y1"], first["x2"], first["y2"])
        second = (second["x1"], second["y1"], second["x2"], second["y2"])
    x1 = max(float(first[0]), float(second[0]))
    y1 = max(float(first[1]), float(second[1]))
    x2 = min(float(first[2]), float(second[2]))
    y2 = min(float(first[3]), float(second[3]))
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area_first = max(0.0, float(first[2]) - float(first[0])) * max(
        0.0, float(first[3]) - float(first[1])
    )
    area_second = max(0.0, float(second[2]) - float(second[0])) * max(
        0.0, float(second[3]) - float(second[1])
    )
    union = area_first + area_second - intersection
    return intersection / union if union > 0 else 0.0


def _looks_like_skin(image: Image.Image, box: FaceBox) -> bool:
    width, height = image.size
    left = max(0, int(np.floor(box.x1)))
    top = max(0, int(np.floor(box.y1)))
    right = min(width, int(np.ceil(box.x2)))
    bottom = min(height, int(np.ceil(box.y2)))
    if right <= left or bottom <= top:
        return True

    sample = np.asarray(
        image.crop((left, top, right, bottom)).resize(
            (96, 96), Image.Resampling.BILINEAR
        ),
        dtype=np.int16,
    )
    red, green, blue = sample[..., 0], sample[..., 1], sample[..., 2]
    max_channel = np.maximum(np.maximum(red, green), blue)
    min_channel = np.minimum(np.minimum(red, green), blue)
    rule_one = (
        (red > 95)
        & (green > 40)
        & (blue > 20)
        & (max_channel - min_channel > 15)
        & (np.abs(red - green) > 15)
        & (red > green)
        & (red > blue)
    )
    rule_two = (
        (red > 220)
        & (green > 210)
        & (blue > 170)
        & (np.abs(red - green) <= 15)
        & (blue < red)
        & (blue < green)
    )
    return float(np.mean(rule_one | rule_two)) >= SKIN_TONE_MIN_PERCENTAGE


async def _read_image(upload: UploadFile) -> Image.Image:
    content = await upload.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 12 MB or smaller.")
    try:
        with Image.open(io.BytesIO(content)) as source:
            if source.format not in SUPPORTED_FORMATS:
                raise HTTPException(
                    status_code=415, detail="Use a JPG, PNG, or WebP image."
                )
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=413, detail="Image dimensions are too large."
                )
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGB")
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=400, detail="The uploaded image is invalid.") from exc
    return image


def _clip_normalized_face_box(values: np.ndarray) -> np.ndarray | None:
    box = np.asarray(values, dtype=np.float64)
    if box.shape != (4,) or not np.all(np.isfinite(box)):
        return None

    x1, y1, x2, y2 = np.clip(box, 0.0, 1.0)
    if x2 <= x1 or y2 <= y1:
        return None
    return np.array([x1, y1, x2, y2], dtype=np.float64)


def _parse_face_box(value: str, image_size: tuple[int, int]) -> FaceBox | None:
    if not value:
        return None
    try:
        box = FaceBox.model_validate_json(value)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail="Face coordinates are invalid.") from exc
    if (
        box.x1 < 0
        or box.y1 < 0
        or box.x2 <= box.x1
        or box.y2 <= box.y1
        or not np.all(np.isfinite([box.x1, box.y1, box.x2, box.y2]))
        or box.x2 > image_size[0]
        or box.y2 > image_size[1]
    ):
        raise HTTPException(
            status_code=422,
            detail="The detected face coordinates do not fit the uploaded image. Please try another clear, front-facing photo.",
        )
    return box


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.models = ModelService(MODEL_DIR)
    yield
    del app.state.models


app = FastAPI(
    title="SkinWISE Inference API",
    version="1.0.0",
    description="Private, non-persisting ONNX inference for SkinWISE scan images.",
    lifespan=lifespan,
)

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok" if hasattr(app.state, "models") else "starting"}


@app.post("/api/analyze/skin", response_model=SkinAnalysisResponse)
async def analyze_skin(image: UploadFile = File(...)) -> dict:
    decoded = await _read_image(image)
    return await run_in_threadpool(app.state.models.analyze_skin, decoded)


@app.post("/api/analyze/acne", response_model=AcneAnalysisResponse)
async def analyze_acne(
    image: UploadFile = File(...),
    face_box: str = Form(default=""),
) -> dict:
    decoded = await _read_image(image)
    parsed_box = _parse_face_box(face_box, decoded.size)
    return await run_in_threadpool(app.state.models.analyze_acne, decoded, parsed_box)
