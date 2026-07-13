/* ForgeSelect Theme Builder: tweak --fs-* CSS variables live and copy the
 * generated CSS. LIGHT/DARK presets mirror styles/forge-select.css's default
 * and dark themes exactly — keep them in sync if that stylesheet changes. */
(function () {
  if (typeof ForgeSelectBundle === "undefined") {
    document.getElementById("tb-preview").textContent =
      "Failed to load the ForgeSelect bundle (dist/index.global.js). Build the library with `npm run build` and reload.";
    return;
  }
  const ForgeSelect = ForgeSelectBundle.default;

  const VARS = [
    { name: "--fs-bg", label: "Background", type: "color" },
    { name: "--fs-fg", label: "Text", type: "color" },
    { name: "--fs-muted", label: "Muted text", type: "color" },
    { name: "--fs-border", label: "Border", type: "color" },
    { name: "--fs-border-focus", label: "Focus border", type: "color" },
    { name: "--fs-dropdown-bg", label: "Dropdown background", type: "color" },
    { name: "--fs-option-hover-bg", label: "Option hover", type: "color" },
    { name: "--fs-option-selected-bg", label: "Option selected bg", type: "color" },
    { name: "--fs-option-selected-fg", label: "Option selected text", type: "color" },
    { name: "--fs-tag-bg", label: "Tag background", type: "color" },
    { name: "--fs-tag-fg", label: "Tag text", type: "color" },
    { name: "--fs-radius", label: "Corner radius", type: "text" },
    { name: "--fs-font-size", label: "Font size", type: "text" },
    { name: "--fs-dropdown-shadow", label: "Dropdown shadow", type: "text" },
  ];

  const LIGHT = {
    "--fs-bg": "#ffffff",
    "--fs-fg": "#1f2937",
    "--fs-muted": "#9ca3af",
    "--fs-border": "#d1d5db",
    "--fs-border-focus": "#6366f1",
    "--fs-radius": "8px",
    "--fs-dropdown-bg": "#ffffff",
    "--fs-dropdown-shadow": "0 8px 24px rgba(0, 0, 0, 0.12)",
    "--fs-option-hover-bg": "#eef2ff",
    "--fs-option-selected-bg": "#e0e7ff",
    "--fs-option-selected-fg": "#3730a3",
    "--fs-tag-bg": "#e0e7ff",
    "--fs-tag-fg": "#3730a3",
    "--fs-font-size": "14px",
  };

  const DARK = {
    ...LIGHT,
    "--fs-bg": "#1f2937",
    "--fs-fg": "#f9fafb",
    "--fs-muted": "#6b7280",
    "--fs-border": "#374151",
    "--fs-border-focus": "#818cf8",
    "--fs-dropdown-bg": "#111827",
    "--fs-dropdown-shadow": "0 8px 24px rgba(0, 0, 0, 0.5)",
    "--fs-option-hover-bg": "#312e81",
    "--fs-option-selected-bg": "#3730a3",
    "--fs-option-selected-fg": "#e0e7ff",
    "--fs-tag-bg": "#3730a3",
    "--fs-tag-fg": "#e0e7ff",
  };

  const varsContainer = document.getElementById("tb-vars");
  const preview = document.getElementById("tb-preview");
  const output = document.getElementById("tb-css-output");
  const copyBtn = document.getElementById("tb-copy");
  const inputs = {};

  // Mount a single-select and a multi-select so tag colors (--fs-tag-*)
  // are visible in the preview too, not just the flat option list.
  const singleEl = document.createElement("select");
  const multiEl = document.createElement("select");
  preview.append(singleEl, multiEl);

  new ForgeSelect(singleEl, {
    placeholder: "Select a country",
    clearable: true,
    data: [
      { value: "vn", label: "Vietnam" },
      { value: "jp", label: "Japan" },
      { value: "us", label: "United States" },
    ],
  });
  const multi = new ForgeSelect(multiEl, {
    placeholder: "Pick tags",
    multiple: true,
    data: [
      { value: "js", label: "JavaScript" },
      { value: "ts", label: "TypeScript" },
      { value: "css", label: "CSS" },
    ],
  });
  multi.setValue(["js", "ts"]);

  const previewRoots = Array.from(preview.querySelectorAll(".forge-select"));

  function currentValues() {
    const values = {};
    for (const v of VARS) values[v.name] = inputs[v.name].value;
    return values;
  }

  function updateOutput(values) {
    const lines = VARS.map((v) => `  ${v.name}: ${values[v.name]};`).join("\n");
    output.textContent = `.forge-select {\n${lines}\n}`;
  }

  function applyVars(values) {
    for (const root of previewRoots) {
      for (const [name, value] of Object.entries(values)) {
        root.style.setProperty(name, value);
      }
    }
    updateOutput(values);
  }

  function loadPreset(preset) {
    for (const v of VARS) inputs[v.name].value = preset[v.name];
    applyVars(preset);
  }

  for (const v of VARS) {
    const row = document.createElement("label");
    row.className = "tb-var-row";
    const span = document.createElement("span");
    span.textContent = v.label;
    const input = document.createElement("input");
    input.type = v.type;
    input.value = LIGHT[v.name];
    input.addEventListener("input", () => applyVars(currentValues()));
    inputs[v.name] = input;
    row.append(span, input);
    varsContainer.append(row);
  }

  document.getElementById("tb-preset-light").addEventListener("click", () => loadPreset(LIGHT));
  document.getElementById("tb-preset-dark").addEventListener("click", () => loadPreset(DARK));

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(output.textContent);
      copyBtn.textContent = "✓ Copied";
    } catch {
      copyBtn.textContent = "✗ Failed";
    }
    setTimeout(() => (copyBtn.textContent = "Copy CSS"), 1200);
  });

  loadPreset(LIGHT);
})();
