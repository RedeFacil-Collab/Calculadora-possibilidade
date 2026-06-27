"""Leitura autenticada e cacheada das informações comerciais do Google Sheets."""

from __future__ import annotations

import os
import threading
import time
import unicodedata
from pathlib import Path

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build


SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
COMMERCIAL_MATRIX_RANGE = "Matriz_Comercial!A:J"
CACHE_TTL_SECONDS = 300


class SheetsConfigurationError(RuntimeError):
    pass


class CommercialMatrixService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cached_rows: list[dict] = []
        self._cache_expires_at = 0.0

    def list_rows(self, bank: str | None = None, operation: str | None = None) -> list[dict]:
        rows = self._get_rows()
        normalized_bank = _normalize(bank) if bank else ""
        normalized_operation = _normalize(operation) if operation else ""
        return [
            row
            for row in rows
            if (not normalized_bank or _normalize(row["banco"]) == normalized_bank)
            and (not normalized_operation or _normalize(row["operacao"]) == normalized_operation)
        ]

    def list_filters(self) -> dict[str, list[str]]:
        rows = self._get_rows()
        return {
            "bancos": sorted({row["banco"] for row in rows}, key=str.casefold),
            "operacoes": sorted({row["operacao"] for row in rows}, key=str.casefold),
        }

    def _get_rows(self) -> list[dict]:
        if time.monotonic() < self._cache_expires_at:
            return self._cached_rows

        with self._lock:
            if time.monotonic() < self._cache_expires_at:
                return self._cached_rows

            self._cached_rows = self._fetch_rows()
            self._cache_expires_at = time.monotonic() + CACHE_TTL_SECONDS
            return self._cached_rows

    def _fetch_rows(self) -> list[dict]:
        spreadsheet_id = os.getenv("GOOGLE_SHEET_ID")
        credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or os.getenv(
            "GOOGLE_CREDENTIALS_FILE"
        )
        if not spreadsheet_id or not credentials_path:
            raise SheetsConfigurationError("Integração Google Sheets não configurada.")

        path = Path(credentials_path)
        if not path.is_file():
            raise SheetsConfigurationError("Arquivo de credencial Google não encontrado.")

        credentials = Credentials.from_service_account_file(path, scopes=[SHEETS_SCOPE])
        service = build("sheets", "v4", credentials=credentials, cache_discovery=False)
        values = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=COMMERCIAL_MATRIX_RANGE,
            valueRenderOption="FORMATTED_VALUE",
        ).execute().get("values", [])
        if not values:
            return []

        header = {_normalize(column): index for index, column in enumerate(values[0])}
        required = {
            "banco",
            "operacao",
            "maturidade",
            "casos",
            "conservador",
            "referencia comercial",
            "% que o banco pode oferecer",
            "confiabilidade",
            "score",
            "fonte",
        }
        missing = required - set(header)
        if missing:
            raise SheetsConfigurationError("Colunas obrigatórias ausentes na Matriz_Comercial.")

        rows = []
        seen = set()
        for source_row in values[1:]:
            bank = _cell(source_row, header["banco"])
            operation = _cell(source_row, header["operacao"])
            maturity = _cell(source_row, header["maturidade"])
            reference = _cell(source_row, header["referencia comercial"])
            if not bank or not operation or not maturity:
                continue
            item = {
                "banco": bank,
                "operacao": operation,
                "maturidade": maturity,
                "casos": int(_parse_optional_decimal(_cell(source_row, header["casos"])) or 0),
                "conservador": _parse_optional_decimal(_cell(source_row, header["conservador"])),
                "referencia_comercial": _parse_optional_decimal(reference),
                "percentual_maximo_banco": _parse_optional_decimal(
                    _cell(source_row, header["% que o banco pode oferecer"])
                ),
                "confiabilidade": _cell(source_row, header["confiabilidade"]),
                "score": _cell(source_row, header["score"]),
                "fonte": _cell(source_row, header["fonte"]),
            }
            key = (item["banco"], item["operacao"], item["maturidade"])
            if key not in seen:
                rows.append(item)
                seen.add(key)
        return rows


def _cell(row: list[str], index: int) -> str:
    return str(row[index]).strip() if index < len(row) else ""


def _normalize(value: str) -> str:
    return " ".join(
        "".join(
            character
            for character in unicodedata.normalize("NFD", str(value).strip().casefold())
            if unicodedata.category(character) != "Mn"
        ).split()
    )


def _parse_decimal(value: str) -> float:
    cleaned = value.replace("%", "").strip()
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    return float(cleaned)


def _parse_optional_decimal(value: str) -> float | None:
    return _parse_decimal(value) if value.strip() else None
