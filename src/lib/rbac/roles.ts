import { ALL_PERMISSIONS, PERMISSIONS, type PermissionKey } from './permissions';

const P = PERMISSIONS;

export interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  /** Lower rank = more powerful. A user can never grant a role ranked above their own. */
  rank: number;
  permissions: PermissionKey[] | 'ALL';
}

/**
 * Roles from PRD §3. These are seeded as system roles; an owner can still
 * create extra custom roles from the dashboard without touching code.
 */
export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'SUPER_ADMIN',
    name: 'Super Admin',
    description: 'Full system access including roles, settings and audit controls.',
    rank: 0,
    permissions: 'ALL',
  },
  {
    key: 'RESTAURANT_OWNER',
    name: 'Restaurant Owner',
    description: 'Business-wide access to sales, finance, inventory, menu, reports and staff.',
    rank: 10,
    permissions: [
      P.DASHBOARD_VIEW,
      P.MENU_VIEW, P.MENU_MANAGE, P.MENU_TOGGLE_AVAILABILITY, P.MENU_DELETE,
      P.WEBSITE_VIEW, P.WEBSITE_MANAGE, P.WEBSITE_PUBLISH, P.REVIEWS_MODERATE,
      P.MEDIA_VIEW, P.MEDIA_UPLOAD, P.MEDIA_DELETE,
      P.RESERVATION_VIEW, P.RESERVATION_MANAGE,
      P.TABLE_VIEW, P.TABLE_MANAGE, P.TABLE_SESSION_MANAGE,
      P.ORDER_VIEW, P.ORDER_CREATE, P.ORDER_EDIT, P.ORDER_CANCEL, P.ORDER_DISCOUNT,
      P.KITCHEN_VIEW,
      P.PAYMENT_VIEW, P.PAYMENT_RECORD, P.PAYMENT_REFUND, P.PAYMENT_VOID, P.PAYMENT_METHOD_MANAGE,
      P.CUSTOMER_VIEW, P.CUSTOMER_MANAGE,
      P.INVENTORY_VIEW, P.INVENTORY_MANAGE, P.INVENTORY_TRANSFER, P.INVENTORY_ADJUST, P.INVENTORY_WASTAGE,
      P.PURCHASE_VIEW, P.PURCHASE_MANAGE, P.SUPPLIER_MANAGE,
      P.RECIPE_VIEW, P.RECIPE_MANAGE,
      P.FINANCE_VIEW, P.FINANCE_MANAGE, P.FINANCE_CLOSE_DAY,
      P.REPORT_SALES, P.REPORT_INVENTORY, P.REPORT_FINANCE, P.REPORT_ANALYTICS,
      P.SEO_VIEW, P.SEO_MANAGE,
      P.USER_VIEW, P.USER_MANAGE,
      P.SETTINGS_VIEW, P.SETTINGS_MANAGE,
      P.AUDIT_VIEW,
    ],
  },
  {
    key: 'GENERAL_MANAGER',
    name: 'General Manager / Admin',
    description: 'Daily operations: tables, reservations, orders, kitchen, menu, inventory and operational reports.',
    rank: 20,
    permissions: [
      P.DASHBOARD_VIEW,
      P.MENU_VIEW, P.MENU_MANAGE, P.MENU_TOGGLE_AVAILABILITY,
      P.WEBSITE_VIEW, P.WEBSITE_MANAGE, P.REVIEWS_MODERATE,
      P.MEDIA_VIEW, P.MEDIA_UPLOAD,
      P.RESERVATION_VIEW, P.RESERVATION_MANAGE,
      P.TABLE_VIEW, P.TABLE_MANAGE, P.TABLE_SESSION_MANAGE,
      P.ORDER_VIEW, P.ORDER_CREATE, P.ORDER_EDIT, P.ORDER_CANCEL, P.ORDER_DISCOUNT,
      P.KITCHEN_VIEW, P.KITCHEN_ACCEPT, P.KITCHEN_UPDATE_STATUS,
      P.PAYMENT_VIEW, P.PAYMENT_RECORD,
      P.CUSTOMER_VIEW, P.CUSTOMER_MANAGE,
      P.INVENTORY_VIEW, P.INVENTORY_TRANSFER, P.INVENTORY_WASTAGE,
      P.PURCHASE_VIEW,
      P.RECIPE_VIEW,
      P.REPORT_SALES, P.REPORT_INVENTORY, P.REPORT_ANALYTICS,
      P.USER_VIEW,
      P.SETTINGS_VIEW,
    ],
  },
  {
    key: 'RECEPTION',
    name: 'Reception / Front Desk',
    description: 'Reservations, customer records, table status, internal orders and billing.',
    rank: 40,
    permissions: [
      P.DASHBOARD_VIEW,
      P.MENU_VIEW,
      P.RESERVATION_VIEW, P.RESERVATION_MANAGE,
      P.TABLE_VIEW, P.TABLE_SESSION_MANAGE,
      P.ORDER_VIEW, P.ORDER_CREATE, P.ORDER_EDIT,
      P.PAYMENT_VIEW, P.PAYMENT_RECORD,
      P.CUSTOMER_VIEW, P.CUSTOMER_MANAGE,
    ],
  },
  {
    key: 'SERVICE_MANAGER',
    name: 'Table / Service Manager',
    description: 'Table assignment, order entry, notes, sending orders to kitchen and serving workflow.',
    rank: 45,
    permissions: [
      P.DASHBOARD_VIEW,
      P.MENU_VIEW, P.MENU_REPORT_STOCKOUT,
      P.TABLE_VIEW, P.TABLE_SESSION_MANAGE,
      P.ORDER_VIEW, P.ORDER_CREATE, P.ORDER_EDIT,
      P.KITCHEN_VIEW,
      P.CUSTOMER_VIEW, P.CUSTOMER_MANAGE,
      P.RESERVATION_VIEW,
    ],
  },
  {
    key: 'KITCHEN_MANAGER',
    name: 'Kitchen Manager',
    description: 'Kitchen orders, KDS, preparation status, kitchen stock, consumption, returns and wastage.',
    rank: 45,
    permissions: [
      P.DASHBOARD_VIEW,
      P.MENU_VIEW, P.MENU_REPORT_STOCKOUT, P.MENU_TOGGLE_AVAILABILITY,
      P.ORDER_VIEW,
      P.KITCHEN_VIEW, P.KITCHEN_ACCEPT, P.KITCHEN_UPDATE_STATUS,
      P.INVENTORY_VIEW, P.INVENTORY_TRANSFER, P.INVENTORY_WASTAGE,
      P.RECIPE_VIEW, P.RECIPE_MANAGE,
      P.REPORT_INVENTORY,
    ],
  },
  {
    key: 'KITCHEN_STAFF',
    name: 'Kitchen Staff',
    description: 'View assigned kitchen tickets and update preparation/ready status only.',
    rank: 70,
    permissions: [
      P.KITCHEN_VIEW, P.KITCHEN_UPDATE_STATUS,
      P.MENU_REPORT_STOCKOUT,
    ],
  },
  {
    key: 'INVENTORY_MANAGER',
    name: 'Store / Inventory Manager',
    description: 'Warehouse, stock receive, purchase, suppliers, transfers, adjustments and inventory reports.',
    rank: 45,
    permissions: [
      P.DASHBOARD_VIEW,
      P.INVENTORY_VIEW, P.INVENTORY_MANAGE, P.INVENTORY_TRANSFER, P.INVENTORY_ADJUST, P.INVENTORY_WASTAGE,
      P.PURCHASE_VIEW, P.PURCHASE_MANAGE, P.SUPPLIER_MANAGE,
      P.RECIPE_VIEW,
      P.REPORT_INVENTORY,
      P.MENU_VIEW,
    ],
  },
  {
    key: 'FINANCE_MANAGER',
    name: 'Finance Manager',
    description: 'Sales, payment reconciliation, expenses, purchase costs and financial reports.',
    rank: 30,
    permissions: [
      P.DASHBOARD_VIEW,
      P.ORDER_VIEW,
      P.PAYMENT_VIEW, P.PAYMENT_RECORD, P.PAYMENT_REFUND, P.PAYMENT_VOID,
      P.FINANCE_VIEW, P.FINANCE_MANAGE, P.FINANCE_CLOSE_DAY,
      P.PURCHASE_VIEW,
      P.REPORT_SALES, P.REPORT_FINANCE, P.REPORT_INVENTORY, P.REPORT_ANALYTICS,
      P.CUSTOMER_VIEW,
      P.AUDIT_VIEW,
    ],
  },
  {
    key: 'MARKETING_MANAGER',
    name: 'Content / Marketing Manager',
    description: 'Menu content, offers, promotions, events, gallery, reviews, SEO and website content.',
    rank: 50,
    permissions: [
      P.DASHBOARD_VIEW,
      P.MENU_VIEW, P.MENU_MANAGE,
      P.WEBSITE_VIEW, P.WEBSITE_MANAGE, P.WEBSITE_PUBLISH, P.REVIEWS_MODERATE,
      P.MEDIA_VIEW, P.MEDIA_UPLOAD, P.MEDIA_DELETE,
      P.SEO_VIEW, P.SEO_MANAGE,
      P.REPORT_ANALYTICS,
    ],
  },
];

export function resolveRolePermissions(def: RoleDefinition): PermissionKey[] {
  return def.permissions === 'ALL' ? ALL_PERMISSIONS : def.permissions;
}

export const SUPER_ADMIN_ROLE_KEY = 'SUPER_ADMIN';
