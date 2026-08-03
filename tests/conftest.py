import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Stub joblib só quando ausente (_load_artifacts é monkeypatched). Stubar sempre
# quebra o import do sklearn, que precisa de joblib.Parallel — e o sklearn entra
# junto com main.py via api/routers/regressao.py.
try:
    import joblib  # noqa: F401
except ImportError:
    _joblib = types.ModuleType("joblib")
    _joblib.load = lambda *a, **kw: None
    sys.modules["joblib"] = _joblib

# Stub pyodbc quando ausente (dev sem driver ODBC) — os testes nunca tocam o
# banco; run_query é monkeypatched onde necessário.
try:
    import pyodbc  # noqa: F401
except ImportError:
    _pyodbc = types.ModuleType("pyodbc")
    _pyodbc.Error = type("Error", (Exception,), {})
    sys.modules["pyodbc"] = _pyodbc
