/**
 * The single source of truth for every permission in the system.
 *
 * Adding a permission here and redeploying seeds it into the database; nothing
 * else needs to change. Every protected route handler and every server action
 * must name one of these keys — a handler with no permission check is a bug.
 */
export const PERMISSION_MODULES = [
  'dashboard',
  'menu',
  'website',
  'media',
  'reservations',
  'tables',
  'orders',
  'kitchen',
  'payments',
  'customers',
  'inventory',
  'purchasing',
  'recipes',
  'finance',
  'reports',
  'seo',
  'users',
  'settings',
  'audit',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: 'dashboard.view',

  // Menu
  MENU_VIEW: 'menu.view',
  MENU_MANAGE: 'menu.manage',
  MENU_TOGGLE_AVAILABILITY: 'menu.toggle_availability',
  MENU_REPORT_STOCKOUT: 'menu.report_stockout',
  MENU_DELETE: 'menu.delete',

  // Public website / CMS
  WEBSITE_VIEW: 'website.view',
  WEBSITE_MANAGE: 'website.manage',
  WEBSITE_PUBLISH: 'website.publish',
  REVIEWS_MODERATE: 'website.reviews_moderate',

  // Media
  MEDIA_VIEW: 'media.view',
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_DELETE: 'media.delete',

  // Reservations
  RESERVATION_VIEW: 'reservations.view',
  RESERVATION_MANAGE: 'reservations.manage',

  // Tables
  TABLE_VIEW: 'tables.view',
  TABLE_MANAGE: 'tables.manage',
  TABLE_SESSION_MANAGE: 'tables.session_manage',

  // Orders
  ORDER_VIEW: 'orders.view',
  ORDER_CREATE: 'orders.create',
  ORDER_EDIT: 'orders.edit',
  ORDER_CANCEL: 'orders.cancel',
  ORDER_DISCOUNT: 'orders.discount',

  // Kitchen
  KITCHEN_VIEW: 'kitchen.view',
  KITCHEN_ACCEPT: 'kitchen.accept',
  KITCHEN_UPDATE_STATUS: 'kitchen.update_status',

  // Payments
  PAYMENT_VIEW: 'payments.view',
  PAYMENT_RECORD: 'payments.record',
  PAYMENT_REFUND: 'payments.refund',
  PAYMENT_VOID: 'payments.void',
  PAYMENT_METHOD_MANAGE: 'payments.method_manage',

  // Customers
  CUSTOMER_VIEW: 'customers.view',
  CUSTOMER_MANAGE: 'customers.manage',

  // Inventory
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_MANAGE: 'inventory.manage',
  INVENTORY_TRANSFER: 'inventory.transfer',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_WASTAGE: 'inventory.wastage',

  // Purchasing
  PURCHASE_VIEW: 'purchasing.view',
  PURCHASE_MANAGE: 'purchasing.manage',
  SUPPLIER_MANAGE: 'purchasing.supplier_manage',

  // Recipes
  RECIPE_VIEW: 'recipes.view',
  RECIPE_MANAGE: 'recipes.manage',

  // Finance
  FINANCE_VIEW: 'finance.view',
  FINANCE_MANAGE: 'finance.manage',
  FINANCE_CLOSE_DAY: 'finance.close_day',

  // Reports & analytics
  REPORT_SALES: 'reports.sales',
  REPORT_INVENTORY: 'reports.inventory',
  REPORT_FINANCE: 'reports.finance',
  REPORT_ANALYTICS: 'reports.analytics',

  // SEO
  SEO_VIEW: 'seo.view',
  SEO_MANAGE: 'seo.manage',

  // Users & roles
  USER_VIEW: 'users.view',
  USER_MANAGE: 'users.manage',
  ROLE_MANAGE: 'users.role_manage',

  // Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',

  // Audit
  AUDIT_VIEW: 'audit.view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as PermissionKey[];

const DESCRIPTIONS: Record<string, string> = {
  'dashboard.view': 'Open the dashboard overview',
  'menu.view': 'View menu items and categories',
  'menu.manage': 'Create and edit menu items, categories, variants and add-ons',
  'menu.toggle_availability': 'Turn a menu item ON/OFF for service',
  'menu.report_stockout': 'Report an item as run out to the manager',
  'menu.delete': 'Archive or delete menu records',
  'website.view': 'View public website content',
  'website.manage': 'Edit pages, offers, events, gallery and home sections',
  'website.publish': 'Publish or unpublish website content',
  'website.reviews_moderate': 'Approve, reject and reply to customer reviews',
  'media.view': 'Browse the media library',
  'media.upload': 'Upload images and videos',
  'media.delete': 'Delete media assets',
  'reservations.view': 'View table reservations',
  'reservations.manage': 'Confirm, reject, cancel and assign reservations',
  'tables.view': 'View the floor plan and table status',
  'tables.manage': 'Create and edit tables and areas',
  'tables.session_manage': 'Open and close table sessions (seat and clear guests)',
  'orders.view': 'View orders',
  'orders.create': 'Create internal orders',
  'orders.edit': 'Edit order lines before completion',
  'orders.cancel': 'Cancel an order or an order line',
  'orders.discount': 'Apply a discount to an order',
  'kitchen.view': 'Open the kitchen display',
  'kitchen.accept': 'Accept incoming kitchen tickets',
  'kitchen.update_status': 'Move a ticket through preparing/ready',
  'payments.view': 'View payment records',
  'payments.record': 'Record a payment against an order',
  'payments.refund': 'Refund a recorded payment',
  'payments.void': 'Void a recorded payment',
  'payments.method_manage': 'Add or disable payment methods',
  'customers.view': 'View customer records',
  'customers.manage': 'Create and edit customer records',
  'inventory.view': 'View stock levels and movements',
  'inventory.manage': 'Manage inventory items, units and warehouses',
  'inventory.transfer': 'Transfer stock between warehouse and kitchen',
  'inventory.adjust': 'Adjust stock quantities',
  'inventory.wastage': 'Record wastage and returns',
  'purchasing.view': 'View purchases',
  'purchasing.manage': 'Create purchases and receive stock',
  'purchasing.supplier_manage': 'Manage suppliers',
  'recipes.view': 'View recipes and BOM',
  'recipes.manage': 'Create and edit recipes',
  'finance.view': 'View income, expenses and reconciliation',
  'finance.manage': 'Record income and expenses',
  'finance.close_day': 'Run and save the daily closing',
  'reports.sales': 'View sales reports',
  'reports.inventory': 'View inventory reports',
  'reports.finance': 'View financial reports',
  'reports.analytics': 'View business analytics',
  'seo.view': 'View SEO settings',
  'seo.manage': 'Edit SEO metadata and structured data',
  'users.view': 'View staff accounts',
  'users.manage': 'Create, edit and suspend staff accounts',
  'users.role_manage': 'Create roles and change role permissions',
  'settings.view': 'View restaurant settings',
  'settings.manage': 'Change restaurant settings',
  'audit.view': 'View the audit log',
};

export function permissionModule(key: string): PermissionModule {
  const prefix = key.split('.')[0] as PermissionModule;
  return PERMISSION_MODULES.includes(prefix) ? prefix : 'dashboard';
}

export function permissionDescription(key: string): string {
  return DESCRIPTIONS[key] ?? key;
}
