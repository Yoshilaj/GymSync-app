"""
A tiny in-memory stand-in for the Supabase AsyncClient.

Only the slice of PostgREST that app/billing/store.py actually uses:
`.table(name).select(cols).eq(k, v).limit(n).execute()`, `.upsert(row,
on_conflict=...)`, and `.rpc(fn, params)`. Enough to test ownership binding,
monotonic upserts and quota arithmetic without a database.

Composite primary keys are passed in explicitly rather than inferred, because
the composite keys ARE the thing under test — Sandbox and Xcode reuse
transaction ids like '0' and '1' across users, and a fake that quietly keyed on
transaction_id alone would hide exactly the collision the schema exists to
prevent.
"""
from __future__ import annotations

from typing import Any

PRIMARY_KEYS: dict[str, tuple[str, ...]] = {
    "apple_transactions": ("environment", "transaction_id"),
    "apple_subscription_owners": ("environment", "original_transaction_id"),
    "feature_usage": ("user_id", "feature", "period_key"),
    # Surrogate key — the id is generated on insert, like gen_random_uuid() does.
    "personal_chunks": ("id",),
    "injuries": ("id",),
    "workout_sessions": ("id",),
    # Migration 012's unique slot key, reproduced EXACTLY — user_id is deliberately
    # not part of it. That omission is what lets an unchecked write against another
    # user's session_id overwrite their set instead of inserting a new row, so a
    # fake that keyed on user_id too would hide the very thing the ownership tests
    # are here to prove.
    "completed_sets": ("session_id", "exercise_name", "set_index"),
    # Migration 019's unique key — one override per (workout, calendar day).
    "plan_workout_overrides": ("plan_workout_id", "day"),
}

# Tables whose primary key the DATABASE fills in, so an insert without one is normal
# rather than a collision on None.
_GENERATED_IDS = {"personal_chunks", "injuries", "workout_sessions"}


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Query:
    def __init__(
        self, rows: list[dict], table: str, blind: bool = False, db: "FakeDB | None" = None
    ) -> None:
        self._rows = rows
        self._table = table
        # Simulates a read that raced: returns nothing even though rows exist,
        # which is exactly the window a concurrent claim slips through.
        #
        # ONE-SHOT — the window closes after the first read. A permanently blind
        # table would also blind the post-conflict recovery read, which in a real
        # database always sees the committed row.
        self._blind = blind
        self._db = db
        self._filters: list[tuple[str, Any]] = []
        self._ifilters: list[tuple[str, Any]] = []
        self._in_filters: list[tuple[str, set[str]]] = []
        self._limit: int | None = None
        self._pending: dict | None = None
        self._mode = "select"
        # None | "strict" (.single(), raises on no row) | "maybe" (.maybe_single()).
        self._single: str | None = None

    # ── builders ────────────────────────────────────────────────────────────
    def select(self, *_cols: str) -> "_Query":
        self._mode = "select"
        return self

    def eq(self, column: str, value: Any) -> "_Query":
        self._filters.append((column, value))
        return self

    def ilike(self, column: str, value: Any) -> "_Query":
        # Catalog lookups match display names case-insensitively. No wildcard
        # handling: every caller passes a bare name, not a pattern.
        self._ifilters.append((column, value))
        return self

    def limit(self, n: int) -> "_Query":
        self._limit = n
        return self

    def order(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    def upsert(self, row: dict, on_conflict: str | None = None) -> "_Query":
        self._mode = "upsert"
        self._pending = row
        return self

    def insert(self, row: dict) -> "_Query":
        self._mode = "insert"
        self._pending = row
        return self

    def update(self, patch: dict) -> "_Query":
        self._mode = "update"
        self._pending = patch
        return self

    def delete(self) -> "_Query":
        self._mode = "delete"
        return self

    def in_(self, column: str, values: list) -> "_Query":
        # Modeled as a filter with set semantics, same string-coercion rule as eq.
        self._in_filters.append((column, {str(v) for v in values}))
        return self

    def single(self) -> "_Query":
        self._single = "strict"
        return self

    def maybe_single(self) -> "_Query":
        self._single = "maybe"
        return self

    # ── execution ───────────────────────────────────────────────────────────
    def _matches(self, row: dict) -> bool:
        return all(
            str(row.get(c)) == str(v) for c, v in self._filters
        ) and all(
            str(row.get(c)).lower() == str(v).lower() for c, v in self._ifilters
        ) and all(
            str(row.get(c)) in allowed for c, allowed in self._in_filters
        )

    async def execute(self) -> _Result:
        if self._mode in ("upsert", "insert"):
            assert self._pending is not None
            if self._table in _GENERATED_IDS and self._pending.get("id") is None:
                self._pending = {
                    **self._pending,
                    "id": f"{self._table}-{len(self._rows) + 1}",
                }
            key_cols = PRIMARY_KEYS[self._table]
            key = tuple(str(self._pending.get(c)) for c in key_cols)
            for i, existing in enumerate(self._rows):
                if tuple(str(existing.get(c)) for c in key_cols) == key:
                    if self._mode == "insert":
                        raise RuntimeError(f"duplicate key in {self._table}: {key}")
                    self._rows[i] = {**existing, **self._pending}
                    return _Result([self._rows[i]])
            self._rows.append(dict(self._pending))
            return _Result([self._pending])

        if self._mode == "delete":
            # PostgREST returns the deleted rows; deleting nothing is not an
            # error — ownership filters fail safe the same way updates do.
            gone = [r for r in self._rows if self._matches(r)]
            self._rows[:] = [r for r in self._rows if not self._matches(r)]
            return _Result(gone)

        if self._mode == "update":
            assert self._pending is not None
            touched = []
            for i, existing in enumerate(self._rows):
                if self._matches(existing):
                    self._rows[i] = {**existing, **self._pending}
                    touched.append(self._rows[i])
            # PostgREST updates nothing when the filters match nothing — it does
            # not error. A scoped update that hits no row is how the ownership
            # filters fail safe, so the fake must model it the same way.
            return _Result(touched)

        if self._blind:
            if self._db is not None:
                self._db.blind_selects.discard(self._table)
            return _Result([])
        found = [r for r in self._rows if self._matches(r)]
        if self._limit is not None:
            found = found[: self._limit]

        if self._single is not None:
            if not found:
                if self._single == "maybe":
                    return _Result(None)
                raise RuntimeError(
                    f"no rows returned for .single() on {self._table}"
                )
            return _Result(found[0])
        return _Result(found)


class _FakeAdmin:
    """Just enough of db.auth.admin for the ownership rules."""

    def __init__(self, db: "FakeDB") -> None:
        self._db = db

    async def get_user_by_id(self, user_id: str):
        if user_id in self._db.deleted_users:
            raise RuntimeError(f"User not found: {user_id}")
        return type("Res", (), {"user": {"id": user_id}})()


class _FakeAuth:
    def __init__(self, db: "FakeDB") -> None:
        self.admin = _FakeAdmin(db)


class FakeDB:
    """`tables` is public so tests can seed state and assert on it directly."""

    def __init__(self) -> None:
        self.tables: dict[str, list[dict]] = {name: [] for name in PRIMARY_KEYS}
        # Accounts that have been deleted. Ownership treats a token naming a
        # LIVE account as someone else's property, and a token naming a deleted
        # one as an unclaimed subscription — so tests must be able to say which.
        self.deleted_users: set[str] = set()
        # Table names whose SELECTs return empty regardless of contents.
        self.blind_selects: set[str] = set()
        self.auth = _FakeAuth(self)

    def table(self, name: str) -> _Query:
        return _Query(
            self.tables.setdefault(name, []),
            name,
            blind=name in self.blind_selects,
            db=self,
        )

    def rpc(self, fn: str, params: dict) -> "_Rpc":
        return _Rpc(self, fn, params)


class _Rpc:
    def __init__(self, db: FakeDB, fn: str, params: dict) -> None:
        self._db, self._fn, self._params = db, fn, params

    async def execute(self) -> _Result:
        if self._fn != "increment_feature_usage":
            raise NotImplementedError(self._fn)
        p = self._params
        key = (p["p_user_id"], p["p_feature"], p["p_period_key"])
        rows = self._db.tables["feature_usage"]
        for row in rows:
            if (row["user_id"], row["feature"], row["period_key"]) == key:
                row["count"] += p.get("p_delta", 1)
                return _Result(row["count"])
        count = p.get("p_delta", 1)
        rows.append(
            {
                "user_id": key[0],
                "feature": key[1],
                "period_key": key[2],
                "count": count,
            }
        )
        return _Result(count)
