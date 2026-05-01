import clsx from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware classname combinator. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default cn;
