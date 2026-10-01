import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NUMBER_SUFFIXES = [
  { value: 1e12, symbol: "T" },
  { value: 1e9, symbol: "B" },
  { value: 1e6, symbol: "M" },
  { value: 1e3, symbol: "K" },
] as const;

/** Short form with up to `digits` decimals: 1700 → "1.7K", 1230000 → "1.23M". */
export function formatNumber(num: number, digits = 2): string {
  if (typeof num !== "number" || Number.isNaN(num)) {
    throw new TypeError("Input must be a valid number.");
  }

  const absNum = Math.abs(num);
  for (const unit of NUMBER_SUFFIXES) {
    if (absNum >= unit.value) {
      return (num / unit.value).toFixed(digits).replace(/\.0+$|(\.[0-9]*[1-9])0+$/, "$1") + unit.symbol;
    }
  }
  return num.toString();
}

/** Vote totals use the same short suffixes as formatNumber. */
export function formatVoteCount(count: number, digits = 2): string {
  return formatNumber(count, digits);
}
