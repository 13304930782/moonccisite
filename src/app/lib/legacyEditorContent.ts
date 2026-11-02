import {micromark} from 'micromark';
import {gfm, gfmHtml} from 'micromark-extension-gfm';

const html = gfmHtml();
// Keep raw HTML intact for the existing sanitizer, rather than displaying escaped unsafe tags.
delete html.exit?.htmlFlowData;
delete html.exit?.htmlTextData;

export const parseLegacy = (value: string) => micromark(value, {
  allowDangerousHtml: true,
  extensions: [
    gfm(),
    // Existing drafts used marked's ordinary reference-link interpretation of footnotes.
    {disable: {null: ['gfmFootnoteDefinition', 'gfmFootnoteCall', 'gfmPotentialFootnoteCall']}},
  ],
  htmlExtensions: [html],
});
