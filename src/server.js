import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import authRoutes from "./routes/auth.js";
import incidentsRoutes from "./routes/incidents.js";
import memoryRoutes from "./routes/memory.js";
import usersRoutes from "./routes/users.js";
import stockRoutes from "./routes/stock.js"; // ¡NUEVA LÍNEA!

dotenv.config();
const app = express();
const prisma = new PrismaClient();

app.use(cors({
    origin: '*', // En desarrollo: permite todo
    // origin: 'https://tu-dominio-base44.com', // En producción: reemplaza por tu dominio
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/incidents", incidentsRoutes);
app.use("/api/memory", memoryRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/stock", stockRoutes); // ¡NUEVA LÍNEA!

app.get("/", (_, res) => res.json({ status: "Pispas API OK" }));

app.listen(process.env.PORT,"0.0.0.0", () => {
  console.log(`🚀 API corriendo en http://0.0.0.0:${process.env.PORT}`);
});
