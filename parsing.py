"""Funções de parsing de tabelas e normalização — sem dependências externas."""

import re
import unicodedata
from dataclasses import asdict, dataclass


@dataclass
class ParsedRow:
    consignataria: str
    situacao: str
    ade: str
    servico: str
    prestacoes: int | None
    pagas: int | None
    prestacao: float | None
    deferimento: str
    ultimo_desconto: str
    ultima_parcela: str


def parse_currency_br(value: str) -> float | None:
    if not value:
        return None
    cleaned = value.replace("R$", "").replace(".", "").replace(",", ".").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_int_value(value: str) -> int | None:
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    digits = re.sub(r"[^\d]", "", cleaned)
    return int(digits) if digits else None


def normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    return normalized.strip().lower()


def clean_source_text(text: str) -> str:
    text = text.replace("\r", "\n").replace("\xa0", " ")
    text = re.sub(r"[ ]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    header = r"Consignatária Situação ADE Serviço Prestações Pagas Prestação Deferimento Quitação Ultimo Desconto Ultima Parcela"
    text = re.sub(header, "", text, flags=re.IGNORECASE)
    return text.strip()


def split_rows(raw_text: str) -> list[str]:
    text = clean_source_text(raw_text)
    if not text:
        return []

    lines = [line.strip() for line in text.split("\n") if line.strip()]
    if len(lines) > 1:
        return lines
    if len(re.findall(r"\bDeferida\b", text)) <= 1:
        return [text]

    pattern = re.compile(r"(?=(?:[A-ZÀ-Ú]+(?:\s+[A-ZÀ-Ú]+)*\s*-\s*.*?\[\d+\]\s+Deferida\b))")
    matches = list(pattern.finditer(text))
    if not matches:
        return [text]

    rows = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        rows.append(text[start:end].strip())
    return rows


def parse_row(row_text: str) -> ParsedRow | None:
    date_matches = list(re.finditer(r"\d{1,2}/\d{1,2}/\d{4}", row_text))
    if len(date_matches) < 3:
        return None

    prefix = row_text[:date_matches[-3].start()].strip()
    parts = prefix.split()
    if len(parts) < 7:
        return None

    prestacao = parse_currency_br(parts[-1])
    if prestacao is None:
        return None

    numeric_trail = []
    index = len(parts) - 2
    while index >= 0 and re.fullmatch(r"\d+", parts[index]):
        numeric_trail.append(int(parts[index]))
        index -= 1
    numeric_trail.reverse()

    prestacoes = None
    pagas = None
    if len(numeric_trail) >= 3 and numeric_trail[0] >= 1000:
        prestacoes = numeric_trail[1]
        pagas = numeric_trail[2]
    elif len(numeric_trail) == 2 and numeric_trail[0] >= 1000:
        prestacoes = numeric_trail[1]
        pagas = 0
    elif len(numeric_trail) >= 2:
        prestacoes = numeric_trail[-2]
        pagas = numeric_trail[-1]
    elif len(numeric_trail) == 1:
        prestacoes = numeric_trail[0]
        pagas = 0

    count_numbers = 2 if prestacoes is not None and pagas is not None else 1 if prestacoes is not None else 0
    service_end_index = len(parts) - 2 - count_numbers

    try:
        situacao_index = parts.index("Deferida")
    except ValueError:
        return None

    return ParsedRow(
        consignataria=" ".join(parts[:situacao_index]).strip(),
        situacao=parts[situacao_index],
        ade=parts[situacao_index + 1],
        servico=" ".join(parts[situacao_index + 2 : service_end_index + 1]).strip(),
        prestacoes=prestacoes,
        pagas=pagas,
        prestacao=prestacao,
        deferimento=date_matches[-3].group(0),
        ultimo_desconto=date_matches[-2].group(0),
        ultima_parcela=date_matches[-1].group(0),
    )


def parse_table_text(raw_text: str) -> list[dict]:
    if "\t" in raw_text:
        tab_rows = parse_tabular_text(raw_text)
        if tab_rows:
            return tab_rows

    rows = []
    for row_text in split_rows(raw_text):
        parsed = parse_row(row_text)
        if parsed:
            rows.append(asdict(parsed))
    return rows


def parse_tabular_text(raw_text: str) -> list[dict]:
    lines = [line.rstrip("\r") for line in raw_text.splitlines() if line.strip()]
    if not lines:
        return []

    headers = [cell.strip() for cell in lines[0].split("\t")]
    if "consignatária" not in headers and "consignataria" not in headers:
        if "consignataria" not in [normalize_header(header) for header in headers]:
            return []

    normalized_headers = [normalize_header(header) for header in headers]

    rows: list[dict] = []
    for line in lines[1:]:
        cells = [cell.strip() for cell in line.split("\t")]
        if len(cells) < len(normalized_headers):
            cells.extend([""] * (len(normalized_headers) - len(cells)))
        row_map = dict(zip(normalized_headers, cells))
        consignataria = row_map.get("consignataria", "")
        if not consignataria:
            continue

        rows.append(
            asdict(
                ParsedRow(
                    consignataria=consignataria,
                    situacao=row_map.get("situacao", ""),
                    ade=row_map.get("ade", ""),
                    servico=row_map.get("servico", ""),
                    prestacoes=parse_int_value(row_map.get("prestacoes", "")),
                    pagas=parse_int_value(row_map.get("pagas", "")) or 0,
                    prestacao=parse_currency_br(row_map.get("prestacao", "")),
                    deferimento=row_map.get("deferimento", ""),
                    ultimo_desconto=row_map.get("ultimo desconto", ""),
                    ultima_parcela=row_map.get("ultima parcela", ""),
                )
            )
        )
    return rows


def normalize_bank_factors(items: list[dict]) -> list[dict]:
    normalized = []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError(
                "Cada fator precisa ser um objeto com 'bank', 'installments', 'factor' e 'active'."
            )
        bank = str(item.get("bank", "")).strip()
        if not bank:
            continue
        installments = int(float(item.get("installments", 0) or 0))
        factor = float(item.get("factor", 0) or 0)
        active = bool(item.get("active", True))
        product = str(item.get("product", "normal") or "normal").strip().lower()
        if product not in {"normal", "tj"}:
            product = "normal"
        if installments <= 0 or factor <= 0:
            continue
        normalized.append(
            {
                "bank": bank,
                "installments": installments,
                "factor": factor,
                "active": active,
                "product": product,
            }
        )

    normalized.sort(key=lambda item: (item["product"], item["bank"].lower(), -item["installments"]))
    return normalized


def slugify_bank_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return normalized or "banco"
