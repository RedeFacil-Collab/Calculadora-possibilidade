const state = {
  rows: [],
  commercialMatrix: [],
  commercialChoices: [],
  blockedEntities: [],
  bankFactors: [],
  factorMode: 'margin',
  factorProduct: 'normal',
  factorCardsVisible: false,
  factorCardsSignature: '',
  editingRowIndex: null,
};

const formatterCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatterNumber = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value) {
  return formatterCurrency.format(Number(value || 0));
}

function formatPercent(value) {
  return `${formatterNumber.format(Number(value || 0))}%`;
}

function formatFactor(value) {
  const amount = Number(value || 0);
  if (!amount) return '0';
  return amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function parseBrNumber(value) {
  if (!value) return 0;
  return Number(String(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}

function formatCurrencyInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return formatterNumber.format(Number(digits) / 100);
}

function formatPercentInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return formatterNumber.format(Number(digits) / 100);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function inferBankName(consignataria) {
  const value = normalizeText(consignataria);
  if (value.includes('bradesco')) return 'BANCO - BRADESCO';
  if (value.includes('digio')) return 'BANCO - DIGIO';
  if (value.includes('sicoob')) return 'COOPERATIVA - SICOOB';
  if (value.includes('banrisul')) return 'BANCO - BANRISUL';
  if (value.includes('santander')) return 'BANCO - SANTANDER';
  if (value.includes('daycoval')) return 'BANCO - DAYCOVAL';
  if (value.includes('safra')) return 'BANCO - SAFRA';
  if (value.includes('bmg')) return 'BANCO - BMG';
  if (value.includes('pan')) return 'BANCO - PAN';
  if (value.includes('inter')) return 'BANCO - INTER';
  if (value.includes('cef') || value.includes('caixa')) return 'BANCO - CEF';
  if (value.includes('banco - bb') || value.startsWith('bb ')) return 'BANCO - BB';
  if (value.includes('master')) return 'BANCO - MASTER';
  if (value.includes('associacao')) return 'ASSOCIACAO';
  return consignataria || '';
}

function normalizeStatus(status) {
  return status === 'Deferida' ? 'Deferida' : status || '';
}

function matrixBankKey(value) {
  return normalizeText(value)
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b(banco|cooperativa)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function matchCommercialBank(consignataria) {
  const inferredKey = matrixBankKey(inferBankName(consignataria));
  return state.commercialChoices.find((choice) => matrixBankKey(choice.banco) === inferredKey)?.banco || '';
}

function computeMaturity(paidCount, installmentCount) {
  if (!installmentCount) return '';
  const paidPercent = paidCount / installmentCount;
  if (paidPercent <= 0.2) return 'Inicial';
  if (paidPercent <= 0.5) return 'Intermediário';
  if (paidPercent <= 0.8) return 'Maduro';
  return 'Final';
}

function findCommercialReference(bankName, operation, maturity) {
  const same = (value, expected) => normalizeText(value) === normalizeText(expected);
  const bankKey = matrixBankKey(bankName);
  const strategies = [
    {
      minimumCases: 1,
      matches: (row) => matrixBankKey(row.banco) === bankKey && same(row.operacao, operation) && same(row.maturidade, maturity),
    },
    {
      minimumCases: 1,
      matches: (row) => matrixBankKey(row.banco) === bankKey && same(row.operacao, operation) && same(row.maturidade, 'Todas'),
    },
    {
      minimumCases: 1,
      matches: (row) => same(row.banco, 'Todos os Bancos') && same(row.operacao, operation),
    },
    {
      minimumCases: 1,
      matches: (row) => same(row.banco, 'Base Geral') && same(row.operacao, 'Todas as Operações'),
    },
  ];
  for (const strategy of strategies) {
    const result = state.commercialMatrix.find(
      (row) => Number(row.casos || 0) >= strategy.minimumCases && strategy.matches(row),
    );
    if (result) return result;
  }
  return null;
}

function computeRow(row) {
  const installmentCount = Number(row.prestacoes || 0);
  const paidCount = Number(row.pagas || 0);
  const hasInstallments = installmentCount > 0 && paidCount >= 0;
  const remaining = hasInstallments ? Math.max(installmentCount - paidCount, 0) : 0;
  const installmentValue = Number(row.prestacao || 0);
  const debtBalance = remaining * installmentValue;
  const avulsoCount = Number(row.avulsoCount || 0);
  const operation = row.operation || '';
  const commercialBank = row.commercialBank || '';
  const maturity = hasInstallments ? computeMaturity(paidCount, installmentCount) : '';
  const commercial = commercialBank && operation
    ? findCommercialReference(commercialBank, operation, maturity)
    : null;
  const requiresAvulso = normalizeText(operation).includes('amortizacao');
  const baseValue = requiresAvulso
    ? (avulsoCount > 0 ? Math.min(avulsoCount, remaining) * installmentValue : 0)
    : debtBalance;
  const canApplyCommercialReference = Boolean(commercial && baseValue > 0 && (!requiresAvulso || avulsoCount > 0));
  const commercialValue = canApplyCommercialReference
    ? baseValue * (1 - Number(commercial.referencia_comercial || 0))
    : 0;

  return {
    ...row,
    bankName: inferBankName(row.consignataria),
    statusLabel: normalizeStatus(row.situacao),
    remaining,
    debtBalance,
    commercialBank,
    operation,
    maturity,
    commercial,
    commercialValue,
    canApplyCommercialReference,
    description: hasInstallments ? `${paidCount} de ${installmentCount} pagas de ${formatCurrency(installmentValue)}` : '-',
    sumInstallments: installmentValue,
  };
}

function updateSummary() {
  const calculatedRows = state.rows.map(computeRow);
  const totalOffer = calculatedRows
    .filter((row) => row.canApplyCommercialReference)
    .reduce((sum, row) => sum + row.commercialValue, 0);

  const gross = parseBrNumber(document.getElementById('gross-input').value);
  const tpsPercent = parseBrNumber(document.getElementById('tps-percent-input').value);
  const tpsValue = gross * (tpsPercent / 100);
  const netValue = gross - tpsValue;
  const consultantBalance = netValue - totalOffer;

  document.getElementById('sum-offer').value = formatCurrency(totalOffer);
  document.getElementById('tps-value').value = formatCurrency(tpsValue);
  document.getElementById('net-value').value = formatCurrency(netValue);
  const balanceInput = document.getElementById('consultant-balance');
  balanceInput.value = formatCurrency(consultantBalance);
  balanceInput.classList.toggle('negative', consultantBalance < 0);
  balanceInput.classList.toggle('positive', consultantBalance > 0);
}

function buildCommercialOptions(row) {
  const blank = '<option value="">Selecione banco e operação...</option>';
  const options = state.commercialChoices.map((choice) => {
    const value = `${choice.banco}::${choice.operacao}`;
    const selected = choice.banco === row.commercialBank && choice.operacao === row.operation ? 'selected' : '';
    return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(choice.banco)} — ${escapeHtml(choice.operacao)}</option>`;
  });
  return blank + options.join('');
}

function groupBankFactors() {
  const grouped = new Map();

  state.bankFactors
    .filter((item) => item.active && String(item.product || 'normal') === state.factorProduct)
    .sort((a, b) => {
      const bankCompare = String(a.bank || '').localeCompare(String(b.bank || ''), 'pt-BR');
      if (bankCompare !== 0) return bankCompare;
      return Number(b.installments || 0) - Number(a.installments || 0);
    })
    .forEach((item) => {
      const bank = item.bank || 'Sem banco';
      if (!grouped.has(bank)) grouped.set(bank, { logoUrl: item.logo_url || '', factors: [] });
      const entry = grouped.get(bank);
      if (!entry.logoUrl && item.logo_url) entry.logoUrl = item.logo_url;
      entry.factors.push(item);
    });

  return grouped;
}

function getFactorContext() {
  return {
    container: document.getElementById('bank-factor-grid'),
    inputValue: parseBrNumber(document.getElementById('factor-base-input').value),
    isMarginMode: state.factorMode === 'margin',
    grouped: groupBankFactors(),
    outputLabel: document.getElementById('factor-output-label'),
    summaryOutput: document.getElementById('factor-summary-output'),
    inputLabel: document.getElementById('factor-input-label'),
  };
}

function getFactorCardsSignature(grouped) {
  return JSON.stringify(
    Array.from(grouped.entries()).map(([bank, group]) => ({
      bank,
      logoUrl: group.logoUrl || '',
      factors: group.factors.map((item) => ({
        installments: Number(item.installments || 0),
        factor: Number(item.factor || 0),
      })),
    }))
  );
}

function renderFactorCardsStructure(context) {
  const { container, grouped, isMarginMode, inputLabel, outputLabel, summaryOutput } = context;
  inputLabel.textContent = isMarginMode ? 'Margem disponivel do cliente' : 'Valor que o cliente quer liberar';
  outputLabel.textContent = isMarginMode ? 'Maior valor liberado na simulacao' : 'Menor parcela encontrada na simulacao';

  if (!grouped.size) {
    container.innerHTML = '<div class="empty-factor-state">Nenhuma faixa cadastrada para este produto.</div>';
    summaryOutput.value = 'Cadastre fatores no editor';
    state.factorCardsSignature = 'empty';
    return;
  }

  if (!state.factorCardsVisible) {
    container.innerHTML = '<div class="empty-factor-state">Informe um valor para visualizar as simulacoes dos bancos.</div>';
    summaryOutput.value = 'Informe um valor para simular';
    state.factorCardsSignature = 'hidden';
    return;
  }

  const cards = Array.from(grouped.entries()).map(([bank, group]) => {
    const items = group.factors.map((item, factorIndex) => {
      const factor = Number(item.factor || 0);
      return `
        <div class="factor-band" data-bank="${escapeHtml(bank)}" data-factor-index="${factorIndex}">
          <div class="factor-band-term">${Number(item.installments || 0)}x</div>
          <div class="factor-band-meta">
            <span>Fator</span>
            <strong>${escapeHtml(formatFactor(factor))}</strong>
          </div>
          <div class="factor-band-meta factor-band-result">
            <span>${isMarginMode ? 'Valor aproximado liberado' : 'Parcela aproximada'}</span>
            <strong class="factor-result-value">-</strong>
          </div>
        </div>
      `;
    }).join('');

    return `
      <article class="bank-factor-card">
        <div class="bank-factor-card-header">
          <div class="bank-factor-brand">
            <div class="bank-factor-logo-wrap">
              ${group.logoUrl ? `<img src="${escapeHtml(group.logoUrl)}" alt="Logo ${escapeHtml(bank)}" class="bank-factor-logo">` : '<div class="bank-factor-logo-fallback">Sem logo</div>'}
            </div>
            <div>
              <h3>${escapeHtml(bank)}</h3>
              <p>${isMarginMode ? 'Faixas e valores aproximados liberados' : 'Faixas e parcelas aproximadas para atingir o valor'}</p>
            </div>
          </div>
        </div>
        <div class="bank-factor-card-body">${items}</div>
      </article>
    `;
  }).join('');

  container.innerHTML = cards;
}

function updateFactorCardsValues(context) {
  const { container, grouped, inputValue, isMarginMode, summaryOutput } = context;
  if (!grouped.size || !state.factorCardsVisible) {
    return;
  }

  let bestValue = null;
  let bestLabel = '';

  Array.from(grouped.entries()).forEach(([bank, group]) => {
    group.factors.forEach((item, factorIndex) => {
      const factor = Number(item.factor || 0);
      const result = inputValue ? (isMarginMode ? inputValue / factor : inputValue * factor) : 0;
      const resultNode = container.querySelector(`.factor-band[data-bank="${CSS.escape(bank)}"][data-factor-index="${factorIndex}"] .factor-result-value`);
      if (resultNode) {
        resultNode.textContent = inputValue ? formatCurrency(result) : '-';
      }

      if (inputValue && (bestValue === null || (isMarginMode ? result > bestValue : result < bestValue))) {
        bestValue = result;
        bestLabel = `${bank} - ${item.installments}x`;
      }
    });
  });

  summaryOutput.value = bestValue === null ? 'Informe um valor para simular' : `${bestLabel}: ${formatCurrency(bestValue)}`;
}

function renderFactorCards() {
  const context = getFactorContext();
  const { grouped, isMarginMode, inputLabel, outputLabel } = context;

  inputLabel.textContent = isMarginMode ? 'Margem disponivel do cliente' : 'Valor que o cliente quer liberar';
  outputLabel.textContent = isMarginMode ? 'Maior valor liberado na simulacao' : 'Menor parcela encontrada na simulacao';

  const nextSignature = !grouped.size
    ? 'empty'
    : !state.factorCardsVisible
      ? 'hidden'
      : `${state.factorMode}::${state.factorProduct}::${getFactorCardsSignature(grouped)}`;

  if (nextSignature !== state.factorCardsSignature) {
    renderFactorCardsStructure(context);
    state.factorCardsSignature = nextSignature;
  }

  updateFactorCardsValues(context);
}

function renderBanksTable() {
  const tbody = document.getElementById('banks-table-body');
  const totals = new Map();

  state.rows.map(computeRow).forEach((row) => {
    const key = row.consignataria || row.bankName || 'Sem nome';
    totals.set(key, (totals.get(key) || 0) + Number(row.sumInstallments || 0));
  });

  if (!totals.size) {
    tbody.innerHTML = '<tr><td colspan="2" class="empty-state small">Sem dados.</td></tr>';
    return;
  }

  let total = 0;
  const rows = Array.from(totals.entries()).map(([name, value]) => {
    total += value;
    return `<tr><td>${escapeHtml(name)}</td><td>${formatCurrency(value)}</td></tr>`;
  }).join('');

  tbody.innerHTML = `${rows}<tr class="total-row"><td>Total</td><td>${formatCurrency(total)}</td></tr>`;
}

function restoreAvulsoFocus(focusIndex, caretPosition) {
  if (focusIndex === null || focusIndex === undefined) return;
  const input = document.querySelector(`.avulso-input[data-index="${focusIndex}"]`);
  if (!input) return;
  input.focus();
  const safePos = Math.min(caretPosition ?? input.value.length, input.value.length);
  input.setSelectionRange(safePos, safePos);
}

function renderRows(focusOptions = {}) {
  const { focusIndex = null, caretPosition = null } = focusOptions;
  const tbody = document.getElementById('calc-table-body');
  if (!state.rows.length) {
    tbody.innerHTML = '<tr><td colspan="17" class="empty-state">Nenhuma linha processada.</td></tr>';
    document.getElementById('result-title').textContent = 'Resultado - 0 registros processados';
    document.getElementById('export-actions').style.display = 'none';
    renderBanksTable();
    updateSummary();
    return;
  }

  tbody.innerHTML = state.rows.map((row, index) => {
    const calculated = computeRow(row);
    const isManual = Boolean(row._manual);
    return `
      <tr class="${isManual ? 'row-manual' : ''}">
        <td class="col-consig">${escapeHtml(calculated.consignataria || '-')}${isManual ? '<span class="manual-badge">novo</span>' : ''}</td>
        <td><span class="status-pill">${escapeHtml(calculated.statusLabel)}</span></td>
        <td>${escapeHtml(calculated.ade || '-')}</td>
        <td class="service-col" title="${escapeHtml(calculated.servico || '')}">${escapeHtml(calculated.servico || '-')}</td>
        <td>${calculated.prestacoes ?? '-'}</td>
        <td>${calculated.pagas ?? '-'}</td>
        <td class="money-col">${formatCurrency(calculated.prestacao || 0)}</td>
        <td>${escapeHtml(calculated.deferimento || '-')}</td>
        <td class="calc-value">${calculated.remaining || '-'}</td>
        <td class="calc-value">${calculated.remaining ? formatCurrency(calculated.debtBalance) : '-'}</td>
        <td class="desc-col">${escapeHtml(calculated.description)}</td>
        <td>
          <div class="cell-field">
            <input class="mini-input avulso-input" data-index="${index}" value="${escapeHtml(row.avulsoCount || '')}" inputmode="numeric" placeholder="qtd">
            <button class="mini-clear clear-avulso" data-index="${index}" type="button">x</button>
          </div>
        </td>
        <td>
          <select class="commercial-select" data-index="${index}">
            ${buildCommercialOptions(calculated)}
          </select>
        </td>
        <td>${escapeHtml(calculated.maturity || '-')}</td>
        <td class="calc-value">${calculated.commercial ? formatPercent(calculated.commercial.referencia_comercial * 100) : '-'}</td>
        <td class="highlight-value">${calculated.canApplyCommercialReference ? formatCurrency(calculated.commercialValue) : '-'}</td>
        <td class="row-actions-col">
          <div class="row-actions">
            ${isManual ? `<button class="action-btn action-muted action-small edit-row" data-index="${index}" type="button">Editar</button>` : ''}
            <button class="action-btn action-danger action-small delete-row" data-index="${index}" type="button">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('result-title').textContent = `Resultado - ${state.rows.length} registros processados`;
  document.getElementById('export-actions').style.display = state.rows.length ? '' : 'none';
  bindRowEvents();
  restoreAvulsoFocus(focusIndex, caretPosition);
  renderBanksTable();
  updateSummary();
}

function bindRowEvents() {
  document.querySelectorAll('.commercial-select').forEach((select) => {
    select.addEventListener('change', (event) => {
      const index = Number(event.target.dataset.index);
      const [commercialBank = '', operation = ''] = event.target.value.split('::');
      state.rows[index].commercialBank = commercialBank;
      state.rows[index].operation = operation;
      renderRows();
    });
  });

  document.querySelectorAll('.avulso-input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const index = Number(event.target.dataset.index);
      state.rows[index].avulsoCount = String(event.target.value).replace(/\D/g, '');
      renderRows({
        focusIndex: index,
        caretPosition: event.target.selectionStart,
      });
    });
  });

  document.querySelectorAll('.clear-avulso').forEach((button) => {
    button.addEventListener('click', (event) => {
      state.rows[Number(event.target.dataset.index)].avulsoCount = '';
      renderRows();
    });
  });

  document.querySelectorAll('.edit-row').forEach((button) => {
    button.addEventListener('click', (event) => {
      openNewContractModal(Number(event.currentTarget.dataset.index));
    });
  });

  document.querySelectorAll('.delete-row').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = Number(event.currentTarget.dataset.index);
      const row = state.rows[index];
      if (!row) return;

      const identifier = row.ade && row.ade !== '-' ? `ADE ${row.ade}` : row.consignataria || 'selecionada';
      if (!window.confirm(`Excluir a linha ${identifier}? Esta acao nao pode ser desfeita.`)) return;

      state.rows.splice(index, 1);
      renderRows();
    });
  });
}

async function loadBlockedEntities() {
  try {
    const response = await fetch('/api/blocked-entities', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.blockedEntities = (payload.blocked || []).map((entry) => normalizeText(entry));
  } catch (error) {
    console.error('Falha ao carregar entidades bloqueadas:', error);
    state.blockedEntities = [];
  }
}

function isEntityBlocked(banco, operacao) {
  const bankKey = normalizeText(banco);
  if (state.blockedEntities.includes(bankKey)) return true;
  if (operacao) {
    const opKey = normalizeText(`${banco}::${operacao}`);
    if (state.blockedEntities.includes(opKey)) return true;
  }
  return false;
}

async function loadCommercialMatrix() {
  try {
    await loadBlockedEntities();
    const response = await fetch('/api/commercial-matrix', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.commercialMatrix = (payload.rows || []).filter((row) => !isEntityBlocked(row.banco, row.operacao));
    const choices = new Map();
    state.commercialMatrix
      .filter((row) => !['Base Geral', 'Todos os Bancos'].includes(row.banco))
      .filter((row) => row.operacao && row.operacao !== 'Todas as Operações')
      .forEach((row) => {
        const key = `${row.banco}::${row.operacao}`;
        choices.set(key, { banco: row.banco, operacao: row.operacao });
      });
    state.commercialChoices = [...choices.values()].sort((a, b) => {
      const bankCompare = a.banco.localeCompare(b.banco, 'pt-BR');
      return bankCompare || a.operacao.localeCompare(b.operacao, 'pt-BR');
    });
  } catch (error) {
    console.error('Falha ao carregar matriz comercial:', error);
    state.commercialMatrix = [];
    state.commercialChoices = [];
  }
}

async function loadBankFactors() {
  try {
    const response = await fetch('/api/bank-factors', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.bankFactors = await response.json();
  } catch (error) {
    console.error('Falha ao carregar fatores bancarios:', error);
    state.bankFactors = [];
  }
}

async function parseSourceTable() {
  const text = document.getElementById('source-table').value.trim();
  if (!text) {
    state.rows = [];
    renderRows();
    return;
  }

  if (!state.commercialMatrix.length) {
    await loadCommercialMatrix();
  }

  const response = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.APP_CSRF_TOKEN || '' },
    body: JSON.stringify({ text }),
  });
  const payload = await response.json();
  state.rows = (payload.rows || []).map((row) => {
    const commercialBank = matchCommercialBank(row.consignataria);
    const defaultChoice = state.commercialChoices.find(
      (choice) => choice.banco === commercialBank && normalizeText(choice.operacao) === 'quitacao'
    );
    return {
      ...row,
      commercialBank,
      operation: defaultChoice?.operacao || '',
      avulsoCount: '',
    };
  });
  renderRows();
}

function collectExportRows() {
  return state.rows.map((row) => {
    const calculated = computeRow(row);
    return {
      consignataria: calculated.consignataria || '',
      situacao: calculated.statusLabel || '',
      ade: calculated.ade || '',
      servico: calculated.servico || '',
      prestacoes: calculated.prestacoes,
      pagas: calculated.pagas,
      prestacao: calculated.prestacao,
      deferimento: calculated.deferimento || '',
      remaining: calculated.remaining,
      debtBalance: calculated.debtBalance,
      maturity: calculated.maturity || '',
      commercialLabel: calculated.commercialBank && calculated.operation
        ? `${calculated.commercialBank} — ${calculated.operation}` : '',
      reference: calculated.commercial ? (calculated.commercial.referencia_comercial * 100).toFixed(2) + '%' : '',
      forecastValue: calculated.canApplyCommercialReference ? calculated.commercialValue : null,
    };
  });
}

async function exportExcel() {
  const rows = collectExportRows();
  if (!rows.length) return;
  try {
    const response = await fetch('/api/export/excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.APP_CSRF_TOKEN || '' },
      body: JSON.stringify({ rows }),
    });
    if (!response.ok) throw new Error('Falha ao exportar');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'calculadora-resultado.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Erro ao exportar Excel:', error);
    window.alert('Não foi possível exportar. Tente novamente.');
  }
}

function exportPrint() {
  window.print();
}

function bindTopActions() {
  const parseButton = document.getElementById('parse-table');
  const clearButton = document.getElementById('clear-source');
  const sampleButton = document.getElementById('load-sample');
  const sourceInput = document.getElementById('source-table');
  if (parseButton) {
    parseButton.addEventListener('click', parseSourceTable);
  }

  if (clearButton && sourceInput) {
    clearButton.addEventListener('click', () => {
      sourceInput.value = '';
      state.rows = [];
      renderRows();
    });
  }

  if (sampleButton && sourceInput) {
    sampleButton.addEventListener('click', () => {
      sourceInput.value = window.APP_SAMPLE_TEXT;
    });
  }

  const excelButton = document.getElementById('export-excel');
  if (excelButton) excelButton.addEventListener('click', exportExcel);

  const printButton = document.getElementById('export-print');
  if (printButton) printButton.addEventListener('click', exportPrint);
}

function bindSummaryInputs() {
  const grossInput = document.getElementById('gross-input');
  const percentInput = document.getElementById('tps-percent-input');

  grossInput.addEventListener('input', (event) => {
    event.target.value = formatCurrencyInput(event.target.value);
    updateSummary();
  });

  percentInput.addEventListener('input', (event) => {
    event.target.value = formatPercentInput(event.target.value);
    updateSummary();
  });

  document.querySelectorAll('.mini-clear[data-clear-target]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const target = document.getElementById(event.target.dataset.clearTarget);
      if (!target) return;
      target.value = '';
      updateSummary();
    });
  });
}

function bindFactorSimulation() {
  const factorInput = document.getElementById('factor-base-input');
  const summaryOutput = document.getElementById('factor-summary-output');

  function resetFactorSimulation(hideCards = false) {
    factorInput.value = '';
    if (hideCards) {
      state.factorCardsVisible = false;
    }
    if (summaryOutput) {
      summaryOutput.value = 'Informe um valor para simular';
    }
    renderFactorCards();
  }

  factorInput.addEventListener('input', (event) => {
    event.target.value = formatCurrencyInput(event.target.value);
    if (parseBrNumber(event.target.value) > 0) {
      state.factorCardsVisible = true;
    }
    renderFactorCards();
  });

  document.getElementById('clear-factor-base').addEventListener('click', () => {
    resetFactorSimulation(true);
  });

  document.querySelectorAll('[data-factor-mode]').forEach((button) => {
    button.addEventListener('click', (event) => {
      state.factorMode = event.target.dataset.factorMode;
      document.querySelectorAll('[data-factor-mode]').forEach((item) => {
        item.classList.toggle('active', item.dataset.factorMode === state.factorMode);
      });
      resetFactorSimulation(false);
    });
  });

  document.querySelectorAll('[data-factor-product]').forEach((button) => {
    button.addEventListener('click', (event) => {
      state.factorProduct = event.target.dataset.factorProduct;
      document.querySelectorAll('[data-factor-product]').forEach((item) => {
        item.classList.toggle('active', item.dataset.factorProduct === state.factorProduct);
      });
      resetFactorSimulation(false);
    });
  });
}

function bindLogout() {
  const logoutButton = document.getElementById('logout-button');
  if (!logoutButton) return;

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = 'Saindo...';
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': window.APP_CSRF_TOKEN || '' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      window.location.assign('/login');
    } catch (error) {
      console.error('Falha ao encerrar a sessão:', error);
      logoutButton.disabled = false;
      logoutButton.textContent = 'Sair';
      window.alert('Não foi possível sair. Tente novamente.');
    }
  });
}

function bindPresenceHeartbeat() {
  const sendHeartbeat = () => {
    fetch('/api/auth/heartbeat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': window.APP_CSRF_TOKEN || '' },
    }).catch(() => {});
  };
  sendHeartbeat();
  window.setInterval(sendHeartbeat, 60000);
}

function parseDateBrToIso(value) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function setNewContractFormMode(rowIndex = null) {
  const isEditing = rowIndex !== null && rowIndex !== undefined;
  state.editingRowIndex = isEditing ? rowIndex : null;
  const modalTitle = document.querySelector('#new-contract-overlay .nc-header h3');
  const modalSubtitle = document.querySelector('#new-contract-overlay .nc-header p');
  const addButton = document.getElementById('nc-add');
  const addAnotherButton = document.getElementById('nc-add-another');
  if (modalTitle) modalTitle.textContent = isEditing ? 'Editar Contrato' : 'Novo Contrato';
  if (modalSubtitle) {
    modalSubtitle.textContent = isEditing
      ? 'Corrija os dados da operacao lancada'
      : 'Preencha os dados da operacao que esta sendo ofertada';
  }
  if (addButton) addButton.textContent = isEditing ? 'Salvar alteracoes' : 'Adicionar a tabela';
  if (addAnotherButton) addAnotherButton.style.display = isEditing ? 'none' : '';
}

function fillNewContractForm(row) {
  document.getElementById('nc-consignataria').value = row.consignataria || '';
  document.getElementById('nc-servico').value = row.servico || '';
  document.getElementById('nc-prestacoes').value = row.prestacoes ?? '';
  document.getElementById('nc-pagas').value = row.pagas ?? '0';
  document.getElementById('nc-prestacao').value = row.prestacao ? formatCurrencyInput(String(Math.round(Number(row.prestacao) * 100))) : '';
  document.getElementById('nc-deferimento').value = parseDateBrToIso(row.deferimento);
}

function openNewContractModal(rowIndex = null) {
  const overlay = document.getElementById('new-contract-overlay');
  setNewContractFormMode(rowIndex);
  const row = state.editingRowIndex !== null ? state.rows[state.editingRowIndex] : null;
  if (row) {
    fillNewContractForm(row);
  } else {
    resetNewContractForm();
  }
  overlay.classList.remove('hidden');
  const msg = overlay.querySelector('.nc-success-msg');
  if (msg) msg.remove();
  document.getElementById('nc-consignataria').focus();
}

function closeNewContractModal() {
  state.editingRowIndex = null;
  document.getElementById('new-contract-overlay').classList.add('hidden');
}

function resetNewContractForm() {
  document.getElementById('nc-consignataria').value = '';
  document.getElementById('nc-servico').value = '';
  document.getElementById('nc-prestacoes').value = '';
  document.getElementById('nc-pagas').value = '0';
  document.getElementById('nc-prestacao').value = '';
  document.getElementById('nc-deferimento').value = '';
}

function formatDateBr(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function buildNewContractRow() {
  const consignataria = document.getElementById('nc-consignataria').value.trim();
  const servico = document.getElementById('nc-servico').value.trim();
  const prestacoesInput = document.getElementById('nc-prestacoes');
  const pagasInput = document.getElementById('nc-pagas');
  prestacoesInput.value = String(prestacoesInput.value || '').replace(/\D/g, '');
  pagasInput.value = String(pagasInput.value || '').replace(/\D/g, '');
  const prestacoes = parseInt(prestacoesInput.value, 10);
  const pagas = parseInt(pagasInput.value || '0', 10);
  const prestacao = parseBrNumber(document.getElementById('nc-prestacao').value);
  const deferimento = formatDateBr(document.getElementById('nc-deferimento').value);

  if (!consignataria) {
    window.alert('Informe a consignatária.');
    return null;
  }
  if (!prestacoes || prestacoes <= 0) {
    window.alert('Informe o número de prestações.');
    return null;
  }
  if (!prestacao || prestacao <= 0) {
    window.alert('Informe o valor da prestação.');
    return null;
  }

  const commercialBank = matchCommercialBank(consignataria);
  const defaultChoice = state.commercialChoices.find(
    (choice) => choice.banco === commercialBank && normalizeText(choice.operacao) === 'quitacao'
  );

  const existingRow = state.editingRowIndex !== null ? state.rows[state.editingRowIndex] : {};
  const operation = existingRow.commercialBank === commercialBank
    ? existingRow.operation
    : defaultChoice?.operacao || '';

  return {
    ...existingRow,
    consignataria,
    situacao: existingRow.situacao || 'Deferida',
    ade: existingRow.ade || '-',
    servico: servico || 'NOVO CONTRATO',
    prestacoes,
    pagas: pagas || 0,
    prestacao,
    deferimento: deferimento || '-',
    ultimo_desconto: existingRow.ultimo_desconto || '-',
    ultima_parcela: existingRow.ultima_parcela || '-',
    commercialBank,
    operation,
    avulsoCount: existingRow.avulsoCount || '',
    _manual: existingRow._manual ?? true,
  };
}

function addNewContract(keepOpen) {
  const row = buildNewContractRow();
  if (!row) return;

  if (state.editingRowIndex !== null) {
    state.rows[state.editingRowIndex] = row;
    state.editingRowIndex = null;
    resetNewContractForm();
    closeNewContractModal();
    renderRows();
    return;
  }

  if (!state.commercialMatrix.length) {
    loadCommercialMatrix().then(() => {
      row.commercialBank = matchCommercialBank(row.consignataria);
      const defaultChoice = state.commercialChoices.find(
        (choice) => choice.banco === row.commercialBank && normalizeText(choice.operacao) === 'quitacao'
      );
      row.operation = defaultChoice?.operacao || '';
      state.rows.push(row);
      renderRows();
    });
  } else {
    state.rows.push(row);
    renderRows();
  }

  if (keepOpen) {
    resetNewContractForm();
    const body = document.querySelector('.nc-body');
    const existing = body.querySelector('.nc-success-msg');
    if (existing) existing.remove();
    const msg = document.createElement('div');
    msg.className = 'nc-success-msg';
    msg.textContent = `Contrato "${row.consignataria}" adicionado com sucesso!`;
    body.insertBefore(msg, body.firstChild);
    document.getElementById('nc-consignataria').focus();
  } else {
    resetNewContractForm();
    closeNewContractModal();
  }
}

function bindNewContract() {
  const openBtn = document.getElementById('open-new-contract');
  if (openBtn) openBtn.addEventListener('click', () => openNewContractModal());

  const closeBtn = document.getElementById('nc-close');
  if (closeBtn) closeBtn.addEventListener('click', closeNewContractModal);

  const overlay = document.getElementById('new-contract-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeNewContractModal();
    });
  }

  const addBtn = document.getElementById('nc-add');
  if (addBtn) addBtn.addEventListener('click', () => addNewContract(false));

  const addAnotherBtn = document.getElementById('nc-add-another');
  if (addAnotherBtn) addAnotherBtn.addEventListener('click', () => addNewContract(true));

  const prestacaoInput = document.getElementById('nc-prestacao');
  if (prestacaoInput) {
    prestacaoInput.addEventListener('input', (e) => {
      e.target.value = formatCurrencyInput(e.target.value);
    });
  }

  ['nc-prestacoes', 'nc-pagas'].forEach((inputId) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', (e) => {
      e.target.value = String(e.target.value || '').replace(/\D/g, '');
    });
  });
}

async function init() {
  bindTopActions();
  bindSummaryInputs();
  bindFactorSimulation();
  bindNewContract();
  bindLogout();
  bindPresenceHeartbeat();
  await Promise.all([loadCommercialMatrix(), loadBankFactors()]);
  renderFactorCards();
  renderRows();
}

init();
