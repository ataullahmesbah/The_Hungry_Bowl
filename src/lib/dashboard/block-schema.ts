/**
 * Field definitions for the editable home-page sections.
 *
 * The database stores each block as free-form JSON; this map tells the
 * dashboard which inputs to render for each one, so an owner sees "Heading"
 * and "Button label" rather than a JSON editor.
 */
export type BlockFieldType = 'text' | 'textarea' | 'url' | 'media' | 'repeater';

export interface BlockField {
  key: string;
  label: string;
  type: BlockFieldType;
  hint?: string;
  mediaSlot?: string;
  /** For repeaters: the fields of each item. */
  fields?: BlockField[];
  maxItems?: number;
}

export interface BlockSchema {
  key: string;
  label: string;
  description: string;
  fields: BlockField[];
}

export const BLOCK_SCHEMAS: BlockSchema[] = [
  {
    key: 'home.hero',
    label: 'Hero',
    description: 'The big banner at the top of the home page.',
    fields: [
      { key: 'eyebrow', label: 'Small line above the heading', type: 'text', hint: 'e.g. “Dhaka · Since 2019”' },
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'subheading', label: 'Supporting line', type: 'textarea' },
      { key: 'primaryCtaLabel', label: 'Main button text', type: 'text' },
      { key: 'primaryCtaHref', label: 'Main button link', type: 'url', hint: 'e.g. /reservation' },
      { key: 'secondaryCtaLabel', label: 'Second button text', type: 'text' },
      { key: 'secondaryCtaHref', label: 'Second button link', type: 'url', hint: 'e.g. /menu' },
      { key: 'imageUrl', label: 'Background photo', type: 'media', mediaSlot: 'hero' },
    ],
  },
  {
    key: 'home.highlights',
    label: 'Highlights',
    description: 'Four short reasons guests come back.',
    fields: [
      { key: 'heading', label: 'Section heading', type: 'text' },
      {
        key: 'items',
        label: 'Highlight cards',
        type: 'repeater',
        maxItems: 6,
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'body', label: 'Description', type: 'textarea' },
        ],
      },
    ],
  },
  {
    key: 'home.about',
    label: 'About strip',
    description: 'A photo with a short paragraph about the restaurant.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'body', label: 'Paragraph', type: 'textarea' },
      { key: 'ctaLabel', label: 'Link text', type: 'text' },
      { key: 'ctaHref', label: 'Link address', type: 'url' },
      { key: 'imageUrl', label: 'Photo', type: 'media', mediaSlot: 'food-detail' },
    ],
  },
  {
    key: 'home.cta',
    label: 'Closing call to action',
    description: 'The dark band at the bottom of the home page.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'body', label: 'Supporting line', type: 'textarea' },
      { key: 'ctaLabel', label: 'Button text', type: 'text' },
      { key: 'ctaHref', label: 'Button link', type: 'url' },
    ],
  },
];

export function blockSchema(key: string): BlockSchema | undefined {
  return BLOCK_SCHEMAS.find((s) => s.key === key);
}
