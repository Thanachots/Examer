import numpy as _np


def softmax(x, dim=-1):
    x = _np.asarray(x, dtype=_np.float64)
    e = _np.exp(x - x.max(axis=dim, keepdims=True))
    from .. import Tensor
    return (e / e.sum(axis=dim, keepdims=True)).astype(_np.float32).view(Tensor)


def gelu(x):
    raise RuntimeError("torch shim: โมเดลต้องรันผ่าน ONNX")
