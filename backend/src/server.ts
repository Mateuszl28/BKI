import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import health from "./routes/health";
import drinks from "./routes/drinks";
import { notFound } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";


export function createServer() {
const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(compression());
app.use(morgan("dev"));
app.use(express.json());


app.use("/api", health);
app.use("/api", drinks);


app.use(notFound);
app.use(errorHandler);
return app;
}