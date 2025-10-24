import express from "express";
import { z } from "zod";
import db from "../db.js";

const router = express.Router();

router.get("/", (req, res) => {
  const sql = `
    SELECT r.*, COALESCE(SUM(v.value),0) as votes
    FROM reports r
    LEFT JOIN votes v ON v.report_id=r.id
    WHERE r.status='active'
    GROUP BY r.id
    ORDER BY r.created_at DESC
    LIMIT 1000
  `;
  res.json(db.prepare(sql).all());
});

router.post("/", (req, res) => {
  const schema = z.object({
    lat: z.number(),
    lng: z.number(),
    category: z.enum(["suspicious", "crowd", "aggressive", "drunk", "other"]),
    message: z.string().max(280).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { lat, lng, category, message } = parsed.data;
  const info = db
    .prepare("INSERT INTO reports (lat,lng,category,message) VALUES (?,?,?,?)")
    .run(lat, lng, category, message || null);
  res.json({ id: info.lastInsertRowid });
});

export default router;
