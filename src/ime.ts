import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export function isComposing(e: ReactKeyboardEvent): boolean {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}
