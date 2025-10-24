import express from "express";
import db from "../db.js";

const router = express.Router();

router.get("/", (req, res) => {
  const points = [];
  const places = db.prepare("SELECT * FROM places LIMIT 500").all();
  for (const p of places)
    points.push({ lat: p.lat, lng: p.lng, intensity: p.risk_weight });
  res.json(points);
});

export default router;
