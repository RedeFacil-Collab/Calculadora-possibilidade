# Calculadora de Possibilidade

Aplicação Flask com tela de login em React. O acesso é controlado por sessão,
perfis e auditoria persistidos em PostgreSQL.

## Perfis

- `operador`: usa a calculadora e suas APIs de leitura.
- `admin`: possui também acesso ao editor de descontos e fatores bancários.

## Como rodar com Docker

Crie o arquivo `.env` a partir de `.env.example`, troque as chaves e senhas de
exemplo e execute:

```bash
docker compose up -d --build
docker compose exec calculadora python auth.py --email admin@empresa.com --role admin
```

O segundo comando solicita uma senha de no mínimo 12 caracteres e cria o
administrador dentro do PostgreSQL.

Acesse `http://localhost:8000/login`, entre com o usuário criado e o sistema
redirecionará administradores para `http://localhost:8000/admin`.

No painel, abra **Usuários** para criar contas com perfil `operador` ou `admin`,
redefinir senhas e ativar/desativar acessos. Para conferir a visão de um
operador sem encerrar a sessão administrativa, abra `/login` em uma janela
anônima e entre com a conta criada.

Usuários e logs ficam no volume Docker `postgres_data`. Reiniciar ou recriar os
containers não apaga esses dados.

O Redis mantém a presença online com expiração automática e publica as mudanças
para o painel por SSE. A interface não faz polling da atividade; cada navegador
autenticado envia somente um heartbeat de presença a cada 60 segundos.

## Comandos úteis

```bash
docker compose ps
docker compose logs -f calculadora
docker compose logs -f postgres
docker compose exec postgres psql -U calculadora -d calculadora
```

Mantenha o arquivo JSON da conta de serviço ao lado do `.env`. A variável
`GOOGLE_CREDENTIALS_FILE` informa seu nome e ele é montado no container somente
para leitura; não inclua essa credencial no Git.

Em uma VPS, o serviço ficará disponível em `http://IP_DA_VPS:8000`.

O React é compilado durante o build e seus arquivos estáticos são servidos pelo
Flask. O Compose executa a aplicação e o PostgreSQL em containers separados.

### Notas de produção

- Em produção, use HTTPS e mantenha `SESSION_COOKIE_SECURE=true`.
- A chave `APP_SECRET_KEY` é obrigatória no Docker e deve permanecer privada.
- Para usar um domínio/HTTPS, coloque um reverse proxy (ex.: Nginx) na frente do container.
