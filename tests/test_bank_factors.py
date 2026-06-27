"""Testes para normalização de fatores bancários e utilitários."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parsing import normalize_bank_factors, slugify_bank_name


class TestNormalizeBankFactors:
    def test_valid_items(self):
        items = [
            {"bank": "Safra", "installments": 120, "factor": 0.018, "active": True},
            {"bank": "Pan", "installments": 96, "factor": 0.024, "active": True},
        ]
        result = normalize_bank_factors(items)
        assert len(result) == 2
        assert all(item["product"] == "normal" for item in result)

    def test_skips_invalid(self):
        items = [
            {"bank": "", "installments": 120, "factor": 0.01},
            {"bank": "Safra", "installments": 0, "factor": 0.01},
            {"bank": "Safra", "installments": 120, "factor": 0},
        ]
        result = normalize_bank_factors(items)
        assert len(result) == 0

    def test_sorts_by_product_bank_installments(self):
        items = [
            {"bank": "Pan", "installments": 96, "factor": 0.025, "active": True, "product": "normal"},
            {"bank": "Pan", "installments": 120, "factor": 0.024, "active": True, "product": "normal"},
            {"bank": "Digio", "installments": 120, "factor": 0.02, "active": True, "product": "tj"},
        ]
        result = normalize_bank_factors(items)
        assert result[0]["bank"] == "Pan"
        assert result[0]["installments"] == 120
        assert result[1]["installments"] == 96
        assert result[2]["product"] == "tj"

    def test_normalizes_product(self):
        items = [{"bank": "Test", "installments": 60, "factor": 0.03, "product": "INVALID"}]
        result = normalize_bank_factors(items)
        assert result[0]["product"] == "normal"

    def test_rejects_non_dict(self):
        try:
            normalize_bank_factors(["not a dict"])
        except ValueError:
            pass


class TestSlugifyBankName:
    def test_simple(self):
        assert slugify_bank_name("Banco Safra") == "banco-safra"

    def test_accents(self):
        assert slugify_bank_name("Ição") == "icao"

    def test_empty(self):
        assert slugify_bank_name("") == "banco"

    def test_special_chars(self):
        assert slugify_bank_name("Pan & Cia!") == "pan-cia"
