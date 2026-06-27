"""Testes unitários para o parser de tabelas."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parsing import (
    clean_source_text,
    parse_currency_br,
    parse_int_value,
    parse_row,
    parse_table_text,
    parse_tabular_text,
    split_rows,
)


class TestParseCurrencyBr:
    def test_standard_value(self):
        assert parse_currency_br("R$ 1.234,56") == 1234.56

    def test_no_prefix(self):
        assert parse_currency_br("267,04") == 267.04

    def test_empty(self):
        assert parse_currency_br("") is None

    def test_integer(self):
        assert parse_currency_br("1000") == 1000.0


class TestParseIntValue:
    def test_digits(self):
        assert parse_int_value("120") == 120

    def test_with_noise(self):
        assert parse_int_value("  45x ") == 45

    def test_empty(self):
        assert parse_int_value("") is None


class TestCleanSourceText:
    def test_removes_header(self):
        raw = "Consignatária Situação ADE Serviço Prestações Pagas Prestação Deferimento Quitação Ultimo Desconto Ultima Parcela\nDATA"
        assert clean_source_text(raw) == "DATA"

    def test_collapses_whitespace(self):
        assert clean_source_text("a   b\n\n\nc") == "a b\nc"


class TestSplitRows:
    def test_empty(self):
        assert split_rows("") == []

    def test_multiline(self):
        lines = "LINHA1\nLINHA2\nLINHA3"
        result = split_rows(lines)
        assert len(result) == 3


class TestParseRow:
    SAMPLE = (
        "BANCO - DIGIO [1684] Deferida 8810971 EMPRESTIMO - 1 - 5017 "
        "120 3 267,04 22/12/2025 01/03/2026 01/12/2035"
    )

    def test_parse_sample(self):
        parsed = parse_row(self.SAMPLE)
        assert parsed is not None
        assert parsed.consignataria == "BANCO - DIGIO [1684]"
        assert parsed.situacao == "Deferida"
        assert parsed.prestacoes == 120
        assert parsed.pagas == 3
        assert parsed.prestacao == 267.04
        assert parsed.deferimento == "22/12/2025"

    def test_insufficient_dates(self):
        assert parse_row("alguma coisa sem datas") is None


class TestParseTableText:
    MULTI_SAMPLE = (
        "BANCO - DIGIO [1684] Deferida 8810971 EMPRESTIMO - 1 - 5017 120 3 267,04 22/12/2025 01/03/2026 01/12/2035\n"
        "BANCO - SAFRA [390] Deferida 6816218 EMPRESTIMO - 1 - 5017 96 45 785,87 03/06/2022 01/03/2026 01/06/2030"
    )

    def test_multiple_rows(self):
        rows = parse_table_text(self.MULTI_SAMPLE)
        assert len(rows) == 2
        assert rows[0]["consignataria"] == "BANCO - DIGIO [1684]"
        assert rows[1]["consignataria"] == "BANCO - SAFRA [390]"
        assert rows[1]["prestacoes"] == 96
        assert rows[1]["pagas"] == 45

    def test_empty(self):
        assert parse_table_text("") == []


class TestParseTabularText:
    TAB_SAMPLE = (
        "Consignatária\tSituação\tADE\tServiço\tPrestações\tPagas\tPrestação\tDeferimento\tUltimo Desconto\tUltima Parcela\n"
        "BANCO DIGIO\tDeferida\t123\tEmprestimo\t120\t10\tR$ 500,00\t01/01/2024\t01/06/2025\t01/01/2034"
    )

    def test_tab_format(self):
        rows = parse_tabular_text(self.TAB_SAMPLE)
        assert len(rows) == 1
        assert rows[0]["consignataria"] == "BANCO DIGIO"
        assert rows[0]["prestacoes"] == 120
        assert rows[0]["pagas"] == 10
        assert rows[0]["prestacao"] == 500.0

    def test_not_tabular(self):
        assert parse_tabular_text("just some text") == []
