import express from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const router = express.Router();
const prisma = new PrismaClient();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔐 MIDDLEWARE DE AUTENTICACIÓN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "No se proporcionó token de autenticación" });
  }

  const token = authHeader.replace("Bearer ", "");
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📋 LISTAR TODOS LOS PEDIDOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/", authenticate, async (req, res) => {
  try {
    const { estado } = req.query;

    const where = estado ? { estado } : {};

    const pedidos = await prisma.purchaseOrder.findMany({
      where,
      include: {
        lineas: true
      },
      orderBy: {
        fecha_creacion: 'desc'
      }
    });

    res.json(pedidos);
  } catch (error) {
    console.error("Error obteniendo pedidos:", error);
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔍 OBTENER UN PEDIDO POR ID
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const pedido = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        lineas: true
      }
    });

    if (!pedido) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    res.json(pedido);
  } catch (error) {
    console.error("Error obteniendo pedido:", error);
    res.status(500).json({ error: "Error al obtener pedido" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ➕ CREAR UN NUEVO PEDIDO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/", authenticate, async (req, res) => {
  try {
    const { notas } = req.body;

    // Generar número de pedido único
    const count = await prisma.purchaseOrder.count();
    const numero = `PO-${String(count + 1).padStart(5, '0')}`;

    const pedido = await prisma.purchaseOrder.create({
      data: {
        numero,
        notas: notas || null,
        created_by: req.user.email || req.user.id
      },
      include: {
        lineas: true
      }
    });

    res.status(201).json(pedido);
  } catch (error) {
    console.error("Error creando pedido:", error);
    res.status(500).json({ error: "Error al crear pedido" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✏️ ACTUALIZAR UN PEDIDO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.put("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, notas, fecha_cursado, fecha_recibido } = req.body;

    const dataToUpdate = {};
    if (estado !== undefined) dataToUpdate.estado = estado;
    if (notas !== undefined) dataToUpdate.notas = notas;
    if (fecha_cursado !== undefined) dataToUpdate.fecha_cursado = fecha_cursado ? new Date(fecha_cursado) : null;
    if (fecha_recibido !== undefined) dataToUpdate.fecha_recibido = fecha_recibido ? new Date(fecha_recibido) : null;

    const pedido = await prisma.purchaseOrder.update({
      where: { id },
      data: dataToUpdate,
      include: {
        lineas: true
      }
    });

    res.json(pedido);
  } catch (error) {
    console.error("Error actualizando pedido:", error);
    res.status(500).json({ error: "Error al actualizar pedido" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🗑️ ELIMINAR UN PEDIDO
// Solo se pueden eliminar pedidos en estado "borrador" o "cancelado"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el pedido existe
    const pedido = await prisma.purchaseOrder.findUnique({
      where: { id }
    });

    if (!pedido) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    // Solo permitir borrar pedidos en borrador o cancelados
    if (pedido.estado !== 'borrador' && pedido.estado !== 'cancelado') {
      return res.status(400).json({
        error: "No se puede eliminar un pedido cursado o recibido. Cancélalo primero.",
        estado: pedido.estado
      });
    }

    // Eliminar el pedido (las líneas se eliminan automáticamente por onDelete: Cascade)
    await prisma.purchaseOrder.delete({
      where: { id }
    });

    res.json({ message: "Pedido eliminado correctamente", id });
  } catch (error) {
    console.error("Error eliminando pedido:", error);
    res.status(500).json({ error: "Error al eliminar pedido" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ➕ AÑADIR LÍNEA A UN PEDIDO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/:id/lineas", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { pieza_id, codigo, nombre, unidad, cantidad, pvp } = req.body;

    // Validar datos requeridos
    if (!pieza_id || !codigo || !nombre || !cantidad || pvp === undefined) {
      return res.status(400).json({ error: "Faltan datos requeridos" });
    }

    // Crear la línea
    const linea = await prisma.purchaseOrderLine.create({
      data: {
        purchase_order_id: id,
        pieza_id: String(pieza_id),
        codigo,
        nombre,
        unidad: unidad || null,
        cantidad: parseInt(cantidad),
        pvp: parseFloat(pvp)
      }
    });

    // Recalcular el total del pedido
    const pedido = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lineas: true }
    });

    const total = pedido.lineas.reduce((sum, l) => sum + (l.cantidad * l.pvp), 0);

    await prisma.purchaseOrder.update({
      where: { id },
      data: { total }
    });

    res.status(201).json(linea);
  } catch (error) {
    console.error("Error añadiendo línea:", error);
    res.status(500).json({ error: "Error al añadir línea al pedido" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✏️ ACTUALIZAR LÍNEA DE PEDIDO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.put("/:id/lineas/:lineaId", authenticate, async (req, res) => {
  try {
    const { id, lineaId } = req.params;
    const { cantidad, cantidad_recibida, pvp } = req.body;

    const dataToUpdate = {};
    if (cantidad !== undefined) dataToUpdate.cantidad = parseInt(cantidad);
    if (cantidad_recibida !== undefined) dataToUpdate.cantidad_recibida = parseInt(cantidad_recibida);
    if (pvp !== undefined) dataToUpdate.pvp = parseFloat(pvp);

    const linea = await prisma.purchaseOrderLine.update({
      where: { id: lineaId },
      data: dataToUpdate
    });

    // Recalcular el total del pedido
    const pedido = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lineas: true }
    });

    const total = pedido.lineas.reduce((sum, l) => sum + (l.cantidad * l.pvp), 0);

    await prisma.purchaseOrder.update({
      where: { id },
      data: { total }
    });

    res.json(linea);
  } catch (error) {
    console.error("Error actualizando línea:", error);
    res.status(500).json({ error: "Error al actualizar línea" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🗑️ ELIMINAR LÍNEA DE PEDIDO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.delete("/:id/lineas/:lineaId", authenticate, async (req, res) => {
  try {
    const { id, lineaId } = req.params;

    await prisma.purchaseOrderLine.delete({
      where: { id: lineaId }
    });

    // Recalcular el total del pedido
    const pedido = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lineas: true }
    });

    const total = pedido.lineas.reduce((sum, l) => sum + (l.cantidad * l.pvp), 0);

    await prisma.purchaseOrder.update({
      where: { id },
      data: { total }
    });

    res.json({ message: "Línea eliminada correctamente" });
  } catch (error) {
    console.error("Error eliminando línea:", error);
    res.status(500).json({ error: "Error al eliminar línea" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📦 RECIBIR MERCANCÍA COMPLETA
// Marca el pedido como recibido y actualiza el stock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/:id/recibir-completo", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const pedido = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lineas: true }
    });

    if (!pedido) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    // Actualizar todas las líneas como recibidas
    await Promise.all(
      pedido.lineas.map(linea =>
        prisma.purchaseOrderLine.update({
          where: { id: linea.id },
          data: { cantidad_recibida: linea.cantidad }
        })
      )
    );

    // Actualizar el pedido
    const pedidoActualizado = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        estado: 'recibido',
        fecha_recibido: new Date(),
        fecha_ultima_recepcion: new Date()
      },
      include: { lineas: true }
    });

    res.json(pedidoActualizado);
  } catch (error) {
    console.error("Error recibiendo mercancía:", error);
    res.status(500).json({ error: "Error al recibir mercancía" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📦 RECIBIR MERCANCÍA PARCIAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/:id/recibir-parcial", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { lineaId, cantidad } = req.body;

    if (!lineaId || !cantidad) {
      return res.status(400).json({ error: "Faltan datos requeridos" });
    }

    const linea = await prisma.purchaseOrderLine.findUnique({
      where: { id: lineaId }
    });

    if (!linea) {
      return res.status(404).json({ error: "Línea no encontrada" });
    }

    const nuevaCantidadRecibida = linea.cantidad_recibida + parseInt(cantidad);

    if (nuevaCantidadRecibida > linea.cantidad) {
      return res.status(400).json({
        error: "La cantidad recibida no puede exceder la cantidad pedida"
      });
    }

    await prisma.purchaseOrderLine.update({
      where: { id: lineaId },
      data: { cantidad_recibida: nuevaCantidadRecibida }
    });

    // Verificar si todas las líneas están completas
    const pedido = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lineas: true }
    });

    const todasCompletas = pedido.lineas.every(l => l.cantidad_recibida >= l.cantidad);

    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        estado: todasCompletas ? 'recibido' : 'parcial',
        fecha_ultima_recepcion: new Date(),
        fecha_recibido: todasCompletas ? new Date() : null
      }
    });

    const pedidoActualizado = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lineas: true }
    });

    res.json(pedidoActualizado);
  } catch (error) {
    console.error("Error recibiendo mercancía parcial:", error);
    res.status(500).json({ error: "Error al recibir mercancía parcial" });
  }
});

export default router;
