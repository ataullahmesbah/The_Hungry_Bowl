import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { RATE_LIMITS } from '@/lib/security/rate-limit';
import { publicReservationSchema } from '@/lib/validation/service';
import { uniqueReservationCode } from '@/lib/service/sessions';
import { getSettings } from '@/lib/settings';
import { env } from '@/lib/env';
import { hashIdentifier } from '@/lib/security/hash';
import { notify } from '@/lib/notifications';
import { publishEvent } from '@/lib/realtime/publish';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { HttpError } from '@/lib/auth/guard';

/**
 * Anonymous reservation request. No payment, no card, no account — PRD §7.
 *
 * A request always lands as PENDING: the restaurant confirms it, which is what
 * stops a bot filling the floor plan with fake bookings.
 */
export const POST = route(
  {
    public: true,
    bodySchema: publicReservationSchema,
    rateLimit: { bucket: 'public-reservation', ...RATE_LIMITS.publicReservation },
  },
  async ({ body, ip }) => {
    const settings = await getSettings();

    if (!settings.reservationsEnabled) {
      throw new HttpError(403, 'Online reservations are closed at the moment. Please call us.', 'reservations_disabled');
    }

    if (body.company) {
      // Honeypot filled: accept silently so a bot learns nothing.
      return apiSuccess({ code: 'PENDING' }, { status: 201 });
    }

    const reservedAt = new Date(body.reservedAt);
    const leadMs = settings.reservationLeadHours * 60 * 60 * 1000;

    if (reservedAt.getTime() < Date.now() + leadMs) {
      throw new HttpError(
        422,
        `Please book at least ${settings.reservationLeadHours} hour(s) ahead, or call us for a table today.`,
        'too_soon',
        { reservedAt: `Choose a time at least ${settings.reservationLeadHours} hour(s) from now` },
      );
    }

    if (reservedAt.getTime() > Date.now() + 180 * 24 * 60 * 60 * 1000) {
      throw new HttpError(422, 'That date is too far ahead. Please call us instead.', 'too_far');
    }

    if (body.guestCount > settings.reservationMaxGuests) {
      throw new HttpError(
        422,
        `For parties over ${settings.reservationMaxGuests}, please call us so we can arrange seating.`,
        'party_too_large',
        { guestCount: `Maximum ${settings.reservationMaxGuests} guests online` },
      );
    }

    const code = await uniqueReservationCode();

    const reservation = await prisma.reservation.create({
      data: {
        code,
        name: body.name.trim(),
        phone: body.phone.trim(),
        email: body.email?.trim() || null,
        guestCount: body.guestCount,
        reservedAt,
        note: body.note?.trim() || null,
        status: 'PENDING',
        source: 'website',
        ipHash: ip ? hashIdentifier(ip, env.AUTH_SECRET) : null,
      },
      select: { id: true, code: true, reservedAt: true, guestCount: true, name: true },
    });

    await notify({
      type: 'reservation.created',
      title: `New reservation request — ${reservation.name}`,
      body: `${reservation.guestCount} guest(s) on ${reservation.reservedAt.toLocaleString('en-GB', { timeZone: settings.timezone })}. Code ${reservation.code}.`,
      level: 'INFO',
      href: '/dashboard/reservations',
      permissions: [PERMISSIONS.RESERVATION_MANAGE],
    });

    await publishEvent({
      channel: 'reservations',
      type: 'reservation.created',
      payload: { reservationId: reservation.id, code: reservation.code },
      requiredPermission: PERMISSIONS.RESERVATION_VIEW,
    });

    return apiSuccess({ code: reservation.code }, { status: 201 });
  },
);
