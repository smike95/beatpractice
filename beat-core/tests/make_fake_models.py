"""Makes tiny FAKE separator models for tests/stems_test.cpp: source s = c[s] * mix (sum of c = 1).
   pip install onnx numpy ; python3 tests/make_fake_models.py OUTPUT_DIR"""
import sys, os, numpy as np, onnx
from onnx import helper, TensorProto, numpy_helper
def make(path, L, S, dyn=False, half_io=False):
    c = np.array([0.30, 0.20, 0.10, 0.15, 0.15, 0.10][:S], dtype=np.float32); c = c / c.sum()
    dt = TensorProto.FLOAT16 if half_io else TensorProto.FLOAT
    npdt = np.float16 if half_io else np.float32
    inp = helper.make_tensor_value_info("mix", dt, [1, 2, "L" if dyn else L])
    out = helper.make_tensor_value_info("sources", dt, [1, S, 2, "L" if dyn else L])
    ax = numpy_helper.from_array(np.array([1], dtype=np.int64), "ax")
    k = numpy_helper.from_array(c.reshape(1, S, 1, 1).astype(npdt), "k")
    nodes = [helper.make_node("Unsqueeze", ["mix", "ax"], ["u"]), helper.make_node("Mul", ["u", "k"], ["sources"])]
    g = helper.make_graph(nodes, "fake_sep", [inp], [out], initializer=[ax, k])
    m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 17)]); m.ir_version = 8
    onnx.checker.check_model(m); onnx.save(m, path)
d = sys.argv[1] if len(sys.argv) > 1 else "."
os.makedirs(d, exist_ok=True)
make(os.path.join(d, "fake_6s_fixed.onnx"), 88200, 6)
make(os.path.join(d, "fake_6s_dynamic.onnx"), 0, 6, dyn=True)
make(os.path.join(d, "fake_4s_fixed.onnx"), 88200, 4)
make(os.path.join(d, "fake_6s_half.onnx"), 88200, 6, half_io=True)
print("fake models written to", d)
