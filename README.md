# Calculadora de viabilidade

Aplicação Flask para colar a tabela original de consignações, calcular saldo devedor, quitação avulsa, desconto e resumo da operação, sem login.

## Como rodar

```bash
py -3 -m pip install -r requirements.txt
py -3 app.py
```

## Deploy com Docker (VPS)

### Requisitos

- Docker
- Docker Compose

### Subir o serviço

```bash
docker compose up -d --build
```

A aplicação ficará disponível em:

- http://IP_DA_VPS:8000

### Persistência de dados

O `docker-compose.yml` monta volumes para manter os dados entre atualizações do container:

- `./data` -> `/app/data` (descontos, fatores, catálogo e mapeamento de logos)
- `./static/bank-logos` -> `/app/static/bank-logos` (uploads de logos)

### Notas de produção

- A aplicação não possui login por padrão. Recomenda-se proteger o acesso ao editor em `/discounts-editor` (ex.: por VPN, IP allowlist ou autenticação no reverse proxy).
- Para usar um domínio/HTTPS, coloque um reverse proxy (ex.: Nginx) na frente do container.
