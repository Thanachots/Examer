from . import functional  # noqa: F401


class Module:
    def __init__(self, *a, **k): pass
    def __call__(self, *a, **k): return self.forward(*a, **k)
    def forward(self, *a, **k): raise RuntimeError("torch shim: โมเดลต้องรันผ่าน ONNX")
    def to(self, *a, **k): return self
    def eval(self): return self
    def train(self, *a): return self
    def load_state_dict(self, *a, **k): return None
    def parameters(self): return iter(())


class Sequential(Module): pass
class Conv2d(Module): pass
class BatchNorm1d(Module): pass
class BatchNorm2d(Module): pass
class GELU(Module): pass
class ReLU(Module): pass
class Dropout(Module): pass
class Linear(Module): pass
class AdaptiveAvgPool2d(Module): pass
class MaxPool2d(Module): pass
class Identity(Module): pass
