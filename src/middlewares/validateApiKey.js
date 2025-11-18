import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function validateApiKey(req, res, next) {
  const apiKey = req.header("X-API-KEY");

  if (!apiKey) {
    return res.status(401).json({ error: "API Key requerida" });
  }

  const key = await prisma.apiKey.findUnique({
    where: { key: apiKey },
  });

  if (!key || key.revoked) {
    return res.status(403).json({ error: "API Key inválida o revocada" });
  }

  req.apiKeyRole = key.role;
  next();
}
