from typing import List, Optional, Tuple


def sql_in(values: Tuple) -> str:
    """Returns string in format '(1, 3, 12)' for use in IN clause."""
    return "(" + ", ".join(str(v) for v in values) + ")"


def quote_ident(identifier: str) -> str:
    """Escapes a SQL identifier (schema/table/column) with brackets."""
    return "[" + identifier.replace("]", "]]") + "]"


def normalize_assessoria_filter(assessoria: Optional[str]) -> Tuple[str, str]:
    assessoria_applied = "todos"
    assessoria_token = ""
    if assessoria and assessoria.strip().lower() != "todos":
        assessoria_applied = assessoria.strip()
        assessoria_token = assessoria_applied.split(":")[-1].strip().upper()
    return assessoria_applied, assessoria_token


def build_assessoria_clause(assessoria_token: str, user_alias: str = "U") -> str:
    if not assessoria_token:
        return ""
    return (
        f" AND (UPPER(LTRIM(RTRIM({user_alias}.CHAVE))) LIKE ?"
        f" OR UPPER(LTRIM(RTRIM({user_alias}.NOME))) LIKE ?)"
    )


def build_assessoria_params(assessoria_token: str, repetitions: int = 1) -> Tuple[str, ...]:
    if not assessoria_token:
        return ()
    like_token = f"%{assessoria_token}%"
    params: List[str] = []
    for _ in range(repetitions):
        params.extend((like_token, like_token))
    return tuple(params)
