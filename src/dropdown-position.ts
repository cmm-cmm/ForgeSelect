export interface DropdownPlacement {
  dropUp: boolean;
  top: number;
}

/** Pure geometry used by both inline and portalled dropdown positioning. */
export function computeDropdownPlacement(
  controlRect: Pick<DOMRect, "top" | "bottom">,
  dropdownHeight: number,
  viewportHeight: number,
  gap = 4,
): DropdownPlacement {
  const spaceBelow = viewportHeight - controlRect.bottom;
  const spaceAbove = controlRect.top;
  const dropUp = dropdownHeight > spaceBelow && spaceAbove > spaceBelow;
  return {
    dropUp,
    top: dropUp ? controlRect.top - dropdownHeight - gap : controlRect.bottom + gap,
  };
}
