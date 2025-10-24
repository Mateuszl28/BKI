import express from "express";
const router = express.Router();

router.get("/", (req, res) => {
  res.json([
    { id: "yolo", name: "YOLO", desc: "Najkrótsza trasa, minimalne ostrzeżenia." },
    { id: "mama", name: "Mama byłaby dumna", desc: "Preferuj bezpieczeństwo kosztem czasu." }
  ]);
});

export default router;
