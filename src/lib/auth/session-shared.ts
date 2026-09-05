/**
 * Constants shared between the edge middleware and the Node runtime.
 * Kept separate so middleware never pulls in Prisma or `server-only`.
 */
export const SESSION_COOKIE = 'hb_session';
