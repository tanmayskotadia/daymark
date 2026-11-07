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
  trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 3v7m4-7v7"/>',
  repeat: '<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15m-14 8-4 4 4 4m14-9v2a3 3 0 0 1-3 3H3"/>'
};

const defaultCategories = new Map([
  ["college", "College"],
  ["dsa", "DSA"],
  ["projects", "Projects"],
  ["skills", "Skills"]
]);
const categories = new Map(defaultCategories);
const categoryColors = new Map();
const taskColors = ["rose", "apricot", "butter", "fern", "sea", "sky", "iris", "stone"];
const repeatLabels = { daily: "Daily", weekdays: "Weekdays", weekends: "Weekends", weekly: "Weekly" };
const storageKey = "daymark.tasks.v1";
const categoriesKey = "daymark.categories.v1";
const locale = "en-US";
const dateFormat = {
  month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
  compact: new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
  full: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
  weekday: new Intl.DateTimeFormat(locale, { weekday: "long" })
};

const byId = (id) => document.getElementById(id);
const dialog = byId("task-dialog");
const form = byId("task-form");
const categoryDialog = byId("category-dialog");
const categoryForm = byId("category-form");
const search = byId("task-search");
const calendar = byId("calendar-grid");
const navButtons = document.querySelectorAll("[data-view]");
const today = dayKey(new Date());
let selected = today;
let month = monthStart(parseDay(today));
let focusedDate = selected;
let view = "calendar";
let layout = "month";
let categoryFilter = null;
let editing = null;
let toastTimeout;
let customCategories = loadCustomCategories();
for (const { id, label, color } of customCategories) {
  categories.set(id, label);
  categoryColors.set(id, color);
}
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
    ["normal", "high"].includes(task.priority) &&
    (task.label === undefined || (typeof task.label === "string" && task.label.length <= 32)) &&
    (task.color === undefined || taskColors.includes(task.color)) &&
    (task.repeat === undefined || Object.hasOwn(repeatLabels, task.repeat)) &&
    (task.until === undefined || (validDate(task.until) && task.until >= task.date)) &&
    [task.completedDates, task.skippedDates].every((dates) => dates === undefined ||
      (Array.isArray(dates) && dates.every(validDate)));
}

function isScheduled(task, key) {
  if (!task.repeat) return task.date === key;
  if (key < task.date || (task.until && key > task.until)) return false;
  if (task.repeat === "daily") return true;
  const weekday = parseDay(key).getDay();
  if (task.repeat === "weekly") return weekday === parseDay(task.date).getDay();
  if (task.repeat === "weekends") return weekday === 0 || weekday === 6;
  return weekday > 0 && weekday < 6;
}

function occurrenceOn(task, key) {
  if (!isScheduled(task, key) || task.skippedDates?.includes(key)) return null;
  return task.repeat ? { ...task, date: key, done: task.completedDates?.includes(key) ?? false } : task;
}

function tasksBetween(items, first, last) {
  const entries = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const key = dayKey(date);
    if (!validDate(key)) continue;
    for (const task of items) {
      const occurrence = occurrenceOn(task, key);
      if (occurrence) entries.push(occurrence);
    }
  }
  return entries;
}

function libraryOccurrence(task, status) {
  if (!task.repeat) return status === "all" || task.done === (status === "done") ? task : null;
  if (status !== "done") {
    const start = parseDay(task.date > today ? task.date : today);
    const end = parseDay(task.until ?? "9999-12-31");
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const occurrence = occurrenceOn(task, dayKey(date));
      if (occurrence && (status === "all" || !occurrence.done)) return occurrence;
    }
  }
  if (status === "open") return null;
  const completed = (task.completedDates ?? []).filter((key) => occurrenceOn(task, key)?.done).sort().at(-1);
  if (status === "done") return completed ? occurrenceOn(task, completed) : null;
  const end = parseDay(task.until && task.until < today ? task.until : today);
  const start = parseDay(task.date);
  for (let date = end; date >= start; date = addDays(date, -1)) {
    const occurrence = occurrenceOn(task, dayKey(date));
    if (occurrence) return occurrence;
  }
  return { ...task, noOccurrence: true };
}

function formatWeek(first) {
  return `${dateFormat.compact.format(first)} – ${dateFormat.compact.format(addDays(first, 6))}`;
}

function animate(node, frames, duration = 230) {
  if (!node?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  node.getAnimations().forEach((animation) => animation.cancel());
  node.animate(frames, { duration, easing: "cubic-bezier(.2,.7,.3,1)" });
}

function taskControl(id, date, className) {
  return document.querySelector(`[data-task-id="${CSS.escape(id)}"][data-task-date="${date}"] .${className}`);
}

function sampleTasks() {
  const examples = [
    [-5, "Review lecture notes", "college", true],
    [-3, "Practice array patterns", "dsa", true],
    [-2, "Sketch portfolio layout", "projects", true],
    [-1, "Watch a Git tutorial", "skills", false],
    [0, "Review past papers", "college", false, "normal", "Exam prep", "sky"],
    [0, "Solve two graph problems", "dsa", false],
    [0, "Review portfolio layout", "projects", true],
    [2, "Practice TypeScript", "skills", false],
    [4, "Outline mini project", "projects", false],
    [6, "Discrete math midterm", "college", false, "high", "College exam", "rose"],
    [9, "Revisit binary search", "dsa", false],
    [12, "Polish project README", "projects", false]
  ];
  return examples.map(([offset, title, category, done, priority = "normal", label = "", color], index) => ({
    id: `sample-${index}`, title, category, done, priority, label, color, sample: true, notes: "",
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

function loadCustomCategories() {
  try {
    const stored = JSON.parse(localStorage.getItem(categoriesKey));
    if (Array.isArray(stored)) return stored.filter((item) =>
      item && /^custom-[a-f0-9-]{36}$/.test(item.id) &&
      typeof item.label === "string" && item.label.length > 0 && item.label.length <= 30 &&
      taskColors.includes(item.color));
  } catch {
    // An unavailable or invalid store has no custom categories.
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
    if (libraryOccurrence(task, "open")) counts.set(task.category, (counts.get(task.category) || 0) + 1);
  }
  for (const button of byId("categories").children) {
    const key = button.dataset.category;
    const active = (key || null) === categoryFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
    if (key) button.lastElementChild.textContent = counts.get(key) || 0;
  }
  byId("clear-demo").hidden = !tasks.some((task) => task.sample);
}

function renderCalendar() {
  const isWeek = layout === "week";
  const monthEnd = addDays(monthStart(month, 1), -1);
  const first = mondayOf(isWeek ? parseDay(focusedDate) : month);
  const last = addDays(isWeek ? first : mondayOf(monthEnd), 6);
  const groups = groupByDay(tasksBetween(matchingTasks(), first, last));
  const dates = document.createDocumentFragment();
  const heading = isWeek ? formatWeek(first) : dateFormat.month.format(month);
  if (byId("month-heading").textContent !== heading) byId("month-heading").textContent = heading;
  calendar.classList.toggle("week-layout", isWeek);
  const previous = byId("prev-month");
  const next = byId("next-month");
  previous.setAttribute("aria-label", isWeek ? "Previous week" : "Previous month");
  next.setAttribute("aria-label", isWeek ? "Next week" : "Next month");
  previous.disabled = isWeek ? !validDate(dayKey(addDays(first, -1)))
    : month.getFullYear() === 1 && month.getMonth() === 0;
  next.disabled = isWeek ? !validDate(dayKey(addDays(last, 1)))
    : month.getFullYear() === 9999 && month.getMonth() === 11;

  for (let date = first; date <= last; date = addDays(date, 1)) {
    const key = dayKey(date);
    const entries = groups.get(key) || [];
    const button = element("button", "calendar-day");
    const isSelected = key === selected;
    const isToday = key === today;
    button.dataset.date = key;
    button.disabled = !validDate(key);
    button.tabIndex = key === focusedDate ? 0 : -1;
    button.classList.toggle("outside", !isWeek && date.getMonth() !== month.getMonth());
    button.classList.toggle("weekend", date.getDay() === 0 || date.getDay() === 6);
    button.classList.toggle("selected", isSelected);
    button.classList.toggle("today", isToday);
    button.setAttribute("aria-pressed", isSelected);
    if (isToday) button.setAttribute("aria-current", "date");
    const count = entries.length === 1 ? "1 task" : `${entries.length} tasks`;
    button.setAttribute("aria-label", `${dateFormat.full.format(date)}, ${count}`);
    button.append(element("span", "day-number", date.getDate()));

    const limit = isWeek ? 5 : 2;
    for (const task of entries.slice(0, limit)) {
      const chip = element("span", `calendar-chip ${task.category}${task.done ? " done" : ""}`);
      const color = task.color ?? categoryColors.get(task.category);
      if (color) chip.dataset.color = color;
      chip.append(element("span", "chip-text", task.title));
      chip.title = task.label ? `${task.title} (${task.label})` : task.title;
      button.append(chip);
    }
    if (entries.length > limit) button.append(element("span", "more-tasks", `+${entries.length - limit}`));
    dates.append(button);
  }
  calendar.replaceChildren(dates);
}

function renderTaskRow(task) {
  const row = element("div", `task-row ${task.category}${task.done ? " done" : ""}`);
  const color = task.color ?? categoryColors.get(task.category);
  if (color) row.dataset.color = color;
  const toggle = element("button", "check-task");
  toggle.setAttribute("role", "checkbox");
  toggle.setAttribute("aria-checked", task.done);
  toggle.setAttribute("aria-label", `Complete ${task.title}`);
  toggle.disabled = Boolean(task.noOccurrence);
  const box = element("span", "check-box");
  if (task.done) box.innerHTML = svg("check");
  toggle.append(box);
  toggle.addEventListener("click", () => {
    const next = tasks.map((item) => {
      if (item.id !== task.id) return item;
      if (!item.repeat) return { ...item, done: !task.done, sample: false };
      const dates = new Set(item.completedDates);
      if (task.done) dates.delete(task.date);
      else dates.add(task.date);
      return { ...item, completedDates: [...dates], sample: false };
    });
    commit(next, task.done ? "Task reopened." : "Task completed.");
    const control = taskControl(task.id, task.date, "check-task");
    (control ?? (view === "tasks" ? search : byId("agenda-add"))).focus({ preventScroll: true });
    if (!task.done) animate(control?.querySelector(".check-box"), [
      { transform: "perspective(90px) rotateY(-80deg) scale(.82)" },
      { transform: "perspective(90px) rotateY(13deg) scale(1.14)", offset: .68 },
      { transform: "perspective(90px) rotateY(0)" }
    ], 290);
  });

  const edit = element("button", "edit-task");
  edit.setAttribute("aria-label", `Edit ${task.title}`);
  const meta = element("span", "task-meta");
  if (task.label) meta.append(element("span", "task-label", task.label));
  meta.append(element("span", "task-category", categories.get(task.category)));
  if (task.repeat) {
    const repeat = element("span", "repeat-badge");
    repeat.innerHTML = svg("repeat");
    repeat.append(repeatLabels[task.repeat]);
    meta.append(repeat);
  }
  if (task.noOccurrence) meta.append(element("span", "task-category", "No scheduled dates"));
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
  row.dataset.taskDate = task.date;
  row.append(toggle, edit, arrow);
  return row;
}

function emptyState(title, detail, day) {
  const node = element("p", "empty");
  if (day !== undefined) {
    const paper = element("span", "empty-paper");
    paper.setAttribute("aria-hidden", "true");
    paper.append(element("span", "empty-paper-day", day));
    node.append(paper);
  }
  node.append(element("strong", "", title), detail);
  return node;
}

function renderAgenda(entries) {
  const date = parseDay(selected);
  const completed = entries.filter((task) => task.done).length;
  byId("agenda-weekday").textContent = selected === today
    ? `TODAY · ${dateFormat.weekday.format(date).toUpperCase()}`
    : dateFormat.weekday.format(date).toUpperCase();
  const heading = byId("agenda-heading");
  heading.replaceChildren(element("span", "agenda-day", date.getDate()),
    element("span", "agenda-month", dateFormat.month.format(date)));
  heading.setAttribute("aria-label", dateFormat.full.format(date));
  byId("progress-label").textContent = `${completed} / ${entries.length} done`;
  const progress = byId("daily-progress");
  progress.max = entries.length || 1;
  progress.value = completed;
  byId("agenda-list").replaceChildren(...(entries.length
    ? entries.map(renderTaskRow)
    : [emptyState("A blank page", categoryFilter ? "No tasks in this category for this day." : "There’s nothing on the list for this day.", date.getDate())]));

  const first = mondayOf(date);
  const week = tasksBetween(matchingTasks(), first, addDays(first, 6));
  const finished = week.filter((task) => task.done).length;
  byId("week-count").textContent = `${finished} of ${week.length} done`;
  byId("week-caption").textContent = formatWeek(first);
  const groups = groupByDay(week);
  const strip = byId("week-strip");
  strip.replaceChildren();
  for (let offset = 0; offset < 7; offset++) {
    const day = addDays(first, offset);
    const key = dayKey(day);
    const items = groups.get(key) ?? [];
    const done = items.filter((task) => task.done).length;
    const button = element("button", "week-day");
    button.dataset.weekDate = key;
    button.disabled = !validDate(key);
    button.setAttribute("aria-pressed", key === selected);
    button.setAttribute("aria-label", `${dateFormat.full.format(day)}, ${done} of ${items.length} done`);
    const ring = element("span", "week-ring", day.getDate());
    ring.style.setProperty("--completed", `${items.length ? done / items.length * 100 : 0}%`);
    button.append(element("span", "week-letter", dateFormat.weekday.format(day).slice(0, 1)), ring);
    strip.append(button);
  }
}

function renderLibrary() {
  const query = search.value.trim().toLowerCase();
  const status = byId("status-filter").value;
  const matches = matchingTasks().filter((task) => {
    const text = `${task.title} ${task.label ?? ""} ${task.notes} ${categories.get(task.category)}`.toLowerCase();
    return text.includes(query);
  });
  const visible = matches.map((task) => libraryOccurrence(task, status)).filter(Boolean);
  byId("library-note").hidden = !visible.some((task) => task.repeat);
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
  byId("page-title").textContent = inCalendar ? "Planner" : "All tasks";

  if (inCalendar) {
    renderCalendar();
    const date = parseDay(selected);
    renderAgenda(groupByDay(tasksBetween(matchingTasks(), date, date)).get(selected) ?? []);
  } else {
    renderLibrary();
  }
}

function selectDay(key) {
  const newPage = layout === "week"
    ? dayKey(mondayOf(parseDay(focusedDate))) !== dayKey(mondayOf(parseDay(key)))
    : dayKey(month) !== dayKey(monthStart(parseDay(key)));
  const changed = selected !== key;
  const direction = key >= selected ? 1 : -1;
  selected = key;
  focusedDate = key;
  month = monthStart(parseDay(key));
  render();
  if (changed) {
    animate(byId("agenda-heading"), [
      { opacity: .45, transform: "perspective(400px) rotateX(-23deg) translateY(4px)" },
      { opacity: 1, transform: "perspective(400px) rotateX(0) translateY(0)" }
    ], 290);
    animate(byId("agenda-list").querySelector(".empty-paper"), [
      { opacity: .35, transform: "perspective(240px) rotateX(29deg) rotateZ(-13deg) translateY(6px)" },
      { opacity: 1, transform: "perspective(240px) rotateX(14deg) rotateZ(-8deg) translateY(0)" }
    ], 320);
  }
  if (newPage) animateCalendar(direction);
}

function animateCalendar(direction = 1) {
  animate(calendar, [
    { opacity: .65, transform: `perspective(1100px) rotateY(${direction * 8}deg) translateX(${direction * 11}px)` },
    { opacity: 1, transform: "perspective(1100px) rotateY(0) translateX(0)" }
  ], 320);
}

function moveCalendar(offset) {
  if (layout === "week") {
    const anchor = parseDay(focusedDate);
    const next = addDays(anchor, offset * 7);
    const first = dayKey(mondayOf(next));
    const last = dayKey(addDays(mondayOf(next), 6));
    const key = dayKey(next);
    const bounded = next.getFullYear() < 1 ? "0001-01-01" : next.getFullYear() > 9999 ? "9999-12-31" : key;
    selectDay(today >= first && today <= last ? today : bounded);
    return;
  }
  const next = monthStart(month, offset);
  if (next.getFullYear() < 1 || next.getFullYear() > 9999) return;
  const first = dayKey(next);
  const last = dayKey(addDays(monthStart(next, 1), -1));
  selectDay(today >= first && today <= last ? today : first);
}

function openTask(task) {
  editing = task ?? null;
  const series = tasks.find((item) => item.id === task?.id);
  form.reset();
  form.elements.title.setCustomValidity("");
  form.elements.title.value = task?.title ?? "";
  form.elements.date.value = series?.date ?? selected;
  form.elements.category.value = task?.category ?? categoryFilter ?? "college";
  form.elements.label.value = task?.label ?? "";
  form.elements.color.value = task?.color ?? "";
  form.elements.priority.value = task?.priority ?? "normal";
  form.elements.notes.value = task?.notes ?? "";
  form.elements.repeat.value = series?.repeat ?? "";
  form.elements.repeat.options[0].disabled = Boolean(series?.repeat);
  form.elements.until.value = series?.until ?? "";
  byId("dialog-title").textContent = series?.repeat ? "Edit repeating task" : task ? "Edit task" : "New task";
  byId("save-task").textContent = task ? "Save changes" : "Add task";
  byId("delete-task").hidden = !task;
  byId("delete-task").lastChild.textContent = series?.repeat ? "Delete series" : "Delete";
  byId("skip-task").hidden = !series?.repeat || Boolean(task?.noOccurrence);
  updateRepeatFields();
  dialog.showModal();
}

function updateRepeatFields() {
  const repeat = form.elements.repeat.value;
  const start = form.elements.date.value;
  form.elements.until.disabled = !repeat;
  form.elements.until.min = start || "0001-01-01";
  byId("repeat-end").hidden = !repeat;
  byId("task-date-label").textContent = repeat ? "Start date" : "Date";
  const detail = byId("repeat-detail");
  detail.hidden = !repeat;
  const schedule = repeat === "weekly" && validDate(start)
    ? `Every ${dateFormat.weekday.format(parseDay(start))}.`
    : repeat === "weekdays" ? "Monday through Friday."
    : repeat === "weekends" ? "Saturday and Sunday." : "Every calendar day.";
  detail.textContent = editing?.repeat ? `${schedule} Changes apply to the entire series.` : schedule;
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

const allCategories = element("button", "category-button", "All categories");
allCategories.dataset.category = "";
allCategories.addEventListener("click", () => {
  categoryFilter = null;
  render();
});
byId("categories").append(allCategories);

function addCategoryOption(key, label) {
  const button = element("button", `category-button ${key}`);
  button.dataset.category = key;
  if (categoryColors.has(key)) button.dataset.color = categoryColors.get(key);
  button.append(element("span", "category-dot"), label, element("span", "category-count"));
  button.addEventListener("click", () => {
    categoryFilter = categoryFilter === key ? null : key;
    render();
  });
  byId("categories").append(button);
  byId("task-category").add(new Option(label, key));
}

for (const [key, label] of categories) addCategoryOption(key, label);

byId("add-category").addEventListener("click", () => {
  categoryForm.reset();
  categoryForm.elements.categoryName.setCustomValidity("");
  categoryDialog.showModal();
});
byId("close-category").addEventListener("click", () => categoryDialog.close());
categoryForm.elements.categoryName.addEventListener("input", (event) => event.target.setCustomValidity(""));
categoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = categoryForm.elements.categoryName;
  const label = input.value.trim();
  const duplicate = [...categories.values()].some((name) => name.toLowerCase() === label.toLowerCase());
  if (!label || duplicate) {
    input.setCustomValidity(duplicate ? "That category already exists." : "Enter a category name.");
    input.reportValidity();
    return;
  }
  const id = `custom-${crypto.randomUUID()}`;
  const color = taskColors[customCategories.length % taskColors.length];
  const next = [...customCategories, { id, label, color }];
  try {
    localStorage.setItem(categoriesKey, JSON.stringify(next));
  } catch {
    notify("The category could not be saved in this browser.");
    return;
  }
  customCategories = next;
  categories.set(id, label);
  categoryColors.set(id, color);
  addCategoryOption(id, label);
  categoryDialog.close();
  renderCategories();
  notify("Category added.");
});

for (const [index, color] of ["", ...taskColors].entries()) {
  const option = element("label", "color-option");
  const input = element("input");
  input.type = "radio";
  input.name = "color";
  input.value = color;
  input.defaultChecked = !color;
  input.setAttribute("aria-label", color ? `Swatch ${index}` : "Use category color");
  const swatch = element("span", "color-swatch");
  if (color) swatch.dataset.color = color;
  else {
    swatch.classList.add("category-swatch");
    option.title = "Use category color";
  }
  option.append(input, swatch);
  byId("color-options").append(option);
}

for (const button of navButtons) {
  button.addEventListener("click", () => {
    view = button.dataset.view;
    render();
  });
}

byId("today-button").addEventListener("click", () => selectDay(today));
byId("prev-month").addEventListener("click", () => moveCalendar(-1));
byId("next-month").addEventListener("click", () => moveCalendar(1));
byId("search-button").addEventListener("click", openSearch);
search.addEventListener("input", renderLibrary);
byId("status-filter").addEventListener("change", renderLibrary);
for (const button of document.querySelectorAll("[data-layout]")) {
  button.addEventListener("click", () => {
    if (layout === button.dataset.layout) return;
    layout = button.dataset.layout;
    focusedDate = selected;
    month = monthStart(parseDay(selected));
    for (const option of document.querySelectorAll("[data-layout]")) {
      option.setAttribute("aria-pressed", option.dataset.layout === layout);
    }
    renderCalendar();
    animateCalendar();
  });
}

byId("week-strip").addEventListener("click", (event) => {
  const key = event.target.closest("[data-week-date]")?.dataset.weekDate;
  if (!key) return;
  selectDay(key);
  byId("week-strip").querySelector(`[data-week-date="${key}"]`)?.focus({ preventScroll: true });
});

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
  renderCalendar();
  calendar.querySelector(`[data-date="${key}"]`)?.focus();
});

for (const id of ["new-task", "agenda-add", "add-row"]) {
  byId(id).addEventListener("click", () => openTask());
}
for (const id of ["close-dialog", "cancel-dialog"]) {
  byId(id).addEventListener("click", () => dialog.close());
}
form.elements.title.addEventListener("input", () => form.elements.title.setCustomValidity(""));
form.elements.repeat.addEventListener("change", updateRepeatFields);
form.elements.date.addEventListener("input", updateRepeatFields);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const title = data.get("title").trim();
  if (!title) {
    form.elements.title.setCustomValidity("Enter a task name.");
    form.elements.title.reportValidity();
    return;
  }
  const current = tasks.find((task) => task.id === editing?.id);
  const task = {
    id: current?.id ?? crypto.randomUUID(),
    title,
    date: data.get("date"),
    category: data.get("category"),
    label: data.get("label").trim(),
    color: data.get("color") || undefined,
    priority: data.get("priority"),
    notes: data.get("notes").trim(),
    done: current?.done ?? false,
    repeat: data.get("repeat") || undefined,
    until: data.get("repeat") && data.get("until") || undefined
  };
  if (!validTask(task)) return;
  if (task.repeat) {
    const completed = current?.repeat ? current.completedDates ?? [] : current?.done ? [current.date] : [];
    task.completedDates = completed.filter((key) => isScheduled(task, key));
    task.skippedDates = (current?.skippedDates ?? []).filter((key) => isScheduled(task, key));
    task.done = false;
  }
  dialog.close();
  selected = editing && occurrenceOn(task, editing.date) ? editing.date : task.date;
  focusedDate = selected;
  month = monthStart(parseDay(selected));
  if (categoryFilter && categoryFilter !== task.category) categoryFilter = null;
  if (!current && view === "tasks") {
    search.value = "";
    byId("status-filter").value = "all";
  }
  const next = current ? tasks.map((item) => item.id === task.id ? task : item) : [...tasks, task];
  commit(next, current ? "Task updated." : task.repeat ? "Repeating task added." : "Task added.");
  const control = taskControl(task.id, selected, "edit-task");
  (control ?? (view === "tasks" ? search : byId("agenda-add"))).focus({ preventScroll: true });
});

byId("delete-task").addEventListener("click", () => {
  const task = tasks.find((item) => item.id === editing?.id);
  if (!task) return;
  dialog.close();
  commit(tasks.filter((item) => item.id !== task.id), task.repeat ? "Series deleted." : "Task deleted.",
    () => commit([...tasks, task], task.repeat ? "Series restored." : "Task restored."));
  byId(view === "calendar" ? "agenda-add" : "task-search").focus({ preventScroll: true });
});

byId("skip-task").addEventListener("click", () => {
  const occurrence = editing;
  if (!occurrence?.repeat) return;
  dialog.close();
  const setSkipped = (skip) => tasks.map((item) => {
    if (item.id !== occurrence.id) return item;
    const dates = new Set(item.skippedDates);
    if (skip) dates.add(occurrence.date);
    else dates.delete(occurrence.date);
    return { ...item, skippedDates: [...dates], sample: false };
  });
  commit(setSkipped(true), "This date was skipped.", () => commit(setSkipped(false), "Date restored."));
  (view === "calendar" ? byId("agenda-add") : search).focus({ preventScroll: true });
});

byId("clear-demo").addEventListener("click", () => {
  const samples = tasks.filter((task) => task.sample);
  commit(tasks.filter((task) => !task.sample), "Sample tasks removed.", () => commit([...tasks, ...samples], "Sample tasks restored."));
});

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || dialog.open || categoryDialog.open ||
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
