// src/middleware/admin.js
export function isAdmin(req) {
  const admins = (process.env.ADMIN_TIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const tid = req.user?.telegram_id;
  return !!tid && admins.includes(String(tid));
}

export function requireAdmin(req, res, next) {
  if (req.user && isAdmin(req)) return next();
  return res.status(403).json({ error: 'forbidden' });
}
