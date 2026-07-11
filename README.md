# ForgeSelect

«A modern, lightweight, highly customizable replacement for Select2.»

ForgeSelect is a next-generation JavaScript select component built for modern web applications. It provides a clean API, powerful customization options, excellent performance, and accessibility while remaining framework-agnostic.

Why ForgeSelect?

Select2 has served the community well for many years, but modern web development has evolved.

ForgeSelect is designed to provide:

- 🚀 High performance
- 🎨 Fully customizable UI
- 📱 Responsive and mobile-friendly
- ♿ Accessibility (ARIA) support
- 🔍 Fast searching
- 🌳 Nested option groups
- 🏷️ Single & multiple selection
- 🧩 Plugin architecture
- 🌐 AJAX & remote data loading
- 🌙 Dark mode support
- 🌍 Internationalization (i18n)
- 📦 Zero dependency

---

Features

- Single Select
- Multiple Select
- Searchable Dropdown
- Async Data Source
- Virtual Scrolling
- Custom Templates
- Tags Mode
- Keyboard Navigation
- Disabled Options
- Option Groups
- Clear Selection
- Placeholder
- Custom Icons
- Custom Themes
- Event System
- TypeScript Support
- Tree Select (planned)
- Infinite Scroll (planned)

---

Installation

npm install forge-select

or

yarn add forge-select

or

pnpm add forge-select

---

Quick Start

<select id="country">
    <option value="vn">Vietnam</option>
    <option value="jp">Japan</option>
    <option value="us">United States</option>
</select>

import ForgeSelect from "forge-select";

new ForgeSelect("#country");

---

Configuration

new ForgeSelect("#country", {
    placeholder: "Select a country",
    searchable: true,
    multiple: false,
    clearable: true,
    allowCreate: false,
    theme: "default"
});

---

Events

select.on("change", value => {
    console.log(value);
});

select.on("open", () => {});

select.on("close", () => {});

---

Framework Support

- Vanilla JavaScript
- React
- Vue
- Angular
- Svelte
- Next.js
- Nuxt
- Astro

---

Browser Support

- Chrome
- Edge
- Firefox
- Safari
- Mobile Browsers

---

Roadmap

- [ ] Tree Select
- [ ] Virtualized List
- [ ] Async Pagination
- [ ] Drag & Drop Ordering
- [ ] Theme Builder
- [ ] CSS Variables
- [ ] React Component
- [ ] Vue Component
- [ ] Angular Component
- [ ] Svelte Component

---

Contributing

Contributions are welcome!

Please feel free to open an issue or submit a pull request.

---

License

MIT License.

---

Built with ❤️ by KonexForge.