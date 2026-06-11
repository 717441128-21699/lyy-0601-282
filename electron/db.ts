import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

let db: Database.Database

export function getDatabase(): Database.Database {
  if (!db) {
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'rental-finance.db')
    
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }

    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initTables()
  }
  return db
}

function initTables() {
  const d = getDatabase()
  d.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_no TEXT NOT NULL UNIQUE,
      building TEXT,
      floor INTEGER,
      area REAL,
      monthly_rent REAL NOT NULL DEFAULT 0,
      deposit_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'vacant',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      id_card TEXT,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      monthly_rent REAL NOT NULL,
      deposit REAL NOT NULL DEFAULT 0,
      payment_cycle TEXT NOT NULL DEFAULT 'monthly',
      status TEXT NOT NULL DEFAULT 'active',
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txn_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payer TEXT,
      payee TEXT,
      payment_method TEXT,
      remark TEXT,
      txn_no TEXT UNIQUE,
      matched INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER,
      room_id INTEGER NOT NULL,
      tenant_id INTEGER,
      bill_period TEXT NOT NULL,
      bill_type TEXT NOT NULL DEFAULT 'rent',
      amount_due REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'unpaid',
      remark TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS bill_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      transaction_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'auto',
      confirmed INTEGER NOT NULL DEFAULT 0,
      confirmed_by TEXT,
      confirmed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER,
      room_id INTEGER NOT NULL,
      tenant_id INTEGER,
      deposit_type TEXT NOT NULL DEFAULT 'rent',
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'collected',
      transaction_id INTEGER,
      freeze_reason TEXT,
      deduct_amount REAL DEFAULT 0,
      deduct_reason TEXT,
      dispute_reason TEXT,
      refund_transaction_id INTEGER,
      remark TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refund_no TEXT UNIQUE,
      contract_id INTEGER,
      room_id INTEGER NOT NULL,
      tenant_id INTEGER,
      deposit_id INTEGER,
      terminate_reason TEXT NOT NULL,
      terminate_date TEXT NOT NULL,
      deposit_amount REAL NOT NULL DEFAULT 0,
      deduction_details TEXT,
      total_deduction REAL NOT NULL DEFAULT 0,
      refund_amount REAL NOT NULL,
      approver TEXT,
      approved_at TEXT,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      payment_date TEXT,
      payment_method TEXT,
      payment_txn_no TEXT,
      remark TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (room_id) REFERENCES rooms(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (deposit_id) REFERENCES deposits(id)
    );

    CREATE TABLE IF NOT EXISTS refund_status_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refund_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      payment_method TEXT,
      payment_date TEXT,
      payment_txn_no TEXT,
      remark TEXT,
      operator TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(txn_date);
    CREATE INDEX IF NOT EXISTS idx_txn_amount ON transactions(amount);
    CREATE INDEX IF NOT EXISTS idx_txn_payer ON transactions(payer);
    CREATE INDEX IF NOT EXISTS idx_bills_period ON bills(bill_period);
    CREATE INDEX IF NOT EXISTS idx_bills_room ON bills(room_id);
    CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
    CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_status);
    CREATE INDEX IF NOT EXISTS idx_refund_logs_refund ON refund_status_logs(refund_id);
  `)
}

export default getDatabase
