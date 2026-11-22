/** One "label → link" row, the way oshi.tw lists its links. */
export interface LinkItem {
  label: string;
  text: string;
  /** A page elsewhere, opened in a new tab. */
  href?: string;
  /** A page on this site. */
  to?: string;
}

/** A number and its unit in the big counter, e.g. "04" "時". */
export interface CounterPart {
  value: string;
  unit: string;
}
