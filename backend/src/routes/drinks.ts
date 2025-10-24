import { Router } from "express";
import { prisma } from "../lib/prisma";


const router = Router();


// List
router.get("/drinks", async (_req, res, next) => {
try {
const data = await prisma.drink.findMany({ orderBy: { id: "desc" } });
res.json(data);
} catch (e) { next(e); }
});


// Create
router.post("/drinks", async (req, res, next) => {
try {
const { name, brand, abv } = req.body;
if (!name) return res.status(400).json({ error: "name is required" });
const created = await prisma.drink.create({ data: { name, brand, abv } });
res.status(201).json(created);
} catch (e) { next(e); }
});


// Update
router.put("/drinks/:id", async (req, res, next) => {
try {
const id = Number(req.params.id);
const { name, brand, abv } = req.body;
const updated = await prisma.drink.update({ where: { id }, data: { name, brand, abv } });
res.json(updated);
} catch (e) { next(e); }
});


// Delete
router.delete("/drinks/:id", async (req, res, next) => {
try {
const id = Number(req.params.id);
await prisma.drink.delete({ where: { id } });
res.status(204).end();
} catch (e) { next(e); }
});


export default router;