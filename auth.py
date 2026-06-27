"""Autenticação, perfis e trilha de auditoria persistidos no PostgreSQL."""

from __future__ import annotations

import argparse
import getpass
import os
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from werkzeug.security import check_password_hash, generate_password_hash


ROLES = {"admin", "operador"}


class AuthStore:
    def __init__(self, database_url: str) -> None:
        if not database_url:
            raise RuntimeError("DATABASE_URL não foi configurada.")
        self._pool = ConnectionPool(
            database_url,
            min_size=2,
            max_size=10,
            kwargs={"row_factory": dict_row},
        )

    def _connect(self) -> psycopg.Connection:
        return self._pool.connection()

    def initialize(self) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        id BIGSERIAL PRIMARY KEY,
                        email TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        role TEXT NOT NULL CHECK(role IN ('admin', 'operador')),
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        last_seen_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                cursor.execute(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ"
                )
                cursor.execute(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT ''"
                )
                cursor.execute(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE"
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS audit_logs (
                        id BIGSERIAL PRIMARY KEY,
                        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
                        event TEXT NOT NULL,
                        details TEXT,
                        ip_address TEXT,
                        created_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx "
                    "ON audit_logs (created_at DESC)"
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx "
                    "ON audit_logs (user_id)"
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS audit_logs_event_idx "
                    "ON audit_logs (event)"
                )

    def create_user(
        self,
        email: str,
        password: str,
        role: str,
        display_name: str = "",
        must_change_password: bool = False,
    ) -> int:
        email = email.strip().lower()
        display_name = display_name.strip()
        if role not in ROLES:
            raise ValueError("Perfil inválido. Use admin ou operador.")
        if not email or "@" not in email:
            raise ValueError("Informe um e-mail válido.")
        if len(password) < 12:
            raise ValueError("A senha deve ter ao menos 12 caracteres.")

        now = _utc_now()
        try:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO users (email, password_hash, role, display_name, must_change_password, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (email, generate_password_hash(password), role, display_name, must_change_password, now, now),
                    )
                    return int(cursor.fetchone()["id"])
        except psycopg.errors.UniqueViolation as error:
            raise ValueError("Já existe um usuário com esse e-mail.") from error

    def update_user(
        self,
        user_id: int,
        *,
        email: str | None = None,
        role: str | None = None,
        is_active: bool | None = None,
        password: str | None = None,
        display_name: str | None = None,
        must_change_password: bool | None = None,
    ) -> dict:
        if email is not None:
            email = email.strip().lower()
            if not email or "@" not in email:
                raise ValueError("Informe um e-mail válido.")
        if role is not None and role not in ROLES:
            raise ValueError("Perfil inválido. Use admin ou operador.")
        if password is not None and len(password) < 12:
            raise ValueError("A senha deve ter ao menos 12 caracteres.")

        assignments = []
        parameters: list[object] = []
        if email is not None:
            assignments.append("email = %s")
            parameters.append(email)
        if role is not None:
            assignments.append("role = %s")
            parameters.append(role)
        if is_active is not None:
            assignments.append("is_active = %s")
            parameters.append(is_active)
        if password is not None:
            assignments.append("password_hash = %s")
            parameters.append(generate_password_hash(password))
        if display_name is not None:
            assignments.append("display_name = %s")
            parameters.append(display_name.strip())
        if must_change_password is not None:
            assignments.append("must_change_password = %s")
            parameters.append(must_change_password)
        if not assignments:
            raise ValueError("Nenhuma alteração foi informada.")

        assignments.append("updated_at = %s")
        parameters.extend([_utc_now(), user_id])
        try:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        f"""
                        UPDATE users
                        SET {", ".join(assignments)}
                        WHERE id = %s
                        RETURNING id, email, role, is_active, display_name, created_at, updated_at
                        """,
                        parameters,
                    )
                    user = cursor.fetchone()
        except psycopg.errors.UniqueViolation as error:
            raise ValueError("Já existe um usuário com esse e-mail.") from error
        if not user:
            raise ValueError("Usuário não encontrado.")
        return dict(user)

    def verify_credentials(self, email: str, password: str) -> dict | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, email, password_hash, role, is_active, must_change_password
                    FROM users
                    WHERE LOWER(email) = LOWER(%s)
                    """,
                    (email.strip(),),
                )
                user = cursor.fetchone()
        if not user or not user["is_active"] or not check_password_hash(user["password_hash"], password):
            return None
        return {
            "id": user["id"],
            "email": user["email"],
            "role": user["role"],
            "must_change_password": user["must_change_password"],
        }

    def get_user(self, user_id: int) -> dict | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id, email, role, is_active, display_name FROM users WHERE id = %s",
                    (user_id,),
                )
                user = cursor.fetchone()
        if not user or not user["is_active"]:
            return None
        return dict(user)

    def touch_user(self, user_id: int) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE users
                    SET last_seen_at = %s
                    WHERE id = %s
                      AND (last_seen_at IS NULL OR last_seen_at < %s - INTERVAL '30 seconds')
                    """,
                    (_utc_now(), user_id, _utc_now()),
                )

    def mark_user_offline(self, user_id: int) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE users SET last_seen_at = NULL WHERE id = %s",
                    (user_id,),
                )

    def log(
        self,
        event: str,
        ip_address: str | None,
        user_id: int | None = None,
        details: str | None = None,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO audit_logs (user_id, event, details, ip_address, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (user_id, event, details, ip_address, _utc_now()),
                )

    def list_audit_logs(
        self,
        page: int = 1,
        per_page: int = 25,
        event: str = "",
        search: str = "",
    ) -> dict:
        page = max(page, 1)
        per_page = min(max(per_page, 1), 100)
        conditions = []
        parameters: list[object] = []
        if event:
            conditions.append("logs.event = %s")
            parameters.append(event)
        if search:
            conditions.append(
                "(users.email ILIKE %s OR logs.details ILIKE %s OR logs.ip_address ILIKE %s)"
            )
            term = f"%{search}%"
            parameters.extend([term, term, term])
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT COUNT(*) AS total
                    FROM audit_logs logs
                    LEFT JOIN users ON users.id = logs.user_id
                    {where}
                    """,
                    parameters,
                )
                total = cursor.fetchone()["total"]
                cursor.execute(
                    f"""
                    SELECT logs.id, logs.event, logs.details, logs.ip_address,
                           logs.created_at, users.email
                    FROM audit_logs logs
                    LEFT JOIN users ON users.id = logs.user_id
                    {where}
                    ORDER BY logs.id DESC
                    LIMIT %s OFFSET %s
                    """,
                    [*parameters, per_page, (page - 1) * per_page],
                )
                rows = cursor.fetchall()

        return {
            "rows": [dict(row) for row in rows],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": max((total + per_page - 1) // per_page, 1),
        }

    def audit_summary(self) -> dict:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) AS total FROM audit_logs")
                total = cursor.fetchone()["total"]
                cursor.execute(
                    "SELECT event, COUNT(*) AS total FROM audit_logs GROUP BY event"
                )
                grouped = {row["event"]: row["total"] for row in cursor.fetchall()}
                cursor.execute(
                    "SELECT COUNT(*) AS total FROM users WHERE is_active = TRUE"
                )
                active_users = cursor.fetchone()["total"]
                cursor.execute("SELECT DISTINCT event FROM audit_logs ORDER BY event")
                events = [row["event"] for row in cursor.fetchall()]
        return {
            "total_events": total,
            "successful_logins": grouped.get("login_succeeded", 0),
            "failed_logins": grouped.get("login_failed", 0),
            "matrix_reads": grouped.get("commercial_matrix_read", 0),
            "active_users": active_users,
            "events": events,
        }

    def list_users(self) -> list[dict]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT users.id, users.email, users.role, users.is_active,
                           users.display_name, users.created_at,
                           MAX(audit_logs.created_at) AS last_activity
                    FROM users
                    LEFT JOIN audit_logs ON audit_logs.user_id = users.id
                    GROUP BY users.id
                    ORDER BY users.email
                    """
                )
                rows = cursor.fetchall()
        return [dict(row) for row in rows]

    def user_activity(self, online_user_ids: set[int] | None = None) -> dict:
        online_user_ids = online_user_ids or set()
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT users.id, users.email, users.role, users.is_active,
                           users.display_name, users.last_seen_at,
                           COUNT(audit_logs.id) FILTER (
                               WHERE audit_logs.event = 'table_processed'
                           ) AS tables_processed,
                           MAX(audit_logs.created_at) FILTER (
                               WHERE audit_logs.event = 'table_processed'
                           ) AS last_table_processed_at
                    FROM users
                    LEFT JOIN audit_logs ON audit_logs.user_id = users.id
                    GROUP BY users.id
                    ORDER BY tables_processed DESC, users.email
                    """
                )
                users = [dict(row) for row in cursor.fetchall()]
                cursor.execute(
                    """
                    SELECT
                        COUNT(*) FILTER (WHERE event = 'table_processed') AS total_processed,
                        COUNT(*) FILTER (
                            WHERE event = 'table_processed'
                              AND created_at >= CURRENT_DATE
                        ) AS processed_today
                    FROM audit_logs
                    """
                )
                totals = dict(cursor.fetchone())

        for user in users:
            user["is_online"] = user["id"] in online_user_ids
        users.sort(key=lambda user: (not user["is_online"], -user["tables_processed"], user["email"]))

        return {
            "users": users,
            "summary": {
                **totals,
                "online_users": sum(1 for user in users if user["is_online"]),
                "total_users": len(users),
            },
            "online_window_minutes": 5,
        }


    def productivity_report(self, date_from: str, date_to: str) -> list[dict]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        users.email,
                        users.display_name,
                        DATE(logs.created_at AT TIME ZONE 'America/Sao_Paulo') AS report_date,
                        MIN(logs.created_at AT TIME ZONE 'America/Sao_Paulo') AS first_at,
                        MAX(logs.created_at AT TIME ZONE 'America/Sao_Paulo') AS last_at,
                        COUNT(*) AS simulations,
                        EXTRACT(EPOCH FROM
                            MAX(logs.created_at) - MIN(logs.created_at)
                        ) / NULLIF(COUNT(*) - 1, 0) AS avg_seconds
                    FROM audit_logs logs
                    JOIN users ON users.id = logs.user_id
                    WHERE logs.event = 'table_processed'
                      AND DATE(logs.created_at AT TIME ZONE 'America/Sao_Paulo') >= %s
                      AND DATE(logs.created_at AT TIME ZONE 'America/Sao_Paulo') <= %s
                    GROUP BY users.id, users.email, users.display_name,
                             DATE(logs.created_at AT TIME ZONE 'America/Sao_Paulo')
                    ORDER BY report_date DESC, users.email
                    """,
                    (date_from, date_to),
                )
                rows = []
                for row in cursor.fetchall():
                    item = dict(row)
                    if item.get("report_date"):
                        item["report_date"] = str(item["report_date"])
                    if item.get("first_at"):
                        item["first_at"] = item["first_at"].isoformat()
                    if item.get("last_at"):
                        item["last_at"] = item["last_at"].isoformat()
                    if item.get("avg_seconds") is not None:
                        item["avg_seconds"] = float(item["avg_seconds"])
                    rows.append(item)
                return rows


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_user_from_cli() -> None:
    parser = argparse.ArgumentParser(description="Cria um usuário no PostgreSQL.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", choices=sorted(ROLES), default="operador")
    args = parser.parse_args()
    password = getpass.getpass("Senha (mín. 12 caracteres): ")
    confirm_password = getpass.getpass("Confirme a senha: ")
    if password != confirm_password:
        raise SystemExit("As senhas não conferem.")

    store = AuthStore(os.getenv("DATABASE_URL", ""))
    store.initialize()
    store.create_user(args.email, password, args.role)
    print(f"Usuário {args.email} criado com perfil {args.role}.")


if __name__ == "__main__":
    create_user_from_cli()
