import { Router } from "express";


const router = Router();


router.get("/health", (_req, res) => {
res.json({ ok: true, uptime: process.uptime(), ts: Date.now() });
});


export default router;