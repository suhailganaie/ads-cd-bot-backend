import jwt from 'jsonwebtoken';

export function sign(user) {
  return jwt.sign({ uid: user.id, tid: user.telegram_id }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

export function auth(req, _res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.uid, telegram_id: payload.tid };
  } catch {}
  next();
}
