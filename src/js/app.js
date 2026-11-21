/* ASAN-CARGOO accounting — renderer logic */

const EXPENSE_CATEGORIES = ['Fuel', 'Maintenance', 'Tolls', 'Salaries', 'Rent', 'Insurance', 'Office Supplies', 'Other'];

const state = {
  db: null,
  invoices: [],
};

/* ---------- helpers ---------- */

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (n) => fmt.format(Number(n) || 0);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayISO = () => new Date().toISOString().slice(0, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function invoiceTotal(inv) {
  return (inv.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
}
function invoicePaid(inv) {
  return (inv.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}
function invoiceBalance(inv) {
  return invoiceTotal(inv) - invoicePaid(inv);
}
function invoiceStatus(inv) {
  const t = invoiceTotal(inv);
  const p = invoicePaid(inv);
  if (t > 0 && p >= t - 0.005) return 'paid';
  if (p > 0) return 'partial';
  return 'unpaid';
}
function statusBadge(st) {
  const map = { paid: 'success', partial: 'warning', unpaid: 'danger' };
  const label = st.charAt(0).toUpperCase() + st.slice(1);
  return `<span class="badge bg-${map[st]} badge-status">${st === 'paid' ? 'Paid' : label}</span>`;
}
function balanceOf(customerId) {
  return state.invoices
    .filter((i) => i.customerId === customerId)
    .reduce((s, i) => s + invoiceBalance(i), 0);
}
function nextInvoiceNumber(invoices) {
  const year = new Date().getFullYear();
  const prefix = 'INV-' + year + '-';
  const nums = invoices
    .filter((i) => (i.number || '').startsWith(prefix))
    .map((i) => parseInt(i.number.slice(prefix.length), 10) || 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + String(next).padStart(4, '0');
}
function nameById(collection, id) {
  const item = (state.db[collection] || []).find((x) => x.id === id);
  return item ? item.name : '—';
}

function persist(...collections) {
  return Promise.all(collections.map((c) => window.cargooDB.save(c, state.db[c])));
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(message)}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  document.getElementById('toastBox').appendChild(el);
  const t = new bootstrap.Toast(el, { delay: 2500 });
  t.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

function fillSelect(selectEl, list, { placeholder, selectedId } = {}) {
  selectEl.innerHTML =
    (placeholder ? `<option value="">${placeholder}</option>` : '') +
    list.map((x) => `<option value="${x.id}" ${x.id === selectedId ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
}

/* ---------- navigation ---------- */

let bsModals = {};

function showModal(id) {
  (bsModals[id] ||= new bootstrap.Modal(document.getElementById(id))).show();
}
function hideModal(id) {
  (bsModals[id] ||= new bootstrap.Modal(document.getElementById(id))).hide();
}
function confirmDialog(text) {
  return window.confirm(text);
}

function switchView(view) {
  document.querySelectorAll('.view').forEach((s) => s.classList.add('d-none'));
  document.getElementById('view-' + view).classList.remove('d-none');
  document.querySelectorAll('#navList .nav-link').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  render(view);
}

/* ---------- dashboard ---------- */

function renderDashboard() {
  document.getElementById('dashToday').textContent = new Date().toDateString();
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);

  const invoicedAll = state.invoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const collectedAll = state.invoices.reduce((s, i) => s + invoicePaid(i), 0);
  const outstandingAll = invoicedAll - collectedAll;
  const expensesAll = state.db.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const tripsRev = state.db.trips.reduce((s, t) => s + (Number(t.revenue) || 0), 0);
  const tripCosts = state.db.trips.reduce((s, t) => s + (Number(t.cost) || 0), 0);
  const tripProfit = tripsRev - tripCosts;

  const ev = state.db.expenses.filter((e) => (e.date || '').startsWith(monthKey));
  const collectedMonth = state.invoices
    .reduce((s, i) => s + (i.payments || []).filter((p) => (p.date || '').startsWith(monthKey)).reduce((x, p) => x + (Number(p.amount) || 0), 0), 0);

  const cards = [
    { label: 'Invoiced (all time)', value: money(invoicedAll), icon: 'bi-stickies', color: 'primary' },
    { label: 'Collected', value: money(collectedAll), icon: 'bi-cash-stack', color: 'success' },
    { label: 'Outstanding', value: money(outstandingAll), icon: 'bi-hourglass-split', color: 'warning' },
    { label: 'Expenses', value: money(expensesAll), icon: 'bi-credit-card', color: 'danger' },
    { label: 'Trip Profit', value: money(tripProfit), icon: 'bi-signpost-split', color: 'info' },
    { label: 'Collected this month', value: money(collectedMonth), icon: 'bi-calendar-check', color: 'secondary' },
  ];
  document.getElementById('dashCards').innerHTML = cards
    .map(
      (c) => `<div class="col-6 col-lg-4 col-xxl-2">
        <div class="card stat-card h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div><div class="label">${c.label}</div><div class="value text-${c.color}">${c.value}</div></div>
              <i class="bi ${c.icon} fs-4 text-${c.color}"></i>
            </div>
          </div>
        </div>
      </div>`
    )
    .join('');

  document.getElementById('dashYear').textContent = '(' + now.getFullYear() + ')';
  const chart = document.getElementById('dashChart');
  const months = [];
  for (let m = 0; m < 12; m++) {
    months.push({ label: new Date(now.getFullYear(), m, 1).toLocaleString('en', { month: 'short' }), rev: 0, exp: 0 });
  }
  state.invoices.forEach((i) => {
    const ym = (i.date || '').slice(0, 7);
    const idx = Number(ym.slice(5, 7)) - 1;
    if ((i.date || '').startsWith(String(now.getFullYear())) && idx >= 0) months[idx].rev += invoiceTotal(i);
  });
  state.db.expenses.forEach((e) => {
    const idx = Number((e.date || '').slice(5, 7)) - 1;
    if ((e.date || '').startsWith(String(now.getFullYear())) && idx >= 0) months[idx].exp += Number(e.amount) || 0;
  });
  const max = Math.max(1, ...months.map((m) => Math.max(m.rev, m.exp)));
  chart.innerHTML =
    `<div class="chart-row">` +
    months
      .map(
        (m) => `<div class="chart-col" title="${m.label}: rev ${money(m.rev)} / exp ${money(m.exp)}">
          <div class="chart-bars">
            <div class="chart-bar chart-rev" style="height:${(m.rev / max) * 100}%"></div>
            <div class="chart-bar chart-exp" style="height:${(m.exp / max) * 100}%"></div>
          </div>
          <span class="chart-label">${m.label}</span>
        </div>`
      )
      .join('') +
    `</div>`;

  const recent = [...state.invoices].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
  document.getElementById('dashRecentInvoices').innerHTML =
    `<tbody>` +
    (recent.length
      ? recent
          .map((i) => {
            const st = invoiceStatus(i);
            return `<tr>
              <td><a href="#" class="invoice-view" data-id="${i.id}">${esc(i.number)}</a></td>
              <td>${esc(nameById('customers', i.customerId))}</td>
              <td class="text-end">${money(invoiceTotal(i))}</td>
              <td>${statusBadge(st)}</td>
            </tr>`;
          })
          .join('')
      : `<tr><td class="text-muted p-3">No invoices yet — create your first one in the Invoices tab.</td></tr>`) +
    `</tbody>`;
}

/* ---------- customers ---------- */

function renderCustomers() {
  const rows = state.db.customers.map((c) => {
    const bal = balanceOf(c.id);
    const invoiced = state.invoices.filter((i) => i.customerId === c.id).reduce((s, i) => s + invoiceTotal(i), 0);
    const paid = invoiced - bal;
    return `<tr>
      <td class="fw-semibold">${esc(c.name)}</td>
      <td>${esc(c.company || '—')}</td>
      <td>${esc(c.phone || '—')}</td>
      <td>${esc(c.email || '—')}</td>
      <td class="text-end">${money(invoiced)}</td>
      <td class="text-end">${money(paid)}</td>
      <td class="text-end fw-bold ${bal > 0.005 ? 'status-unpaid' : 'status-paid'}">${money(bal)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="App.openCustomer('${c.id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="App.deleteCustomer('${c.id}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  });
  document.getElementById('customersBody').innerHTML =
    rows.join('') ||
    `<tr><td colspan="8" class="text-muted p-4 text-center">No customers yet. Click “New Customer” to add one.</td></tr>`;
}

function openCustomerModal(id = null) {
  document.getElementById('customerForm').reset();
  document.getElementById('customerId').value = id || '';
  if (id) {
    const c = state.db.customers.find((x) => x.id === id);
    if (!c) return;
    document.getElementById('customerName').value = c.name || '';
    document.getElementById('customerCompany').value = c.company || '';
    document.getElementById('customerPhone').value = c.phone || '';
    document.getElementById('customerEmail').value = c.email || '';
    document.getElementById('customerNotes').value = c.notes || '';
  }
  showModal('customerModal');
}

function deleteCustomer(id) {
  if (!confirmDialog('Delete this customer? Invoices stay but will show “Unknown customer”.')) return;
  state.db.customers = state.db.customers.filter((c) => c.id !== id);
  persist('customers').then(() => {
    toast('Customer deleted');
    renderCurrent();
  });
}

/* ---------- invoices ---------- */

function renderInvoices() {
  const filter = document.getElementById('invoiceFilter').value;
  const list = [...state.invoices]
    .filter((i) => !filter || invoiceStatus(i) === filter)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const rows = list.map((i) => {
    const st = invoiceStatus(i);
    const bal = invoiceBalance(i);
    return `<tr>
      <td><a href="#" class="invoice-view" data-id="${i.id}">${esc(i.number)}</a></td>
      <td>${esc(i.date)}</td>
      <td>${esc(nameById('customers', i.customerId))}</td>
      <td class="text-end">${money(invoiceTotal(i))}</td>
      <td class="text-end">${money(invoicePaid(i))}</td>
      <td class="text-end fw-bold">${money(bal)}</td>
      <td>${statusBadge(st)}</td>
      <td class="text-end text-nowrap">
        ${st !== 'paid' ? `<button class="btn btn-sm btn-success me-1" onclick="App.openPayment('${i.id}')" title="Record payment"><i class="bi bi-cash"></i></button>` : ''}
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="App.printInvoice('${i.id}')" title="Print"><i class="bi bi-printer"></i></button>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="App.openInvoice('${i.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="App.deleteInvoice('${i.id}')" title="Delete"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  });
  document.getElementById('invoicesBody').innerHTML =
    rows.join('') || `<tr><td colspan="8" class="text-muted p-4 text-center">No invoices${filter ? ' with this status' : ' yet'}.</td></tr>`;
}

function addInvoiceLine(desc = '', qty = 1, rate = '') {
  const tbody = document.getElementById('invoiceLinesBody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="form-control form-control-sm line-desc" value="${esc(desc)}" /></td>
    <td><input type="number" step="any" min="0" class="form-control form-control-sm line-qty" value="${qty}" /></td>
    <td><input type="number" step="0.01" min="0" class="form-control form-control-sm line-rate" value="${rate}" /></td>
    <td class="text-end small line-amount">$0.00</td>
    <td><button type="button" class="btn btn-sm btn-outline-danger btn-line-remove"><i class="bi bi-x"></i></button></td>`;
  tbody.appendChild(tr);
  updateInvoiceTotal();
}

function updateInvoiceTotal() {
  let total = 0;
  document.querySelectorAll('#invoiceLinesBody tr').forEach((tr) => {
    const amt = (Number(tr.querySelector('.line-qty').value) || 0) * (Number(tr.querySelector('.line-rate').value) || 0);
    total += amt;
    tr.querySelector('.line-amount').textContent = money(amt);
  });
  document.getElementById('invoiceTotalLabel').textContent = money(total);
}

function openInvoiceModal(id = null) {
  if (!state.db.customers.length) {
    toast('Add a customer first', 'warning');
    switchView('customers');
    openCustomerModal();
    return;
  }
  document.getElementById('invoiceForm').reset();
  document.getElementById('invoiceLinesBody').innerHTML = '';
  document.getElementById('invoiceId').value = id || '';

  fillSelect(document.getElementById('invoiceCustomer'), state.db.customers, { placeholder: '— select customer —' });

  if (id) {
    const inv = state.invoices.find((x) => x.id === id);
    if (!inv) return;
    document.getElementById('invoiceNumberLabel').textContent = inv.number;
    document.getElementById('invoiceCustomer').value = inv.customerId;
    document.getElementById('invoiceDate').value = inv.date;
    document.getElementById('invoiceDueDate').value = inv.dueDate || '';
    document.getElementById('invoiceNotes').value = inv.notes || '';
    (inv.items || []).forEach((it) => addInvoiceLine(it.desc, it.qty, it.rate));
  } else {
    document.getElementById('invoiceNumberLabel').textContent = nextInvoiceNumber(state.invoices);
    document.getElementById('invoiceDate').value = todayISO();
    addInvoiceLine();
  }
  showModal('invoiceModal');
}

function saveInvoice(e) {
  e.preventDefault();
  const id = document.getElementById('invoiceId').value;
  const items = [];
  document.querySelectorAll('#invoiceLinesBody tr').forEach((tr) => {
    const desc = tr.querySelector('.line-desc').value.trim();
    const qty = Number(tr.querySelector('.line-qty').value) || 0;
    const rate = Number(tr.querySelector('.line-rate').value) || 0;
    if (desc || qty || rate) items.push({ desc, qty, rate });
  });
  if (!items.length) {
    toast('Add at least one line item', 'warning');
    return;
  }
  const data = {
    customerId: document.getElementById('invoiceCustomer').value,
    date: document.getElementById('invoiceDate').value,
    dueDate: document.getElementById('invoiceDueDate').value,
    notes: document.getElementById('invoiceNotes').value.trim(),
    items
  };
  if (!data.customerId) {
    toast('Select a customer', 'warning');
    return;
  }

  if (id) {
    const inv = state.invoices.find((x) => x.id === id);
    Object.assign(inv, data);
    toast('Invoice updated');
  } else {
    state.db.invoices.push({
      id: uid(),
      number: nextInvoiceNumber(state.invoices),
      payments: [],
      createdAt: new Date().toISOString(),
      ...data
    });
    toast('Invoice created');
  }
  hideModal('invoiceModal');
  persist('invoices').then(renderCurrent);
}

function deleteInvoice(id) {
  if (!confirmDialog('Delete this invoice and all its payments?')) return;
  state.db.invoices = state.db.invoices.filter((i) => i.id !== id);
  persist('invoices').then(() => {
    toast('Invoice deleted');
    renderCurrent();
  });
}

function openPaymentModal(invoiceId) {
  const inv = state.invoices.find((x) => x.id === invoiceId);
  if (!inv) return;
  const bal = invoiceBalance(inv);
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentInvoiceId').value = invoiceId;
  document.getElementById('paymentInvoiceNo').textContent = '(' + inv.number + ')';
  document.getElementById('paymentTotal').textContent = money(invoiceTotal(inv));
  document.getElementById('paymentBalance').textContent = money(bal);
  document.getElementById('paymentBalance').dataset.raw = bal;
  document.getElementById('paymentAmount').value = bal > 0 ? bal.toFixed(2) : '';
  document.getElementById('paymentDate').value = todayISO();
  showModal('paymentModal');
}

function savePayment(e) {
  e.preventDefault();
  const inv = state.invoices.find((x) => x.id === document.getElementById('paymentInvoiceId').value);
  if (!inv) return;
  const amount = Number(document.getElementById('paymentAmount').value) || 0;
  const bal = Number(document.getElementById('paymentBalance').dataset.raw) || 0;
  if (amount > bal + 0.005) {
    toast('Amount exceeds remaining balance', 'warning');
    return;
  }
  inv.payments = inv.payments || [];
  inv.payments.push({
    id: uid(),
    amount,
    date: document.getElementById('paymentDate').value,
    method: document.getElementById('paymentMethod').value
  });
  hideModal('paymentModal');
  persist('invoices').then(() => {
    toast('Payment recorded');
    renderCurrent();
  });
}

function printInvoice(id) {
  const inv = state.invoices.find((x) => x.id === id);
  if (!inv) return;
  const c = state.db.customers.find((x) => x.id === inv.customerId) || {};
  const rowsHtml = (inv.items || [])
    .map((it, n) => `<tr><td>${n + 1}</td><td>${esc(it.desc)}</td><td style="text-align:right">${it.qty}</td><td style="text-align:right">${money(it.rate)}</td><td style="text-align:right">${money(it.qty * it.rate)}</td></tr>`)
    .join('');
  const win = window.open('', '_blank', 'width=800,height=900');
  win.document.write(`<!DOCTYPE html><html><head><title>${esc(inv.number)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; color: #222; }
      h1 { color: #0d6efd; margin: 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 24px; }
      th, td { border-bottom: 1px solid #ddd; padding: 8px; font-size: 14px; }
      th { background: #f4f6f9; text-align: left; }
      .tot { font-size: 18px; font-weight: bold; text-align: right; margin-top: 16px; }
      .meta { margin-top: 24px; line-height: 1.6; }
    </style></head><body>
    <h1>ASAN-CARGOO</h1><div>Transportation &amp; Logistics</div>
    <h2 style="margin-top:24px">Invoice ${esc(inv.number)}</h2>
    <div class="meta">
      <b>Bill to:</b> ${esc(c.name || 'Unknown customer')}${c.company ? ' — ' + esc(c.company) : ''}<br/>
      <b>Date:</b> ${esc(inv.date)}<br/><b>Due:</b> ${esc(inv.dueDate || '—')}
    </div>
    <table><thead><tr><th>#</th><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rowsHtml}</tbody></table>
    <div class="tot">Total: ${money(invoiceTotal(inv))}<br/>Paid: ${money(invoicePaid(inv))}<br/>Balance due: ${money(invoiceBalance(inv))}</div>
    ${inv.notes ? '<p style="margin-top:24px"><b>Notes:</b> ' + esc(inv.notes) + '</p>' : ''}
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`);
  win.document.close();
}

/* ---------- expenses ---------- */

function renderExpenses() {
  const month = document.getElementById('expenseMonthFilter').value;
  const cat = document.getElementById('expenseCategoryFilter').value;
  const list = [...state.db.expenses]
    .filter((e) => (!month || (e.date || '').startsWith(month)) && (!cat || e.category === cat))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const rows = list.map((x) => {
    const v = state.db.vehicles.find((v2) => v2.id === x.vehicleId);
    return `<tr>
      <td>${esc(x.date)}</td>
      <td><span class="badge bg-light text-dark border">${esc(x.category)}</span></td>
      <td>${v ? esc(v.name) : '—'}</td>
      <td>${esc(x.note || '—')}</td>
      <td class="text-end fw-bold">${money(x.amount)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="App.openExpense('${x.id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="App.deleteExpense('${x.id}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  });
  const sum = list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  document.getElementById('expensesBody').innerHTML =
    rows.join('') +
    `<tr class="table-light"><td colspan="4" class="fw-bold">Total shown (${list.length})</td><td class="text-end fw-bold">${money(sum)}</td><td></td></tr>`;
}

function openExpenseModal(id = null) {
  document.getElementById('expenseForm').reset();
  document.getElementById('expenseId').value = id || '';
  fillSelect(document.getElementById('expenseVehicle'), state.db.vehicles, { placeholder: '— none —' });
  if (id) {
    const x = state.db.expenses.find((e) => e.id === id);
    if (!x) return;
    document.getElementById('expenseDate').value = x.date;
    document.getElementById('expenseCategory').value = x.category;
    document.getElementById('expenseVehicle').value = x.vehicleId || '';
    document.getElementById('expenseAmount').value = x.amount;
    document.getElementById('expenseNote').value = x.note || '';
  } else {
    document.getElementById('expenseDate').value = todayISO();
  }
  showModal('expenseModal');
}

function saveExpense(e) {
  e.preventDefault();
  const id = document.getElementById('expenseId').value;
  const data = {
    date: document.getElementById('expenseDate').value,
    category: document.getElementById('expenseCategory').value,
    vehicleId: document.getElementById('expenseVehicle').value || null,
    amount: Number(document.getElementById('expenseAmount').value) || 0,
    note: document.getElementById('expenseNote').value.trim()
  };
  if (id) {
    Object.assign(state.db.expenses.find((x) => x.id === id), data);
    toast('Expense updated');
  } else {
    state.db.expenses.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
    toast('Expense added');
  }
  hideModal('expenseModal');
  persist('expenses').then(renderCurrent);
}

function deleteExpense(id) {
  if (!confirmDialog('Delete this expense?')) return;
  state.db.expenses = state.db.expenses.filter((x) => x.id !== id);
  persist('expenses').then(() => {
    toast('Expense deleted');
    renderCurrent();
  });
}

/* ---------- trips ---------- */

function renderTrips() {
  const month = document.getElementById('tripMonthFilter').value;
  const list = [...state.db.trips]
    .filter((t) => !month || (t.date || '').startsWith(month))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const rows = list.map((t) => {
    const rev = Number(t.revenue) || 0;
    const cost = Number(t.cost) || 0;
    const profit = rev - cost;
    return `<tr>
      <td>${esc(t.date)}</td>
      <td>${esc(t.origin)} → ${esc(t.destination)}${t.cargo ? ' <span class="text-muted small">(' + esc(t.cargo) + ')</span>' : ''}</td>
      <td>${esc(nameById('customers', t.customerId))}</td>
      <td>${t.vehicleId ? esc(nameById('vehicles', t.vehicleId)) : '—'}</td>
      <td>${t.driverId ? esc(nameById('drivers', t.driverId)) : '—'}</td>
      <td class="text-end">${money(rev)}</td>
      <td class="text-end">${money(cost)}</td>
      <td class="text-end fw-bold ${profit >= 0 ? 'status-paid' : 'status-unpaid'}">${money(profit)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="App.openTrip('${t.id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="App.deleteTrip('${t.id}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  });
  const sumRev = list.reduce((s, t) => s + (Number(t.revenue) || 0), 0);
  const sumCost = list.reduce((s, t) => s + (Number(t.cost) || 0), 0);
  document.getElementById('tripsBody').innerHTML =
    `<tr class="table-light"><td colspan="5" class="fw-bold">Totals (${list.length} trips)</td>
     <td class="text-end fw-bold">${money(sumRev)}</td><td class="text-end fw-bold">${money(sumCost)}</td>
     <td class="text-end fw-bold">${money(sumRev - sumCost)}</td><td></td></tr>` +
    (list.length ? rows.join('') : '');
  if (!list.length) {
    document.querySelector('#tripsBody').insertAdjacentHTML(
      'beforeend',
      `<tr><td colspan="9" class="text-muted p-4 text-center">No trips${month ? ' in this month' : ' yet'}.</td></tr>`
    );
  }
}

function openTripModal(id = null) {
  document.getElementById('tripForm').reset();
  document.getElementById('tripId').value = id || '';
  fillSelect(document.getElementById('tripCustomer'), state.db.customers, { placeholder: '— none —' });
  fillSelect(document.getElementById('tripVehicle'), state.db.vehicles, { placeholder: '— none —' });
  fillSelect(document.getElementById('tripDriver'), state.db.drivers, { placeholder: '— none —' });
  if (id) {
    const t = state.db.trips.find((x) => x.id === id);
    if (!t) return;
    document.getElementById('tripDate').value = t.date;
    document.getElementById('tripOrigin').value = t.origin || '';
    document.getElementById('tripDestination').value = t.destination || '';
    document.getElementById('tripCustomer').value = t.customerId || '';
    document.getElementById('tripVehicle').value = t.vehicleId || '';
    document.getElementById('tripDriver').value = t.driverId || '';
    document.getElementById('tripCargo').value = t.cargo || '';
    document.getElementById('tripRevenue').value = t.revenue;
    document.getElementById('tripCost').value = t.cost;
  } else {
    document.getElementById('tripDate').value = todayISO();
  }
  showModal('tripModal');
}

function saveTrip(e) {
  e.preventDefault();
  const id = document.getElementById('tripId').value;
  const data = {
    date: document.getElementById('tripDate').value,
    origin: document.getElementById('tripOrigin').value.trim(),
    destination: document.getElementById('tripDestination').value.trim(),
    customerId: document.getElementById('tripCustomer').value || null,
    vehicleId: document.getElementById('tripVehicle').value || null,
    driverId: document.getElementById('tripDriver').value || null,
    cargo: document.getElementById('tripCargo').value.trim(),
    revenue: Number(document.getElementById('tripRevenue').value) || 0,
    cost: Number(document.getElementById('tripCost').value) || 0
  };
  if (id) {
    Object.assign(state.db.trips.find((x) => x.id === id), data);
    toast('Trip updated');
  } else {
    state.db.trips.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
    toast('Trip added');
  }
  hideModal('tripModal');
  persist('trips').then(renderCurrent);
}

function deleteTrip(id) {
  if (!confirmDialog('Delete this trip?')) return;
  state.db.trips = state.db.trips.filter((x) => x.id !== id);
  persist('trips').then(() => {
    toast('Trip deleted');
    renderCurrent();
  });
}

/* ---------- fleet ---------- */

function renderFleet() {
  document.getElementById('vehiclesBody').innerHTML =
    state.db.vehicles
      .map(
        (v) => `<tr>
          <td class="fw-semibold">${esc(v.name)}</td>
          <td>${esc(v.plate || '—')}</td><td>${esc(v.type || '—')}</td>
          <td class="text-end text-nowrap">
            <button class="btn btn-sm btn-outline-primary me-1" onclick="App.openVehicle('${v.id}')"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="App.deleteVehicle('${v.id}')"><i class="bi bi-trash"></i></button>
          </td></tr>`
      )
      .join('') ||
    `<tr><td colspan="4" class="text-muted p-3 text-center">No vehicles added.</td></tr>`;

  document.getElementById('driversBody').innerHTML =
    state.db.drivers
      .map(
        (d) => `<tr>
          <td class="fw-semibold">${esc(d.name)}</td>
          <td>${esc(d.phone || '—')}</td><td>${esc(d.license || '—')}</td>
          <td class="text-end text-nowrap">
            <button class="btn btn-sm btn-outline-primary me-1" onclick="App.openDriver('${d.id}')"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="App.deleteDriver('${d.id}')"><i class="bi bi-trash"></i></button>
          </td></tr>`
      )
      .join('') ||
    `<tr><td colspan="4" class="text-muted p-3 text-center">No drivers added.</td></tr>`;
}

function openVehicleModal(id = null) {
  document.getElementById('vehicleForm').reset();
  document.getElementById('vehicleId').value = id || '';
  if (id) {
    const v = state.db.vehicles.find((x) => x.id === id);
    document.getElementById('vehicleName').value = v.name || '';
    document.getElementById('vehiclePlate').value = v.plate || '';
    document.getElementById('vehicleType').value = v.type || 'Truck';
  }
  showModal('vehicleModal');
}
function saveVehicle(e) {
  e.preventDefault();
  const id = document.getElementById('vehicleId').value;
  const data = {
    name: document.getElementById('vehicleName').value.trim(),
    plate: document.getElementById('vehiclePlate').value.trim(),
    type: document.getElementById('vehicleType').value
  };
  if (id) Object.assign(state.db.vehicles.find((v) => v.id === id), data);
  else state.db.vehicles.push({ id: uid(), ...data });
  hideModal('vehicleModal');
  persist('vehicles').then(() => { toast('Vehicle saved'); renderCurrent(); });
}
function deleteVehicle(id) {
  if (!confirmDialog('Delete this vehicle?')) return;
  state.db.vehicles = state.db.vehicles.filter((v) => v.id !== id);
  persist('vehicles').then(() => { toast('Vehicle deleted'); renderCurrent(); });
}

function openDriverModal(id = null) {
  document.getElementById('driverForm').reset();
  document.getElementById('driverId').value = id || '';
  if (id) {
    const d = state.db.drivers.find((x) => x.id === id);
    document.getElementById('driverName').value = d.name || '';
    document.getElementById('driverPhone').value = d.phone || '';
    document.getElementById('driverLicense').value = d.license || '';
  }
  showModal('driverModal');
}
function saveDriver(e) {
  e.preventDefault();
  const id = document.getElementById('driverId').value;
  const data = {
    name: document.getElementById('driverName').value.trim(),
    phone: document.getElementById('driverPhone').value.trim(),
    license: document.getElementById('driverLicense').value.trim()
  };
  if (id) Object.assign(state.db.drivers.find((d) => d.id === id), data);
  else state.db.drivers.push({ id: uid(), ...data });
  hideModal('driverModal');
  persist('drivers').then(() => { toast('Driver saved'); renderCurrent(); });
}
function deleteDriver(id) {
  if (!confirmDialog('Delete this driver?')) return;
  state.db.drivers = state.db.drivers.filter((d) => d.id !== id);
  persist('drivers').then(() => { toast('Driver deleted'); renderCurrent(); });
}

/* ---------- reports ---------- */

function renderReports() {
  const ym = document.getElementById('reportMonth').value || new Date().toISOString().slice(0, 7);
  const label = new Date(ym + '-01').toLocaleString('en', { month: 'long', year: 'numeric' });

  const revInvoiced = state.invoices.filter((i) => (i.date || '').startsWith(ym)).reduce((s, i) => s + invoiceTotal(i), 0);
  const collected = state.invoices.reduce(
    (s, i) => s + (i.payments || []).filter((p) => (p.date || '').startsWith(ym)).reduce((x, p) => x + Number(p.amount), 0), 0);
  const expenses = state.db.expenses.filter((e) => (e.date || '').startsWith(ym)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const tripRev = state.db.trips.filter((t) => (t.date || '').startsWith(ym)).reduce((s, t) => s + (Number(t.revenue) || 0), 0);
  const tripCost = state.db.trips.filter((t) => (t.date || '').startsWith(ym)).reduce((s, t) => s + (Number(t.cost) || 0), 0);

  const cards = [
    { label: `Invoiced — ${label}`, value: money(revInvoiced), color: 'primary' },
    { label: 'Payments collected', value: money(collected), color: 'success' },
    { label: 'Expenses', value: money(expenses), color: 'danger' },
    { label: 'Trip revenue / cost', value: `${money(tripRev)} / ${money(tripCost)}`, color: 'info' },
    { label: 'Net (collected − expenses)', value: money(collected - expenses), color: collected - expenses >= 0 ? 'success' : 'danger' },
  ];
  document.getElementById('reportCards').innerHTML = cards
    .map(
      (c) => `<div class="col-md col-6">
        <div class="card stat-card"><div class="card-body">
          <div class="label">${c.label}</div>
          <div class="value text-${c.color}">${c.value}</div>
        </div></div></div>`
    )
    .join('');

  const byCat = {};
  state.db.expenses.filter((e) => (e.date || '').startsWith(ym)).forEach((e) => {
    byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0);
  });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...catEntries.map(([, v]) => v));
  document.getElementById('reportExpensesByCategory').innerHTML = catEntries.length
    ? catEntries
        .map(
          ([cat, val]) => `<div class="mb-2">
            <div class="d-flex justify-content-between small fw-semibold"><span>${esc(cat)}</span><span>${money(val)}</span></div>
            <div class="progress" style="height:8px"><div class="progress-bar bg-danger" style="width:${(val / maxCat) * 100}%"></div></div>
          </div>`
        )
        .join('')
    : `<div class="text-muted">No expenses recorded in ${esc(label)}.</div>`;

  const balRows = state.db.customers
    .map((c) => ({ c, bal: balanceOf(c.id) }))
    .filter((r) => r.bal !== 0)
    .sort((a, b) => b.bal - a.bal);
  document.getElementById('reportBalances').innerHTML =
    `<thead class="table-light"><tr><th>Customer</th><th class="text-end">Balance owed</th></tr></thead><tbody>` +
    (balRows.length
      ? balRows
          .map(
            (r) => `<tr><td>${esc(r.c.name)}</td>
            <td class="text-end fw-bold ${r.bal > 0 ? 'status-unpaid' : 'status-paid'}">${money(r.bal)}</td></tr>`
          )
          .join('')
      : `<tr><td class="text-muted p-3">No outstanding balances. Everyone is settled up.</td></tr>`) +
    `</tbody>`;
}

function exportCsv() {
  const ym = document.getElementById('reportMonth').value || new Date().toISOString().slice(0, 7);
  const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['type,date,reference,category/description,amount_usd'];

  state.db.expenses
    .filter((e) => (e.date || '').startsWith(ym))
    .forEach((e) => lines.push([csvEscape('expense'), csvEscape(e.date), '', csvEscape(e.category + (e.note ? ' - ' + e.note : '')), csvEscape(-(Number(e.amount) || 0))].join(',')));

  state.invoices.forEach((i) => {
    (i.payments || [])
      .filter((p) => (p.date || '').startsWith(ym))
      .forEach((p) => lines.push([csvEscape('payment'), csvEscape(p.date), csvEscape(i.number), csvEscape('Payment from ' + nameById('customers', i.customerId) + ' (' + (p.method || '') + ')'), csvEscape(Number(p.amount) || 0)].join(',')));
  });

  state.db.trips
    .filter((t) => (t.date || '').startsWith(ym))
    .forEach((t) => lines.push([csvEscape('trip'), csvEscape(t.date), csvEscape(t.origin + ' → ' + t.destination), csvEscape('Trip revenue'), csvEscape(Number(t.revenue) || 0)]));

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `asan-cargoo-report-${ym}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV exported');
}

/* ---------- controller ---------- */

function renderCurrent() {
  render(window.currentView || 'dashboard');
}

function render(view) {
  ({ dashboard: renderDashboard, customers: renderCustomers, invoices: renderInvoices,
     expenses: renderExpenses, trips: renderTrips, fleet: renderFleet, reports: renderReports }[view] || (() => {}))();
}

const App = {
  openCustomer: openCustomerModal,
  deleteCustomer,
  openInvoice: openInvoiceModal,
  deleteInvoice,
  openPayment: openPaymentModal,
  printInvoice,
  openExpense: openExpenseModal,
  deleteExpense,
  openTrip: openTripModal,
  deleteTrip,
  openVehicle: openVehicleModal,
  openDriver: openDriverModal,
  deleteVehicle,
  deleteDriver,
};

async function init() {
  state.db = await window.cargooDB.load();
  state.invoices = state.db.invoices;

  document.getElementById('expenseCategory').innerHTML = EXPENSE_CATEGORIES.map((c) => `<option>${c}</option>`).join('');
  document.getElementById('expenseCategoryFilter').innerHTML =
    '<option value="">All categories</option>' + EXPENSE_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('tripMonthFilter').value = todayISO().slice(0, 7);
  document.getElementById('reportMonth').value = todayISO().slice(0, 7);

  document.querySelectorAll('[data-view]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(el.dataset.view);
    })
  );

  document.getElementById('customerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('customerId').value;
    const data = {
      name: document.getElementById('customerName').value.trim(),
      company: document.getElementById('customerCompany').value.trim(),
      phone: document.getElementById('customerPhone').value.trim(),
      email: document.getElementById('customerEmail').value.trim(),
      notes: document.getElementById('customerNotes').value.trim()
    };
    if (id) Object.assign(state.db.customers.find((c) => c.id === id), data);
    else state.db.customers.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
    hideModal('customerModal');
    persist('customers').then(() => { toast('Customer saved'); renderCurrent(); });
  });

  document.getElementById('newInvoiceBtn').addEventListener('click', () => openInvoiceModal());
  document.getElementById('addLineBtn').addEventListener('click', () => addInvoiceLine());
  document.getElementById('invoiceForm').addEventListener('submit', saveInvoice);
  document.getElementById('invoiceLinesBody').addEventListener('input', updateInvoiceTotal);
  document.getElementById('invoiceLinesBody').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-line-remove');
    if (btn) {
      btn.closest('tr').remove();
      updateInvoiceTotal();
    }
  });
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.invoice-view');
    if (link) {
      e.preventDefault();
      openInvoiceModal(link.dataset.id);
    }
  });
  document.getElementById('invoiceFilter').addEventListener('change', renderInvoices);

  document.getElementById('paymentForm').addEventListener('submit', savePayment);

  document.getElementById('newExpenseBtn').addEventListener('click', () => openExpenseModal());
  document.getElementById('expenseForm').addEventListener('submit', saveExpense);
  document.getElementById('expenseMonthFilter').addEventListener('change', renderExpenses);
  document.getElementById('expenseCategoryFilter').addEventListener('change', renderExpenses);

  document.getElementById('newTripBtn').addEventListener('click', () => openTripModal());
  document.getElementById('tripForm').addEventListener('submit', saveTrip);
  document.getElementById('tripMonthFilter').addEventListener('change', renderTrips);

  document.getElementById('newVehicleBtn').addEventListener('click', () => openVehicleModal());
  document.getElementById('vehicleForm').addEventListener('submit', saveVehicle);
  document.getElementById('newDriverBtn').addEventListener('click', () => openDriverModal());
  document.getElementById('driverForm').addEventListener('submit', saveDriver);

  document.getElementById('reportMonth').addEventListener('change', renderReports);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);

  switchView('dashboard');
}

window.App = App;
document.addEventListener('DOMContentLoaded', init);
