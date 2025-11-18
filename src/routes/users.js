import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";

const prisma = new PrismaClient();
const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      full_name: true,
      role: true,
      created_date: true
    }
  });
  res.json(users);
});

export default router;
