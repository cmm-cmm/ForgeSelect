import type { Option, TemplateFn } from "./types";

export type OptionRenderVariant = "row" | "inline";

/** Render one option without coupling presentation details to the select controller. */
export function renderOptionContent(
  container: HTMLElement,
  option: Option,
  template?: TemplateFn,
  variant: OptionRenderVariant = "row",
): void {
  if (template) {
    const result = template(option);
    if (typeof result === "string") container.innerHTML = result;
    else container.append(result);
    return;
  }
  if (!option.avatar && !option.description) {
    container.textContent = option.label;
    return;
  }

  // Built-in rich rendering only uses textContent/attribute assignment.
  if (option.avatar) {
    const avatar = document.createElement("img");
    avatar.className = variant === "row" ? "forge-select__option-avatar" : "forge-select__inline-avatar";
    avatar.src = option.avatar;
    avatar.alt = "";
    avatar.setAttribute("loading", "lazy");
    avatar.setAttribute("decoding", "async");
    container.append(avatar);
  }
  if (variant === "row" && option.description) {
    const body = document.createElement("span");
    body.className = "forge-select__option-body";
    const label = document.createElement("span");
    label.className = "forge-select__option-label";
    label.textContent = option.label;
    const description = document.createElement("span");
    description.className = "forge-select__option-desc";
    description.textContent = option.description;
    body.append(label, description);
    container.append(body);
  } else {
    const label = document.createElement("span");
    label.className = "forge-select__option-label";
    label.textContent = option.label;
    container.append(label);
  }
}
