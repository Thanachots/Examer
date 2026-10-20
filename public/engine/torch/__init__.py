"""torch จำลอง (numpy ล้วน) — ให้โค้ดของ repo Computer-Vision import ได้ใน Pyodide
ตัวโมเดลจริงไม่ได้รันที่นี่: examer_engine แทน engine.model ด้วยตัวกลางที่ส่งงานไป ONNX (onnxruntime-web)"""
import numpy as _np
from . import nn  # noqa: F401


class Tensor(_np.ndarray):
    def to(self, *a, **k): return self
    def cpu(self): return self
    def numpy(self): return _np.asarray(self)
    def float(self): return self.astype(_np.float32).view(Tensor)
    def flatten(self, start=0): return self.reshape(self.shape[:start] + (-1,)).view(Tensor)


def from_numpy(a): return _np.asarray(a).view(Tensor)
def device(*a, **k): return "cpu"
def load(*a, **k): return {}
def cat(xs, dim=0): return _np.concatenate([_np.asarray(x) for x in xs], axis=dim).view(Tensor)


class no_grad:
    def __call__(self, fn): return fn
    def __enter__(self): return self
    def __exit__(self, *a): return False
