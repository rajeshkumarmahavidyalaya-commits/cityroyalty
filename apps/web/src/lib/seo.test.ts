import { describe, expect, it } from 'vitest';
import { factAttributes, faqEntries, faqLd, productFacts, productMetaDescription } from './seo';

const jacket = `Men’s Biker Black Leather Jacket Concept
Few items of menswear come packaged with as much attitude as a leather jacket. They are built to last.
FEATURES

Material: 100% Real Leather
Adjustable Cuffs.
Full-Grain, Vegetable-Tanned Leather Jacket Trim Lining.
Zinc Alloy, YKK Brass Zippers, Steel Rivets.
Manufactured by Worldwide Artisans in India.

CARE
Condition your leather every 6 months.`;

const bag = `Our duffle makes traveling effortless.
FEATURES
? Dimensions: 23? x 10? x 10?
? Full-grain vegetable-tanned leather
Interior Pocket: 8″” X 5-1/2″”
? Manufactured by Worldwide Artisans in Royal India`;

describe('productFacts', () => {
  it('lists the FEATURES lines as written and stops at the next heading', () => {
    expect(productFacts(jacket)).toEqual([
      'Material: 100% Real Leather',
      'Adjustable Cuffs',
      'Full-Grain, Vegetable-Tanned Leather Jacket Trim Lining',
      'Zinc Alloy, YKK Brass Zippers, Steel Rivets',
      'Manufactured by Worldwide Artisans in India',
    ]);
  });
  it('repairs the source encoding damage (lost bullets and inch marks) without rewording', () => {
    expect(productFacts(bag)).toEqual(['Dimensions: 23″ x 10″ x 10″', 'Full-grain vegetable-tanned leather', 'Interior Pocket: 8″ X 5-1/2″', 'Manufactured by Worldwide Artisans in Royal India']);
  });
  it('returns nothing when there is no FEATURES section', () => {
    expect(productFacts('Just a paragraph.')).toEqual([]);
  });
});

describe('factAttributes / productMetaDescription', () => {
  it('derives only explicitly stated facts', () => {
    expect(factAttributes(productFacts(jacket))).toEqual({ material: 'Full-grain leather', madeInIndia: true });
    expect(factAttributes(['Adjustable cuffs'])).toEqual({ material: undefined, madeInIndia: false });
  });
  it('writes an answer-style description under 160 characters', () => {
    const d = productMetaDescription({ title: 'Men’s Biker Black Leather Jacket', description: jacket, priceFrom: 799900 }, productFacts(jacket));
    expect(d.startsWith('Men’s Biker Black Leather Jacket by City Royalty, in full-grain leather, made in India. ₹7,999.')).toBe(true);
    expect(d.length).toBeLessThanOrEqual(158);
  });
});

describe('faqEntries', () => {
  it('pairs each h3 question with the content up to the next heading', () => {
    const html = '<h2>Orders</h2><h3>How long does delivery take?</h3><p>Usually 2 to 5 days.</p><ul><li>Tracked</li></ul><h3>Is shipping free?</h3><p>Over &#8377;600 &amp; up.</p><h2>Care</h2><p>Not an answer</p>';
    expect(faqEntries(html)).toEqual([
      { q: 'How long does delivery take?', a: 'Usually 2 to 5 days. Tracked' },
      { q: 'Is shipping free?', a: 'Over ₹600 & up.' },
    ]);
  });
  it('gives no FAQPage when the page has no questions', () => {
    expect(faqLd('<p>Just text</p>')).toBeNull();
    expect(faqLd('<h3>Q?</h3><p>A.</p>')).toMatchObject({ '@type': 'FAQPage', mainEntity: [{ name: 'Q?', acceptedAnswer: { text: 'A.' } }] });
  });
});
