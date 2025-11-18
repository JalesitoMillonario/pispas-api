import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
const prisma = new PrismaClient();
const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  const memories = await prisma.memory.findMany({ where: { userId: req.user.id } });
  res.json(memories);
});

router.get("/:scope/:key", authenticate, async (req, res) => {
  const mem = await prisma.memory.findUnique({
    where: { userId_scope_key: { userId: req.user.id, scope: req.params.scope, key: req.params.key } },
  });
  if (!mem) return res.status(404).json({ message: "No encontrada" });
  res.json(mem);
});

router.post("/", authenticate, async (req, res) => {
  const { scope, key, value, expiresAt } = req.body;
  if (!scope || !key)
    return res.status(400).json({ message: "Faltan campos" });
  const memory = await prisma.memory.upsert({
    where: { userId_scope_key: { userId: req.user.id, scope, key } },
    update: { value, expiresAt },
    create: { userId: req.user.id, scope, key, value, expiresAt },
  });
  res.status(201).json(memory);
});

router.delete("/:scope/:key", authenticate, async (req, res) => {
  await prisma.memory.delete({
    where: { userId_scope_key: { userId: req.user.id, scope: req.params.scope, key: req.params.key } },
  });
  res.json({ success: true, message: "Memory entry deleted successfully" });
});

export default router;
