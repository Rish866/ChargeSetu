/** Tiny className joiner (avoids adding a dependency for this). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
