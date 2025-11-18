import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import { validateApiKey } from "../middlewares/validateApiKey.js";

const prisma = new PrismaClient();
const router = express.Router();

function genNumber() {
  const d = new Date();
  return `PSP-${d.getFullYear().toString().slice(-2)}${String(
    d.getMonth() + 1
  ).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(
    Math.random() * 9000 + 1000
  )}`;
}

async function authOrApiKey(req, res, next) {
  const apiKey = req.header("X-API-KEY");
  if (apiKey) return validateApiKey(req, res, next);
  return authenticate(req, res, next);
}

// 🧩 Obtener lista de incidencias
router.get("/", authenticate, async (req, res) => {
  const { status, priority, category, assigned_to, sort, limit } = req.query;
  const where = {};

  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = category;
  if (assigned_to) where.assigned_to = assigned_to;

  const orderBy = {};
  if (sort) {
    if (sort.startsWith("-")) orderBy[sort.substring(1)] = "desc";
    else orderBy[sort] = "asc";
  } else orderBy.created_date = "desc";

  const incidents = await prisma.incident.findMany({
    where,
    orderBy,
    take: limit ? parseInt(limit) : 100,
  });
  res.json(incidents);
});

// 🧩 Obtener una incidencia
router.get("/:id", authenticate, async (req, res) => {
  const inc = await prisma.incident.findUnique({
    where: { id: req.params.id },
  });
  if (!inc) return res.status(404).json({ message: "No encontrado" });
  res.json(inc);
});

// 🧩 Crear una incidencia
router.post("/", authOrApiKey, async (req, res) => {
  const data = req.body;
  if (!data.title || !data.description)
    return res.status(400).json({ message: "Faltan campos" });

  let createdBy = "bot@system";
  if (req.user && req.user.email) createdBy = req.user.email;

  const incident = await prisma.incident.create({
    data: {
      ...data,
      number: genNumber(),
      created_by: createdBy,
    },
  });

  res.status(201).json(incident);
});

// 🧩 Actualizar incidencia con webhooks
router.put("/:id", authenticate, async (req, res) => {
  try {
    const oldIncident = await prisma.incident.findUnique({
      where: { id: req.params.id },
    });

    const incident = await prisma.incident.update({
      where: { id: req.params.id },
      data: req.body,
    });

    console.log("🚨 ACTUALIZANDO INCIDENCIA:", {
      id: incident.id,
      category: incident.category,
      status: incident.status,
      oldStatus: oldIncident?.status,
      resolution_notes: incident.resolution_notes,
    });

    // 💳 WEBHOOK 1: Facturación
    if (
      incident.category === "billing_issue" &&
      incident.status === "resolved" &&
      oldIncident.status !== "resolved"
    ) {
      const webhookUrl = process.env.BILLING_WEBHOOK_URL;
      if (webhookUrl) {
        console.log("💳 Disparando webhook de facturación...");
        try {
          const resp = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "billing_resolved",
              incident_id: incident.id,
              incident_number: incident.number,
              trip_id: incident.trip_id,
              title: incident.title,
              description: incident.description,
              resolution_notes: incident.resolution_notes,
              resolved_at: new Date().toISOString(),
              reported_by: incident.reported_by,
              user_phone: incident.user_phone,
              scooter_id: incident.scooter_id,
              location: incident.location,
              estimated_cost: incident.estimated_cost,
              category: incident.category,
              created_by: incident.created_by
            }),
          });
          console.log("✅ Webhook facturación:", resp.status);
        } catch (e) {
          console.error("❌ Error webhook facturación:", e.message);
        }
      }
    }

    // 🔧 WEBHOOK 2: Mecánicas
    const mechanicalCategories = [
      "mechanical_failure",
      "flat_tire",
      "battery_issue",
      "electrical_problem",
      "accident",
      "theft",
    ];

    if (
      mechanicalCategories.includes(incident.category) &&
      incident.status === "resolved" &&
      oldIncident.status !== "resolved" &&
      incident.resolution_notes?.trim() !== ""
    ) {
      const webhookUrl = process.env.MECHANICAL_WEBHOOK_URL;
      if (webhookUrl) {
        console.log("🔧 Disparando webhook mecánico...");
        try {
          const resp = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "mechanical_resolved",
              incident_id: incident.id,
              incident_number: incident.number,
              scooter_id: incident.scooter_id,
              trip_id: incident.trip_id,
              category: incident.category,
              title: incident.title,
              description: incident.description,
              resolution_notes: incident.resolution_notes,
              resolved_at: new Date().toISOString(),
              user_phone: incident.user_phone,
              reported_by: incident.reported_by,
              location: incident.location,
              estimated_cost: incident.estimated_cost,
              created_by: incident.created_by
            }),
          });
          console.log("✅ Webhook mecánico:", resp.status);
        } catch (e) {
          console.error("❌ Error webhook mecánico:", e.message);
        }
      }
    }

    // 📋 WEBHOOK 3: OTHER (incluye user_error)
    console.log("🧠 DEBUG OTHER:", {
      category: incident.category,
      status: incident.status,
      oldStatus: oldIncident?.status,
      notes: incident.resolution_notes,
      webhook: process.env.OTHER_WEBHOOK_URL,
    });

    if (
      (incident.category?.toLowerCase().trim() === "other" ||
       incident.category?.toLowerCase().trim() === "user_error") &&
      incident.status === "resolved" &&
      oldIncident.status !== "resolved" &&
      incident.resolution_notes?.trim() !== ""
    ) {
      const webhookUrl = process.env.OTHER_WEBHOOK_URL;
      if (webhookUrl) {
        console.log("📋 Incidencia de 'Other/User Error' resuelta CON notas, disparando webhook...");
        console.log("📤 URL:", webhookUrl);
        console.log("📤 Número:", incident.number);
        try {
          const webhookResponse = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "other_resolved",
              incident_id: incident.id,
              incident_number: incident.number,
              category: incident.category,
              title: incident.title,
              description: incident.description,
              resolution_notes: incident.resolution_notes,
              resolved_at: new Date().toISOString(),
              reported_by: incident.reported_by,
              user_phone: incident.user_phone,
              trip_id: incident.trip_id,
              scooter_id: incident.scooter_id,
              location: incident.location,
              estimated_cost: incident.estimated_cost,
              created_by: incident.created_by
            }),
          });
          console.log("✅ Webhook 'Other/User Error' enviado exitosamente:", webhookResponse.status);
        } catch (error) {
          console.error("❌ Error enviando webhook 'Other/User Error':", error.message);
        }
      } else {
        console.warn("⚠️ OTHER_WEBHOOK_URL no está definida en el entorno.");
      }
    } else {
      console.log("🚫 No se cumplen condiciones para webhook 'Other/User Error'.");
    }

    res.json(incident);
  } catch (err) {
    console.error("❌ Error actualizando incidencia:", err);
    res.status(404).json({ message: "No encontrado" });
  }
});

// 🧩 Eliminar incidencia
router.delete("/:id", authenticate, async (req, res) => {
  try {
    await prisma.incident.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Incident deleted successfully" });
  } catch {
    res.status(404).json({ message: "No encontrado" });
  }
});

// 🧩 Notas
router.get("/:id/notes", authenticate, async (req, res) => {
  const notes = await prisma.incidentNote.findMany({
    where: { incidentId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(notes);
});

router.post("/:id/notes", authenticate, async (req, res) => {
  const note = await prisma.incidentNote.create({
    data: {
      body: req.body.body,
      incidentId: req.params.id,
      authorId: req.user.id,
    },
  });
  res.status(201).json(note);
});

// 🧩 Historial
router.get("/:id/history", authenticate, async (req, res) => {
  const hist = await prisma.incidentHistory.findMany({
    where: { incidentId: req.params.id },
    orderBy: { changedAt: "asc" },
  });
  res.json(hist);
});

export default router;
