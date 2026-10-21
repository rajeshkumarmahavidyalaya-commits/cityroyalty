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
  [/off[\s-]?white|cream|ivory/i, '#ece4d2'], [/white/i, '#f4f1ea'], [/grayish black|iron gr[ae]y|gr[ae]y/i, '#4b4b4b'], [/black/i, '#141414'],
  [/maroon|mahogany|red|burgundy/i, '#5c1522'], [/chocolate|syrup|rusty|brunette|tortilla|coffee|dark brown/i, '#4a2716'], [/caramel|tan|tawny|camel/i, '#a8743f'],
  [/brown/i, '#6d4424'], [/turquoise|teal|ocean/i, '#1f8f9a'], [/prussian|navy|dark blue/i, '#16254a'], [/blue/i, '#1d4a9a'], [/olive|green/i, '#4d5a2c'],
  [/mustard|yellow|golden/i, '#c59a2a'], [/orange|peach/i, '#d98a54'], [/pink/i, '#d98aa0'],
];
export const swatchColour = (name: string): string | null => SWATCH.find(([re]) => re.test(name))?.[1] ?? null;
