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
  if (apiKey) {
    return validateApiKey(req, res, next);
  }
  return authenticate(req, res, next);
}

// Obtener lista de incidencias
router.get("/", authenticate, async (req, res) => {
  const { status, priority, category, assigned_to, sort, limit } = req.query;
  const where = {};

  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = category;
  if (assigned_to) where.assigned_to = assigned_to;

  const orderBy = {};
  if (sort) {
    if (sort.startsWith('-')) {
      orderBy[sort.substring(1)] = 'desc';
    } else {
      orderBy[sort] = 'asc';
    }
  } else {
    orderBy.created_date = 'desc';
  }

  const incidents = await prisma.incident.findMany({
    where,
    orderBy,
    take: limit ? parseInt(limit) : 100,
  });
  res.json(incidents);
});

// Obtener una incidencia específica
router.get("/:id", authenticate, async (req, res) => {
  const inc = await prisma.incident.findUnique({ where: { id: req.params.id } });
  if (!inc) return res.status(404).json({ message: "No encontrado" });
  res.json(inc);
});

// Crear una incidencia
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

// Actualizar una incidencia - CON WEBHOOKS
router.put("/:id", authenticate, async (req, res) => {
  try {
    const oldIncident = await prisma.incident.findUnique({ 
      where: { id: req.params.id } 
    });
    
    const incident = await prisma.incident.update({
      where: { id: req.params.id },
      data: req.body,
    });
    
    // 🚀 WEBHOOK 1: Incidencias de FACTURACIÓN resueltas
    if (
      incident.category === 'billing_issue' && 
      incident.status === 'resolved' && 
      oldIncident.status !== 'resolved' // Solo si el estado cambia a resuelta
    ) {
      const webhookUrl = process.env.BILLING_WEBHOOK_URL;
      if (webhookUrl) {
        console.log('💳 Incidencia de facturación resuelta, disparando webhook...');
        console.log('📤 URL:', webhookUrl);
        console.log('📤 Incidencia:', incident.number, '| Viaje:', incident.trip_id);
        
        try {
          const webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'billing_resolved',
              incident_id: incident.id,
              incident_number: incident.number,
              trip_id: incident.trip_id,
              title: incident.title,
              description: incident.description,
              resolution_notes: incident.resolution_notes,
              resolved_at: new Date().toISOString(),
              user_phone: incident.user_phone,
              reported_by: incident.reported_by
            })
          });
          
          console.log('✅ Webhook facturación enviado exitosamente:', webhookResponse.status);
        } catch (error) {
          console.error('❌ Error enviando webhook de facturación:', error.message);
        }
      }
    }
    
    // 🚀 WEBHOOK 2: Incidencias MECÁNICAS resueltas CON notas
    const mechanicalCategories = [
      'mechanical_failure', 
      'flat_tire', 
      'battery_issue', 
      'electrical_problem', 
      'accident', 
      'theft'
    ];
    
    if (
      mechanicalCategories.includes(incident.category) && 
      incident.status === 'resolved' && 
      oldIncident.status !== 'resolved' && // Solo si el estado cambia a resuelta
      incident.resolution_notes && 
      incident.resolution_notes.trim() !== '' // SOLO si hay notas de resolución
    ) {
      const webhookUrl = process.env.MECHANICAL_WEBHOOK_URL;
      if (webhookUrl) {
        console.log('🔧 Incidencia mecánica resuelta CON notas, disparando webhook...');
        console.log('📤 URL:', webhookUrl);
        console.log('📤 Incidencia:', incident.number, '| Moto:', incident.scooter_id);
        
        try {
          const webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'mechanical_resolved',
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
              estimated_cost: incident.estimated_cost
            })
          });
          
          console.log('✅ Webhook mecánico enviado exitosamente:', webhookResponse.status);
        } catch (error) {
          console.error('❌ Error enviando webhook mecánico:', error.message);
        }
      }
    }
    
    res.json(incident);
  } catch (error) {
    console.error('Error actualizando incidencia:', error);
    res.status(404).json({ message: "No encontrado" });
  }
});

// Eliminar una incidencia
router.delete("/:id", authenticate, async (req, res) => {
  try {
    await prisma.incident.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Incident deleted successfully" });
  } catch {
    res.status(404).json({ message: "No encontrado" });
  }
});

// Notas de una incidencia - ✅ CORREGIDO con incidentId y createdAt
router.get("/:id/notes", authenticate, async (req, res) => {
  const notes = await prisma.incidentNote.findMany({
    where: { incidentId: req.params.id }, // Corregido: incidentId
    orderBy: { createdAt: 'asc' } // Corregido: createdAt
  });
  res.json(notes);
});

router.post("/:id/notes", authenticate, async (req, res) => {
  const note = await prisma.incidentNote.create({
    data: {
      body: req.body.body,
      incidentId: req.params.id, // Corregido: incidentId
      authorId: req.user.id,
    },
  });
  res.status(201).json(note);
});

// Historial de una incidencia - ✅ CORREGIDO con incidentId y changedAt
router.get("/:id/history", authenticate, async (req, res) => {
  const hist = await prisma.incidentHistory.findMany({
    where: { incidentId: req.params.id }, // Corregido: incidentId
    orderBy: { changedAt: 'asc' } // Corregido: changedAt
  });
  res.json(hist);
});

export default router;
