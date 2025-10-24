import express from "express";
import db from "../db.js";
import { haversine } from "../utils.js";

const router = express.Router();

router.get("/", (req, res) => {
  const lat = Number(req.query.lat),
    lng = Number(req.query.lng);
  if (!isFinite(lat) || !isFinite(lng))
    return res.status(400).json({ error: "lat,lng required" });

  const places = db.prepare("SELECT * FROM places").all();
  let risk = 0;
  for (const p of places) {
    const d = haversine(lat, lng, p.lat, p.lng);
    if (d < 1000) risk += p.risk_weight * Math.exp(-(d ** 2) / (2 * 200 ** 2));
  }

  const score = Math.min(100, Math.round(risk * 40));
  const msg =
    score < 30
      ? "Spoko okolica. Mama byłaby dumna. ✅"
      : score < 60
      ? "Lepiej miej oczy dookoła głowy. 🤨"
      : "Uwaga! Lepiej skręcić w prawo i udawać, że rozmawiasz przez telefon. 🚨";
  res.json({ score, message: msg });
});

export default router;
