const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const ordersFile = path.join(dataDir, 'orders.json');

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(ordersFile)) fs.writeFileSync(ordersFile, '[]', 'utf8');
}

function loadOrders() {
  try {
    ensureStore();
    const raw = fs.readFileSync(ordersFile, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveOrders(list) {
  ensureStore();
  fs.writeFileSync(ordersFile, JSON.stringify(list, null, 2), 'utf8');
}

function addOrder(order) {
  const list = loadOrders();
  list.push(order);
  saveOrders(list);
  return order;
}

function getOrder(id) {
  return loadOrders().find(o => o.id === id) || null;
}

module.exports = { loadOrders, saveOrders, addOrder, getOrder };
