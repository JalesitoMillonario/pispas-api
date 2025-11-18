import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  // Genera una clave segura y larga
  const key = crypto.randomBytes(48).toString("hex");

  // Puedes pasarle un nombre opcional al crearla
  const name = process.argv[2] || "n8n-bot";

  const apiKey = await prisma.apiKey.create({
    data: {
      key,
      name,
      role: "bot", // rol por defecto
    },
  });

  console.log(`✅ API Key generada correctamente:
  Nombre: ${apiKey.name}
  Rol: ${apiKey.role}
  Key: ${apiKey.key}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    prisma.$disconnect();
  });
