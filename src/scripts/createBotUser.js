import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const botUser = await prisma.user.upsert({
    where: { email: "bot@system" },
    update: {},
    create: {
      email: "bot@system",
      password: "placeholder",
      full_name: "System Bot",
      role: "bot",
    },
  });

  console.log("✅ Usuario bot@system disponible:", botUser);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
  });
