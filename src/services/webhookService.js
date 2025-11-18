const axios = require('axios');

class WebhookService {
  constructor() {
    // URL del webhook (puedes moverlo a .env)
    this.webhookUrl = process.env.BILLING_WEBHOOK_URL || 'https://tu-sistema-facturacion.com/webhook';
  }

  /**
   * Envía datos de incidencia resuelta al webhook
   */
  async sendBillingIncidentResolved(incident, notes) {
    try {
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

      console.log('📤 Enviando webhook de facturación:', {
        url: this.webhookUrl,
        incident_number: incident.number,
        trip_id: incident.trip_id
      });

      const response = await axios.post(this.webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Source': 'pispas-incident-system'
        },
        timeout: 10000 // 10 segundos
      });

      console.log('✅ Webhook enviado exitosamente:', response.status);
      return { success: true, status: response.status };

    } catch (error) {
      console.error('❌ Error enviando webhook:', error.message);
      // No lanzar error para no bloquear la resolución de la incidencia
      return { success: false, error: error.message };
    }
  }

  /**
   * Verifica si una incidencia debe disparar el webhook
   */
  shouldTriggerWebhook(oldIncident, newIncident) {
    const isBillingCategory = newIncident.category === 'billing_issue';
    const wasResolved = oldIncident.status !== 'resolved' && newIncident.status === 'resolved';
    
    return isBillingCategory && wasResolved;
  }
}
