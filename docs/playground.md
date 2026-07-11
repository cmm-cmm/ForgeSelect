# Playground

> [Docs home](./README.md)

## Live demo

The interactive demo on GitHub Pages always reflects the latest `main` commit (deployments run on pushes to `main`; superseded in-progress runs may be canceled):

**<https://cmm-cmm.github.io/ForgeSelect/demo/>**

It showcases:

- Single searchable select with clear button
- Multiple selection with tags and `allowCreate`
- Option groups
- Custom `templateResult` / `templateSelection`
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
