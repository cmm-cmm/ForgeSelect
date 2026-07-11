export type Strings = Record<string, string>;

const locales: Record<string, Strings> = {
  en: {
    noResults: "No results found",
    loading: "Loading…",
    createOption: 'Create "{query}"',
    clearSelection: "Clear selection",
    removeItem: "Remove {label}",
    search: "Search",
  },
  vi: {
    noResults: "Không tìm thấy kết quả",
    loading: "Đang tải…",
    createOption: 'Tạo "{query}"',
    clearSelection: "Xóa lựa chọn",
    removeItem: "Xóa {label}",
    search: "Tìm kiếm",
  },
};

export function getStrings(language: string | Strings): Strings {
  if (typeof language === "string") {
    return locales[language] ?? locales.en;
  }
  return { ...locales.en, ...language };
}

export function format(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}
