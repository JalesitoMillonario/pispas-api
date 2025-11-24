import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";

const prisma = new PrismaClient();
const router = express.Router();

// 📦 GESTIÓN DE STOCK - SISTEMA COMPLETO DE INVENTARIO

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📋 LISTAR TODOS LOS ITEMS DE STOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/", authenticate, async (req, res) => {
  try {
    const {
      category,
      status,
      supplier,
      location,
      compatible_models,
      search,
      sort,
      limit
    } = req.query;

    const where = {};

    // Filtros
    if (category) where.category = category;
    if (status) where.status = status;
    if (supplier) where.supplier = { contains: supplier, mode: 'insensitive' };
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (compatible_models) where.compatible_models = { contains: compatible_models, mode: 'insensitive' };

    // Búsqueda general (por SKU, nombre o descripción)
    if (search) {
      where.OR = [
        { sku: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Ordenamiento
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

    const stockItems = await prisma.stockItem.findMany({
      where,
      orderBy,
      take: limit ? parseInt(limit) : 100,
    });

    res.json(stockItems);
  } catch (error) {
    console.error("Error obteniendo stock:", error);
    res.status(500).json({
      message: "Error al obtener items de stock",
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔍 BUSCAR POR SKU
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/sku/:sku", authenticate, async (req, res) => {
  try {
    const item = await prisma.stockItem.findUnique({
      where: { sku: req.params.sku }
    });

    if (!item) {
      return res.status(404).json({ message: "Item no encontrado" });
    }

    res.json(item);
  } catch (error) {
    console.error("Error buscando por SKU:", error);
    res.status(500).json({
      message: "Error al buscar item",
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚠️ OBTENER ITEMS CON STOCK BAJO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/low-stock", authenticate, async (req, res) => {
  try {
    const lowStockItems = await prisma.$queryRaw`
      SELECT * FROM stock_items
      WHERE quantity <= min_quantity
      AND status = 'available'
      ORDER BY quantity ASC
    `;

    res.json(lowStockItems);
  } catch (error) {
    console.error("Error obteniendo stock bajo:", error);
    res.status(500).json({
      message: "Error al obtener items con stock bajo",
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 ESTADÍSTICAS DE STOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/stats", authenticate, async (req, res) => {
  try {
    const totalItems = await prisma.stockItem.count();

    const lowStockResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM stock_items
      WHERE quantity <= min_quantity
    `;
    const lowStock = parseInt(lowStockResult[0].count);

    const outOfStock = await prisma.stockItem.count({
      where: { quantity: 0 }
    });

    const byCategory = await prisma.stockItem.groupBy({
      by: ['category'],
      _count: true,
      _sum: {
        quantity: true
      }
    });

    const byStatus = await prisma.stockItem.groupBy({
      by: ['status'],
      _count: true
    });

    const totalValue = await prisma.stockItem.aggregate({
      _sum: {
        quantity: true
      },
      where: {
        unit_price: { not: null }
      }
    });

    res.json({
      total_items: totalItems,
      low_stock_items: lowStock,
      out_of_stock_items: outOfStock,
      by_category: byCategory,
      by_status: byStatus,
      total_units: totalValue._sum.quantity || 0
    });
  } catch (error) {
    console.error("Error obteniendo estadísticas:", error);
    res.status(500).json({
      message: "Error al obtener estadísticas",
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔍 OBTENER UN ITEM ESPECÍFICO POR ID
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.get("/:id", authenticate, async (req, res) => {
  try {
    const item = await prisma.stockItem.findUnique({
      where: { id: req.params.id }
    });

    if (!item) {
      return res.status(404).json({ message: "Item no encontrado" });
    }

    res.json(item);
  } catch (error) {
    console.error("Error obteniendo item:", error);
    res.status(500).json({
      message: "Error al obtener item",
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ➕ CREAR NUEVO ITEM DE STOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/", authenticate, async (req, res) => {
  try {
    const data = req.body;

    // Validaciones
    if (!data.sku) {
      return res.status(400).json({ message: "El SKU es obligatorio" });
    }
    if (!data.name) {
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    // Verificar que el SKU no exista
    const existing = await prisma.stockItem.findUnique({
      where: { sku: data.sku }
    });

    if (existing) {
      return res.status(409).json({
        message: "Ya existe un item con ese SKU",
        existing_item: existing
      });
    }

    // Crear item
    const stockItem = await prisma.stockItem.create({
      data: {
        ...data,
        created_by: req.user.email,
      }
    });

    console.log(`✅ Nuevo item creado: ${stockItem.sku} - ${stockItem.name}`);
    res.status(201).json(stockItem);
  } catch (error) {
    console.error("Error creando item:", error);
    res.status(500).json({
      message: "Error al crear item de stock",
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✏️ ACTUALIZAR ITEM DE STOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.put("/:id", authenticate, async (req, res) => {
  try {
    const data = req.body;

    // Si se está actualizando el SKU, verificar que no exista
    if (data.sku) {
      const existing = await prisma.stockItem.findFirst({
        where: {
          sku: data.sku,
          id: { not: req.params.id }
        }
      });

      if (existing) {
        return res.status(409).json({
          message: "Ya existe otro item con ese SKU"
        });
      }
    }

    const stockItem = await prisma.stockItem.update({
      where: { id: req.params.id },
      data
    });

    console.log(`✏️ Item actualizado: ${stockItem.sku} - ${stockItem.name}`);
    res.json(stockItem);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: "Item no encontrado" });
    }
    console.error("Error actualizando item:", error);
    res.status(500).json({
      message: "Error al actualizar item",
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📥 AGREGAR STOCK (ENTRADA DE INVENTARIO)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/:id/add-stock", authenticate, async (req, res) => {
  try {
    const { quantity, notes } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        message: "La cantidad debe ser mayor a 0"
      });
    }

    const item = await prisma.stockItem.findUnique({
      where: { id: req.params.id }
    });

    if (!item) {
      return res.status(404).json({ message: "Item no encontrado" });
    }

    const updatedItem = await prisma.stockItem.update({
      where: { id: req.params.id },
      data: {
        quantity: item.quantity + parseInt(quantity),
        last_restock_date: new Date(),
        notes: notes || item.notes
      }
    });

    console.log(`📥 Stock agregado: ${updatedItem.sku} +${quantity} (Total: ${updatedItem.quantity})`);

    res.json({
      message: "Stock agregado exitosamente",
      item: updatedItem,
      added_quantity: parseInt(quantity),
      previous_quantity: item.quantity,
      new_quantity: updatedItem.quantity
    });
  } catch (error) {
    console.error("Error agregando stock:", error);
    res.status(500).json({
      message: "Error al agregar stock",
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📤 QUITAR STOCK (SALIDA DE INVENTARIO)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.post("/:id/remove-stock", authenticate, async (req, res) => {
  try {
    const { quantity, reason } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        message: "La cantidad debe ser mayor a 0"
      });
    }

    const item = await prisma.stockItem.findUnique({
      where: { id: req.params.id }
    });

    if (!item) {
      return res.status(404).json({ message: "Item no encontrado" });
    }

    if (item.quantity < quantity) {
      return res.status(400).json({
        message: "Stock insuficiente",
        available: item.quantity,
        requested: quantity
      });
    }

    const newQuantity = item.quantity - parseInt(quantity);
    const updatedItem = await prisma.stockItem.update({
      where: { id: req.params.id },
      data: {
        quantity: newQuantity,
        notes: reason ? `${item.notes || ''}\n[${new Date().toISOString()}] Salida: -${quantity} - ${reason}`.trim() : item.notes
      }
    });

    console.log(`📤 Stock removido: ${updatedItem.sku} -${quantity} (Total: ${updatedItem.quantity})`);

    res.json({
      message: "Stock removido exitosamente",
      item: updatedItem,
      removed_quantity: parseInt(quantity),
      previous_quantity: item.quantity,
      new_quantity: updatedItem.quantity,
      low_stock_warning: newQuantity <= item.min_quantity
    });
  } catch (error) {
    console.error("Error removiendo stock:", error);
    res.status(500).json({
      message: "Error al remover stock",
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🗑️ ELIMINAR ITEM DE STOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const item = await prisma.stockItem.findUnique({
      where: { id: req.params.id }
    });

    if (!item) {
      return res.status(404).json({ message: "Item no encontrado" });
    }

    await prisma.stockItem.delete({
      where: { id: req.params.id }
    });

    console.log(`🗑️ Item eliminado: ${item.sku} - ${item.name}`);

    res.json({
      success: true,
      message: "Item eliminado exitosamente",
      deleted_item: item
    });
  } catch (error) {
    console.error("Error eliminando item:", error);
    res.status(500).json({
      message: "Error al eliminar item",
      error: error.message
    });
  }
});

export default router;
