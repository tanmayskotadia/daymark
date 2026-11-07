"use strict";

const icons = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18m-13 5h2m4 0h2"/>',
  list: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m6 10 1 1 2-2m3 1h5m-5 5h5M7 15h.01"/>',
  device: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  flag: '<path d="M5 21V4c4-4 8 4 14 0v10c-6 4-10-4-14 0"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 3v7m4-7v7"/>'
};

const categories = new Map([
  ["college", "College"],
  ["dsa", "DSA"],
  ["projects", "Projects"],
  ["skills", "Skills"]
]);
const storageKey = "daymark.tasks.v1";
const locale = "en-US";
const dateFormat = {
  month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
  short: new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }),
  compact: new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
  full: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
  weekday: new Intl.DateTimeFormat(locale, { weekday: "long" })
};

const byId = (id) => document.getElementById(id);
const dialog = byId("task-dialog");
const form = byId("task-form");
const search = byId("task-search");
const calendar = byId("calendar-grid");
const navButtons = document.querySelectorAll("[data-view]");
const today = dayKey(new Date());
const firstOfWeek = mondayOf(parseDay(today));
const weekStart = dayKey(firstOfWeek);
const weekEnd = dayKey(addDays(firstOfWeek, 7));
let selected = today;
let month = monthStart(parseDay(today));
let focusedDate = selected;
let view = "calendar";
let categoryFilter = null;
let editingId = null;
let toastTimeout;
let tasks = loadTasks();

function svg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}

function parseDay(key) {
  const [year, monthNumber, day] = key.split("-").map(Number);
  const date = new Date(2000, 0, 1, 12);
  date.setFullYear(year, monthNumber - 1, day);
  return date;
}

function dayKey(date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const monthNumber = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${monthNumber}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function monthStart(date, offset = 0) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + offset);
  return next;
}

function mondayOf(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

function validDate(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= "0001-01-01" && dayKey(parseDay(key)) === key;
}

function validTask(task) {
  return task && typeof task.id === "string" && typeof task.title === "string" &&
    typeof task.date === "string" && validDate(task.date) && categories.has(task.category) &&
    typeof task.notes === "string" && typeof task.done === "boolean" &&
    ["normal", "high"].includes(task.priority);
}

function sampleTasks() {
  const examples = [
    [-5, "Review lecture notes", "college", true],
    [-3, "Practice array patterns", "dsa", true],
    [-2, "Sketch portfolio layout", "projects", true],
    [-1, "Watch a Git tutorial", "skills", false],
    [0, "Finish lab write-up", "college", false, "high"],
    [0, "Solve two graph problems", "dsa", false],
    [0, "Review portfolio layout", "projects", true],
    [2, "Practice TypeScript", "skills", false],
    [4, "Outline mini project", "projects", false],
    [6, "Read chapter three", "college", false],
    [9, "Revisit binary search", "dsa", false],
    [12, "Polish project README", "projects", false]
  ];
  return examples.map(([offset, title, category, done, priority = "normal"], index) => ({
    id: `sample-${index}`, title, category, done, priority, sample: true, notes: "",
    date: dayKey(addDays(parseDay(today), offset))
  }));
}

function loadTasks() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return sampleTasks();
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) return parsed.filter(validTask);
  } catch {
    // Keep the planner usable if browser storage is blocked.
  }
  return [];
}

function commit(nextTasks, message, undo) {
  tasks = nextTasks;
  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
    notify(message, undo);
  } catch {
    notify("Browser storage is unavailable. Changes will last until you leave this page.", undo);
  }
  render();
}

function notify(message, undo) {
  const toast = byId("toast");
  clearTimeout(toastTimeout);
  toast.replaceChildren(element("span", "", message));
  if (undo) {
    const button = element("button", "", "Undo");
    button.addEventListener("click", undo);
    toast.append(button);
  }
  toast.hidden = false;
  toastTimeout = setTimeout(() => { toast.hidden = true; }, undo ? 10000 : 3200);
}

function matchingTasks() {
  return categoryFilter ? tasks.filter((task) => task.category === categoryFilter) : tasks;
}

function groupByDay(items) {
  const groups = new Map();
  for (const task of items) {
    if (!groups.has(task.date)) groups.set(task.date, []);
    groups.get(task.date).push(task);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => Number(a.done) - Number(b.done) || Number(b.priority === "high") - Number(a.priority === "high"));
  }
  return groups;
}

function renderCategories() {
  const counts = new Map();
  for (const task of tasks) {
    if (!task.done) counts.set(task.category, (counts.get(task.category) || 0) + 1);
  }
  for (const button of byId("categories").children) {
    const key = button.dataset.category;
    const active = key === categoryFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
    button.lastElementChild.textContent = counts.get(key) || 0;
  }
  byId("clear-demo").hidden = !tasks.some((task) => task.sample);
}

function renderCalendar(groups) {
  const monthEnd = addDays(monthStart(month, 1), -1);
  const first = mondayOf(month);
  const last = addDays(mondayOf(monthEnd), 6);
  const dates = document.createDocumentFragment();
  byId("month-heading").textContent = dateFormat.month.format(month);
  byId("prev-month").disabled = month.getFullYear() === 1 && month.getMonth() === 0;
  byId("next-month").disabled = month.getFullYear() === 9999 && month.getMonth() === 11;

  for (let date = first; date <= last; date = addDays(date, 1)) {
    const key = dayKey(date);
    const entries = groups.get(key) || [];
    const button = element("button", "calendar-day");
    const isSelected = key === selected;
    const isToday = key === today;
    button.dataset.date = key;
    button.disabled = !validDate(key);
    button.tabIndex = key === focusedDate ? 0 : -1;
    button.classList.toggle("outside", date.getMonth() !== month.getMonth());
    button.classList.toggle("weekend", date.getDay() === 0 || date.getDay() === 6);
    button.classList.toggle("selected", isSelected);
    button.classList.toggle("today", isToday);
    button.setAttribute("aria-pressed", isSelected);
    if (isToday) button.setAttribute("aria-current", "date");
    const count = entries.length === 1 ? "1 task" : `${entries.length} tasks`;
    button.setAttribute("aria-label", `${dateFormat.full.format(date)}, ${count}`);
    button.append(element("span", "day-number", date.getDate()));

    for (const task of entries.slice(0, 2)) {
      const chip = element("span", `calendar-chip ${task.category}${task.done ? " done" : ""}`);
      chip.append(element("span", "category-dot"), element("span", "chip-text", task.title));
      chip.title = task.title;
      button.append(chip);
    }
    if (entries.length > 2) button.append(element("span", "more-tasks", `+${entries.length - 2}`));
    dates.append(button);
  }
  calendar.replaceChildren(dates);
}

function renderTaskRow(task) {
  const row = element("div", task.done ? "task-row done" : "task-row");
  const toggle = element("button", "check-task");
  toggle.setAttribute("role", "checkbox");
  toggle.setAttribute("aria-checked", task.done);
  toggle.setAttribute("aria-label", `Complete ${task.title}`);
  const box = element("span", "check-box");
  if (task.done) box.innerHTML = svg("check");
  toggle.append(box);
  toggle.addEventListener("click", () => {
    commit(tasks.map((item) => item.id === task.id ? { ...item, done: !item.done, sample: false } : item),
      task.done ? "Task reopened." : "Task completed.");
    document.querySelector(`[data-task-id="${CSS.escape(task.id)}"] .check-task`)?.focus();
  });

  const edit = element("button", "edit-task");
  edit.setAttribute("aria-label", `Edit ${task.title}`);
  const meta = element("span", "task-meta");
  const pill = element("span", `category-pill ${task.category}`);
  pill.append(element("span", "category-dot"), categories.get(task.category));
  meta.append(pill);
  if (task.priority === "high") {
    const flag = element("span", "priority-flag");
    flag.innerHTML = svg("flag");
    flag.append("High");
    meta.append(flag);
  }
  edit.append(element("span", "task-name", task.title), meta);
  edit.addEventListener("click", () => openTask(task));
  const arrow = element("span", "row-arrow");
  arrow.innerHTML = svg("chevronRight");
  row.dataset.taskId = task.id;
  row.append(toggle, edit, arrow);
  return row;
}

function emptyState(title, detail) {
  const node = element("p", "empty");
  node.append(element("strong", "", title), detail);
  return node;
}

function renderAgenda(entries) {
  const date = parseDay(selected);
  const completed = entries.filter((task) => task.done).length;
  byId("agenda-weekday").textContent = selected === today
    ? `TODAY · ${dateFormat.weekday.format(date).toUpperCase()}`
    : dateFormat.weekday.format(date).toUpperCase();
  byId("agenda-heading").textContent = dateFormat.short.format(date);
  byId("progress-label").textContent = `${completed} / ${entries.length} done`;
  const progress = byId("daily-progress");
  progress.max = entries.length || 1;
  progress.value = completed;
  byId("agenda-list").replaceChildren(...(entries.length
    ? entries.map(renderTaskRow)
    : [emptyState("Nothing planned", categoryFilter ? "No tasks in this category for this day." : "Add a task when you’re ready.")]));

  const week = tasks.filter((task) => task.date >= weekStart && task.date < weekEnd);
  const finished = week.filter((task) => task.done).length;
  byId("week-count").textContent = `${finished} of ${week.length} done`;
  byId("week-caption").textContent = `${dateFormat.compact.format(firstOfWeek)} – ${dateFormat.compact.format(addDays(firstOfWeek, 6))}`;
}

function renderLibrary() {
  const query = search.value.trim().toLowerCase();
  const status = byId("status-filter").value;
  const visible = matchingTasks().filter((task) => {
    const text = `${task.title} ${task.notes} ${categories.get(task.category)}`.toLowerCase();
    return text.includes(query) && (status === "all" || task.done === (status === "done"));
  });
  const groups = groupByDay(visible);
  const sections = [...groups.keys()].sort().map((key) => {
    const section = element("section", "task-group");
    section.append(element("h3", "", dateFormat.full.format(parseDay(key))), ...groups.get(key).map(renderTaskRow));
    return section;
  });
  byId("library-list").replaceChildren(...(sections.length ? sections : [
    emptyState("No tasks to show", query || categoryFilter || status !== "all"
      ? "Try a different search or filter."
      : "Add a task to start planning.")
  ]));
}

function render() {
  renderCategories();
  const inCalendar = view === "calendar";
  byId("calendar-view").hidden = !inCalendar;
  byId("tasks-view").hidden = inCalendar;
  for (const button of navButtons) {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  byId("breadcrumb").textContent = inCalendar ? "Calendar" : "All tasks";
  byId("page-title").textContent = inCalendar ? "The calendar" : "All tasks";
  byId("page-description").textContent = inCalendar ? "Pick a date to plan your day." : "Find and manage your tasks across dates.";

  if (inCalendar) {
    const groups = groupByDay(matchingTasks());
    renderCalendar(groups);
    renderAgenda(groups.get(selected) || []);
  } else {
    renderLibrary();
  }
}

function selectDay(key) {
  selected = key;
  focusedDate = key;
  month = monthStart(parseDay(key));
  render();
}

function moveMonth(offset) {
  const next = monthStart(month, offset);
  if (next.getFullYear() < 1 || next.getFullYear() > 9999) return;
  const first = dayKey(next);
  const last = dayKey(addDays(monthStart(next, 1), -1));
  selectDay(today >= first && today <= last ? today : first);
}

function openTask(task) {
  editingId = task?.id ?? null;
  form.reset();
  form.elements.title.setCustomValidity("");
  form.elements.title.value = task?.title ?? "";
  form.elements.date.value = task?.date ?? selected;
  form.elements.category.value = task?.category ?? categoryFilter ?? "college";
  form.elements.priority.value = task?.priority ?? "normal";
  form.elements.notes.value = task?.notes ?? "";
  byId("dialog-title").textContent = task ? "Edit task" : "New task";
  byId("save-task").textContent = task ? "Save changes" : "Add task";
  byId("delete-task").hidden = !task;
  dialog.showModal();
}

function openSearch() {
  view = "tasks";
  categoryFilter = null;
  byId("status-filter").value = "all";
  render();
  search.focus();
  search.select();
}

for (const placeholder of document.querySelectorAll("[data-icon]")) {
  placeholder.innerHTML = svg(placeholder.dataset.icon);
}

for (const [key, label] of categories) {
  const button = element("button", `category-button ${key}`);
  button.dataset.category = key;
  button.append(element("span", "category-dot"), label, element("span", "category-count"));
  button.addEventListener("click", () => {
    categoryFilter = categoryFilter === key ? null : key;
    render();
  });
  byId("categories").append(button);
  byId("task-category").add(new Option(label, key));
}

for (const button of navButtons) {
  button.addEventListener("click", () => {
    view = button.dataset.view;
    render();
  });
}

byId("current-weekday").textContent = dateFormat.weekday.format(parseDay(today));
byId("current-date").textContent = dateFormat.compact.format(parseDay(today));
byId("today-button").addEventListener("click", () => selectDay(today));
byId("prev-month").addEventListener("click", () => moveMonth(-1));
byId("next-month").addEventListener("click", () => moveMonth(1));
byId("search-button").addEventListener("click", openSearch);
search.addEventListener("input", renderLibrary);
byId("status-filter").addEventListener("change", renderLibrary);

calendar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-date]");
  if (!button) return;
  selectDay(button.dataset.date);
  calendar.querySelector(`[data-date="${selected}"]`)?.focus({ preventScroll: true });
});

calendar.addEventListener("keydown", (event) => {
  const offsets = new Map([["ArrowLeft", -1], ["ArrowRight", 1], ["ArrowUp", -7], ["ArrowDown", 7]]);
  const button = event.target.closest("[data-date]");
  if (!button || !offsets.has(event.key)) return;
  event.preventDefault();
  const next = addDays(parseDay(button.dataset.date), offsets.get(event.key));
  const key = dayKey(next);
  if (!validDate(key)) return;
  focusedDate = key;
  if (!calendar.querySelector(`[data-date="${key}"]`)) month = monthStart(next);
  renderCalendar(groupByDay(matchingTasks()));
  calendar.querySelector(`[data-date="${key}"]`)?.focus();
});

for (const id of ["new-task", "agenda-add", "add-row"]) {
  byId(id).addEventListener("click", () => openTask());
}
for (const id of ["close-dialog", "cancel-dialog"]) {
  byId(id).addEventListener("click", () => dialog.close());
}
form.elements.title.addEventListener("input", () => form.elements.title.setCustomValidity(""));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const title = data.get("title").trim();
  if (!title) {
    form.elements.title.setCustomValidity("Enter a task name.");
    form.elements.title.reportValidity();
    return;
  }
  const current = tasks.find((task) => task.id === editingId);
  const task = {
    id: current?.id ?? crypto.randomUUID(),
    title,
    date: data.get("date"),
    category: data.get("category"),
    priority: data.get("priority"),
    notes: data.get("notes").trim(),
    done: current?.done ?? false
  };
  if (!validTask(task)) return;
  dialog.close();
  selected = task.date;
  focusedDate = selected;
  month = monthStart(parseDay(selected));
  if (categoryFilter && categoryFilter !== task.category) categoryFilter = null;
  if (!current && view === "tasks") {
    search.value = "";
    byId("status-filter").value = "all";
  }
  const next = current ? tasks.map((item) => item.id === task.id ? task : item) : [...tasks, task];
  commit(next, current ? "Task updated." : "Task added.");
  document.querySelector(`[data-task-id="${CSS.escape(task.id)}"] .edit-task`)?.focus({ preventScroll: true });
});

byId("delete-task").addEventListener("click", () => {
  const task = tasks.find((item) => item.id === editingId);
  if (!task) return;
  dialog.close();
  commit(tasks.filter((item) => item.id !== task.id), "Task deleted.", () => commit([...tasks, task], "Task restored."));
  byId(view === "calendar" ? "agenda-add" : "task-search").focus({ preventScroll: true });
});

byId("clear-demo").addEventListener("click", () => {
  const samples = tasks.filter((task) => task.sample);
  commit(tasks.filter((task) => !task.sample), "Sample tasks removed.", () => commit([...tasks, ...samples], "Sample tasks restored."));
});

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || dialog.open ||
      event.target.closest("input, textarea, select, [contenteditable]")) return;
  if (event.key === "/") {
    event.preventDefault();
    openSearch();
  } else if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    openTask();
  }
});

render();
