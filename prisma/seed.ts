/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

// Next.js loads .env for the app, but a standalone `tsx prisma/seed.ts` does
// not. Load it here so `npm run db:seed` works from a plain terminal.
for (const file of ['.env.local', '.env']) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    const key = match[1]!;
    if (process.env[key] !== undefined) continue;
    let value = (match[2] ?? '').trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
import bcrypt from 'bcryptjs';
import { ALL_PERMISSIONS, permissionDescription, permissionModule } from '../src/lib/rbac/permissions';
import { ROLE_DEFINITIONS, resolveRolePermissions } from '../src/lib/rbac/roles';

const prisma = new PrismaClient();

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL || 'owner@thehungrybowl.com';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD || 'ChangeMe#2026';
const OWNER_NAME = process.env.SEED_OWNER_NAME || 'Restaurant Owner';

async function seedPermissions() {
  console.log('→ permissions');
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, module: permissionModule(key), description: permissionDescription(key) },
      update: { module: permissionModule(key), description: permissionDescription(key) },
    });
  }
  // Remove permissions that no longer exist in code.
  await prisma.permission.deleteMany({ where: { key: { notIn: [...ALL_PERMISSIONS] } } });
}

async function seedRoles() {
  console.log('→ roles');
  for (const def of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { key: def.key },
      create: { key: def.key, name: def.name, description: def.description, rank: def.rank, isSystem: true },
      update: { name: def.name, description: def.description, rank: def.rank, isSystem: true },
    });

    const keys = resolveRolePermissions(def);
    const permissions = await prisma.permission.findMany({
      where: { key: { in: keys as string[] } },
      select: { id: true },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissions.length) {
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  }
}

async function seedOwner() {
  console.log('→ owner account');
  const superAdmin = await prisma.role.findUnique({ where: { key: 'SUPER_ADMIN' } });
  if (!superAdmin) throw new Error('SUPER_ADMIN role missing');

  const existing = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (existing) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: existing.id, roleId: superAdmin.id } },
      create: { userId: existing.id, roleId: superAdmin.id },
      update: {},
    });
    console.log(`   owner already exists: ${OWNER_EMAIL}`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: OWNER_EMAIL,
      name: OWNER_NAME,
      passwordHash: await bcrypt.hash(OWNER_PASSWORD, 12),
      status: 'ACTIVE',
      // Force a password change on first login unless one was supplied by env.
      mustChangePassword: !process.env.SEED_OWNER_PASSWORD,
      roles: { create: { roleId: superAdmin.id } },
    },
  });
  console.log(`   created ${user.email} / ${OWNER_PASSWORD}`);
}

async function seedSettings() {
  console.log('→ restaurant settings');
  await prisma.restaurantSettings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      name: 'The Hungry Bowl',
      tagline: 'Fresh flavours, served warm',
      description:
        'The Hungry Bowl is a family restaurant serving authentic Bangladeshi and continental dishes, prepared fresh every day.',
      countryCode: 'BD',
      countryName: 'Bangladesh',
      currencyCode: 'BDT',
      currencySymbol: '৳',
      currencyPosition: 'before',
      currencyDecimals: 2,
      locale: 'en-BD',
      timezone: 'Asia/Dhaka',
      phoneCountryCode: '+880',
      taxPercent: new Prisma.Decimal(5),
      taxLabel: 'VAT',
      serviceChargePercent: new Prisma.Decimal(0),
      addressLine1: 'House 12, Road 5, Dhanmondi',
      city: 'Dhaka',
      state: 'Dhaka Division',
      postalCode: '1205',
      phone: '+880 1700-000000',
      email: 'hello@thehungrybowl.com',
      cuisines: ['Bangladeshi', 'Indian', 'Continental', 'Chinese'],
      priceRange: '৳৳',
      openingHours: [
        { day: 0, open: '11:00', close: '23:00', closed: false },
        { day: 1, open: '11:00', close: '23:00', closed: false },
        { day: 2, open: '11:00', close: '23:00', closed: false },
        { day: 3, open: '11:00', close: '23:00', closed: false },
        { day: 4, open: '11:00', close: '23:30', closed: false },
        { day: 5, open: '11:00', close: '23:30', closed: false },
        { day: 6, open: '11:00', close: '23:00', closed: false },
      ],
      orderNumberPrefix: '',
    },
    update: {},
  });

  await prisma.seoGlobal.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      siteName: 'The Hungry Bowl',
      titleTemplate: '%s | The Hungry Bowl',
      defaultTitle: 'The Hungry Bowl — Family Restaurant in Dhaka, Bangladesh',
      defaultDescription:
        'The Hungry Bowl is a family restaurant in Dhaka serving Bangladeshi, Indian and continental food. Browse the menu, see today’s specials and reserve a table.',
    },
    update: {},
  });
}

/**
 * Payment methods are seeded per country. bKash / Nagad / Rocket carry
 * countryCode "BD" so a client abroad can hide them in one click instead of
 * needing a code change.
 */
async function seedPaymentMethods() {
  console.log('→ payment methods');
  const methods = [
    { key: 'CASH', name: 'Cash', kind: 'CASH', requiresReference: false, countryCode: null, sortOrder: 1 },
    { key: 'CARD', name: 'Card', kind: 'CARD', requiresReference: true, countryCode: null, sortOrder: 2 },
    { key: 'BKASH', name: 'bKash', kind: 'MOBILE', requiresReference: true, countryCode: 'BD', sortOrder: 3 },
    { key: 'NAGAD', name: 'Nagad', kind: 'MOBILE', requiresReference: true, countryCode: 'BD', sortOrder: 4 },
    { key: 'ROCKET', name: 'Rocket', kind: 'MOBILE', requiresReference: true, countryCode: 'BD', sortOrder: 5 },
    { key: 'UPAY', name: 'Upay', kind: 'MOBILE', requiresReference: true, countryCode: 'BD', sortOrder: 6 },
    { key: 'BANK', name: 'Bank Transfer', kind: 'BANK', requiresReference: true, countryCode: null, sortOrder: 7 },
    { key: 'OTHER', name: 'Other', kind: 'OTHER', requiresReference: false, countryCode: null, sortOrder: 9 },
  ];
  for (const m of methods) {
    await prisma.paymentMethod.upsert({
      where: { key: m.key },
      create: m,
      update: { name: m.name, kind: m.kind, requiresReference: m.requiresReference, sortOrder: m.sortOrder },
    });
  }
}

async function seedUnits() {
  console.log('→ units');
  const units = [
    { code: 'g', name: 'Gram', kind: 'WEIGHT', toBase: 1 },
    { code: 'kg', name: 'Kilogram', kind: 'WEIGHT', toBase: 1000 },
    { code: 'ml', name: 'Millilitre', kind: 'VOLUME', toBase: 1 },
    { code: 'l', name: 'Litre', kind: 'VOLUME', toBase: 1000 },
    { code: 'pc', name: 'Piece', kind: 'COUNT', toBase: 1 },
    { code: 'dozen', name: 'Dozen', kind: 'COUNT', toBase: 12 },
    { code: 'box', name: 'Box', kind: 'COUNT', toBase: 1 },
    { code: 'pack', name: 'Pack', kind: 'COUNT', toBase: 1 },
    { code: 'bottle', name: 'Bottle', kind: 'COUNT', toBase: 1 },
    { code: 'portion', name: 'Portion', kind: 'COUNT', toBase: 1 },
  ];
  for (const u of units) {
    await prisma.unit.upsert({
      where: { code: u.code },
      create: { ...u, toBase: new Prisma.Decimal(u.toBase) },
      update: { name: u.name, kind: u.kind, toBase: new Prisma.Decimal(u.toBase) },
    });
  }
}

async function seedWarehouses() {
  console.log('→ warehouses');
  const existing = await prisma.warehouse.count();
  if (existing > 0) return;
  await prisma.warehouse.createMany({
    data: [
      { name: 'Main Warehouse', kind: 'WAREHOUSE', isDefaultReceiving: true, isDefaultConsumption: false },
      { name: 'Kitchen Store', kind: 'KITCHEN', isDefaultReceiving: false, isDefaultConsumption: true },
    ],
  });
}

async function seedExpenseCategories() {
  console.log('→ expense categories');
  const categories = [
    { name: 'Food Purchase', kind: 'FOOD', sortOrder: 1 },
    { name: 'Supplier Payment', kind: 'FOOD', sortOrder: 2 },
    { name: 'Salary', kind: 'SALARY', sortOrder: 3 },
    { name: 'Electricity', kind: 'UTILITY', sortOrder: 4 },
    { name: 'Gas', kind: 'UTILITY', sortOrder: 5 },
    { name: 'Water', kind: 'UTILITY', sortOrder: 6 },
    { name: 'Rent', kind: 'RENT', sortOrder: 7 },
    { name: 'Maintenance', kind: 'MAINTENANCE', sortOrder: 8 },
    { name: 'Marketing', kind: 'MARKETING', sortOrder: 9 },
    { name: 'Other', kind: 'OTHER', sortOrder: 10 },
  ];
  for (const c of categories) {
    await prisma.expenseCategory.upsert({ where: { name: c.name }, create: c, update: {} });
  }
}

async function seedTables() {
  console.log('→ table areas and tables');
  if ((await prisma.restaurantTable.count()) > 0) return;

  const ground = await prisma.tableArea.create({
    data: { name: 'Ground Floor', floor: 'Ground', sortOrder: 1 },
  });
  const first = await prisma.tableArea.create({
    data: { name: 'First Floor', floor: '1st', sortOrder: 2 },
  });

  const tables: Prisma.RestaurantTableCreateManyInput[] = [];
  for (let i = 1; i <= 8; i += 1) {
    tables.push({
      name: `T${String(i).padStart(2, '0')}`,
      areaId: ground.id,
      capacity: i <= 4 ? 4 : 6,
      posX: ((i - 1) % 4) * 140,
      posY: Math.floor((i - 1) / 4) * 140,
    });
  }
  for (let i = 9; i <= 14; i += 1) {
    tables.push({
      name: `T${String(i).padStart(2, '0')}`,
      areaId: first.id,
      capacity: i >= 13 ? 8 : 4,
      shape: i >= 13 ? 'rect' : 'square',
      posX: ((i - 9) % 3) * 140,
      posY: Math.floor((i - 9) / 3) * 140,
    });
  }
  await prisma.restaurantTable.createMany({ data: tables });
}

async function seedMenu() {
  console.log('→ menu');
  if ((await prisma.menuCategory.count()) > 0) return;

  const categories = [
    { name: 'Starters', slug: 'starters', sortOrder: 1, description: 'Light bites to open the meal.' },
    { name: 'Biryani & Rice', slug: 'biryani-rice', sortOrder: 2, description: 'Slow-cooked rice classics.' },
    { name: 'Curry', slug: 'curry', sortOrder: 3, description: 'Home-style Bangladeshi curries.' },
    { name: 'Grill & Kebab', slug: 'grill-kebab', sortOrder: 4, description: 'Charcoal grilled, freshly skewered.' },
    { name: 'Pizza', slug: 'pizza', sortOrder: 5, description: 'Hand-stretched, stone baked.' },
    { name: 'Burgers', slug: 'burgers', sortOrder: 6, description: 'Stacked and served with fries.' },
    { name: 'Desserts', slug: 'desserts', sortOrder: 7, description: 'Sweet endings.' },
    { name: 'Beverages', slug: 'beverages', sortOrder: 8, description: 'Hot and cold drinks.' },
  ];

  const created: Record<string, string> = {};
  for (const c of categories) {
    const row = await prisma.menuCategory.create({ data: { ...c, isFeatured: c.sortOrder <= 4 } });
    created[c.slug] = row.id;
  }

  const saladGroup = await prisma.addOnGroup.create({
    data: {
      name: 'Choose Salad',
      description: 'Pick one salad to go with your dish.',
      selectionType: 'SINGLE',
      isRequired: false,
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 1,
      addOns: {
        create: [
          { name: 'Regular Salad', price: new Prisma.Decimal(0), isDefault: true, sortOrder: 1 },
          { name: 'Special Salad', price: new Prisma.Decimal(60), sortOrder: 2 },
          { name: 'Caesar Salad', price: new Prisma.Decimal(90), sortOrder: 3 },
        ],
      },
    },
  });

  const extrasGroup = await prisma.addOnGroup.create({
    data: {
      name: 'Extras',
      description: 'Add anything you like.',
      selectionType: 'MULTIPLE',
      sortOrder: 2,
      addOns: {
        create: [
          { name: 'Extra Cheese', price: new Prisma.Decimal(70), sortOrder: 1 },
          { name: 'Extra Chicken', price: new Prisma.Decimal(120), sortOrder: 2 },
          { name: 'Extra Sauce', price: new Prisma.Decimal(30), sortOrder: 3 },
          { name: 'Extra Naan', price: new Prisma.Decimal(40), sortOrder: 4 },
        ],
      },
    },
  });

  interface SeedItem {
    name: string;
    slug: string;
    category: string;
    shortDescription: string;
    description: string;
    priceDisplayMode: 'FIXED' | 'RANGE' | 'HIDDEN';
    basePrice?: number;
    variants: { name: string; code?: string; price: number; isDefault?: boolean; portionLabel?: string }[];
    addOnGroups?: string[];
    isFeatured?: boolean;
    isTodaysSpecial?: boolean;
    isVegetarian?: boolean;
    spiceLevel?: number;
    prepMinutes?: number;
  }

  const items: SeedItem[] = [
    {
      name: 'Chicken Dominator',
      slug: 'chicken-dominator',
      category: 'pizza',
      shortDescription: 'Loaded chicken pizza with four toppings.',
      description:
        'Our signature pizza: hand-stretched dough, smoked chicken, grilled chicken chunks, chicken sausage and mozzarella, finished with a house tomato base.',
      priceDisplayMode: 'RANGE',
      variants: [
        { name: 'Regular', code: 'R', price: 690, isDefault: true, portionLabel: '8 inch' },
        { name: 'Medium', code: 'M', price: 990, portionLabel: '10 inch' },
        { name: 'Large', code: 'L', price: 1390, portionLabel: '12 inch' },
      ],
      addOnGroups: ['salad', 'extras'],
      isFeatured: true,
      prepMinutes: 20,
    },
    {
      name: 'Kacchi Biryani',
      slug: 'kacchi-biryani',
      category: 'biryani-rice',
      shortDescription: 'Slow-cooked mutton kacchi with aromatic rice.',
      description:
        'Mutton marinated overnight in yoghurt and spices, layered with basmati rice and potato, sealed and dum-cooked. Served with borhani and salad.',
      priceDisplayMode: 'RANGE',
      variants: [
        { name: 'Half', price: 420, portionLabel: '1 person' },
        { name: 'Full', price: 780, isDefault: true, portionLabel: '2 persons' },
        { name: 'Family Pack', price: 2900, portionLabel: '6-8 persons' },
      ],
      addOnGroups: ['salad', 'extras'],
      isFeatured: true,
      isTodaysSpecial: true,
      spiceLevel: 2,
      prepMinutes: 25,
    },
    {
      name: 'Beef Tehari',
      slug: 'beef-tehari',
      category: 'biryani-rice',
      shortDescription: 'Old Dhaka style beef tehari.',
      description: 'Fragrant short-grain rice cooked with cubed beef, mustard oil and green chilli.',
      priceDisplayMode: 'FIXED',
      basePrice: 320,
      variants: [{ name: 'Regular', price: 320, isDefault: true }],
      addOnGroups: ['salad'],
      spiceLevel: 3,
      prepMinutes: 15,
    },
    {
      name: 'Chicken Tikka Masala',
      slug: 'chicken-tikka-masala',
      category: 'curry',
      shortDescription: 'Grilled chicken in a creamy tomato gravy.',
      description: 'Charcoal-grilled chicken tikka simmered in a rich tomato, cream and cashew gravy.',
      priceDisplayMode: 'RANGE',
      variants: [
        { name: 'Half', price: 340, isDefault: true },
        { name: 'Full', price: 620 },
      ],
      addOnGroups: ['extras'],
      spiceLevel: 2,
      prepMinutes: 18,
    },
    {
      name: 'Mutton Rezala',
      slug: 'mutton-rezala',
      category: 'curry',
      shortDescription: 'White mutton curry, Dhaka style.',
      description: 'Tender mutton in a pale yoghurt-and-cashew gravy with whole spices and kewra water.',
      priceDisplayMode: 'FIXED',
      basePrice: 560,
      variants: [{ name: 'Regular', price: 560, isDefault: true }],
      spiceLevel: 2,
      prepMinutes: 22,
    },
    {
      name: 'Chicken Shashlik',
      slug: 'chicken-shashlik',
      category: 'grill-kebab',
      shortDescription: 'Skewered chicken with peppers and onion.',
      description: 'Marinated chicken cubes grilled with capsicum, onion and tomato, served with fried rice.',
      priceDisplayMode: 'FIXED',
      basePrice: 480,
      variants: [{ name: 'Regular', price: 480, isDefault: true }],
      addOnGroups: ['salad', 'extras'],
      prepMinutes: 20,
    },
    {
      name: 'Beef Seekh Kebab',
      slug: 'beef-seekh-kebab',
      category: 'grill-kebab',
      shortDescription: 'Minced beef kebab, charcoal grilled.',
      description: 'Hand-minced beef with green chilli and herbs, moulded on skewers and charcoal grilled.',
      priceDisplayMode: 'RANGE',
      variants: [
        { name: '2 pcs', price: 260, isDefault: true },
        { name: '4 pcs', price: 480 },
      ],
      spiceLevel: 3,
      prepMinutes: 15,
    },
    {
      name: 'Chicken Cheese Burger',
      slug: 'chicken-cheese-burger',
      category: 'burgers',
      shortDescription: 'Crispy chicken, cheddar and house sauce.',
      description: 'Buttermilk-fried chicken thigh, cheddar, lettuce and house sauce in a toasted brioche bun.',
      priceDisplayMode: 'FIXED',
      basePrice: 380,
      variants: [{ name: 'Single', price: 380, isDefault: true }, { name: 'Double', price: 560 }],
      addOnGroups: ['extras'],
      prepMinutes: 12,
    },
    {
      name: 'Chicken Wings',
      slug: 'chicken-wings',
      category: 'starters',
      shortDescription: 'Six wings, your choice of glaze.',
      description: 'Fried chicken wings tossed in barbecue, hot honey or naga glaze.',
      priceDisplayMode: 'RANGE',
      variants: [
        { name: '6 pcs', price: 320, isDefault: true },
        { name: '12 pcs', price: 590 },
      ],
      spiceLevel: 2,
      prepMinutes: 14,
    },
    {
      name: 'Chef’s Tasting Platter',
      slug: 'chefs-tasting-platter',
      category: 'starters',
      shortDescription: 'Seasonal selection — price on request.',
      description:
        'A rotating platter built from whatever is best in the market that morning. Ask your server for today’s composition and price.',
      priceDisplayMode: 'HIDDEN',
      variants: [{ name: 'Standard', price: 0, isDefault: true }],
      prepMinutes: 25,
    },
    {
      name: 'Firni',
      slug: 'firni',
      category: 'desserts',
      shortDescription: 'Chilled rice pudding with pistachio.',
      description: 'Slow-cooked ground rice and milk, set in a clay pot and topped with pistachio.',
      priceDisplayMode: 'FIXED',
      basePrice: 140,
      variants: [{ name: 'Regular', price: 140, isDefault: true }],
      isVegetarian: true,
      prepMinutes: 5,
    },
    {
      name: 'Borhani',
      slug: 'borhani',
      category: 'beverages',
      shortDescription: 'Spiced yoghurt drink.',
      description: 'Traditional savoury yoghurt drink with mint, mustard and black salt.',
      priceDisplayMode: 'FIXED',
      basePrice: 90,
      variants: [{ name: 'Glass', price: 90, isDefault: true }, { name: 'Jug', price: 320 }],
      isVegetarian: true,
      prepMinutes: 3,
    },
  ];

  for (const item of items) {
    const groupIds: string[] = [];
    if (item.addOnGroups?.includes('salad')) groupIds.push(saladGroup.id);
    if (item.addOnGroups?.includes('extras')) groupIds.push(extrasGroup.id);

    await prisma.menuItem.create({
      data: {
        name: item.name,
        slug: item.slug,
        categoryId: created[item.category]!,
        shortDescription: item.shortDescription,
        description: item.description,
        priceDisplayMode: item.priceDisplayMode,
        basePrice: item.basePrice ? new Prisma.Decimal(item.basePrice) : null,
        isFeatured: item.isFeatured ?? false,
        isTodaysSpecial: item.isTodaysSpecial ?? false,
        isVegetarian: item.isVegetarian ?? false,
        spiceLevel: item.spiceLevel ?? 0,
        prepMinutes: item.prepMinutes ?? null,
        metaTitle: `${item.name} — The Hungry Bowl`,
        metaDescription: item.shortDescription,
        variants: {
          create: item.variants.map((v, index) => ({
            name: v.name,
            code: v.code ?? null,
            price: new Prisma.Decimal(v.price),
            isDefault: v.isDefault ?? index === 0,
            sortOrder: index,
            portionLabel: v.portionLabel ?? null,
          })),
        },
        addOnGroups: groupIds.length
          ? { create: groupIds.map((groupId, i) => ({ groupId, sortOrder: i })) }
          : undefined,
      },
    });
  }
}

async function seedContent() {
  console.log('→ website content');

  const blocks = [
    {
      key: 'home.hero',
      section: 'home',
      label: 'Home hero',
      sortOrder: 1,
      data: {
        eyebrow: 'Dhaka · Since 2019',
        heading: 'Food that feels like coming home',
        subheading:
          'Bangladeshi classics, charcoal grills and stone-baked pizza — cooked fresh, served warm, seven days a week.',
        primaryCtaLabel: 'Reserve a table',
        primaryCtaHref: '/reservation',
        secondaryCtaLabel: 'See the menu',
        secondaryCtaHref: '/menu',
        imageUrl: '',
      },
    },
    {
      key: 'home.highlights',
      section: 'home',
      label: 'Restaurant highlights',
      sortOrder: 2,
      data: {
        heading: 'Why guests come back',
        items: [
          { title: 'Cooked to order', body: 'Nothing sits under a lamp. Every plate starts when you order it.' },
          { title: 'Halal kitchen', body: 'Sourced from trusted local suppliers and prepared to halal standards.' },
          { title: 'Family seating', body: 'Fourteen tables across two floors, including large family tables.' },
          { title: 'Quick service', body: 'Most dishes reach your table inside twenty minutes.' },
        ],
      },
    },
    {
      key: 'home.about',
      section: 'home',
      label: 'About strip',
      sortOrder: 3,
      data: {
        heading: 'A neighbourhood kitchen in Dhanmondi',
        body:
          'The Hungry Bowl started as a six-table kitchen with one clay oven. We still cook the same way — small batches, fresh spices ground each morning, and a menu that changes with the market.',
        ctaLabel: 'Our story',
        ctaHref: '/about',
        imageUrl: '',
      },
    },
    {
      key: 'home.cta',
      section: 'home',
      label: 'Closing call to action',
      sortOrder: 4,
      data: {
        heading: 'Planning a family dinner?',
        body: 'Reserve ahead and we will keep a table ready for you.',
        ctaLabel: 'Book a table',
        ctaHref: '/reservation',
      },
    },
  ];

  for (const block of blocks) {
    await prisma.contentBlock.upsert({
      where: { key: block.key },
      create: block,
      update: { section: block.section, label: block.label, sortOrder: block.sortOrder },
    });
  }

  const pages = [
    {
      slug: 'about',
      title: 'About The Hungry Bowl',
      kind: 'page',
      excerpt: 'A family restaurant in Dhanmondi, Dhaka, cooking Bangladeshi and continental food since 2019.',
      content:
        '<h2>Our kitchen</h2><p>The Hungry Bowl opened in 2019 with six tables and one clay oven. We cook in small batches, grind our spices fresh each morning, and buy from the same handful of suppliers we started with.</p><h2>What we serve</h2><p>Bangladeshi classics like kacchi biryani, tehari and rezala sit alongside charcoal grills, stone-baked pizza and burgers, so a whole family can eat together without compromise.</p><h2>Visiting us</h2><p>We are open every day from 11:00 to 23:00. Reservations are free and can be made from this website or by phone.</p>',
    },
    {
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      kind: 'policy',
      excerpt: 'How we handle the information you share with us.',
      content:
        '<p>We collect only the information needed to hold your reservation: your name, phone number, and optionally your email and a note about your visit.</p><h2>How we use it</h2><p>Reservation details are used to prepare your table and to contact you if anything changes. We do not sell or share this information with third parties for marketing.</p><h2>Payments</h2><p>This website does not take online payments. Bills are settled in the restaurant, and we never store full card numbers or security codes.</p><h2>Your choices</h2><p>Write to us at the address on the contact page to request a copy of what we hold about you, or to have it deleted.</p>',
    },
    {
      slug: 'terms',
      title: 'Terms of Use',
      kind: 'policy',
      excerpt: 'The terms that apply when you use this website.',
      content:
        '<p>Menu items, prices and opening hours shown on this website may change without notice. Where a price is not shown, please ask a member of staff.</p><h2>Reservations</h2><p>A reservation request is not confirmed until we contact you or the status on your confirmation shows as confirmed.</p><h2>Content</h2><p>Photographs, text and branding on this site belong to The Hungry Bowl and may not be reused without permission.</p>',
    },
    {
      slug: 'reservation-policy',
      title: 'Reservation Policy',
      kind: 'policy',
      excerpt: 'How table bookings work at The Hungry Bowl.',
      content:
        '<h2>Holding your table</h2><p>We hold a reserved table for 20 minutes past the booking time. After that it may be released to walk-in guests.</p><h2>Changes and cancellations</h2><p>Please call us at least two hours ahead if your plans change, so we can offer the table to someone else.</p><h2>Large groups</h2><p>For parties above eight, call us directly so we can arrange seating and confirm the menu in advance.</p><h2>No online payment</h2><p>Reservations are free. We do not ask for a card or a deposit online — your bill is settled at the restaurant.</p>',
    },
  ];

  for (const page of pages) {
    await prisma.page.upsert({
      where: { slug: page.slug },
      create: {
        ...page,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        metaTitle: page.title,
        metaDescription: page.excerpt,
      },
      update: {},
    });
  }

  if ((await prisma.offer.count()) === 0) {
    await prisma.offer.createMany({
      data: [
        {
          title: 'Family Feast Friday',
          slug: 'family-feast-friday',
          subtitle: '15% off every Friday for tables of four or more',
          description:
            'Bring the family on a Friday and take 15% off the food bill for any table of four or more guests. Dine-in only, no coupon needed.',
          type: 'PERCENTAGE',
          value: new Prisma.Decimal(15),
          isFeatured: true,
          sortOrder: 1,
          terms: 'Dine-in only. Not valid with other offers. Beverages excluded.',
        },
        {
          title: 'Lunch Combo',
          slug: 'lunch-combo',
          subtitle: 'Rice, curry, salad and a drink for a flat price',
          description: 'Available every weekday between 12:00 and 16:00. Choose any one curry with rice, salad and a soft drink.',
          type: 'SPECIAL_PRICE',
          value: new Prisma.Decimal(399),
          sortOrder: 2,
          terms: 'Weekdays 12:00–16:00. Dine-in and takeaway.',
        },
      ],
    });
  }

  if ((await prisma.event.count()) === 0) {
    const soon = new Date();
    soon.setDate(soon.getDate() + 14);
    await prisma.event.create({
      data: {
        title: 'Winter Grill Night',
        slug: 'winter-grill-night',
        description:
          'An evening built around the charcoal grill: live kebab counter, seasonal sides and firni to finish. Limited seating, reservation recommended.',
        startsAt: soon,
        venue: 'Rooftop, First Floor',
        isFeatured: true,
      },
    });
  }

  if ((await prisma.review.count()) === 0) {
    await prisma.review.createMany({
      data: [
        {
          authorName: 'Farhana R.',
          rating: 5,
          title: 'Best kacchi in Dhanmondi',
          body: 'We came for a family dinner and the kacchi was excellent — properly cooked mutton, not dry at all. Service was quick even though it was full.',
          status: 'APPROVED',
          isFeatured: true,
          source: 'website',
        },
        {
          authorName: 'Tanvir A.',
          rating: 5,
          title: 'Great grill, friendly staff',
          body: 'Ordered the seekh kebab and shashlik. Both arrived hot and the portions were generous. Staff helped us pick for the kids too.',
          status: 'APPROVED',
          isFeatured: true,
          source: 'website',
        },
        {
          authorName: 'Nusrat J.',
          rating: 4,
          title: 'Lovely food, book ahead',
          body: 'The food is genuinely good and the pizza surprised me. It gets busy after 8pm so reserve a table if you are more than four people.',
          status: 'APPROVED',
          source: 'website',
        },
      ],
    });
  }
}

async function seedSeoEntries() {
  console.log('→ SEO entries');
  const entries = [
    { path: '/', title: 'The Hungry Bowl — Family Restaurant in Dhaka', description: 'Bangladeshi, Indian and continental food in Dhanmondi, Dhaka. Browse the menu, see today’s specials and reserve a table online.', priority: 1.0, changeFreq: 'daily' },
    { path: '/menu', title: 'Menu', description: 'Browse the full menu at The Hungry Bowl — biryani, curry, grill, pizza, burgers, desserts and drinks.', priority: 0.9, changeFreq: 'daily' },
    { path: '/offers', title: 'Offers & Promotions', description: 'Current offers and promotions at The Hungry Bowl, Dhaka.', priority: 0.7, changeFreq: 'weekly' },
    { path: '/events', title: 'Events', description: 'Special evenings and programmes at The Hungry Bowl.', priority: 0.6, changeFreq: 'weekly' },
    { path: '/gallery', title: 'Gallery', description: 'Photographs of the restaurant, the kitchen and the food.', priority: 0.5, changeFreq: 'monthly' },
    { path: '/reviews', title: 'Customer Reviews', description: 'What guests say about The Hungry Bowl.', priority: 0.6, changeFreq: 'weekly' },
    { path: '/reservation', title: 'Reserve a Table', description: 'Book a table at The Hungry Bowl. Free reservation, no online payment required.', priority: 0.9, changeFreq: 'monthly' },
    { path: '/contact', title: 'Contact & Location', description: 'Address, phone number, opening hours and directions to The Hungry Bowl in Dhanmondi, Dhaka.', priority: 0.8, changeFreq: 'monthly' },
    { path: '/about', title: 'About Us', description: 'The story behind The Hungry Bowl.', priority: 0.6, changeFreq: 'monthly' },
  ];
  for (const e of entries) {
    await prisma.seoEntry.upsert({ where: { path: e.path }, create: e, update: {} });
  }
}

async function main() {
  console.log('Seeding The Hungry Bowl…');
  await seedPermissions();
  await seedRoles();
  await seedOwner();
  await seedSettings();
  await seedPaymentMethods();
  await seedUnits();
  await seedWarehouses();
  await seedExpenseCategories();
  await seedTables();
  await seedMenu();
  await seedContent();
  await seedSeoEntries();
  console.log('\nSeed complete.');
  console.log(`Login: ${OWNER_EMAIL}`);
  console.log(`Password: ${OWNER_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
