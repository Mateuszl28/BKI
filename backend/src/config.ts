import dotenv from "dotenv";
dotenv.config();


export const config = {
env: process.env.NODE_ENV ?? "development",
port: Number(process.env.PORT ?? 5174),
corsOrigin: process.env.CORS_ORIGIN ?? "*",
};