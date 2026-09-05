import { z } from 'zod';
import { prisma } from '@/lib/db';
import { apiSuccess, route } from '@/lib/api';
import { RATE_LIMITS } from '@/lib/security/rate-limit';
import { getSettings } from '@/lib/settings';
import { env } from '@/lib/env';
import { hashIdentifier } from '@/lib/security/hash';
import { notify } from '@/lib/notifications';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { HttpError } from '@/lib/auth/guard';

const bodySchema = z.object({
  authorName: z.string().min(2, 'Please tell us your name').max(80),
  authorEmail: z.string().email('Enter a valid email').max(200).optional().or(z.literal('')),
  rating: z.number().int().min(1, 'Choose a rating').max(5),
  title: z.string().max(120).optional().or(z.literal('')),
  body: z.string().min(10, 'Please write at least a sentence').max(2000),
  /** Honeypot: real people never fill this in. */
  website: z.string().max(0).optional(),
});

/**
 * Public review submission.
 *
 * Anonymous write endpoints are the softest target on a restaurant site, so
 * this one is rate limited by IP, carries a honeypot, stores only a hashed IP,
 * and (by default) lands in a moderation queue rather than straight on the page.
 */
export const POST = route(
  {
    public: true,
    bodySchema,
    rateLimit: { bucket: 'public-review', ...RATE_LIMITS.publicReview },
  },
  async ({ body, ip, req }) => {
    const settings = await getSettings();
    if (!settings.reviewsEnabled) {
      throw new HttpError(403, 'Reviews are currently closed.', 'reviews_disabled');
    }

    if (body.website) {
      // Silently accept so a bot cannot tell it was caught.
      return apiSuccess({ pending: true });
    }

    const requiresApproval = settings.reviewsRequireApproval;

    const review = await prisma.review.create({
      data: {
        authorName: body.authorName.trim(),
        authorEmail: body.authorEmail?.trim() || null,
        rating: body.rating,
        title: body.title?.trim() || null,
        body: body.body.trim(),
        status: requiresApproval ? 'PENDING' : 'APPROVED',
        source: 'website',
        ipHash: ip ? hashIdentifier(ip, env.AUTH_SECRET) : null,
      },
      select: { id: true, authorName: true, rating: true },
    });

    await notify({
      type: 'review.submitted',
      title: `New ${review.rating}-star review from ${review.authorName}`,
      body: requiresApproval ? 'Waiting for approval before it appears on the website.' : 'Published on the website.',
      level: review.rating <= 2 ? 'WARNING' : 'INFO',
      href: '/dashboard/reviews',
      permissions: [PERMISSIONS.REVIEWS_MODERATE],
    });

    void req;
    return apiSuccess({ pending: requiresApproval }, { status: 201 });
  },
);
