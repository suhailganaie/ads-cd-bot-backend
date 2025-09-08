import jwt from 'jsonwebtoken';

/**
 * Issue a JWT for a user record.
 * Payload holds uid (db id) and tid (telegram_id). 30d expiry.
 */
export function sign(user) {
  return jwt.sign(
    { uid: user.id, tid: user.telegram_id },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * Best-effort auth: if a valid Bearer token is present, attaches req.user.
 * Does not fail the request when missing/invalid; pair with requireAuth below for protected routes.
 */
export function auth(req, _res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET); // throws on invalid/expired
      req.user = { id: payload.uid, telegram_id: payload.tid };
    } catch {
      // ignore; route can still proceed unauthenticated
    }
  }
  next();
}

/**
 * Strict guard for protected routes.
 * Accepts either:
 *  - Bearer JWT (preferred), or
 *  - Authorization: tma <initDataRaw> previously verified by upstream middleware, or
 *  - x-telegram-id header as a last-resort internal fallback.
 *
 * If none resolved, responds 401.
 */
export function requireAuth(req, res, next) {
  // If optional auth already decoded a valid JWT:
  if (req.user && req.user.telegram_id) return next();

  const hdr = req.headers.authorization || '';

  // If using Telegram Mini App init data, place a real verifier upstream that
  // validates the signature and sets req.user accordingly per platform docs.
  // Here, we only accept it if verification already populated req.user.
  if (hdr.startsWith('tma ') && req.user && req.user.telegram_id) {
    return next();
  }

  // Developer/internal fallback: x-telegram-id (do not expose publicly)
  const xTid = req.header('x-telegram-id');
  if (xTid) {
    req.user = { telegram_id: String(xTid) };
    return next();
  }

  return res.status(401).json({ error: 'unauthorized' });
}
