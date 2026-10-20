"""ตัวกลางระหว่างหน้า app (JS) กับโค้ด repo Computer-Vision ใน Pyodide

ทำงาน 2 รอบต่อ 1 แผ่น เพราะ ONNX ฝั่ง JS เป็น async:
  prepare(bytes) → ตัดขอบ + จับช่อง แล้ว "บันทึก" input ของทั้ง 3 โมเดล → คืนให้ JS
  JS รัน ONNX ได้ logits
  finish(logits) → เรียกฟังก์ชันเดิมของ repo อีกครั้งโดย "เล่นซ้ำ" logits → ผลเหมือนรันด้วย PyTorch

input ของทั้ง 3 โมเดลขึ้นกับผลจับช่องอย่างเดียว (ไม่ขึ้นกับผลของโมเดลอื่น) จึงบันทึกครบได้ในรอบแรก
"""
import base64
import json
import time

import cv2
import numpy as np

from src.preprocessing.dewarp import FiducialDewarper
from src.detection.grid_extractor import Template2GridExtractor
from src.detection.strikethrough_detector import StrikethroughDetectorEngine
from src.recognition.char_classifier import HCRModelEngine
from src.recognition.digit_classifier import DigitRecognizerEngine

PREVIEW_W = 1240


class _Recorder:
    def __init__(self, n_out): self.n_out, self.inputs = n_out, None
    def __call__(self, *xs):
        self.inputs = [np.ascontiguousarray(np.asarray(x, dtype=np.float32)) for x in xs]
        return np.zeros((xs[0].shape[0], self.n_out), np.float32)


class _Replay:
    def __init__(self, logits): self.logits = logits
    def __call__(self, *xs):
        assert self.logits.shape[0] == xs[0].shape[0], "จำนวนช่องไม่ตรงกับรอบแรก"
        return self.logits


class Engine:
    def __init__(self, meta):
        self.dewarper = FiducialDewarper()
        self.extractor = Template2GridExtractor()
        self.hcr = HCRModelEngine(weights_path=None)
        self.strike = StrikethroughDetectorEngine(weights_path=None)
        self.digit = DigitRecognizerEngine(weights_path=None)
        d = meta.get("hcr_digits", {})
        self.digit.mean_norm = float(d.get("mean_norm", 0.1307))
        self.digit.std_norm = float(d.get("std_norm", 0.3081))
        self.state = None

    # ---------- รอบ 1 ----------
    def prepare(self, data, name="upload.jpg"):
        t0 = time.perf_counter()
        img = cv2.imdecode(np.frombuffer(bytes(data), np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("อ่านไฟล์ภาพไม่ได้ (รองรับ JPG/PNG)")
        res1 = self.dewarper.process_image(img, image_name=name, return_normalized=True)
        t1 = time.perf_counter()
        grid = self.extractor.process_rectified_sheet(res1.rectified_norm_gray, image_name=name)
        t2 = time.perf_counter()
        occupied = [(r, c, grid.answer_grid[r - 1][c - 1].clean_patch)
                    for r in range(1, 21) for c in range(1, 21) if not grid.answer_grid[r - 1][c - 1].is_empty]
        all_cells = [(r, c, grid.answer_grid[r - 1][c - 1].clean_patch) for r in range(1, 21) for c in range(1, 21)]

        rec = {"digit": _Recorder(10), "hcr": _Recorder(26), "strike": _Recorder(3)}
        self.digit.model, self.hcr.model, self.strike.model = rec["digit"], rec["hcr"], rec["strike"]
        self.digit.predict_header_fields(grid.header_ids)
        if occupied:
            self.hcr.predict_cells(occupied)
        self.strike.predict_cells(all_cells, hcr_predictions={})

        self.state = dict(size=[int(img.shape[1]), int(img.shape[0])], res1=res1, grid=grid, occupied=occupied, all_cells=all_cells,
                          ms={"dewarp": (t1 - t0) * 1000, "grid": (t2 - t1) * 1000}, t0=t0)
        out = {}
        for k, r in rec.items():
            if r.inputs is not None:
                out[k] = r.inputs
        return out

    def prepare_js(self, data, name="upload.jpg"):
        """เหมือน prepare แต่คืนรูปแบบที่ส่งข้ามไป JS ได้: {model: [[shape, bytes], ...]}"""
        if hasattr(data, "to_bytes"):  # Uint8Array จาก JS
            data = data.to_bytes()
        return {k: [[list(a.shape), a.tobytes()] for a in arrs] for k, arrs in self.prepare(data, name).items()}

    def finish_js(self, logits_js):
        """logits_js: {model: [shape, Float32Array]} จาก JS"""
        logits = {}
        for k in logits_js:
            shape, arr = logits_js[k]
            if hasattr(arr, "to_py"):
                arr = arr.to_py()
            logits[k] = np.frombuffer(arr, dtype=np.float32).reshape([int(x) for x in shape])
        return self.finish(logits)

    # ---------- รอบ 2 ----------
    def finish(self, logits):
        s = self.state
        t3 = time.perf_counter()
        grid, res1 = s["grid"], s["res1"]
        if "digit" in logits:
            self.digit.model = _Replay(np.asarray(logits["digit"], np.float32))
        header = self.digit.predict_header_fields(grid.header_ids)
        chars = {}
        if s["occupied"]:
            self.hcr.model = _Replay(np.asarray(logits["hcr"], np.float32))
            chars = {(p.row_idx, p.col_idx): p for p in self.hcr.predict_cells(s["occupied"])}
        self.strike.model = _Replay(np.asarray(logits["strike"], np.float32))
        states = {(p.row_idx, p.col_idx): p for p in self.strike.predict_cells(s["all_cells"], hcr_predictions=chars)}

        H, W = res1.rectified_bgr.shape[:2]
        fb = lambda b: [round(b[0] / W, 5), round(b[1] / H, 5), round(b[2] / W, 5), round(b[3] / H, 5)]
        reads = []
        for r in range(1, 21):
            row = []
            for c in range(1, 21):
                st, cp, patch = states[(r, c)], chars.get((r, c)), grid.answer_grid[r - 1][c - 1]
                cell = {"bbox": fb(patch.bbox)}
                if st.is_empty or cp is None:
                    cell.update(char="", conf=round(float(st.empty_prob if st.is_empty else st.confidence), 4), cls="empty")
                elif st.is_strikethrough:
                    cell.update(char=cp.predicted_char, conf=round(float(st.strikethrough_prob), 4), cls="crossed")
                else:
                    cell.update(char=cp.predicted_char, conf=round(min(float(cp.confidence), float(st.normal_char_prob)), 4), cls="char")
                if cp is not None:
                    cell["top3"] = [[ch, round(float(p), 4)] for ch, p in cp.top3_chars]
                row.append(cell)
            reads.append(row)

        xs = [v for row in reads for v in (row[0]["bbox"][0], row[-1]["bbox"][2])]
        ys = [v for row in (reads[0], reads[-1]) for cell in row for v in (cell["bbox"][1], cell["bbox"][3])]
        scale = PREVIEW_W / W
        preview = cv2.resize(res1.rectified_bgr, (PREVIEW_W, int(H * scale)), interpolation=cv2.INTER_AREA)
        ok, jpg = cv2.imencode(".jpg", preview, [cv2.IMWRITE_JPEG_QUALITY, 80])
        # ภาพ overlay: เขียว = ตัวอักษร, แดง = ขีดฆ่า, เทาจาง = ช่องว่าง
        ov = preview.copy()
        PH, PW = ov.shape[:2]
        for row in reads:
            for cell in row:
                x1, y1, x2, y2 = cell["bbox"]
                col = {"char": (60, 160, 30), "crossed": (40, 40, 220)}.get(cell["cls"], (200, 200, 200))
                cv2.rectangle(ov, (int(x1 * PW), int(y1 * PH)), (int(x2 * PW), int(y2 * PH)), col, 2 if cell["cls"] != "empty" else 1)
        ok2, jpg2 = cv2.imencode(".jpg", ov, [cv2.IMWRITE_JPEG_QUALITY, 80])
        to_url = lambda b: "data:image/jpeg;base64," + base64.b64encode(b.tobytes()).decode()
        m1 = res1.metrics
        hf = lambda r: {"value": r.assembled_id, "slots": r.formatted_14_slots, "mean_conf": round(float(r.mean_confidence), 4),
                        "min_conf": round(float(r.min_confidence), 4), "review": bool(r.needs_human_review)}
        t4 = time.perf_counter()
        warnings = []
        if m1.markers_found_count < 3:
            warnings.append(f"พบสี่เหลี่ยมดำ {m1.markers_found_count}/3 มุม — ผลอาจคลาด ควรถ่ายใหม่ให้เห็นทั้งแผ่น")
        if m1.used_fallback:
            warnings.append("ใช้วิธีหาขอบกระดาษสำรอง — ตรวจภาพที่ตัดขอบแล้วอีกครั้ง")
        result = {
            "student_id": header["student_id"].assembled_id,
            "subject_id": header["subject_id"].assembled_id,
            "school_id": header["school_id"].assembled_id,
            "header": {k: hf(v) for k, v in header.items()},
            "set": grid.metrics.detected_question_set,
            "question_set": grid.metrics.detected_question_set,
            "page": grid.metrics.detected_page_number,
            "dewarp": {"corners": np.asarray(res1.src_corners).round(1).tolist(), "width": s["size"][0], "height": s["size"][1]},
            "images": {"rectified": to_url(jpg) if ok else None, "overlay": to_url(jpg2) if ok2 else None},
            "cells": {"box": {"x": min(xs), "y": min(ys), "w": max(xs) - min(xs), "h": max(ys) - min(ys)}},
            "reads": reads,
            "quality": {"markers_found": int(m1.markers_found_count), "used_fallback": bool(m1.used_fallback),
                        "timing_bars": [int(grid.metrics.left_bars_detected), int(grid.metrics.right_bars_detected)],
                        "warnings": warnings},
            "timing_ms": {**{k: round(v) for k, v in s["ms"].items()}, "read": round((t4 - t3) * 1000), "total": round((t4 - s["t0"]) * 1000)},
        }
        self.state = None
        return json.dumps(result)
