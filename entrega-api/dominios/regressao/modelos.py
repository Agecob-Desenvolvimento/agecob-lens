"""
Regression models for agent performance analysis.

Uses scikit-learn for:
- Data cleaning (null removal, dedup, IQR outlier detection)
- 5 OLS regression models with cross-validation (70/30 split)
- Returns structured results consumable by the frontend RegressionView.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import PolynomialFeatures


# ── Types ───────────────────────────────────────────────────────────────────


@dataclass
class CoefEstimate:
    name: str
    value: float
    se: float


@dataclass
class ModelResult:
    id: str
    label: str
    description: str
    drawable: bool
    r2_train: float
    r2_test: float
    adj_r2: float
    cv_train_n: int
    cv_test_n: int
    intercept: float
    intercept_se: float
    coefficients: List[CoefEstimate] = field(default_factory=list)


@dataclass
class CleaningMeta:
    raw_count: int
    clean_count: int
    removed_nulls: int
    removed_duplicates: int
    removed_outliers: int


@dataclass
class RegressionResponse:
    meta: CleaningMeta
    modelos: List[ModelResult]


# ── Data cleaning ───────────────────────────────────────────────────────────


def _clean_data(
    pontos: List[Dict[str, Any]],
    numeric_fields: Tuple[str, ...] = (
        "eficiencia", "valor", "acionamentos", "contatos", "cpc", "conversao",
    ),
    id_field: str = "id",
) -> Tuple[np.ndarray, np.ndarray, CleaningMeta]:
    """
    Clean agent data: remove nulls, duplicates, IQR outliers.
    Returns (X_matrix, y_vector, cleaning_metadata).
    X_matrix columns: eficiencia, acionamentos, contatos, cpc, conversao
    y_vector: valor
    """
    raw_count = len(pontos)
    removed_nulls = 0
    removed_duplicates = 0
    removed_outliers = 0

    # 1. Remove nulls / NaN
    clean: List[Dict[str, Any]] = []
    for p in pontos:
        ok = True
        for f in numeric_fields:
            v = p.get(f)
            if v is None or (isinstance(v, float) and not math.isfinite(v)):
                ok = False
                break
        if ok:
            clean.append(p)
        else:
            removed_nulls += 1

    # 2. Remove duplicates by id
    seen: set = set()
    deduped: List[Dict[str, Any]] = []
    for p in clean:
        pid = p.get(id_field)
        if pid in seen:
            removed_duplicates += 1
            continue
        seen.add(pid)
        deduped.append(p)
    clean = deduped

    # 3. IQR outlier removal
    if len(clean) >= 4:
        outlier_indices: set = set()
        for f in numeric_fields:
            vals = sorted(p[f] for p in clean)
            q1 = vals[len(vals) // 4]
            q3 = vals[(3 * len(vals)) // 4]
            iqr = q3 - q1
            if iqr == 0:
                continue
            lo = q1 - 1.5 * iqr
            hi = q3 + 1.5 * iqr
            for idx, p in enumerate(clean):
                v = p[f]
                if v < lo or v > hi:
                    outlier_indices.add(idx)
        # Remove in reverse order
        for idx in sorted(outlier_indices, reverse=True):
            clean.pop(idx)
            removed_outliers += 1

    # Build X, y arrays
    # Order: eficiencia, acionamentos, contatos, cpc, conversao
    X = np.array([
        [p["eficiencia"], p["acionamentos"], p["contatos"], p["cpc"], p["conversao"]]
        for p in clean
    ], dtype=np.float64)

    y = np.array([p["valor"] for p in clean], dtype=np.float64)

    meta = CleaningMeta(
        raw_count=raw_count,
        clean_count=len(clean),
        removed_nulls=removed_nulls,
        removed_duplicates=removed_duplicates,
        removed_outliers=removed_outliers,
    )

    return X, y, meta


# ── Standard errors for OLS coefficients ────────────────────────────────────


def _ols_standard_errors(X: np.ndarray, y: np.ndarray, model: LinearRegression) -> Tuple[np.ndarray, float]:
    """
    Compute standard errors for OLS coefficients.
    SE(β_j) = σ̂ · sqrt(diag((XᵀX)⁻¹)_jj)
    """
    n, p = X.shape
    y_pred = model.predict(X)
    residuals = y - y_pred
    sigma2 = float(np.sum(residuals ** 2) / max(1, n - p))
    # Add intercept column
    X_aug = np.column_stack([np.ones(n), X])
    try:
        XtX_inv = np.linalg.inv(X_aug.T @ X_aug)
        se = np.sqrt(sigma2 * np.diag(XtX_inv))
        return se, float(np.sqrt(sigma2))
    except np.linalg.LinAlgError:
        return np.zeros(p + 1), float(np.sqrt(sigma2))


# ── Adjusted R² ─────────────────────────────────────────────────────────────


def _adj_r2(r2: float, n: int, p: int) -> float:
    if n <= p + 1:
        return 0.0
    return float(1.0 - (1.0 - r2) * (n - 1) / (n - p - 1))


# ── Model fitting ───────────────────────────────────────────────────────────


def _fit_single_model(
    X: np.ndarray,
    y: np.ndarray,
    model_id: str,
    label: str,
    description: str,
    drawable: bool,
    feature_indices: List[int],
    feature_names: List[str],
    test_size: float = 0.3,
    random_state: int = 42,
) -> ModelResult:
    """Fit a single model with train/test split and return structured result."""
    n = X.shape[0]
    if n < 4:
        return ModelResult(
            id=model_id, label=label, description=description, drawable=drawable,
            r2_train=0.0, r2_test=0.0, adj_r2=0.0, cv_train_n=n, cv_test_n=0,
            intercept=0.0, intercept_se=0.0,
            coefficients=[CoefEstimate(name=nm, value=0.0, se=0.0) for nm in feature_names],
        )

    X_sub = X[:, feature_indices]
    p = len(feature_indices)

    X_train, X_test, y_train, y_test = train_test_split(
        X_sub, y, test_size=test_size, random_state=random_state,
    )

    model = LinearRegression()
    model.fit(X_train, y_train)

    r2_train = float(model.score(X_train, y_train))
    r2_test = float(model.score(X_test, y_test)) if len(X_test) > 0 else 0.0
    adj_r2 = _adj_r2(r2_train, len(X_train), p)

    se, residual_se = _ols_standard_errors(X_sub, y, model)
    intercept_se = float(se[0]) if len(se) > 0 else 0.0

    coefficients = [
        CoefEstimate(
            name=feature_names[i],
            value=float(model.coef_[i]) if p > 1 else float(model.coef_[0]) if p == 1 else 0.0,
            se=float(se[i + 1]) if len(se) > i + 1 else 0.0,
        )
        for i in range(p)
    ] if p > 0 else []

    # For single-predictor case, coef_ is a scalar wrapped in array
    if p == 1 and len(coefficients) == 1:
        pass  # Already handled above

    return ModelResult(
        id=model_id, label=label, description=description, drawable=drawable,
        r2_train=r2_train, r2_test=r2_test, adj_r2=adj_r2,
        cv_train_n=len(X_train), cv_test_n=len(X_test),
        intercept=float(model.intercept_),
        intercept_se=intercept_se,
        coefficients=coefficients,
    )


def fit_all_models(pontos: List[Dict[str, Any]]) -> RegressionResponse:
    """
    Clean data and fit all 5 regression models.
    Returns structured response for the frontend RegressionView.
    """
    X, y, meta = _clean_data(pontos)
    n = X.shape[0]

    if n < 3:
        return RegressionResponse(meta=meta, modelos=[])

    modelos: List[ModelResult] = []

    # 1. Simple: y ~ eficiencia
    modelos.append(_fit_single_model(
        X, y, "simple", "Simples", "valor ~ eficiência", True,
        [0], ["x"],
    ))

    # 2. Log-Log: ln(y) ~ ln(eficiencia)
    eps = 1e-9
    X_log = np.log(np.maximum(X[:, [0]], eps))
    y_log = np.log(np.maximum(y, eps))
    modelos.append(_fit_single_model(
        X_log, y_log, "loglog", "Log-Log", "ln(valor) ~ ln(eficiência)", True,
        [0], ["ln(x)"],
    ))

    # 3. Polynomial (degree 2): y ~ eficiencia + eficiencia²
    poly = PolynomialFeatures(degree=2, include_bias=False)
    X_poly = poly.fit_transform(X[:, [0]])  # [eficiencia, eficiencia²]
    modelos.append(_fit_single_model(
        X_poly, y, "poly2", "Polinomial", "valor ~ eficiência + eficiência²", True,
        [0, 1], ["x", "x²"],
    ))

    # 4. Volume: y ~ acionamentos + contatos (indices 1, 2)
    modelos.append(_fit_single_model(
        X, y, "volume", "Volume", "valor ~ acionamentos + contatos", False,
        [1, 2], ["acionamentos", "contatos"],
    ))

    # 5. Full: y ~ acionamentos + contatos + cpc + conversao (indices 1-4)
    modelos.append(_fit_single_model(
        X, y, "full", "Completo", "valor ~ acionam. + contatos + cpc + conv.", False,
        [1, 2, 3, 4], ["acionamentos", "contatos", "cpc", "conversao"],
    ))

    return RegressionResponse(meta=meta, modelos=modelos)


# ── JSON serialization helpers ──────────────────────────────────────────────


def regression_response_to_dict(resp: RegressionResponse) -> Dict[str, Any]:
    """Convert RegressionResponse to JSON-serializable dict."""
    return {
        "meta": {
            "raw_count": resp.meta.raw_count,
            "clean_count": resp.meta.clean_count,
            "removed_nulls": resp.meta.removed_nulls,
            "removed_duplicates": resp.meta.removed_duplicates,
            "removed_outliers": resp.meta.removed_outliers,
        },
        "modelos": [
            {
                "id": m.id,
                "label": m.label,
                "description": m.description,
                "drawable": m.drawable,
                "r2_train": round(m.r2_train, 6),
                "r2_test": round(m.r2_test, 6),
                "adj_r2": round(m.adj_r2, 6),
                "cv_train_n": m.cv_train_n,
                "cv_test_n": m.cv_test_n,
                "intercept": round(m.intercept, 6),
                "intercept_se": round(m.intercept_se, 6),
                "coefficients": [
                    {"name": c.name, "value": round(c.value, 6), "se": round(c.se, 6)}
                    for c in m.coefficients
                ],
            }
            for m in resp.modelos
        ],
    }
