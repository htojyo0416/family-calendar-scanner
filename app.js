const profiles = {
  daughter: {
    child: "長女",
    sample: "5/12 遠足 9:00-14:00 持ち物: お弁当\n5/14 ピアノ 16:30-17:00\n5/21 保護者会 15:00",
  },
  son: {
    child: "長男",
    sample: "5/10 サッカー 8:30-10:00 グラウンド\n5/16 授業参観 10:30\n5/24 スイミング 14:00-15:00",
  },
};

const state = {
  events: [],
};

const calendarImage = document.querySelector("#calendarImage");
const previewFrame = document.querySelector("#previewFrame");
const previewImage = document.querySelector("#previewImage");
const statusPill = document.querySelector("#statusPill");
const ocrText = document.querySelector("#ocrText");
const ocrNote = document.querySelector("#ocrNote");
const eventList = document.querySelector("#eventList");
const eventTemplate = document.querySelector("#eventTemplate");
const eventCount = document.querySelector("#eventCount");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // GitHub Pages以外のローカル表示では登録できない場合があります。
    });
  });
}

calendarImage.addEventListener("change", () => {
  const file = calendarImage.files?.[0];
  if (!file) return;

  previewImage.src = URL.createObjectURL(file);
  previewFrame.hidden = false;
  statusPill.textContent = "画像取込済";
  ocrNote.textContent =
    "写真を取り込みました。今の版は自動読取が未接続なので、写真を見ながら予定を入力してください。";
  if (!ocrText.value.trim()) {
    ocrText.placeholder = "例: 5/12 遠足 9:00-14:00\n5/14 ピアノ 16:30-17:00\n5/21 保護者会 15:00";
  }
});

document.querySelector("#loadSample").addEventListener("click", () => {
  const profile = getProfile();
  ocrText.value = profiles[profile].sample;
  statusPill.textContent = "サンプル入力";
});

document.querySelector("#parseText").addEventListener("click", () => {
  const parsed = parseScheduleText(ocrText.value);
  state.events = parsed.length ? parsed : [createEmptyEvent()];
  renderEvents();
  statusPill.textContent = `${state.events.length}件変換`;
});

document.querySelector("#addEvent").addEventListener("click", () => {
  state.events.push(createEmptyEvent());
  renderEvents();
});

document.querySelector("#downloadIcs").addEventListener("click", () => {
  if (!state.events.length) {
    state.events.push(createEmptyEvent());
    renderEvents();
    return;
  }

  const ics = buildIcs(state.events);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "family-schedule.ics";
  link.click();
  URL.revokeObjectURL(link.href);
});

function getProfile() {
  return document.querySelector('input[name="profile"]:checked').value;
}

function getSelectedChild() {
  return profiles[getProfile()].child;
}

function createEmptyEvent() {
  const year = document.querySelector("#baseYear").value;
  const today = new Date();
  const fallbackDate = `${year}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const start = document.querySelector("#defaultTime").value;
  return {
    date: fallbackDate,
    title: "",
    start,
    end: addMinutes(start, Number(document.querySelector("#defaultDuration").value)),
    child: getSelectedChild(),
    memo: "",
  };
}

function parseScheduleText(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLine)
    .filter(Boolean);
}

function parseLine(line) {
  const year = document.querySelector("#baseYear").value;
  const defaultTime = document.querySelector("#defaultTime").value;
  const duration = Number(document.querySelector("#defaultDuration").value);
  const dateMatch = line.match(/(\d{1,2})[\/月.](\d{1,2})日?/);
  if (!dateMatch) return null;

  const timeRange = line.match(/(\d{1,2}):(\d{2})(?:\s*[-~ー]\s*(\d{1,2}):(\d{2}))?/);
  const start = timeRange ? `${pad(timeRange[1])}:${timeRange[2]}` : defaultTime;
  const end = timeRange?.[3] ? `${pad(timeRange[3])}:${timeRange[4]}` : addMinutes(start, duration);
  const dateText = dateMatch[0];
  const timeText = timeRange?.[0] ?? "";
  const remainder = line.replace(dateText, "").replace(timeText, "").trim();
  const [title, ...memoParts] = remainder.split(/\s+/);

  return {
    date: `${year}-${pad(dateMatch[1])}-${pad(dateMatch[2])}`,
    title: title || "予定",
    start,
    end,
    child: getSelectedChild(),
    memo: memoParts.join(" "),
  };
}

function renderEvents() {
  eventList.innerHTML = "";
  state.events.forEach((event, index) => {
    const node = eventTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.child = event.child;

    node.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      input.value = event[field] ?? "";
      input.addEventListener("input", () => {
        state.events[index][field] = input.value;
        if (field === "child") node.dataset.child = input.value;
        updateCount();
      });
    });

    node.querySelector(".remove").addEventListener("click", () => {
      state.events.splice(index, 1);
      renderEvents();
    });

    eventList.append(node);
  });
  updateCount();
}

function updateCount() {
  eventCount.textContent = `${state.events.length}件`;
}

function buildIcs(events) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Handwritten Calendar//JA",
    "CALSCALE:GREGORIAN",
  ];

  events.forEach((event, index) => {
    const isAllDay = minutesBetween(event.start, event.end) >= 1440;
    const start = isAllDay ? formatDate(event.date) : formatDateTime(event.date, event.start);
    const endDate = isAllDay ? nextDate(event.date) : event.date;
    const end = isAllDay ? formatDate(endDate) : formatDateTime(event.date, event.end);
    const dtType = isAllDay ? ";VALUE=DATE" : "";

    lines.push(
      "BEGIN:VEVENT",
      `UID:${Date.now()}-${index}@handwritten-calendar.local`,
      `DTSTAMP:${toUtcStamp(new Date())}`,
      `DTSTART${dtType}:${start}`,
      `DTEND${dtType}:${end}`,
      `SUMMARY:${escapeIcs(`${event.child}: ${event.title || "予定"}`)}`,
      `DESCRIPTION:${escapeIcs(event.memo || "")}`,
      "END:VEVENT",
    );
  });

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function addMinutes(time, minutes) {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hour, minute + minutes);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function minutesBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function nextDate(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(year, month - 1, day + 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(dateText) {
  return dateText.replaceAll("-", "");
}

function formatDateTime(dateText, timeText) {
  return `${formatDate(dateText)}T${timeText.replace(":", "")}00`;
}

function toUtcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

renderEvents();
