import express from "express";
import { z } from "zod";
import db from "../db.js";

const router = express.Router();

const bboxSchema = z
  .string()
  .transform(s => {
    const parts = s.split(",").map(Number);
    if (parts.length !== 4 || parts.some(isNaN))
      throw new Error("bbox must be left,bottom,right,top");
    return { left: parts[0], bottom: parts[1], right: parts[2], top: parts[3] };
  });

const withinBboxSql = bbox =>
  `lat BETWEEN ${bbox.bottom} AND ${bbox.top} AND lng BETWEEN ${bbox.left} AND ${bbox.right}`;

router.get("/", (req, res) => {
  try {
    const bbox = req.query.bbox ? bboxSchema.parse(String(req.query.bbox)) : null;
    const types = String(req.query.types || "").split(",").filter(Boolean);
    const where = [];
    if (bbox) where.push(withinBboxSql(bbox));
    if (types.length) where.push(`type IN (${types.map(() => "?").join(",")})`);
    const sql = `SELECT * FROM places ${
      where.length ? "WHERE " + where.join(" AND ") : ""
    } LIMIT 1000`;
    const rows = db.prepare(sql).all(...types);
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/", (req, res) => {
  const schema = z.object({
    type: z.enum(["shop", "club", "bench", "police-history", "other"]),
    name: z.string().optional(),
    lat: z.number(),
    lng: z.number(),
    risk_weight: z.number().min(0.1).max(5).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { type, name, lat, lng, risk_weight } = parsed.data;
  const info = db
    .prepare(
      "INSERT INTO places (type,name,lat,lng,risk_weight,source) VALUES (?,?,?,?,?,?)"
    )
    .run(type, name || null, lat, lng, risk_weight ?? 1.0, "anon");
  res.json({ id: info.lastInsertRowid });
});

export default router;
