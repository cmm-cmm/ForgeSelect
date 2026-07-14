# Playground

> [Docs home](./README.md)

## Interactive playground

Write and run Forge Select code directly in the browser — with presets for every major feature:

**<https://forgeselect.konexforge.com/playground/>**

Pick a preset (Basic, Multiple + tags, Rich items ×1000, Option groups, Custom template, Dark theme, Events), edit the snippet, and press **Run** (or Ctrl/Cmd + Enter). Your code receives a fresh `el` (`<select>` element) and a `log()` helper that prints into the preview pane.

## Live demo

A curated showcase of every feature, deployed from the latest `main` commit:

**<https://forgeselect.konexforge.com/demo/>**

It showcases:

- Single searchable select with clear button
- Multiple selection with tags and `allowCreate`
- Option groups
- Custom `templateResult` / `templateSelection`
- Rich items (avatar + description) with 1,000 users
- Virtual scrolling with 10,000 options
- Vietnamese locale (`language: "vi"`)
- A live event log of every `change` / `open` / `close` / `search` / `clear` event
- Dark mode toggle

## Run the demo locally

```bash
git clone https://github.com/cmm-cmm/ForgeSelect.git
cd ForgeSelect
npm install
npm run build
python3 -m http.server 8080   # or: npx serve -l 8080
```

Then open <http://localhost:8080/demo/> in your browser. The demo page (`demo/index.html`) loads the IIFE bundle from `dist/index.global.js` and the stylesheet from `styles/forge-select.css`.

## Hosted sandboxes

StackBlitz / CodeSandbox starter templates are planned once the package is published to npm. Until then, copy any snippet from [Examples](./examples.md) into the local demo setup above.

## See also

- [Examples](./examples.md)
- [Benchmarks](./benchmarks.md)
