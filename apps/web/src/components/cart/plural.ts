const pluralRules = new Intl.PluralRules("ro-RO");

/** "1 produs", "5 produse", "20 de produse" (Romanian counting rules). */
export function formatCount(count: number, one: string, other: string): string {
  switch (pluralRules.select(count)) {
    case "one":
      return `${count} ${one}`;
    case "few":
      return `${count} ${other}`;
    default:
      return `${count} de ${other}`;
  }
}
