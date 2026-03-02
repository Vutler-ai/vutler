/**
 * Clients API
 * Manage client companies and their relationships with deployments
 */
const express = require("express");
const router = express.Router();

// In-memory store (replace with DB in production)
let clients = [];
let nextId = 1;

// GET /api/v1/clients - List all clients for workspace
router.get("/", async (req, res) => {
  try {
    const workspaceClients = clients
      .filter(c => c.workspaceId === req.workspaceId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({ 
      success: true, 
      clients: workspaceClients
    });
  } catch (err) {
    console.error("[CLIENTS] List error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/clients/:id - Get single client
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = clients.find(c => c.id === id && c.workspaceId === req.workspaceId);
    
    if (!client) {
      return res.status(404).json({ success: false, error: "Client not found" });
    }
    
    res.json({ success: true, client });
  } catch (err) {
    console.error("[CLIENTS] Get error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/clients - Create new client
router.post("/", async (req, res) => {
  try {
    const { name, contactEmail, notes, company } = req.body;
    
    const client = {
      id: String(nextId++),
      name: name || company,
      contactEmail: contactEmail || '',
      notes: notes || '',
      deployments: [],
      workspaceId: req.workspaceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    clients.push(client);
    
    res.json({ success: true, client });
  } catch (err) {
    console.error("[CLIENTS] Create error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/clients/:id - Update client
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contactEmail, notes } = req.body;
    
    const client = clients.find(c => c.id === id && c.workspaceId === req.workspaceId);
    
    if (!client) {
      return res.status(404).json({ success: false, error: "Client not found" });
    }
    
    if (name !== undefined) client.name = name;
    if (contactEmail !== undefined) client.contactEmail = contactEmail;
    if (notes !== undefined) client.notes = notes;
    client.updatedAt = new Date().toISOString();
    
    res.json({ success: true, client });
  } catch (err) {
    console.error("[CLIENTS] Update error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/clients/:id - Delete client
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const index = clients.findIndex(c => c.id === id && c.workspaceId === req.workspaceId);
    
    if (index === -1) {
      return res.status(404).json({ success: false, error: "Client not found" });
    }
    
    clients.splice(index, 1);
    res.json({ success: true });
  } catch (err) {
    console.error("[CLIENTS] Delete error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
