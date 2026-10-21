export { formatMoney, percentOff, prettySize, sizeRank } from '@cityroyalty/shared';
export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

/** Rough colour for swatches, derived only from the colour's own name (never invented per product). */
const SWATCH: [RegExp, string][] = [
  [/\b(off[\s-]?white|cream|ivory)\b/i, '#ece4d2'], [/\bwhite\b/i, '#f4f1ea'], [/\b(grayish black|iron gr[ae]y|gr[ae]y)\b/i, '#4b4b4b'], [/\bblack\b/i, '#141414'],
  [/\b(maroon|mahogany|red|burgundy)\b/i, '#5c1522'], [/\b(chocolate|syrup|rusty|brunette|tortilla|coffee|dark brown)\b/i, '#4a2716'], [/\b(caramel|tan|tawny|camel)\b/i, '#a8743f'],
  [/\bbrown\b/i, '#6d4424'], [/\b(turquoise|teal|ocean)\b/i, '#1f8f9a'], [/\b(prussian|navy|dark blue)\b/i, '#16254a'], [/\bblue\b/i, '#1d4a9a'], [/\b(olive|green)\b/i, '#4d5a2c'],
  [/\b(mustard|yellow|golden)\b/i, '#c59a2a'], [/\b(orange|peach)\b/i, '#d98a54'], [/\bpink\b/i, '#d98aa0'],
];
export const swatchColour = (name: string): string | null => SWATCH.find(([re]) => re.test(name))?.[1] ?? null;
