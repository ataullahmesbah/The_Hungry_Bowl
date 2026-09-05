import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { settingsSchema } from '@/lib/validation/settings';
import { getSettings } from '@/lib/settings';
import { audit } from '@/lib/audit';
import { HttpError } from '@/lib/auth/guard';

export const GET = route({ permission: PERMISSIONS.SETTINGS_VIEW }, async () =>
  apiSuccess(await getSettings()),
);

/**
 * The one place the platform is localised.
 *
 * Changing the country block here — currency, symbol, decimals, locale,
 * timezone, tax — is the whole job of moving this restaurant platform to
 * another country. No code changes anywhere.
 */
export const PATCH = route(
  { permission: PERMISSIONS.SETTINGS_MANAGE, bodySchema: settingsSchema.partial() },
  async ({ body, session }) => {
    const before = await getSettings();

    // A bad timezone would silently corrupt every business-date calculation
    // (order numbering, the daily close), so it is validated before it lands.
    if (body.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: body.timezone }).format(new Date());
      } catch {
        throw new HttpError(422, `“${body.timezone}” is not a timezone this server recognises.`, 'invalid_timezone', {
          timezone: 'Use a name like Asia/Dhaka or Europe/London',
        });
      }
    }
    if (body.locale) {
      try {
        new Intl.NumberFormat(body.locale).format(1);
      } catch {
        throw new HttpError(422, `“${body.locale}” is not a locale this server recognises.`, 'invalid_locale', {
          locale: 'Use a tag like en-BD or en-GB',
        });
      }
    }

    const settings = await prisma.restaurantSettings.update({
      where: { id: 'singleton' },
      data: {
        ...body,
        ...(body.taxPercent !== undefined ? { taxPercent: new Prisma.Decimal(body.taxPercent) } : {}),
        ...(body.serviceChargePercent !== undefined
          ? { serviceChargePercent: new Prisma.Decimal(body.serviceChargePercent) }
          : {}),
        ...(body.latitude !== undefined
          ? { latitude: body.latitude != null ? new Prisma.Decimal(body.latitude) : null }
          : {}),
        ...(body.longitude !== undefined
          ? { longitude: body.longitude != null ? new Prisma.Decimal(body.longitude) : null }
          : {}),
        ...(body.openingHours !== undefined
          ? { openingHours: body.openingHours ? JSON.parse(JSON.stringify(body.openingHours)) : Prisma.DbNull }
          : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
        updatedBy: session!.user.id,
      },
    });

    await audit({
      session,
      action: 'settings.updated',
      entity: 'RestaurantSettings',
      entityId: 'singleton',
      severity: 'HIGH',
      before: {
        name: before.name,
        countryCode: before.countryCode,
        currencyCode: before.currencyCode,
        timezone: before.timezone,
        taxPercent: Number(before.taxPercent),
        maintenanceMode: before.maintenanceMode,
      },
      after: {
        name: settings.name,
        countryCode: settings.countryCode,
        currencyCode: settings.currencyCode,
        timezone: settings.timezone,
        taxPercent: Number(settings.taxPercent),
        maintenanceMode: settings.maintenanceMode,
      },
    });

    return apiSuccess(settings);
  },
);
