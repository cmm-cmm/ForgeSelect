/* ForgeSelect playground: edit the snippet on the left, run it, and the
 * preview pane re-mounts a fresh <select> for your code to enhance. */
(function () {
  if (typeof ForgeSelectBundle === "undefined") {
    const errorBar = document.getElementById("pg-error");
    errorBar.hidden = false;
    errorBar.textContent =
      "Failed to load the ForgeSelect bundle (dist/index.global.js). Build the library with `npm run build` and reload.";
    return;
  }
  const ForgeSelect = ForgeSelectBundle.default;

  const PRESETS = [
    {
      name: "Basic",
      code: `// "el" is a fresh <select> element in the preview pane.
const select = new ForgeSelect(el, {
  placeholder: "Select a country",
  clearable: true,
  data: [
    { value: "vn", label: "Vietnam" },
    { value: "jp", label: "Japan" },
    { value: "us", label: "United States" },
    { value: "fr", label: "France" },
  ],
});

select.on("change", (value) => log("change → " + JSON.stringify(value)));`,
    },
    {
      name: "Multiple + tags",
      code: `const select = new ForgeSelect(el, {
  placeholder: "Pick or create tags",
  multiple: true,
  allowCreate: true,
  clearable: true,
  data: [
    { value: "js", label: "JavaScript" },
    { value: "ts", label: "TypeScript" },
    { value: "css", label: "CSS" },
  ],
});

select.on("change", (value) => log("change → " + JSON.stringify(value)));`,
    },
    {
      name: "Rich items ×1000",
      code: `// 1,000 users with avatars — virtualization kicks in automatically.
const palette = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6"];
const avatar = (initial, bg) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(
    \`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" rx="28" fill="\${bg}"/><text x="28" y="37" font-family="sans-serif" font-size="26" fill="#fff" text-anchor="middle">\${initial}</text></svg>\`);

const data = Array.from({ length: 1000 }, (_, i) => ({
  value: "u" + i,
  label: "User #" + (i + 1),
  description: "user" + (i + 1) + "@example.com",
  avatar: avatar("U", palette[i % palette.length]),
}));

new ForgeSelect(el, {
  placeholder: "Search 1,000 users…",
  itemHeight: 52,
  clearable: true,
  data,
});`,
    },
    {
      name: "Option groups",
      code: `new ForgeSelect(el, {
  placeholder: "Grouped options",
  data: [
    { label: "Asia", options: [
      { value: "vn", label: "Vietnam" },
      { value: "jp", label: "Japan" },
    ]},
    { label: "Europe", options: [
      { value: "fr", label: "France" },
      { value: "de", label: "Germany" },
    ]},
  ],
});`,
    },
    {
      name: "Custom template",
      code: `const statuses = { ana: "online", bao: "away", chi: "offline" };
const colors = { online: "#22c55e", away: "#f59e0b", offline: "#94a3b8" };

new ForgeSelect(el, {
  placeholder: "Custom template",
  data: [
    { value: "ana", label: "Ana Trần" },
    { value: "bao", label: "Bảo Lê" },
    { value: "chi", label: "Chi Phạm" },
  ],
  templateResult: (o) => {
    const row = document.createElement("span");
    const dot = document.createElement("span");
    dot.style.cssText = "width:8px;height:8px;border-radius:50%;background:" + colors[statuses[o.value]];
    const name = document.createElement("span");
    name.textContent = o.label + " (" + statuses[o.value] + ")";
    row.append(dot, name);
    row.style.cssText = "display:inline-flex;align-items:center;gap:8px";
    return row;
  },
});`,
    },
    {
      name: "Dark theme",
      code: `new ForgeSelect(el, {
  placeholder: "Dark theme",
  theme: "dark",
  clearable: true,
  data: [
    { value: "vn", label: "Vietnam" },
    { value: "jp", label: "Japan" },
    { value: "us", label: "United States" },
  ],
});`,
    },
    {
      name: "Events",
      code: `const select = new ForgeSelect(el, {
  placeholder: "Watch the log below",
  clearable: true,
  data: [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ],
});

for (const event of ["change", "open", "close", "search", "clear"]) {
  select.on(event, (payload) =>
    log(event + (payload !== undefined ? " → " + JSON.stringify(payload) : "")));
}`,
    },
  ];

  const editor = document.getElementById("pg-editor");
  const preview = document.getElementById("pg-preview");
  const errorBar = document.getElementById("pg-error");
  const status = document.getElementById("pg-status");
  const presetList = document.getElementById("pg-preset-list");

  let activePreset = 0;

  PRESETS.forEach((preset, i) => {
    const button = document.createElement("button");
    button.textContent = preset.name;
    button.addEventListener("click", () => {
      activePreset = i;
      editor.value = preset.code;
      highlightPreset();
      run();
    });
    presetList.append(button);
  });

  function highlightPreset() {
    [...presetList.children].forEach((b, i) => b.classList.toggle("active", i === activePreset));
  }

  function run() {
    errorBar.hidden = true;
    preview.textContent = "";

    const el = document.createElement("select");
    preview.append(el);

    const logBox = document.createElement("pre");
    logBox.style.cssText =
      "margin-top:20px;font-size:12px;color:var(--fg-muted);white-space:pre-wrap;max-height:200px;overflow-y:auto";
    const log = (line) => {
      logBox.textContent = "[" + new Date().toLocaleTimeString() + "] " + line + "\n" + logBox.textContent;
    };

    try {
      const fn = new Function("ForgeSelect", "el", "log", editor.value);
      fn(ForgeSelect, el, log);
      preview.append(logBox);
      status.textContent = "Ran at " + new Date().toLocaleTimeString();
    } catch (err) {
      errorBar.hidden = false;
      errorBar.textContent = String(err);
      status.textContent = "Error";
    }
  }

  document.getElementById("pg-run").addEventListener("click", run);
  document.getElementById("pg-reset").addEventListener("click", () => {
    editor.value = PRESETS[activePreset].code;
    run();
  });
  editor.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const { selectionStart, selectionEnd, value } = editor;
      editor.value = value.slice(0, selectionStart) + "  " + value.slice(selectionEnd);
      editor.selectionStart = editor.selectionEnd = selectionStart + 2;
    }
  });

  editor.value = PRESETS[0].code;
  highlightPreset();
  run();
})();
