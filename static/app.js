const state = {
  discounts: [],
  rows: [],
  bankFactors: [],
  factorMode: 'margin',
  factorProduct: 'normal',
  factorCardsVisible: false,
  factorCardsSignature: '',
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

function setTheme() {
  document.documentElement.dataset.theme = 'dark';
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

function discountRequiresAvulso(discountName) {
  const value = normalizeText(discountName);
  return value.includes('crescente') || value.includes('decrescente');
}

function computeRow(row) {
  const installmentCount = Number(row.prestacoes || 0);
  const paidCount = Number(row.pagas || 0);
  const hasInstallments = installmentCount > 0 && paidCount >= 0;
  const remaining = hasInstallments ? Math.max(installmentCount - paidCount, 0) : 0;
  const installmentValue = Number(row.prestacao || 0);
  const debtBalance = remaining * installmentValue;
  const avulsoCount = Number(row.avulsoCount || 0);
  const rawQuitBase = avulsoCount > 0 ? Math.min(avulsoCount, remaining) * installmentValue : debtBalance;
  const discountPercent = Number(row.discountPercent || 0);
  const requiresAvulso = discountRequiresAvulso(row.discountName);
  const canApplyDiscount = row.discountName && (!requiresAvulso || avulsoCount > 0);
  const quitBase = canApplyDiscount ? rawQuitBase : 0;
  const discountedValue = canApplyDiscount ? quitBase * (1 - discountPercent / 100) : 0;

  return {
    ...row,
    bankName: inferBankName(row.consignataria),
    statusLabel: normalizeStatus(row.situacao),
    remaining,
    debtBalance,
    quitBase,
    discountedValue,
    canApplyDiscount,
    description: hasInstallments ? `${paidCount} de ${installmentCount} pagas de ${formatCurrency(installmentValue)}` : '-',
    sumInstallments: installmentValue,
  };
}

function updateSummary() {
  const calculatedRows = state.rows.map(computeRow);
  const totalOffer = calculatedRows
    .filter((row) => row.discountName)
    .reduce((sum, row) => sum + row.discountedValue, 0);

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

function buildDiscountOptions(row) {
  const blank = '<option value="">Selecione...</option>';
  const options = state.discounts.map((item) => {
    const selected = item.name === row.discountName ? 'selected' : '';
    return `<option value="${escapeHtml(item.name)}" data-percent="${item.percent}" ${selected}>${escapeHtml(item.name)}</option>`;
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
    tbody.innerHTML = '<tr><td colspan="15" class="empty-state">Nenhuma linha processada.</td></tr>';
    document.getElementById('result-title').textContent = 'Resultado - 0 registros processados';
    renderBanksTable();
    updateSummary();
    return;
  }

  tbody.innerHTML = state.rows.map((row, index) => {
    const calculated = computeRow(row);
    return `
      <tr>
        <td class="col-consig">${escapeHtml(calculated.consignataria || '-')}</td>
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
          <select class="discount-select" data-index="${index}">
            ${buildDiscountOptions(row)}
          </select>
        </td>
        <td class="calc-value">${calculated.canApplyDiscount ? formatPercent(calculated.discountPercent) : '-'}</td>
        <td class="highlight-value">${calculated.canApplyDiscount ? formatCurrency(calculated.discountedValue) : '-'}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('result-title').textContent = `Resultado - ${state.rows.length} registros processados`;
  bindRowEvents();
  restoreAvulsoFocus(focusIndex, caretPosition);
  renderBanksTable();
  updateSummary();
}

function bindRowEvents() {
  document.querySelectorAll('.discount-select').forEach((select) => {
    select.addEventListener('change', (event) => {
      const index = Number(event.target.dataset.index);
      const selectedOption = event.target.selectedOptions[0];
      state.rows[index].discountName = event.target.value;
      state.rows[index].discountPercent = Number(selectedOption?.dataset.percent || 0);
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
}

async function loadDiscounts() {
  try {
    const response = await fetch('/api/discounts', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.discounts = await response.json();
  } catch (error) {
    console.error('Falha ao carregar descontos:', error);
    state.discounts = [];
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

  const response = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const payload = await response.json();
  state.rows = (payload.rows || []).map((row) => ({
    ...row,
    discountName: '',
    discountPercent: 0,
    avulsoCount: '',
  }));
  renderRows();
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

async function init() {
  bindTopActions();
  bindSummaryInputs();
  bindFactorSimulation();
  setTheme();
  renderFactorCards();
  renderRows();
  await Promise.all([loadDiscounts(), loadBankFactors()]);
  renderFactorCards();
  renderRows();
}

init();
