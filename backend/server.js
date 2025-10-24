import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import http from "http";
import { Server as SocketIOServer } from "socket.io";

import placesRouter from "./routes/places.js";
import reportsRouter from "./routes/reports.js";
import heatmapRouter from "./routes/heatmap.js";
import scoreRouter from "./routes/score.js";
import modesRouter from "./routes/modes.js";
import setupSockets from "./sockets.js";

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: "*" } });
setupSockets(io);

app.use(cors());
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

app.use("/api/places", placesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/heatmap", heatmapRouter);
app.use("/api/score", scoreRouter);
app.use("/api/modes", modesRouter);

server.listen(PORT, () =>
  console.log(`🚀 Alko Radar backend running on port ${PORT}`)
);
