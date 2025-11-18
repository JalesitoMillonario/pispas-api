import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Obtener todas las incidencias con filtros y ordenamiento
export const getAllIncidents = async (req, res) => {
  try {
    const { 
      status, 
      priority, 
      category, 
      assigned_to,
      requires_pickup,
      sort = '-created_date',
      limit = 100 
    } = req.query;

    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;
    if (assigned_to) where.assigned_to = assigned_to;
    if (requires_pickup !== undefined) {
      where.requires_pickup = requires_pickup === 'true';
    }

    let orderBy = {};
    if (sort.startsWith('-')) {
      orderBy[sort.substring(1)] = 'desc';
    } else {
      orderBy[sort] = 'asc';
    }

    const incidents = await prisma.incident.findMany({
      where,
      orderBy,
      take: parseInt(limit),
    });

    res.json(incidents);
  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(500).json({ error: 'Error al obtener incidencias' });
  }
};

// Obtener una incidencia por ID
export const getIncidentById = async (req, res) => {
  try {
    const { id } = req.params;

    const incident = await prisma.incident.findUnique({
      where: { id },
    });

    if (!incident) {
      return res.status(404).json({ error: 'Incidencia no encontrada' });
    }

    res.json(incident);
  } catch (error) {
    console.error('Error fetching incident:', error);
    res.status(500).json({ error: 'Error al obtener incidencia' });
  }
};

// Crear nueva incidencia
export const createIncident = async (req, res) => {
  try {
    const incidentData = req.body;

    // Generar número de incidencia
    const count = await prisma.incident.count();
    incidentData.number = `INC-${String(count + 1).padStart(6, '0')}`;

    const incident = await prisma.incident.create({
      data: incidentData,
    });

    res.status(201).json(incident);
  } catch (error) {
    console.error('Error creating incident:', error);
    res.status(500).json({ error: 'Error al crear incidencia' });
  }
};

// 🚀 WEBHOOK: Enviar notificación de incidencia resuelta
async function sendBillingWebhook(incident) {
  try {
    const webhookUrl = process.env.BILLING_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.warn('⚠️ BILLING_WEBHOOK_URL no configurada');
      return;
    }

    // Obtener todas las notas
    const notes = await prisma.incidentNote.findMany({
      where: { incident_id: incident.id },
      orderBy: { created_at: 'asc' }
    });

    const payload = {
      event: 'billing_incident_resolved',
      timestamp: new Date().toISOString(),
      incident: {
        id: incident.id,
        number: incident.number,
        title: incident.title,
        description: incident.description,
        category: incident.category,
        priority: incident.priority,
        scooter_id: incident.scooter_id,
        trip_id: incident.trip_id,
        location: incident.location,
        user_phone: incident.user_phone,
        reported_by: incident.reported_by,
        assigned_to: incident.assigned_to,
        created_date: incident.created_date,
        resolution_date: incident.resolution_date,
        resolution_notes: incident.resolution_notes,
        estimated_cost: incident.estimated_cost,
        source: incident.source
      },
      operator_notes: notes.map(note => ({
        id: note.id,
        body: note.body,
        created_by: note.created_by,
        created_at: note.created_at
      }))
    };

    console.log('🎯 Incidencia de facturación resuelta, disparando webhook...');
    console.log('📤 URL:', webhookUrl);
    console.log('📤 Incident:', incident.number, '| Trip:', incident.trip_id);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'pispas-incident-system'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('✅ Webhook enviado exitosamente:', response.status);
    } else {
      console.error('❌ Webhook falló:', response.status, await response.text());
    }

  } catch (error) {
    console.error('❌ Error enviando webhook:', error.message);
  }
}

// Actualizar incidencia
export const updateIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Obtener incidencia actual
    const oldIncident = await prisma.incident.findUnique({
      where: { id }
    });

    if (!oldIncident) {
      return res.status(404).json({ error: 'Incidencia no encontrada' });
    }

    // Si se marca como resuelta, añadir fecha
    if (updateData.status === 'resolved' && oldIncident.status !== 'resolved') {
      updateData.resolution_date = new Date();
    }

    // Actualizar
    const incident = await prisma.incident.update({
      where: { id },
      data: updateData,
    });

    // 🚀 DISPARAR WEBHOOK si es facturación y se resolvió
    if (incident.category === 'billing_issue' && 
        oldIncident.status !== 'resolved' && 
        incident.status === 'resolved') {
      
      // Enviar webhook de forma asíncrona
      sendBillingWebhook(incident).catch(err => {
        console.error('Error en webhook:', err);
      });
    }

    res.json(incident);
  } catch (error) {
    console.error('Error updating incident:', error);
    res.status(500).json({ error: 'Error al actualizar incidencia' });
  }
};

// Eliminar incidencia
export const deleteIncident = async (req, res) => {
  try {
    const { id } = req.params;

    const incident = await prisma.incident.findUnique({
      where: { id }
    });

    if (!incident) {
      return res.status(404).json({ error: 'Incidencia no encontrada' });
    }

    // Eliminar notas
    await prisma.incidentNote.deleteMany({
      where: { incident_id: id }
    });

    // Eliminar historial
    await prisma.incidentHistory.deleteMany({
      where: { incident_id: id }
    });

    // Eliminar incidencia
    await prisma.incident.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting incident:', error);
    res.status(500).json({ error: 'Error al eliminar incidencia' });
  }
};

// Obtener notas de una incidencia
export const getIncidentNotes = async (req, res) => {
  try {
    const { id } = req.params;

    const notes = await prisma.incidentNote.findMany({
      where: { incident_id: id },
      orderBy: { created_at: 'asc' }
    });

    res.json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'Error al obtener notas' });
  }
};

// Añadir nota a una incidencia
export const addIncidentNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;

    const note = await prisma.incidentNote.create({
      data: {
        incident_id: id,
        body,
        created_by: req.user?.email || 'sistema'
      }
    });

    res.status(201).json(note);
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Error al añadir nota' });
  }
};

// Obtener historial de una incidencia
export const getIncidentHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const history = await prisma.incidentHistory.findMany({
      where: { incident_id: id },
      orderBy: { changed_at: 'desc' }
    });

    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
};
