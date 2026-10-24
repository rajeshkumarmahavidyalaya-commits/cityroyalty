import { describe, expect, it } from 'vitest';
import { cleanHtml } from '../src/lib/sanitize';

describe('cleanHtml', () => {
  it('drops leaked page-builder shortcodes (curly quotes included) but keeps the text', () => {
    const html = '<p>[vc_row equal_height=”yes” css=”.vc_custom_1{margin:0 !important;}”][vc_column][woodmart_title title=”SHOP”]Real text[/vc_column][/vc_row]</p>';
    expect(cleanHtml(html)).toBe('<p>Real text</p>');
  });

  it('still strips scripts and inline handlers', () => {
    expect(cleanHtml('<p onclick="x()">Hi<script>alert(1)</script></p>')).toBe('<p>Hi</p>');
  });

  it('leaves ordinary square brackets alone', () => {
    expect(cleanHtml('<p>Sizes [S–XL] available</p>')).toBe('<p>Sizes [S–XL] available</p>');
  });
});
