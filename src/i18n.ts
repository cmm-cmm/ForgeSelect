export type Strings = Record<string, string>;

const locales: Record<string, Strings> = {
  en: {
    noResults: "No results found",
    loading: "Loading…",
    loadingMore: "Loading more…",
    errorLoading: "Could not load options",
    createOption: 'Create "{query}"',
    clearSelection: "Clear selection",
    removeItem: "Remove {label}",
    search: "Search",
    reorderHint: "{label}. Press Alt+Left or Alt+Right to reorder.",
    minSearchLength: "Type {count} or more characters to search",
    maximumSelected: "Maximum of {count} selections reached",
  },
  vi: {
    noResults: "Không tìm thấy kết quả",
    loading: "Đang tải…",
    loadingMore: "Đang tải thêm…",
    errorLoading: "Không thể tải tùy chọn",
    createOption: 'Tạo "{query}"',
    clearSelection: "Xóa lựa chọn",
    removeItem: "Xóa {label}",
    search: "Tìm kiếm",
    reorderHint: "{label}. Nhấn Alt+Trái hoặc Alt+Phải để sắp xếp lại.",
    minSearchLength: "Nhập thêm {count} ký tự để tìm kiếm",
    maximumSelected: "Đã đạt tối đa {count} lựa chọn",
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
