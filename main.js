const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let dbPath;
let win;

const DEFAULT_DB = {
  settings: { company: 'ASAN-CARGOO', currency: 'USD' },
  customers: [],
  vehicles: [],
  drivers: [],
  invoices: [],
  expenses: [],
  trips: []
};

function loadDb() {
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DB, ...parsed };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function saveDb(db) {
  const tmp = dbPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, dbPath);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'ASAN-CARGOO — Accounting',
    backgroundColor: '#f4f6f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  dbPath = process.env.ASAN_DATA_FILE || path.join(app.getPath('userData'), 'asan-cargoo-data.json');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let db = loadDb();

  ipcMain.handle('db:load', () => db);

  ipcMain.handle('db:save', (_e, collection, items) => {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_DB, collection)) {
      throw new Error('Unknown collection: ' + collection);
    }
    if (!Array.isArray(items)) {
      throw new Error('Collection must be an array');
    }
    db[collection] = items;
    saveDb(db);
    return true;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
