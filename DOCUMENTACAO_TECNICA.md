# Documentação Técnica — Calculadora de Viabilidade (Flask)

## 1) Visão geral
A **Calculadora de Viabilidade** é uma aplicação web em **Flask** (backend) com **HTML/CSS/JavaScript** (frontend) que recebe uma tabela de consignações em texto (copiar/colar) e gera:

- Estruturação das linhas (parse do texto em registros).
- Cálculos por contrato (parcelas restantes, saldo devedor estimado, quitação total/avulsa).
- Aplicação de descontos configuráveis.
- Consolidação de um resumo financeiro da operação.
- Simulador por banco baseado em fatores parametrizados (por prazo e produto).

**Importante:** o sistema foi desenhado **sem login** (conforme `README.md`). O editor de parâmetros está acessível pela rota `/discounts-editor`.

---

## 2) Stack e estrutura do projeto

### 2.1 Tecnologias
- **Python 3**
- **Flask 3.1.0** (única dependência listada em `requirements.txt`)
- **Templates Jinja2** (nativo do Flask)
- **Frontend:** JavaScript puro (`static/app.js`)

### 2.2 Pastas e arquivos
- `app.py`
  - Aplicação Flask.
  - Endpoints HTTP.
  - Parse e normalização dos dados.
  - Persistência de parâmetros em JSON.
- `templates/index.html`
  - Tela principal (colar tabela, tabela de resultados, resumo e simulador por banco).
- `templates/discounts_editor.html`
  - Editor de descontos, bancos, logos e fatores (Normal/TJ).
- `static/app.js`
  - Estado da UI.
  - Cálculos (saldo, desconto, resumo, simulador por banco).
  - Renderização e bindings de eventos.
- `static/styles.css`
  - Estilos da aplicação.
- `data/discounts.json`
  - Lista de descontos `{name, percent}`.
- `data/bank_factors.json`
  - Lista de fatores por banco/prazo/produto.
- `data/bank_catalog.json`
  - Lista de bancos cadastrados (catálogo para o editor).
- `data/bank_logos.json`
  - Mapeamento `banco -> nome do arquivo`.
- `static/bank-logos/`
  - Logos enviados via upload.

---

## 3) Como rodar

### 3.1 Instalar dependências
```bash
py -3 -m pip install -r requirements.txt
```

### 3.2 Executar
```bash
py -3 app.py
```

O servidor sobe em:
- `http://localhost:5000`

Ao iniciar, `ensure_data_files()` garante a existência de `data/*.json` com defaults.

---

## 4) Arquitetura e fluxo de dados

### 4.1 Fluxo principal (tela `/`)
1. Usuário cola a tabela no `textarea` (`#source-table`).
2. Usuário clica em **Processar Tabela**.
3. Frontend chama `POST /api/parse` com `{ text }`.
4. Backend faz parse e retorna `{ rows: [...] }`.
5. Frontend:
   - adiciona campos de UI (`discountName`, `discountPercent`, `avulsoCount`),
   - calcula cada linha via `computeRow()`,
   - renderiza tabela e resumo.
6. Usuário seleciona descontos e/ou preenche avulso; o frontend recalcula e atualiza o resumo.

### 4.2 Fluxo do simulador por banco
1. Frontend carrega fatores via `GET /api/bank-factors`.
2. Usuário escolhe produto (Normal/TJ) e modo (Margem/Valor desejado) e informa valor base.
3. Frontend recalcula cards por banco/prazo usando o fator correspondente.

### 4.3 Fluxo do editor `/discounts-editor`
1. A rota renderiza a página com dados vindos de:
   - `load_discounts()`
   - `build_editor_bank_groups('normal')`
   - `build_editor_bank_groups('tj')`
2. Alterações são enviadas via `POST` com um `form_type` (ver seção 6).
3. Backend valida e persiste em JSON.

---

## 5) Endpoints (API e páginas)

### 5.1 `GET /`
- **Descrição:** renderiza a tela principal.
- **Resposta:** `templates/index.html`

### 5.2 `GET /api/discounts`
- **Descrição:** retorna lista de descontos cadastrados.
- **Resposta (JSON):**
```json
[
  {"name": "BB - Quitação", "percent": 12.0}
]
```

### 5.3 `GET /api/bank-factors`
- **Descrição:** retorna fatores bancários normalizados.
- **Resposta (JSON):**
```json
[
  {
    "bank": "Safra",
    "installments": 120,
    "factor": 0.01893,
    "active": true,
    "product": "normal",
    "logo_url": "/static/bank-logos/safra.png"
  }
]
```

### 5.4 `POST /api/parse`
- **Descrição:** faz parse do texto colado.
- **Request (JSON):**
```json
{ "text": "..." }
```
- **Resposta (JSON):**
```json
{
  "rows": [
    {
      "consignataria": "BANCO - SAFRA [390]",
      "situacao": "Deferida",
      "ade": "6816218",
      "servico": "EMPRESTIMO - 1 - 5017",
      "prestacoes": 96,
      "pagas": 45,
      "prestacao": 785.87,
      "deferimento": "03/06/2022",
      "ultimo_desconto": "01/03/2026",
      "ultima_parcela": "01/06/2030"
    }
  ]
}
```

### 5.5 `GET|POST /discounts-editor`
- **Descrição:** página de parametrização.
- **GET:** renderiza `templates/discounts_editor.html`.
- **POST:** salva alterações dependendo do `form_type`.

---

## 6) Parametrizações e persistência (JSON)

### 6.1 Garantia de existência dos arquivos
A função `ensure_data_files()`:
- cria `data/` se não existir;
- cria `static/bank-logos/` se não existir;
- cria arquivos default quando ausentes:
  - `discounts.json`
  - `bank_factors.json`
  - `bank_logos.json`
  - `bank_catalog.json`

### 6.2 `discounts.json`
- **Formato:** lista de objetos
```json
[{"name": "BB - Quitação", "percent": 12.0}]
```
- **Leitura:** `load_discounts()`
- **Escrita:** `save_discounts(items)`
  - descarta itens inválidos;
  - normaliza `name` e converte `percent` para `float`.

### 6.3 `bank_factors.json`
- **Formato:** lista de objetos
```json
[
  {"bank":"Safra","installments":120,"factor":0.01893,"active":true,"product":"normal"}
]
```
- **Leitura:** `load_bank_factors()`
- **Normalização:** `normalize_bank_factors(items)`
  - valida formato;
  - `installments` e `factor` precisam ser `> 0`;
  - `product` ∈ `{ "normal", "tj" }` (outros valores viram `normal`);
  - ordena por `(product, bank, -installments)`.
- **Escrita:** `save_bank_factors(items)`.

### 6.4 `bank_catalog.json`
- **Formato:** lista de strings
```json
["Safra", "Pan", "Daycoval"]
```
- **Uso:** manter catálogo de bancos, incluindo bancos sem fator cadastrado ainda.
- **Leitura/Escrita:** `load_bank_catalog()` / `save_bank_catalog(items)`
- **Registro:** `register_bank(bank)` adiciona se não existir.

### 6.5 Logos
- **Mapa:** `bank_logos.json` é um dict `nome_do_banco -> filename`.
- **Upload:** `save_uploaded_bank_logo(bank, file_storage)`
  - extensão permitida: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`;
  - nome do arquivo é derivado de `slugify_bank_name(bank)` + extensão;
  - remove o logo anterior se for diferente.

---

## 7) Funcionalidades detalhadas (regras e cálculo)

## 7.1 Parse da tabela (backend)
O parse é feito por `parse_table_text(raw_text)`:

- Se o texto contém `\t`, tenta parse tabular via `parse_tabular_text()`.
- Caso contrário, faz split em linhas via `split_rows()` e parse individual via `parse_row()`.

### 7.1.1 Limpeza (`clean_source_text`)
- Normaliza quebras de linha.
- Remove duplicação de espaços.
- Remove um header conhecido (regex com títulos de colunas).

### 7.1.2 Divisão em linhas (`split_rows`)
- Se existem múltiplas linhas, usa cada linha.
- Se veio “tudo em uma linha”, tenta separar por padrões contendo `Deferida`.

### 7.1.3 Parse de uma linha (`parse_row`)
Condições para considerar a linha válida:
- precisa ter **pelo menos 3 datas** `dd/mm/aaaa`.
- precisa conter o token **"Deferida"**.
- precisa conseguir extrair uma **prestação** em formato BR.

Campos extraídos:
- `consignataria`: texto antes de `Deferida`.
- `situacao`: normalmente `Deferida`.
- `ade`: token após `Deferida`.
- `servico`: faixa de tokens entre `ade` e os números finais.
- `prestacoes` e `pagas`: heurística baseada no rastro de números.
- `prestacao`: último token do prefixo como moeda BR.
- datas: as 3 últimas datas mapeadas em:
  - `deferimento`, `ultimo_desconto`, `ultima_parcela`.

### 7.1.4 Parse tabular (`parse_tabular_text`)
- Primeira linha é cabeçalho separado por TAB.
- Normaliza headers (`normalize_header`) removendo acentos e baixando para lowercase.
- Mapeia colunas esperadas (`consignataria`, `situacao`, `ade`, `servico`, `prestacoes`, `pagas`, `prestacao`, `deferimento`, `ultimo desconto`, `ultima parcela`).

---

## 7.2 Cálculo por linha (frontend)
O cálculo principal é feito em `computeRow(row)`.

### 7.2.1 Variáveis calculadas
- `remaining`:
  - `max(prestacoes - pagas, 0)`
- `debtBalance` (saldo devedor estimado):
  - `remaining * prestacao`
- `rawQuitBase` (base bruta para quitação):
  - se `avulsoCount > 0`: `min(avulsoCount, remaining) * prestacao`
  - senão: `debtBalance`

### 7.2.2 Aplicação de desconto
- O usuário escolhe um `discountName` (combobox).
- O percentual vem do cadastro (`discountPercent`).
- Regra especial: `discountRequiresAvulso(discountName)`
  - se o nome contiver “crescente” ou “decrescente”, o desconto **exige** `avulsoCount > 0`.
- `discountedValue`:
  - `quitBase * (1 - discountPercent/100)`

### 7.2.3 Inferência de banco
Função `inferBankName(consignataria)` tenta mapear nomes para um label de banco.
Observação: a tabela “Bancos — soma de parcelas” usa a chave `consignataria || bankName`.

---

## 7.3 Resumo da operação (frontend)
O resumo é recalculado em `updateSummary()`:
- `totalOffer`: soma de `discountedValue` somente de linhas com `discountName` selecionado.
- `gross`: valor informado em `#gross-input`.
- `tpsPercent`: valor informado em `#tps-percent-input`.
- `tpsValue = gross * (tpsPercent/100)`
- `netValue = gross - tpsValue`
- `consultantBalance = netValue - totalOffer`

UI:
- atualiza campos `#sum-offer`, `#tps-value`, `#net-value`, `#consultant-balance`.
- aplica classes `negative/positive` no saldo.

---

## 7.4 Simulador por banco (frontend)
Dados:
- `state.bankFactors` é carregado por `GET /api/bank-factors`.
- O simulador filtra por:
  - `item.active === true`
  - `item.product === state.factorProduct` (`normal`/`tj`).

Cálculo por faixa:
- modo margem (`factorMode = 'margin'`):
  - `result = inputValue / factor`
- modo valor desejado (`factorMode = 'target'`):
  - `result = inputValue * factor`

O simulador também identifica o “melhor resultado”:
- em margem: **maior** `result`
- em target: **menor** `result`

---

## 8) Editor (`/discounts-editor`) — Operação técnica
A rota trata múltiplos formulários pelo campo `form_type`:

### 8.1 `form_type = discounts`
- Recebe `discount_name[]` e `discount_percent[]`.
- Persiste em `discounts.json` via `save_discounts()`.

### 8.2 `form_type = add_bank`
- Campos:
  - `bank_name`
  - arquivo `bank_logo`
- Ações:
  - `register_bank(bank_name)`
  - `save_uploaded_bank_logo(bank_name, bank_logo)`

### 8.3 `form_type = modal_bank_logo`
- Campos:
  - `modal_bank_name`
  - arquivo `modal_bank_logo`
- Ações iguais ao upload normal.

### 8.4 `form_type = bank_logos`
- Itera por bancos enviados e tenta salvar `logo_file_{bank}`.

### 8.5 `form_type = bank_factors_payload`
- Recebe `bank_factors_payload` como JSON string (lista de grupos).
- Cada grupo esperado:
  - `{ bank, product, factors: [{ installments, factor }, ...] }`
- Backend:
  - agrega itens em uma lista plana,
  - salva bancos no catálogo,
  - persiste fatores via `save_bank_factors(items)`.

### 8.6 `form_type = bank_factors` (legado)
- Recebe listas paralelas `factor_bank[]`, `factor_installments[]`, `factor_value[]`.
- Persiste via `save_bank_factors(items)`.

Tratamento de erro:
- `ValueError` vira mensagem em tela (campo `error`).

---

## 9) Considerações de qualidade, limites e recomendações

### 9.1 Sem autenticação
- Qualquer usuário com acesso à URL consegue editar parâmetros e fazer upload.
- Recomendado para produção:
  - autenticação no editor,
  - restrição por IP/rede,
  - logs/auditoria.

### 9.2 Robustez do parse
- O parse é heurístico e depende do formato do texto (datas, token “Deferida”, moeda BR).
- Recomendações:
  - criar testes com amostras reais,
  - manter exemplos por convênio/sistema origem,
  - adicionar mensagens de validação para linhas descartadas.

### 9.3 Persistência em arquivo
- JSON em disco é simples e eficaz para ambiente pequeno/médio.
- Para grande porte, pode-se migrar para:
  - SQLite/PostgreSQL para versionamento e auditoria,
  - painel com controle de acesso.

---

## 10) Guia rápido de troubleshooting
- **Descontos não aparecem:** verifique `GET /api/discounts` e o arquivo `data/discounts.json`.
- **Fatores não aparecem no simulador:** verifique `GET /api/bank-factors` e se existem itens com `active=true` e `product` correto.
- **Logo não carrega:** verifique se o arquivo está em `static/bank-logos/` e se `bank_logos.json` referencia o nome correto.
- **Linhas não são processadas:** confirme se a linha contém `Deferida`, 3 datas `dd/mm/aaaa` e prestação no formato esperado.

---

## 11) Referência (mapeamento rápido)
- Backend:
  - `parse_table_text`, `parse_row`, `parse_tabular_text`
  - `load_discounts`, `save_discounts`
  - `load_bank_factors`, `save_bank_factors`, `normalize_bank_factors`
  - `register_bank`, `load_bank_catalog`, `save_bank_catalog`
  - `save_uploaded_bank_logo`, `load_bank_logos`, `get_bank_logo_url`
- Frontend:
  - `computeRow`, `updateSummary`, `renderRows`
  - `renderFactorCards`, `groupBankFactors`

