import json
import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import List

from flask import Flask, jsonify, redirect, render_template, request, url_for
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DISCOUNTS_FILE = DATA_DIR / "discounts.json"
BANK_FACTORS_FILE = DATA_DIR / "bank_factors.json"
BANK_LOGOS_FILE = DATA_DIR / "bank_logos.json"
BANK_CATALOG_FILE = DATA_DIR / "bank_catalog.json"
BANK_LOGOS_DIR = BASE_DIR / "static" / "bank-logos"
ALLOWED_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".svg"}

DEFAULT_DISCOUNTS = [
    {"name": "BanriSul - Crescente", "percent": 0.0},
    {"name": "BanriSul - Decrescente", "percent": 18.0},
    {"name": "BanriSul - Quitação", "percent": 20.0},
    {"name": "BB - Crescente", "percent": 4.0},
    {"name": "BB - Decrescente", "percent": 10.0},
    {"name": "BB - Quitação", "percent": 12.0},
    {"name": "BMG - Crescente", "percent": 0.0},
    {"name": "BMG - Decrescente", "percent": 12.0},
    {"name": "BMG - Quitação", "percent": 20.0},
    {"name": "Bradesco - Crescente", "percent": 0.0},
    {"name": "Bradesco - Decrescente", "percent": 10.0},
    {"name": "Bradesco - Quitação", "percent": 12.0},
    {"name": "CEF - Crescente", "percent": 0.0},
    {"name": "CEF - Decrescente", "percent": 10.0},
    {"name": "CEF - Quitação", "percent": 12.0},
    {"name": "Daycoval - Crescente", "percent": 0.0},
    {"name": "Daycoval - Decrescente", "percent": 15.0},
    {"name": "Daycoval - Quitação", "percent": 20.0},
    {"name": "Digio - Crescente", "percent": 3.0},
    {"name": "Digio - Decrescente", "percent": 6.0},
    {"name": "Digio - Quitação", "percent": 15.0},
    {"name": "Inter - Crescente", "percent": 0.0},
    {"name": "Inter - Decrescente", "percent": 8.0},
    {"name": "Inter - Quitação", "percent": 12.0},
    {"name": "PAN - Crescente", "percent": 5.0},
    {"name": "PAN - Decrescente", "percent": 12.0},
    {"name": "PAN - Quitação", "percent": 18.0},
    {"name": "Safra - Crescente", "percent": 5.0},
    {"name": "Safra - Decrescente", "percent": 15.0},
    {"name": "Safra - Quitação", "percent": 20.0},
    {"name": "Santander - Crescente", "percent": 3.0},
    {"name": "Santander - Decrescente", "percent": 8.0},
    {"name": "Santander - Quitação", "percent": 15.0},
    {"name": "Sicoob - Crescente", "percent": 0.0},
    {"name": "Sicoob - Decrescente", "percent": 18.0},
    {"name": "Sicoob - Quitação", "percent": 25.0},
    {"name": "Associação - Quitação", "percent": 12.0},
]

DEFAULT_BANK_FACTORS = [
    {"bank": "Safra", "installments": 120, "factor": 0.01893, "active": True, "product": "normal"},
    {"bank": "Safra", "installments": 96, "factor": 0.02253, "active": True, "product": "normal"},
    {"bank": "Pan", "installments": 120, "factor": 0.024001, "active": True, "product": "normal"},
    {"bank": "Pan", "installments": 96, "factor": 0.025335, "active": True, "product": "normal"},
    {"bank": "Pan", "installments": 84, "factor": 0.0288085, "active": True, "product": "normal"},
    {"bank": "Daycoval", "installments": 120, "factor": 0.021692, "active": True, "product": "normal"},
    {"bank": "Daycoval", "installments": 96, "factor": 0.02407, "active": True, "product": "normal"},
    {"bank": "Daycoval", "installments": 84, "factor": 0.025301, "active": True, "product": "normal"},
    {"bank": "Daycoval", "installments": 72, "factor": 0.027843, "active": True, "product": "normal"},
    {"bank": "Daycoval", "installments": 60, "factor": 0.034357, "active": True, "product": "normal"},
    {"bank": "Daycoval", "installments": 48, "factor": 0.038199, "active": True, "product": "normal"},
    {"bank": "Santander", "installments": 120, "factor": 0.023252, "active": True, "product": "normal"},
    {"bank": "Santander", "installments": 96, "factor": 0.02496, "active": True, "product": "normal"},
    {"bank": "Santander", "installments": 84, "factor": 0.026301, "active": True, "product": "normal"},
    {"bank": "Santander", "installments": 72, "factor": 0.028202, "active": True, "product": "normal"},
    {"bank": "Santander", "installments": 60, "factor": 0.03092, "active": True, "product": "normal"},
    {"bank": "Santander", "installments": 48, "factor": 0.035865, "active": True, "product": "normal"},
    {"bank": "Santander", "installments": 36, "factor": 0.04269, "active": True, "product": "normal"},
    {"bank": "Digio", "installments": 120, "factor": 0.020741, "active": True, "product": "normal"},
    {"bank": "Digio", "installments": 96, "factor": 0.023225, "active": True, "product": "normal"},
    {"bank": "Digio", "installments": 84, "factor": 0.027818, "active": True, "product": "normal"},
    {"bank": "Digio", "installments": 72, "factor": 0.02947, "active": True, "product": "normal"},
    {"bank": "Digio", "installments": 60, "factor": 0.03194, "active": True, "product": "normal"},
    {"bank": "Digio", "installments": 48, "factor": 0.035865, "active": True, "product": "normal"},
    {"bank": "Digio", "installments": 36, "factor": 0.04269, "active": True, "product": "normal"},
]

app = Flask(__name__)


def asset_url(filename: str) -> str:
    file_path = BASE_DIR / "static" / filename
    version = int(file_path.stat().st_mtime) if file_path.exists() else 0
    return url_for("static", filename=filename, v=version)


@app.context_processor
def inject_asset_url():
    return {"asset_url": asset_url}


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


def ensure_data_files() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    BANK_LOGOS_DIR.mkdir(parents=True, exist_ok=True)
    if not DISCOUNTS_FILE.exists():
        DISCOUNTS_FILE.write_text(
            json.dumps(DEFAULT_DISCOUNTS, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    if not BANK_FACTORS_FILE.exists():
        BANK_FACTORS_FILE.write_text(
            json.dumps(DEFAULT_BANK_FACTORS, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    if not BANK_LOGOS_FILE.exists():
        BANK_LOGOS_FILE.write_text("{}", encoding="utf-8")
    if not BANK_CATALOG_FILE.exists():
        default_banks = sorted({item["bank"] for item in DEFAULT_BANK_FACTORS}, key=str.lower)
        BANK_CATALOG_FILE.write_text(
            json.dumps(default_banks, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def load_discounts() -> list[dict]:
    ensure_data_files()
    try:
        return json.loads(DISCOUNTS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return DEFAULT_DISCOUNTS


def load_discounts_raw() -> str:
    ensure_data_files()
    try:
        return DISCOUNTS_FILE.read_text(encoding="utf-8")
    except OSError:
        return json.dumps(DEFAULT_DISCOUNTS, ensure_ascii=False, indent=2)


def save_discounts(items: list[dict]) -> None:
    ensure_data_files()
    normalized = []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Cada item precisa ser um objeto com 'name' e 'percent'.")
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        percent = float(item.get("percent", 0) or 0)
        normalized.append({"name": name, "percent": percent})

    DISCOUNTS_FILE.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


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


def load_bank_factors() -> list[dict]:
    ensure_data_files()
    try:
        items = json.loads(BANK_FACTORS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        items = DEFAULT_BANK_FACTORS
    return normalize_bank_factors(items)


def save_bank_factors(items: list[dict]) -> None:
    ensure_data_files()
    BANK_FACTORS_FILE.write_text(
        json.dumps(normalize_bank_factors(items), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_bank_catalog() -> list[str]:
    ensure_data_files()
    try:
        raw = json.loads(BANK_CATALOG_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        raw = sorted({item["bank"] for item in DEFAULT_BANK_FACTORS}, key=str.lower)
    if not isinstance(raw, list):
        return []
    names = sorted(
        {str(item).strip() for item in raw if str(item).strip()},
        key=str.lower,
    )
    return names


def save_bank_catalog(items: list[str]) -> None:
    ensure_data_files()
    names = sorted({str(item).strip() for item in items if str(item).strip()}, key=str.lower)
    BANK_CATALOG_FILE.write_text(
        json.dumps(names, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def register_bank(bank: str) -> None:
    cleaned = str(bank or "").strip()
    if not cleaned:
        raise ValueError("Informe o nome do banco.")
    banks = load_bank_catalog()
    if cleaned not in banks:
        banks.append(cleaned)
        save_bank_catalog(banks)


def slugify_bank_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return normalized or "banco"


def load_bank_logos() -> dict[str, str]:
    ensure_data_files()
    try:
        raw = json.loads(BANK_LOGOS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return {str(key): str(value) for key, value in raw.items() if key and value}


def save_bank_logos(items: dict[str, str]) -> None:
    ensure_data_files()
    BANK_LOGOS_FILE.write_text(
        json.dumps(items, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_bank_logo_url(bank: str, logos: dict[str, str] | None = None) -> str:
    if logos is None:
        logos = load_bank_logos()
    filename = logos.get(bank, "").strip()
    if not filename:
        return ""
    return url_for("static", filename=f"bank-logos/{filename}")


def save_uploaded_bank_logo(bank: str, file_storage) -> None:
    if not bank.strip() or not file_storage or not file_storage.filename:
        return

    ensure_data_files()
    extension = Path(file_storage.filename).suffix.lower()
    if extension not in ALLOWED_LOGO_EXTENSIONS:
        raise ValueError("Formato de logo invalido. Use PNG, JPG, JPEG, WEBP ou SVG.")

    slug = slugify_bank_name(bank)
    filename = secure_filename(f"{slug}{extension}")
    target = BANK_LOGOS_DIR / filename

    logos = load_bank_logos()
    previous = logos.get(bank)
    if previous and previous != filename:
        previous_path = BANK_LOGOS_DIR / previous
        if previous_path.exists():
            previous_path.unlink()

    file_storage.save(target)
    logos[bank] = filename
    save_bank_logos(logos)


def build_editor_bank_groups(product: str) -> list[dict]:
    logos = load_bank_logos()
    grouped: dict[str, list[dict]] = {}
    for item in load_bank_factors():
        if item.get("product", "normal") != product:
            continue
        grouped.setdefault(item["bank"], []).append(item)

    groups = []
    all_banks = sorted(set(load_bank_catalog()) | set(grouped.keys()) | set(logos.keys()), key=str.lower)
    for bank in all_banks:
        factors = sorted(grouped.get(bank, []), key=lambda item: -item["installments"])
        groups.append(
            {
                "bank": bank,
                "logo_url": get_bank_logo_url(bank, logos),
                "factors": factors,
                "factor_count": len(factors),
                "product": product,
            }
        )
    return groups


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


def parse_table_text(raw_text: str) -> List[dict]:
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


def parse_tabular_text(raw_text: str) -> List[dict]:
    lines = [line.rstrip("\r") for line in raw_text.splitlines() if line.strip()]
    if not lines:
        return []

    headers = [cell.strip() for cell in lines[0].split("\t")]
    if "consignatária" not in headers and "consignataria" not in headers:
        if "consignataria" not in [normalize_header(header) for header in headers]:
            return []

    normalized_headers = [normalize_header(header) for header in headers]

    rows: List[dict] = []
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


@app.route("/")
def index():
    return render_template("index.html")


@app.get("/api/discounts")
def api_discounts():
    return jsonify(load_discounts())


@app.get("/api/bank-factors")
def api_bank_factors():
    logos = load_bank_logos()
    return jsonify(
        [
            {
                **item,
                "logo_url": get_bank_logo_url(item["bank"], logos),
            }
            for item in load_bank_factors()
        ]
    )


@app.post("/api/parse")
def api_parse():
    payload = request.get_json(silent=True) or {}
    return jsonify({"rows": parse_table_text(payload.get("text", ""))})


@app.route("/discounts-editor", methods=["GET", "POST"])
def discounts_editor():
    error = None
    if request.method == "POST":
        try:
            form_type = request.form.get("form_type", "discounts")
            if form_type == "add_bank":
                bank_name = request.form.get("bank_name", "").strip()
                register_bank(bank_name)
                save_uploaded_bank_logo(bank_name, request.files.get("bank_logo"))
            elif form_type == "modal_bank_logo":
                bank_name = request.form.get("modal_bank_name", "").strip()
                register_bank(bank_name)
                save_uploaded_bank_logo(bank_name, request.files.get("modal_bank_logo"))
            elif form_type == "bank_logos":
                for bank in request.form.getlist("logo_bank"):
                    save_uploaded_bank_logo(bank, request.files.get(f"logo_file_{bank}"))
            elif form_type == "bank_factors_payload":
                payload = json.loads(request.form.get("bank_factors_payload", "[]") or "[]")
                if not isinstance(payload, list):
                    raise ValueError("Payload de fatores invalido.")
                items = []
                banks = []
                for group in payload:
                    if not isinstance(group, dict):
                        continue
                    bank = str(group.get("bank", "")).strip()
                    if not bank:
                        continue
                    product = str(group.get("product", "normal") or "normal").strip().lower()
                    if product not in {"normal", "tj"}:
                        product = "normal"
                    banks.append(bank)
                    factors = group.get("factors", [])
                    if not isinstance(factors, list):
                        continue
                    for factor_item in factors:
                        if not isinstance(factor_item, dict):
                            continue
                        items.append(
                            {
                                "bank": bank,
                                "installments": factor_item.get("installments", 0),
                                "factor": factor_item.get("factor", 0),
                                "active": True,
                                "product": product,
                            }
                        )
                save_bank_catalog(load_bank_catalog() + banks)
                save_bank_factors(items)
            elif form_type == "bank_factors":
                banks = request.form.getlist("factor_bank")
                installments = request.form.getlist("factor_installments")
                factors = request.form.getlist("factor_value")
                items = []
                for index, (bank, installment, factor) in enumerate(
                    zip(banks, installments, factors)
                ):
                    cleaned_bank = bank.strip()
                    if not cleaned_bank:
                        continue
                    items.append(
                        {
                            "bank": cleaned_bank,
                            "installments": int(float(str(installment or "0").replace(",", "."))),
                            "factor": float(str(factor or "0").replace(",", ".")),
                            "active": True,
                        }
                    )
                save_bank_factors(items)
            else:
                names = request.form.getlist("discount_name")
                percents = request.form.getlist("discount_percent")
                items = []
                for name, percent in zip(names, percents):
                    cleaned_name = name.strip()
                    if not cleaned_name:
                        continue
                    items.append(
                        {
                            "name": cleaned_name,
                            "percent": float(str(percent or "0").replace(",", ".")),
                        }
                    )
                save_discounts(items)
            return redirect(url_for("discounts_editor", saved="1"))
        except ValueError as exc:
            error = str(exc)

    return render_template(
        "discounts_editor.html",
        discounts=load_discounts(),
        bank_groups_normal=build_editor_bank_groups("normal"),
        bank_groups_tj=build_editor_bank_groups("tj"),
        saved=request.args.get("saved") == "1",
        error=error,
    )


if __name__ == "__main__":
    ensure_data_files()
    app.run(host="0.0.0.0", port=5000, debug=True)
