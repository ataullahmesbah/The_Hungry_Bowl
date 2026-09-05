/**
 * Recommended upload sizes, PRD §16.
 *
 * Every media field in the dashboard shows the hint for its slot so a
 * non-developer knows what to upload without asking anyone.
 */
export interface MediaSlot {
  key: string;
  label: string;
  folder: string;
  recommended: string;
  aspect?: string;
  note?: string;
  accept: 'image' | 'video' | 'both';
}

export const MEDIA_SLOTS: MediaSlot[] = [
  {
    key: 'hero',
    label: 'Hero / banner',
    folder: 'home',
    recommended: '1920 × 1080 px',
    aspect: '16 / 9',
    note: 'Keep the important part of the picture near the centre — the edges get cropped on phones.',
    accept: 'both',
  },
  {
    key: 'menu-card',
    label: 'Menu / food card',
    folder: 'menu',
    recommended: '1200 × 1200 px',
    aspect: '1 / 1',
    note: 'Square keeps every card the same height on the menu page.',
    accept: 'image',
  },
  {
    key: 'food-detail',
    label: 'Food detail / gallery',
    folder: 'menu',
    recommended: '1600 × 1200 px',
    aspect: '4 / 3',
    accept: 'both',
  },
  {
    key: 'offer',
    label: 'Offer / promotion banner',
    folder: 'offers',
    recommended: '1600 × 900 px',
    aspect: '16 / 9',
    accept: 'image',
  },
  {
    key: 'event',
    label: 'Event banner',
    folder: 'events',
    recommended: '1600 × 900 px',
    aspect: '16 / 9',
    accept: 'image',
  },
  {
    key: 'gallery',
    label: 'Restaurant gallery',
    folder: 'gallery',
    recommended: '1600 × 1200 px',
    aspect: '4 / 3',
    accept: 'both',
  },
  {
    key: 'logo',
    label: 'Logo',
    folder: 'brand',
    recommended: 'SVG preferred, or PNG 1000 px+ with a transparent background',
    accept: 'image',
  },
  {
    key: 'og',
    label: 'Social share image (Open Graph)',
    folder: 'seo',
    recommended: '1200 × 630 px',
    aspect: '1.91 / 1',
    note: 'This is the picture people see when your link is shared on Facebook or WhatsApp.',
    accept: 'image',
  },
  {
    key: 'staff',
    label: 'Staff / chef portrait',
    folder: 'team',
    recommended: '1000 × 1000 px',
    aspect: '1 / 1',
    accept: 'image',
  },
  {
    key: 'thumb',
    label: 'Small thumbnail',
    folder: 'misc',
    recommended: '800 × 800 px',
    aspect: '1 / 1',
    note: 'The system generates smaller sizes automatically — you never need to resize by hand.',
    accept: 'image',
  },
];

export function slotByKey(key: string): MediaSlot | undefined {
  return MEDIA_SLOTS.find((s) => s.key === key);
}

/** Folders offered in the media library's folder picker. */
export const MEDIA_FOLDERS = [
  'home',
  'menu',
  'offers',
  'events',
  'gallery',
  'team',
  'brand',
  'seo',
  'misc',
] as const;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

export const ALLOWED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg'];
export const ALLOWED_VIDEO_FORMATS = ['mp4', 'webm', 'mov'];
