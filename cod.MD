# Calculadora de Viabilidade (Consignado) — Documento Comercial

## Visão executiva
A **Calculadora de Viabilidade** é uma aplicação web leve para operações de **empréstimo consignado** (originação, portabilidade e principalmente **pós-venda/renegociação**) que transforma a “tabela crua” de consignações (copiar/colar do sistema de origem) em uma **simulação padronizada e acionável**.

O objetivo é acelerar a tomada de decisão do consultor, reduzir erro operacional e aumentar conversão ao entregar, em poucos segundos:

- **Saldo devedor estimado** por contrato.
- **Simulação de quitação total ou parcial (avulso)** com **descontos configuráveis**.
- **Resumo financeiro da operação** (oferta, TPS, líquido e saldo/viabilidade).
- **Simulador por banco** (tabela de fatores por prazo/produto) para orientar estratégia de oferta.

> Proposta de valor: **menos tempo calculando, mais tempo vendendo** — com **governança** sobre descontos e fatores por instituição.

---

## Para quem é
- **Empresas de grande porte** com operação de consignado e equipes de:
  - vendas e pré-vendas,
  - retenção/pós-venda,
  - backoffice comercial.
- **Gestores comerciais** que precisam garantir padronização de proposta e aderência às políticas de desconto.

---

## Dores que o sistema resolve
### 1) Simulação lenta e sujeita a erro
Sem ferramenta adequada, o consultor costuma usar planilhas e cálculos manuais para chegar em saldo, quitação e desconto, o que gera:
- demora de resposta ao cliente;
- variação entre consultores (cada um “faz de um jeito”);
- risco de oferecer valores incorretos.

### 2) Falta de padronização de política comercial
Políticas de desconto e fatores mudam com frequência por banco/produto/prazo. Sem um ponto único de configuração, a operação perde controle.

### 3) Dificuldade em escolher o melhor banco/prazo na hora da oferta
Comparar rapidamente “o que libera mais” (margem) ou “qual a menor parcela” (valor desejado) é decisivo para conversão.

---

## O que a empresa recebe (entregáveis do sistema)
### 1) Motor de cálculo por contrato (linha a linha)
Ao colar a tabela de consignações e clicar em **Processar Tabela**, o sistema entrega uma grade com:
- **parcelas restantes**;
- **saldo devedor estimado**;
- **quitação total** (automaticamente) ou **quitação avulsa** (parcial por quantidade de parcelas);
- seleção de **desconto** e cálculo do **valor final com desconto**;
- uma **descrição operacional** do contrato (ex.: “pagas de X, valor da prestação”).

### 2) Resumo executivo da operação (viabilidade)
Em um painel único, o sistema consolida:
- **Soma da oferta** (total dos valores com desconto selecionados);
- **Bruto** (valor informado pela operação);
- **TPS %** e cálculo automático do **TPS R$**;
- **Líquido**;
- **Saldo** (indicador final de viabilidade), com destaque visual de positivo/negativo.

### 3) Visão por instituição (“Bancos — soma de parcelas”)
O sistema agrupa por consignatária/banco e apresenta a **soma das prestações**, ajudando a:
- identificar concentração por instituição;
- priorizar abordagens;
- organizar a estratégia de atuação (por banco, por perfil, por carteira).

### 4) Simulador por banco (fatores por prazo e produto)
Com base em uma tabela de fatores configurável, o consultor simula:
- **modo Margem do cliente**: dado o valor de margem, qual o **valor estimado liberado** por banco/prazo;
- **modo Valor desejado**: dado um valor objetivo, qual a **parcela estimada** por banco/prazo;
- destaque automático do **melhor resultado** (maior valor liberado ou menor parcela).

---

## Funcionalidades em destaque
### A) Colar e processar a tabela (sem fricção)
- Entrada por **copiar/colar** do sistema de origem.
- Parse automático e estruturação das linhas.
- Resultado pronto para decisão e argumentação comercial.

### B) Quitação avulsa (parcial) e total
- Simulação de quitação **total** (base no saldo devedor estimado).
- Simulação de quitação **avulsa** por quantidade de parcelas, quando a política comercial exigir.

### C) Descontos configuráveis do pós-venda
- Catálogo de descontos com **nome e percentual**.
- Aplicação guiada no cálculo (com regras específicas para descontos do tipo “crescente/decrescente”).

### D) Editor de fatores por banco e produto (Normal e TJ)
- Cadastro de faixas por banco:
  - prazo (ex.: 120x, 96x, 84x…)
  - fator
  - produto (**Normal** ou **TJ**)
- Atualização simples para refletir a precificação vigente.

### E) Logos e identidade visual por banco
- Upload de logos por banco para facilitar leitura e usabilidade na operação.

---

## Benefícios diretos para a operação comercial
### 1) Aumento de produtividade
- Reduz o tempo de cálculo por atendimento.
- Padroniza a simulação em um fluxo único.

### 2) Melhora de conversão
- Resposta mais rápida ao cliente.
- Oferta mais assertiva ao comparar bancos/prazos imediatamente.

### 3) Redução de risco operacional
- Menos erro por planilha e cálculo manual.
- Política de desconto centralizada.

### 4) Padronização e governança
- Gestão controla:
  - descontos do pós-venda;
  - fatores por banco/produto/prazo;
  - catálogo de bancos.

---

## Diferenciais para uma operação de grande porte
- **Configuração central (descontos e fatores)**: atualização rápida quando a mesa muda regras.
- **Dois produtos (Normal e TJ)**: separação clara para evitar uso de tabela errada.
- **Experiência orientada ao consultor**: foco em decisão, não em planilha.
- **Baixo atrito**: não depende de integração para gerar valor (funciona com o que a operação já tem: a tabela do sistema).

---

## Implantação (visão prática)
### Requisitos
- Python 3 + Flask.

### Execução
- Instalação de dependências.
- Execução do servidor da aplicação.

### Parametrização inicial
- Cadastro/ajuste de:
  - descontos do pós-venda;
  - bancos e logos;
  - fatores por banco (Normal/TJ).

---

## Segurança e controles (recomendação para ambiente corporativo)
A aplicação foi desenhada para ser simples e rápida; por padrão, não utiliza login.

Para uma implantação corporativa, recomenda-se:
- restringir acesso por rede (VPN/intranet) e/ou reverse proxy;
- adicionar autenticação para o editor de parâmetros;
- registrar auditoria de alterações (quem alterou desconto/fator e quando).

---

## Exemplos de uso comercial (casos típicos)
- **Pós-venda**: simular quitação total/parcial com desconto para retenção.
- **Portabilidade**: comparar bancos/prazos com base em margem ou valor desejado.
- **Mesa/gestão**: ajustar fatores e descontos para refletir campanhas e estratégia semanal.

---

## Próximos passos (para proposta com grande porte)
- Alinhamento de terminologia (ex.: definição de TPS, bruto, saldo na sua operação).
- Customizações:
  - exportação (PDF/CSV),
  - histórico de simulações,
  - perfis de acesso,
  - integração via API com o sistema de origem.

---

## Resumo
A **Calculadora de Viabilidade** entrega **padronização, velocidade e governança** para operações de consignado. Ela transforma dados operacionais em uma proposta comercial clara, com simulação por contrato, consolidação financeira e comparativo por banco — permitindo que a equipe comercial opere com mais eficiência e previsibilidade.
