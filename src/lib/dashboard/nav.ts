import { PERMISSIONS, type PermissionKey } from '@/lib/rbac/permissions';

const P = PERMISSIONS;

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  /** Any one of these grants access; undefined means everyone signed in. */
  permission?: PermissionKey | PermissionKey[];
  badgeKey?: 'newOrders' | 'pendingReservations' | 'lowStock' | 'pendingReviews';
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Dashboard information architecture, PRD §23. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', permission: P.DASHBOARD_VIEW }],
  },
  {
    title: 'Service',
    items: [
      { label: 'Orders', href: '/dashboard/orders', icon: 'ReceiptText', permission: P.ORDER_VIEW, badgeKey: 'newOrders' },
      { label: 'Tables', href: '/dashboard/tables', icon: 'Grid3x3', permission: P.TABLE_VIEW },
      { label: 'Manage tables', href: '/dashboard/tables/manage', icon: 'LayoutGrid', permission: P.TABLE_MANAGE },
      { label: 'Reservations', href: '/dashboard/reservations', icon: 'CalendarCheck', permission: P.RESERVATION_VIEW, badgeKey: 'pendingReservations' },
      { label: 'Kitchen (KDS)', href: '/dashboard/kitchen', icon: 'ChefHat', permission: P.KITCHEN_VIEW },
      { label: 'Payments', href: '/dashboard/payments', icon: 'CreditCard', permission: P.PAYMENT_VIEW },
      { label: 'Customers', href: '/dashboard/customers', icon: 'Users', permission: P.CUSTOMER_VIEW },
    ],
  },
  {
    title: 'Menu & Website',
    items: [
      { label: 'Menu items', href: '/dashboard/menu', icon: 'UtensilsCrossed', permission: P.MENU_VIEW },
      { label: 'Categories', href: '/dashboard/menu/categories', icon: 'FolderTree', permission: P.MENU_VIEW },
      { label: 'Add-on groups', href: '/dashboard/menu/addons', icon: 'CirclePlus', permission: P.MENU_MANAGE },
      { label: 'Offers', href: '/dashboard/offers', icon: 'BadgePercent', permission: P.WEBSITE_VIEW },
      { label: 'Events', href: '/dashboard/events', icon: 'CalendarDays', permission: P.WEBSITE_VIEW },
      { label: 'Pages', href: '/dashboard/pages', icon: 'FileText', permission: P.WEBSITE_VIEW },
      { label: 'Home sections', href: '/dashboard/website', icon: 'LayoutTemplate', permission: P.WEBSITE_MANAGE },
      { label: 'Gallery', href: '/dashboard/gallery', icon: 'GalleryHorizontal', permission: P.WEBSITE_VIEW },
      { label: 'Reviews', href: '/dashboard/reviews', icon: 'Star', permission: P.WEBSITE_VIEW, badgeKey: 'pendingReviews' },
      { label: 'Media library', href: '/dashboard/media', icon: 'Images', permission: P.MEDIA_VIEW },
    ],
  },
  {
    title: 'Stock & Purchasing',
    items: [
      { label: 'Inventory', href: '/dashboard/inventory', icon: 'Package', permission: P.INVENTORY_VIEW, badgeKey: 'lowStock' },
      { label: 'Warehouses', href: '/dashboard/inventory/warehouses', icon: 'Warehouse', permission: P.INVENTORY_VIEW },
      { label: 'Stock movements', href: '/dashboard/inventory/movements', icon: 'ArrowLeftRight', permission: P.INVENTORY_VIEW },
      { label: 'Stock ledger', href: '/dashboard/inventory/ledger', icon: 'BookOpenCheck', permission: P.INVENTORY_VIEW },
      { label: 'Purchases', href: '/dashboard/purchases', icon: 'ShoppingCart', permission: P.PURCHASE_VIEW },
      { label: 'Suppliers', href: '/dashboard/suppliers', icon: 'Truck', permission: P.PURCHASE_VIEW },
      { label: 'Recipes / BOM', href: '/dashboard/recipes', icon: 'BookOpen', permission: P.RECIPE_VIEW },
    ],
  },
  {
    title: 'Money',
    items: [
      { label: 'Finance', href: '/dashboard/finance', icon: 'Wallet', permission: P.FINANCE_VIEW },
      { label: 'Expenses', href: '/dashboard/finance/expenses', icon: 'Receipt', permission: P.FINANCE_VIEW },
      { label: 'Daily closing', href: '/dashboard/finance/closing', icon: 'ClipboardCheck', permission: P.FINANCE_VIEW },
      { label: 'Reports', href: '/dashboard/reports', icon: 'FileBarChart', permission: [P.REPORT_SALES, P.REPORT_FINANCE, P.REPORT_INVENTORY] },
      { label: 'Analytics', href: '/dashboard/analytics', icon: 'TrendingUp', permission: P.REPORT_ANALYTICS },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'SEO', href: '/dashboard/seo', icon: 'Search', permission: P.SEO_VIEW },
      { label: 'Users & roles', href: '/dashboard/users', icon: 'UserCog', permission: P.USER_VIEW },
      { label: 'Settings', href: '/dashboard/settings', icon: 'Settings', permission: P.SETTINGS_VIEW },
      { label: 'Audit log', href: '/dashboard/audit', icon: 'ScrollText', permission: P.AUDIT_VIEW },
    ],
  },
];

export function filterNav(groups: NavGroup[], permissions: Set<string>): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.permission) return true;
        const list = Array.isArray(item.permission) ? item.permission : [item.permission];
        return list.some((p) => permissions.has(p));
      }),
    }))
    .filter((group) => group.items.length > 0);
}
