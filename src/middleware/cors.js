import cors from 'cors';

export const corsMw = cors({
  origin: (origin, cb) => {
    const allow = (process.env.CORS_ORIGINS || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (!origin) return cb(null, true); // allow null origin (in‑app WebViews)
    if (allow.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'));
  },
  credentials: true
});
