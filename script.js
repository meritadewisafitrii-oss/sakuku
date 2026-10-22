"use strict";

const STORAGE_KEY = "saku.transactions.v1";
const MAX_AMOUNT = 999_999_999;

const CATEGORY_META = Object.freeze({
  Makanan: { slug: "makanan", icon: "icon-food" },
  Transportasi: { slug: "transportasi", icon: "icon-transport" },
  Belanja: { slug: "belanja", icon: "icon-shopping" },
  Hiburan: { slug: "hiburan", icon: "icon-entertainment" },
  Lainnya: { slug: "lainnya", icon: "icon-other" },
});

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const shortMonth = new Intl.DateTimeFormat("id-ID", { month: "short" });
const longMonth = new Intl.DateTimeFormat("id-ID", { month: "long" });
const shortWeekday = new Intl.DateTimeFormat("id-ID", { weekday: "short" });
const longWeekday = new Intl.DateTimeFormat("id-ID", { weekday: "long" });
const listDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const fullDate = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const elements = {
  currentDate: document.querySelector("#currentDate"),
  weekRange: document.querySelector("#weekRange"),
  weekTotal: document.querySelector("#weekTotal"),
  weekCount: document.querySelector("#weekCount"),
  weekAverage: document.querySelector("#weekAverage"),
  todayTotal: document.querySelector("#todayTotal"),
  todayMeta: document.querySelector("#todayMeta"),
  dailyAverage: document.querySelector("#dailyAverage"),
  chart: document.querySelector("#chart"),
  chartTotal: document.querySelector("#chartTotal"),
  chartCaption: document.querySelector("#chartCaption"),
  historyMeta: document.querySelector("#historyMeta"),
  historyCount: document.querySelector("#historyCount"),
  transactionList: document.querySelector("#transactionList"),
  listHead: document.querySelector(".list-head"),
  emptyState: document.querySelector("#emptyState"),
  emptyCta: document.querySelector("#emptyCta"),
  form: document.querySelector("#transactionForm"),
  nameInput: document.querySelector("#expenseName"),
  amountInput: document.querySelector("#expenseAmount"),
  dateInput: document.querySelector("#expenseDate"),
  liveRegion: document.querySelector("#liveRegion"),
  toast: document.querySelector("#toast"),
  toastIcon: document.querySelector("#toastIcon"),
  toastMessage: document.querySelector("#toastMessage"),
  toastAction: document.querySelector("#toastAction"),
};

let transactions = [];
let deletedTransaction = null;
let toastTimer = 0;
let toastHideTimer = 0;
let toastActionHandler = null;

/* Date helpers */

function pad(value) {
  return String(value).padStart(2, "0");
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function addDays(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCurrency(value) {
  return rupiah.format(Math.round(Number(value) || 0));
}

function formatWeekRange(start, end) {
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${longMonth.format(end)} ${end.getFullYear()}`;
  }

  if (sameYear) {
    return `${start.getDate()} ${shortMonth.format(start)} – ${end.getDate()} ${shortMonth.format(end)} ${end.getFullYear()}`;
  }

  return `${start.getDate()} ${shortMonth.format(start)} ${start.getFullYear()} – ${end.getDate()} ${shortMonth.format(end)} ${end.getFullYear()}`;
}

function formatExactDate(isoDate) {
  const date = parseISODate(isoDate);
  return date ? listDate.format(date) : isoDate;
}

function formatRelativeDate(isoDate, todayISO) {
  if (isoDate === todayISO) return "Hari ini";

  const yesterday = addDays(parseISODate(todayISO), -1);
  if (isoDate === toISODate(yesterday)) return "Kemarin";

  return formatExactDate(isoDate);
}

function formatFullDate(date) {
  return capitalize(fullDate.format(date));
}

function formatChartDay(date) {
  return capitalize(shortWeekday.format(date));
}

/* Data helpers */

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeCategory(category) {
  return Object.prototype.hasOwnProperty.call(CATEGORY_META, category)
    ? category
    : "Lainnya";
}

function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;

        const name = typeof item.name === "string" ? item.name.trim().slice(0, 60) : "";
        const amount = Math.round(Number(item.amount));
        const date = typeof item.date === "string" ? item.date : "";

        if (!name || !Number.isFinite(amount) || amount <= 0 || !parseISODate(date)) {
          return null;
        }

        return {
          id: typeof item.id === "string" && item.id ? item.id : createId(),
          name,
          amount: Math.min(amount, MAX_AMOUNT),
          category: sanitizeCategory(item.category),
          date,
          createdAt: Number(item.createdAt) || index,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error("Tidak dapat membaca data Saku:", error);
    return [];
  }
}

function saveTransactions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    return true;
  } catch (error) {
    console.error("Tidak dapat menyimpan data Saku:", error);
    showToast("Data gagal disimpan di browser ini.", {
      icon: "icon-lock",
      timeout: 5000,
    });
    return false;
  }
}

function sortTransactions() {
  transactions.sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt
  );
}

/* Rendering */

function setHeaderDate() {
  const now = new Date();
  elements.currentDate.textContent = formatFullDate(now);
  elements.currentDate.dateTime = toISODate(now);
}

function renderSummary(today) {
  const todayISO = toISODate(today);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const startISO = toISODate(weekStart);
  const endISO = toISODate(weekEnd);

  const thisWeek = transactions.filter(
    (transaction) => transaction.date >= startISO && transaction.date <= endISO
  );
  const weekTotal = thisWeek.reduce((sum, transaction) => sum + transaction.amount, 0);
  const todayTransactions = transactions.filter(
    (transaction) => transaction.date === todayISO
  );
  const todayTotal = todayTransactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0
  );

  elements.weekRange.textContent = formatWeekRange(weekStart, weekEnd);
  elements.weekTotal.textContent = formatCurrency(weekTotal);

  if (thisWeek.length === 0) {
    elements.weekCount.textContent = "Belum ada pengeluaran minggu ini";
    elements.weekAverage.textContent = "";
  } else {
    elements.weekCount.textContent = `${thisWeek.length} transaksi`;
    elements.weekAverage.textContent = `Rata-rata ${formatCurrency(weekTotal / thisWeek.length)} / transaksi`;
  }

  elements.todayTotal.textContent = formatCurrency(todayTotal);
  elements.todayMeta.textContent =
    todayTransactions.length === 0
      ? "Belum ada transaksi"
      : `${todayTransactions.length} transaksi hari ini`;

  return {
    todayISO,
    weekTotal,
    todayTotal,
  };
}

function renderChart(today) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const values = days.map((day) => {
    const iso = toISODate(day);
    return transactions
      .filter((transaction) => transaction.date === iso)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  });

  const chartTotal = values.reduce((sum, value) => sum + value, 0);
  const highest = Math.max(...values, 0);
  const maxIndex = values.indexOf(highest);
  const todayISO = toISODate(today);

  elements.chartTotal.textContent = formatCurrency(chartTotal);
  elements.dailyAverage.textContent = formatCurrency(chartTotal / 7);
  elements.chart.setAttribute(
    "aria-label",
    `Grafik batang pengeluaran tujuh hari terakhir. Total ${formatCurrency(chartTotal)}.`
  );

  const guides = Array.from(
    { length: 4 },
    () => '<span class="chart-guide" aria-hidden="true"></span>'
  ).join("");

  const columns = days
    .map((day, index) => {
      const iso = toISODate(day);
      const total = values[index];
      const isToday = iso === todayISO;
      const isEmpty = total === 0;
      const height = isEmpty || highest === 0 ? 0 : Math.max(9, (total / highest) * 100);
      const accessibleLabel = `${longWeekday.format(day)}, ${day.getDate()} ${longMonth.format(day)} ${day.getFullYear()}: ${formatCurrency(total)}`;
      const classes = ["chart-day", isToday ? "is-today" : "", isEmpty ? "is-zero" : ""]
        .filter(Boolean)
        .join(" ");

      return `
        <div
          class="${classes}"
          tabindex="0"
          role="img"
          aria-label="${escapeHTML(accessibleLabel)}"
        >
          <div class="chart-bar-wrap">
            <div class="chart-bar" style="--bar-height: ${height.toFixed(1)}%">
              <span class="chart-bar-tooltip" aria-hidden="true">${escapeHTML(formatCurrency(total))}</span>
            </div>
          </div>
          <span class="chart-day-label">${formatChartDay(day)}</span>
          <span class="chart-date-label">${day.getDate()}</span>
        </div>
      `;
    })
    .join("");

  elements.chart.innerHTML = `<div class="chart-guides" aria-hidden="true">${guides}</div><div class="chart-columns">${columns}</div>`;

  if (chartTotal === 0) {
    elements.chartCaption.textContent =
      "Grafik akan terisi otomatis saat kamu mulai mencatat.";
  } else {
    const peakDay = days[maxIndex];
    elements.chartCaption.textContent = `Puncak pengeluaran ${capitalize(longWeekday.format(peakDay))}, ${peakDay.getDate()} ${shortMonth.format(peakDay)} · ${formatCurrency(highest)}.`;
  }
}

function renderHistory(todayISO) {
  const count = transactions.length;

  elements.historyCount.textContent = `${count} transaksi`;
  elements.historyMeta.textContent =
    count === 0 ? "Semua catatanmu ada di sini." : "Terbaru di atas.";
  elements.emptyState.hidden = count > 0;
  elements.listHead.hidden = count === 0;

  if (count === 0) {
    elements.transactionList.innerHTML = "";
    return;
  }

  elements.transactionList.innerHTML = transactions
    .map((transaction) => {
      const meta = CATEGORY_META[sanitizeCategory(transaction.category)];
      const relativeDateLabel = formatRelativeDate(transaction.date, todayISO);
      const exactDateLabel = formatExactDate(transaction.date);
      const name = escapeHTML(transaction.name);
      const category = sanitizeCategory(transaction.category);

      return `
        <li class="transaction-item" data-id="${escapeHTML(transaction.id)}">
          <div class="tx-main">
            <span class="tx-icon cat-${meta.slug}" aria-hidden="true">
              <svg><use href="#${meta.icon}"></use></svg>
            </span>
            <div class="tx-copy">
              <p class="tx-name" title="${name}">${name}</p>
              <p class="tx-mobile-meta">
                <span class="tx-cat-inline cat-${meta.slug}">${category}</span>
                <span aria-hidden="true">·</span>
                <time datetime="${transaction.date}">${relativeDateLabel}</time>
              </p>
            </div>
          </div>
          <span class="category-badge cat-${meta.slug}">${category}</span>
          <time class="tx-date" datetime="${transaction.date}">${exactDateLabel}</time>
          <span class="tx-amount">${formatCurrency(transaction.amount)}</span>
          <button
            class="delete-button"
            type="button"
            data-delete-id="${escapeHTML(transaction.id)}"
            aria-label="Hapus ${name} sebesar ${formatCurrency(transaction.amount)}"
          >
            <svg aria-hidden="true"><use href="#icon-trash"></use></svg>
          </button>
        </li>
      `;
    })
    .join("");
}

function render() {
  const today = new Date();
  setHeaderDate();
  const summary = renderSummary(today);
  renderChart(today);
  renderHistory(summary.todayISO);
}

/* Form */

function getField(name) {
  return elements.form.querySelector(`[data-field="${name}"]`);
}

function clearFieldError(name) {
  const field = getField(name);
  if (!field) return;

  field.classList.remove("has-error");
  const error = field.querySelector(".field-error");
  if (error) error.textContent = "";
  field.querySelectorAll("input").forEach((input) => {
    input.removeAttribute("aria-invalid");
  });
}

function clearAllErrors() {
  ["name", "amount", "category", "date"].forEach(clearFieldError);
}

function setFieldError(name, message) {
  const field = getField(name);
  if (!field) return;

  field.classList.add("has-error");
  const error = field.querySelector(".field-error");
  if (error) error.textContent = message;
  field.querySelectorAll("input").forEach((input) => {
    input.setAttribute("aria-invalid", "true");
  });
}

function validateForm() {
  clearAllErrors();

  const errors = {};
  const name = elements.nameInput.value.trim();
  const amountDigits = elements.amountInput.value.replace(/\D/g, "");
  const amount = amountDigits ? Number(amountDigits) : 0;
  const categoryInput = elements.form.querySelector('input[name="category"]:checked');
  const dateValue = elements.dateInput.value;
  const todayISO = toISODate(new Date());

  if (!name) {
    errors.name = "Nama pengeluaran perlu diisi.";
  }

  if (!amountDigits) {
    errors.amount = "Nominal perlu diisi.";
  } else if (amount <= 0) {
    errors.amount = "Nominal harus lebih dari Rp 0.";
  } else if (amount > MAX_AMOUNT) {
    errors.amount = `Nominal maksimal ${formatCurrency(MAX_AMOUNT)}.`;
  }

  if (!categoryInput) {
    errors.category = "Pilih satu kategori untuk transaksi ini.";
  }

  if (!dateValue) {
    errors.date = "Tanggal perlu diisi.";
  } else if (!parseISODate(dateValue)) {
    errors.date = "Tanggal tidak valid.";
  } else if (dateValue > todayISO) {
    errors.date = "Tanggal tidak boleh melewati hari ini.";
  }

  Object.entries(errors).forEach(([field, message]) => setFieldError(field, message));

  if (Object.keys(errors).length > 0) {
    const firstField = getField(Object.keys(errors)[0]);
    const firstInput = firstField?.querySelector("input");
    firstInput?.focus();
    announce("Form belum lengkap. Periksa kolom yang ditandai.");
    return null;
  }

  return {
    name,
    amount,
    category: sanitizeCategory(categoryInput.value),
    date: dateValue,
  };
}

function announce(message) {
  if (!elements.liveRegion) return;

  elements.liveRegion.textContent = "";
  window.setTimeout(() => {
    elements.liveRegion.textContent = message;
  }, 30);
}

function handleSubmit(event) {
  event.preventDefault();
  const values = validateForm();
  if (!values) return;

  transactions.push({
    id: createId(),
    ...values,
    createdAt: Date.now(),
  });
  sortTransactions();
  const saved = saveTransactions();
  render();

  elements.form.reset();
  elements.dateInput.value = toISODate(new Date());
  elements.dateInput.max = toISODate(new Date());
  clearAllErrors();
  elements.nameInput.focus({ preventScroll: true });

  if (saved) {
    showToast("Pengeluaran berhasil dicatat.", {
      icon: "icon-check",
      timeout: 2600,
    });
    announce("Pengeluaran berhasil dicatat.");
  }
}

/* Delete and undo */

function handleListClick(event) {
  const deleteButton = event.target.closest("[data-delete-id]");
  if (!deleteButton) return;

  const id = deleteButton.dataset.deleteId;
  const index = transactions.findIndex((transaction) => transaction.id === id);
  if (index === -1) return;

  const [removed] = transactions.splice(index, 1);
  deletedTransaction = { transaction: removed, index };
  saveTransactions();
  render();

  showToast(`“${removed.name}” dihapus.`, {
    icon: "icon-trash",
    actionLabel: "Urungkan",
    timeout: 6000,
    onAction: restoreDeletedTransaction,
  });
}

function restoreDeletedTransaction() {
  if (!deletedTransaction) return;

  const { transaction, index } = deletedTransaction;
  const insertAt = Math.min(index, transactions.length);
  transactions.splice(insertAt, 0, transaction);
  sortTransactions();
  deletedTransaction = null;
  saveTransactions();
  render();

  showToast("Pengeluaran dikembalikan.", {
    icon: "icon-check",
    timeout: 2500,
  });
  announce("Pengeluaran dikembalikan.");
}

/* Toast */

function showToast(message, options = {}) {
  const {
    icon = "icon-trash",
    actionLabel = "",
    onAction = null,
    timeout = 3000,
  } = options;

  window.clearTimeout(toastTimer);
  window.clearTimeout(toastHideTimer);

  toastActionHandler = onAction;
  elements.toastMessage.textContent = message;
  elements.toastIcon.setAttribute("href", `#${icon}`);
  elements.toastAction.textContent = actionLabel;
  elements.toastAction.hidden = !actionLabel;
  elements.toast.hidden = false;
  elements.toast.classList.remove("is-visible");

  window.requestAnimationFrame(() => {
    elements.toast.classList.add("is-visible");
  });

  if (timeout > 0) {
    toastTimer = window.setTimeout(hideToast, timeout);
  }
}

function hideToast() {
  window.clearTimeout(toastTimer);
  window.clearTimeout(toastHideTimer);
  elements.toast.classList.remove("is-visible");
  toastActionHandler = null;

  toastHideTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 200);
}

function handleToastAction() {
  const action = toastActionHandler;
  hideToast();
  if (action) action();
}

/* Events */

function bindEvents() {
  elements.form.addEventListener("submit", handleSubmit);

  elements.nameInput.addEventListener("input", () => clearFieldError("name"));

  elements.amountInput.addEventListener("input", () => {
    const digits = elements.amountInput.value.replace(/\D/g, "").slice(0, 9);
    elements.amountInput.value = digits ? Number(digits).toLocaleString("id-ID") : "";
    clearFieldError("amount");
  });

  elements.dateInput.addEventListener("input", () => clearFieldError("date"));
  elements.dateInput.addEventListener("change", () => clearFieldError("date"));

  elements.form.querySelectorAll('input[name="category"]').forEach((input) => {
    input.addEventListener("change", () => clearFieldError("category"));
  });

  elements.transactionList.addEventListener("click", handleListClick);
  elements.toastAction.addEventListener("click", handleToastAction);

  elements.emptyCta.addEventListener("click", () => {
    elements.form.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => elements.nameInput.focus({ preventScroll: true }), 250);
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    transactions = loadTransactions();
    sortTransactions();
    render();
  });
}

function initialize() {
  const todayISO = toISODate(new Date());
  elements.dateInput.max = todayISO;
  elements.dateInput.value = todayISO;

  transactions = loadTransactions();
  sortTransactions();
  bindEvents();
  render();
}

initialize();
