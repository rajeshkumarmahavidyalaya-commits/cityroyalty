/** All money is integer paise. Decimals exist only at the display edge. */
export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

export function formatMoney(paise: number, currency = 'INR', locale = 'en-IN'): string {
  const whole = paise % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export const percentOff = (price: number, compareAt: number | null | undefined): number =>
  compareAt && compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : 0;
