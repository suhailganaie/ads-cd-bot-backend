import { Router } from 'express';
import { asyncHandler } from '../middleware/async.js';
import { auth } from '../middleware/auth.js';
import { query } from '../db.js';
import { POINTS } from '../services/points.js';

export const ads = Router();

ads.post('/ads/main', auth, asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const pts = POINTS.AD_MAIN;
  await query("insert into events(user_id, type, points, meta) values($1,'earn2',$2,$3)", [req.user.id, pts, {}]);
  await query('update users set points = points + $1 where id = $2', [pts, req.user.id]);
  res.json({ ok: true, points_added: pts });
}));

ads.post('/ads/side', auth, asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const pts = POINTS.AD_SIDE;
  await query("insert into events(user_id, type, points, meta) values($1,'earn1',$2,$3)", [req.user.id, pts, {}]);
  await query('update users set points = points + $1 where id = $2', [pts, req.user.id]);
  res.json({ ok: true, points_added: pts });
}));
