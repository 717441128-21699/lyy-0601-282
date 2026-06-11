import { ipcMain } from 'electron'
import { getDatabase } from './db'
import dayjs from 'dayjs'
import type Database from 'better-sqlite3'

type AnyRow = Record<string, any>

function q(db: Database.Database, sql: string, ...params: any[]): AnyRow | undefined {
  return db.prepare(sql).get(...params) as AnyRow | undefined
}
function qa(db: Database.Database, sql: string, ...params: any[]): AnyRow[] {
  return db.prepare(sql).all(...params) as AnyRow[]
}

export function registerDatabaseHandlers() {
  const d = () => getDatabase()

  ipcMain.handle('transactions:list', (_e, params) => {
    const { page = 1, pageSize = 20, ...filters } = params || {}
    const where: string[] = []
    const args: any[] = []

    if (filters.matched !== undefined) {
      where.push('matched = ?')
      args.push(filters.matched ? 1 : 0)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = q(d(), `SELECT COUNT(*) as cnt FROM transactions ${whereSql}`, ...args)?.cnt || 0
    const offset = (page - 1) * pageSize
    const data = qa(d(), `
      SELECT t.*,
        COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0) as allocated_amount,
        t.amount - COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0) as remaining_amount,
        GROUP_CONCAT(bm.bill_id) as matched_bill_ids
      FROM transactions t
      LEFT JOIN bill_matches bm ON t.id = bm.transaction_id
      ${whereSql}
      GROUP BY t.id
      ORDER BY t.txn_date DESC, t.id DESC
      LIMIT ? OFFSET ?
    `, ...args, pageSize, offset)
    return { data, total, page, pageSize }
  })

  ipcMain.handle('transactions:search', (_e, filters) => {
    const where: string[] = []
    const args: any[] = []

    if (filters.minAmount !== undefined) { where.push('amount >= ?'); args.push(filters.minAmount) }
    if (filters.maxAmount !== undefined) { where.push('amount <= ?'); args.push(filters.maxAmount) }
    if (filters.payer) { where.push('payer LIKE ?'); args.push(`%${filters.payer}%`) }
    if (filters.remark) { where.push('remark LIKE ?'); args.push(`%${filters.remark}%`) }
    if (filters.startDate) { where.push('txn_date >= ?'); args.push(filters.startDate) }
    if (filters.endDate) { where.push('txn_date <= ?'); args.push(filters.endDate) }
    if (filters.matched !== undefined) { where.push('matched = ?'); args.push(filters.matched ? 1 : 0) }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const data = qa(d(), `
      SELECT t.*,
        COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0) as allocated_amount,
        t.amount - COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0) as remaining_amount,
        GROUP_CONCAT(bm.bill_id) as matched_bill_ids
      FROM transactions t
      LEFT JOIN bill_matches bm ON t.id = bm.transaction_id
      ${whereSql}
      GROUP BY t.id
      ORDER BY t.txn_date DESC, t.id DESC
    `, ...args)
    return { data, total: data.length }
  })

  ipcMain.handle('transactions:create', (_e, data) => {
    let txnNo = data.txn_no
    if (!txnNo || txnNo.trim() === '') {
      txnNo = 'TXN' + dayjs(data.txn_date).format('YYYYMMDD') + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100).toString().padStart(2, '0')
    }
    const stmt = d().prepare(`
      INSERT INTO transactions (txn_date, amount, payer, payee, payment_method, remark, txn_no)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(data.txn_date, data.amount, data.payer || '', data.payee || '租赁公司', data.payment_method || '银行转账', data.remark || '', txnNo)
    return { id: result.lastInsertRowid, txn_no: txnNo }
  })

  ipcMain.handle('transactions:update', (_e, id, data) => {
    d().prepare(`
      UPDATE transactions SET txn_date=?, amount=?, payer=?, payee=?, payment_method=?, remark=?, txn_no=?, updated_at=datetime('now','localtime')
      WHERE id=?
    `).run(data.txn_date, data.amount, data.payer, data.payee, data.payment_method, data.remark, data.txn_no, id)
    return { success: true }
  })

  ipcMain.handle('transactions:delete', (_e, id) => {
    const tx = d().transaction(() => {
      d().prepare('DELETE FROM bill_matches WHERE transaction_id=?').run(id)
      d().prepare('DELETE FROM transactions WHERE id=?').run(id)
    })
    tx()
    return { success: true }
  })

  ipcMain.handle('transactions:bulkImport', (_e, rows) => {
    const stmt = d().prepare(`
      INSERT OR IGNORE INTO transactions (txn_date, amount, payer, payee, payment_method, remark, txn_no)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = d().transaction((list: any[]) => {
      let count = 0
      for (const r of list) {
        const result = stmt.run(r.txn_date, r.amount, r.payer, r.payee, r.payment_method, r.remark, r.txn_no)
        if (result.changes) count++
      }
      return count
    })
    const inserted = tx(rows)
    return { inserted }
  })

  ipcMain.handle('bills:list', (_e, params) => {
    const { page = 1, pageSize = 20, ...filters } = params || {}
    const where: string[] = []
    const args: any[] = []

    if (filters.status) { where.push('b.status = ?'); args.push(filters.status) }
    if (filters.roomId) { where.push('b.room_id = ?'); args.push(filters.roomId) }
    if (filters.period) { where.push('b.bill_period = ?'); args.push(filters.period) }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = q(d(), `SELECT COUNT(*) as cnt FROM bills b ${whereSql}`, ...args)?.cnt || 0
    const offset = (page - 1) * pageSize
    const data = qa(d(), `
      SELECT b.*, r.room_no, t.name as tenant_name,
        (SELECT GROUP_CONCAT(json_object('id', bm.id, 'txn_id', bm.transaction_id, 'amount', bm.amount, 'confirmed', bm.confirmed, 'match_type', bm.match_type, 'payer', tx.payer, 'txn_no', tx.txn_no, 'txn_date', tx.txn_date))
         FROM bill_matches bm
         LEFT JOIN transactions tx ON bm.transaction_id = tx.id
         WHERE bm.bill_id = b.id) as matches
      FROM bills b
      LEFT JOIN rooms r ON b.room_id = r.id
      LEFT JOIN tenants t ON b.tenant_id = t.id
      ${whereSql}
      ORDER BY b.bill_period DESC, b.id DESC
      LIMIT ? OFFSET ?
    `, ...args, pageSize, offset)
    return { data, total, page, pageSize }
  })

  ipcMain.handle('bills:getUnmatched', () => {
    const unmatchedTxns = qa(d(), `
      SELECT t.*,
        COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0) as allocated_amount,
        t.amount - COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0) as remaining_amount
      FROM transactions t
      WHERE (t.amount - COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0)) > 0.005
      ORDER BY t.txn_date DESC
    `)
    const unpaidBills = qa(d(), `
      SELECT b.*, r.room_no, t.name as tenant_name, c.monthly_rent
      FROM bills b
      LEFT JOIN rooms r ON b.room_id = r.id
      LEFT JOIN tenants t ON b.tenant_id = t.id
      LEFT JOIN contracts c ON b.contract_id = c.id
      WHERE b.status IN ('unpaid', 'partial')
      ORDER BY b.bill_period DESC
    `)
    return { unmatchedTxns, unpaidBills }
  })

  ipcMain.handle('bills:create', (_e, data) => {
    const stmt = d().prepare(`
      INSERT INTO bills (contract_id, room_id, tenant_id, bill_period, bill_type, amount_due, due_date, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(data.contract_id, data.room_id, data.tenant_id, data.bill_period, data.bill_type || 'rent', data.amount_due, data.due_date, data.remark)
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('bills:update', (_e, id, data) => {
    d().prepare(`
      UPDATE bills SET contract_id=?, room_id=?, tenant_id=?, bill_period=?, bill_type=?, amount_due=?, due_date=?, remark=?
      WHERE id=?
    `).run(data.contract_id, data.room_id, data.tenant_id, data.bill_period, data.bill_type, data.amount_due, data.due_date, data.remark, id)
    return { success: true }
  })

  ipcMain.handle('bills:delete', (_e, id) => {
    const tx = d().transaction(() => {
      const matches = qa(d(), 'SELECT transaction_id, amount FROM bill_matches WHERE bill_id=?', id)
      d().prepare('DELETE FROM bill_matches WHERE bill_id=?').run(id)
      for (const m of matches) {
        const txn = q(d(), 'SELECT id, amount FROM transactions WHERE id=?', m.transaction_id)
        if (txn) {
          const otherMatches = q(d(), 'SELECT COALESCE(SUM(amount),0) as s FROM bill_matches WHERE transaction_id=?', m.transaction_id)?.s || 0
          if (otherMatches === 0) {
            d().prepare('UPDATE transactions SET matched=0 WHERE id=?').run(m.transaction_id)
          }
        }
      }
      d().prepare('DELETE FROM bills WHERE id=?').run(id)
    })
    tx()
    return { success: true }
  })

  function refreshBillAndTxnStatus(db: Database.Database, billId: number, txnId: number) {
    const bill = q(db, 'SELECT amount_due, COALESCE(SUM(bm.amount),0) as paid FROM bills b LEFT JOIN bill_matches bm ON b.id=bm.bill_id WHERE b.id=? GROUP BY b.id', billId)
    if (bill) {
      const paid = bill.paid || 0
      let status = 'unpaid'
      if (paid >= bill.amount_due) status = 'paid'
      else if (paid > 0) status = 'partial'
      db.prepare('UPDATE bills SET amount_paid=?, status=? WHERE id=?').run(paid, status, billId)
    }
    const txnPaid = q(db, 'SELECT COALESCE(SUM(amount),0) as s FROM bill_matches WHERE transaction_id=?', txnId)?.s || 0
    const txn = q(db, 'SELECT amount FROM transactions WHERE id=?', txnId)
    if (txn) {
      db.prepare('UPDATE transactions SET matched=? WHERE id=?').run(txnPaid >= txn.amount ? 1 : 0, txnId)
    }
  }

  ipcMain.handle('bills:match', (_e, { billId, transactionId, amount, matchType = 'manual' }) => {
    const tx = d().transaction(() => {
      const stmt = d().prepare(`
        INSERT INTO bill_matches (bill_id, transaction_id, amount, match_type, confirmed)
        VALUES (?, ?, ?, ?, ?)
      `)
      const result = stmt.run(billId, transactionId, amount, matchType, matchType === 'manual' ? 1 : 0)
      refreshBillAndTxnStatus(d(), billId, transactionId)
      return { id: result.lastInsertRowid }
    })
    return tx()
  })

  ipcMain.handle('bills:confirmMatch', (_e, matchId, confirmed) => {
    const tx = d().transaction(() => {
      const match = q(d(), 'SELECT * FROM bill_matches WHERE id=?', matchId)
      if (match) {
        d().prepare('UPDATE bill_matches SET confirmed=?, confirmed_by=?, confirmed_at=datetime(?) WHERE id=?')
          .run(confirmed ? 1 : 0, 'operator', dayjs().format('YYYY-MM-DD HH:mm:ss'), matchId)
        refreshBillAndTxnStatus(d(), match.bill_id, match.transaction_id)
      }
    })
    tx()
    return { success: true }
  })

  ipcMain.handle('bills:batchConfirm', (_e, matchIds) => {
    const d2 = d()
    const tx = d2.transaction(() => {
      for (const mid of matchIds) {
        const match = q(d2, 'SELECT * FROM bill_matches WHERE id=?', mid)
        if (match && !match.confirmed) {
          d2.prepare('UPDATE bill_matches SET confirmed=1, confirmed_by=?, confirmed_at=datetime(?) WHERE id=?')
            .run('operator', dayjs().format('YYYY-MM-DD HH:mm:ss'), mid)
          refreshBillAndTxnStatus(d2, match.bill_id, match.transaction_id)
        }
      }
    })
    tx()
    return { success: true, count: matchIds.length }
  })

  ipcMain.handle('bills:batchMatch', (_e, matches) => {
    const d2 = d()
    const results: any[] = []
    const tx = d2.transaction(() => {
      for (const m of matches) {
        const txn = q(d2, 'SELECT amount FROM transactions WHERE id=?', m.transactionId)
        const allocated = q(d2, 'SELECT COALESCE(SUM(amount),0) as s FROM bill_matches WHERE transaction_id=?', m.transactionId)?.s || 0
        const remaining = (txn?.amount || 0) - allocated
        if (remaining < 0.01) { results.push({ ...m, skipped: true, reason: '流水已分完' }); continue }
        const bill = q(d2, 'SELECT amount_due, amount_paid FROM bills WHERE id=?', m.billId)
        const billRemain = (bill?.amount_due || 0) - (bill?.amount_paid || 0)
        if (billRemain < 0.01) { results.push({ ...m, skipped: true, reason: '账单已缴清' }); continue }
        const alloc = Math.min(remaining, billRemain, m.amount || remaining)
        d2.prepare('INSERT INTO bill_matches (bill_id, transaction_id, amount, match_type, confirmed) VALUES (?, ?, ?, ?, 0)')
          .run(m.billId, m.transactionId, Number(alloc.toFixed(2)), m.matchType || 'manual')
        refreshBillAndTxnStatus(d2, m.billId, m.transactionId)
        results.push({ ...m, amount: Number(alloc.toFixed(2)), skipped: false })
      }
    })
    tx()
    return { success: true, results }
  })

  ipcMain.handle('deposits:list', (_e, params) => {
    const { page = 1, pageSize = 20, ...filters } = params || {}
    const where: string[] = []
    const args: any[] = []

    if (filters.status) { where.push('d.status = ?'); args.push(filters.status) }
    if (filters.roomId) { where.push('d.room_id = ?'); args.push(filters.roomId) }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = q(d(), `SELECT COUNT(*) as cnt FROM deposits d ${whereSql}`, ...args)?.cnt || 0
    const offset = (page - 1) * pageSize
    const data = qa(d(), `
      SELECT d.*, r.room_no, t.name as tenant_name
      FROM deposits d
      LEFT JOIN rooms r ON d.room_id = r.id
      LEFT JOIN tenants t ON d.tenant_id = t.id
      ${whereSql}
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?
    `, ...args, pageSize, offset)
    return { data, total, page, pageSize }
  })

  ipcMain.handle('deposits:stats', () => {
    const rows = qa(d(), `
      SELECT status, COUNT(*) as count, SUM(amount) as amount
      FROM deposits
      GROUP BY status
    `)
    const stats: Record<string, { count: number; amount: number }> = {}
    const statuses = ['collected', 'frozen', 'deducted', 'refunded', 'disputed']
    statuses.forEach(s => { stats[s] = { count: 0, amount: 0 } })
    rows.forEach(r => {
      if (stats[r.status as string]) {
        stats[r.status as string] = { count: r.count, amount: r.amount || 0 }
      }
    })
    const total = rows.reduce((a, b) => a + b.count, 0)
    const totalAmount = rows.reduce((a, b) => a + (b.amount || 0), 0)
    return { byStatus: stats, total, totalAmount }
  })

  ipcMain.handle('deposits:create', (_e, data) => {
    const stmt = d().prepare(`
      INSERT INTO deposits (contract_id, room_id, tenant_id, deposit_type, amount, status, transaction_id, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      data.contract_id || null,
      data.room_id,
      data.tenant_id || null,
      data.deposit_type || 'rent',
      data.amount,
      data.status || 'collected',
      data.transaction_id || null,
      data.remark || ''
    )
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('deposits:update', (_e, id, data) => {
    d().prepare(`
      UPDATE deposits SET contract_id=?, room_id=?, tenant_id=?, deposit_type=?, amount=?, status=?, remark=?, updated_at=datetime('now','localtime')
      WHERE id=?
    `).run(data.contract_id, data.room_id, data.tenant_id, data.deposit_type, data.amount, data.status, data.remark, id)
    return { success: true }
  })

  ipcMain.handle('deposits:changeStatus', (_e, id, status, extra = {}) => {
    const allowed = ['collected', 'frozen', 'deducted', 'refunded', 'disputed']
    if (!allowed.includes(status)) throw new Error('Invalid status')
    const tx = d().transaction(() => {
      const updates = ['status = ?', "updated_at = datetime('now','localtime')"]
      const args: any[] = [status]
      if ((extra as any).freeze_reason) { updates.push('freeze_reason = ?'); args.push((extra as any).freeze_reason) }
      if ((extra as any).deduct_amount !== undefined) { updates.push('deduct_amount = ?'); args.push((extra as any).deduct_amount) }
      if ((extra as any).deduct_reason) { updates.push('deduct_reason = ?'); args.push((extra as any).deduct_reason) }
      if ((extra as any).dispute_reason) { updates.push('dispute_reason = ?'); args.push((extra as any).dispute_reason) }
      if ((extra as any).refund_transaction_id) { updates.push('refund_transaction_id = ?'); args.push((extra as any).refund_transaction_id) }
      args.push(id)
      d().prepare(`UPDATE deposits SET ${updates.join(', ')} WHERE id=?`).run(...args)
    })
    tx()
    return { success: true }
  })

  ipcMain.handle('refunds:list', (_e, params) => {
    const { page = 1, pageSize = 20, ...filters } = params || {}
    const where: string[] = []
    const args: any[] = []

    if (filters.paymentStatus) { where.push('r.payment_status = ?'); args.push(filters.paymentStatus) }
    if (filters.approver === 'pending') { where.push('r.approver IS NULL') }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = q(d(), `SELECT COUNT(*) as cnt FROM refunds r ${whereSql}`, ...args)?.cnt || 0
    const offset = (page - 1) * pageSize
    const data = qa(d(), `
      SELECT r.*, rm.room_no, t.name as tenant_name
      FROM refunds r
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN tenants t ON r.tenant_id = t.id
      ${whereSql}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `, ...args, pageSize, offset)
    return { data, total, page, pageSize }
  })

  ipcMain.handle('refunds:create', (_e, data) => {
    const refundNo = 'RF' + dayjs().format('YYYYMMDDHHmmss') + Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const stmt = d().prepare(`
      INSERT INTO refunds (refund_no, contract_id, room_id, tenant_id, deposit_id, terminate_reason, terminate_date,
        deposit_amount, deduction_details, total_deduction, refund_amount, payment_status, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `)
    const deductionList = data.deduction_details && Array.isArray(data.deduction_details)
      ? data.deduction_details.filter((d: any) => d.type && d.amount > 0)
      : []
    const totalDeduction = deductionList.reduce((a: number, b: any) => a + Number(b.amount || 0), 0)
    const depositAmount = Number(data.deposit_amount || 0)
    const refundAmount = Math.max(0, depositAmount - totalDeduction)
    const result = stmt.run(refundNo,
      data.contract_id || null,
      data.room_id || null,
      data.tenant_id || null,
      data.deposit_id || null,
      data.terminate_reason || '',
      data.terminate_date || dayjs().format('YYYY-MM-DD'),
      depositAmount,
      deductionList.length > 0 ? JSON.stringify(deductionList) : null,
      totalDeduction,
      refundAmount,
      data.remark || ''
    )
    return { id: result.lastInsertRowid, refundNo, deposit_amount: depositAmount, total_deduction: totalDeduction, refund_amount: refundAmount }
  })

  ipcMain.handle('refunds:update', (_e, id, data) => {
    d().prepare(`
      UPDATE refunds SET terminate_reason=?, terminate_date=?, deposit_amount=?, deduction_details=?,
        total_deduction=?, refund_amount=?, remark=?
      WHERE id=?
    `).run(data.terminate_reason, data.terminate_date, data.deposit_amount,
      data.deduction_details ? JSON.stringify(data.deduction_details) : null,
      data.total_deduction, data.refund_amount, data.remark, id)
    return { success: true }
  })

  ipcMain.handle('refunds:approve', (_e, id, approver) => {
    const d2 = d()
    const tx = d2.transaction(() => {
      const refund = q(d2, 'SELECT payment_status FROM refunds WHERE id=?', id)
      d2.prepare(`UPDATE refunds SET approver=?, approved_at=datetime('now','localtime') WHERE id=?`)
        .run(approver, id)
      d2.prepare(`INSERT INTO refund_status_logs (refund_id, old_status, new_status, operator, remark)
        VALUES (?, ?, ?, ?, ?)`)
        .run(id, refund ? refund.payment_status : null, 'approved', approver, '财务审批通过')
    })
    tx()
    return { success: true }
  })

  ipcMain.handle('refunds:listStatusLogs', (_e, refundId) => {
    return qa(d(), `SELECT * FROM refund_status_logs WHERE refund_id=? ORDER BY created_at DESC`, refundId)
  })

  ipcMain.handle('refunds:updatePaymentStatus', (_e, id, status, extra = {}) => {
    const d2 = d()
    const refund = q(d2, 'SELECT * FROM refunds WHERE id=?', id)
    if (!refund) return { success: false, error: '退款单不存在' }
    let retryCount = Number(refund.retry_count || 0)
    const tx = d2.transaction(() => {
      const updates = ['payment_status = ?']
      const args: any[] = [status]
      if ((extra as any).payment_method) { updates.push('payment_method = ?'); args.push((extra as any).payment_method) }
      if ((extra as any).payment_txn_no) { updates.push('payment_txn_no = ?'); args.push((extra as any).payment_txn_no) }
      if ((extra as any).payment_remark) { updates.push('remark = ?'); args.push((extra as any).payment_remark) }
      if (status === 'paid') {
        updates.push("payment_date = datetime(?)")
        args.push((extra as any).payment_date || dayjs().format('YYYY-MM-DD'))
      }
      if (status === 'failed' || status === 'processing') {
        if (refund.payment_status !== 'paid') {
          retryCount = retryCount + 1
        }
        updates.push('retry_count = ?')
        args.push(retryCount)
      }
      args.push(id)
      d2.prepare(`UPDATE refunds SET ${updates.join(', ')} WHERE id=?`).run(...args)
      if (refund.deposit_id) {
        const dep = q(d2, 'SELECT status FROM deposits WHERE id=?', refund.deposit_id)
        if (status === 'paid') {
          if (dep && dep.status !== 'refunded') {
            d2.prepare(`UPDATE deposits SET status='refunded', updated_at=datetime('now','localtime') WHERE id=?`).run(refund.deposit_id)
          }
        } else if (refund.payment_status === 'paid' && status !== 'paid') {
          if (dep && dep.status === 'refunded') {
            d2.prepare(`UPDATE deposits SET status='collected', updated_at=datetime('now','localtime') WHERE id=?`).run(refund.deposit_id)
          }
        }
      }
      d2.prepare(`INSERT INTO refund_status_logs (refund_id, old_status, new_status, payment_method, payment_date, payment_txn_no, failure_reason, retry_count, receipt_info, remark, operator)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, refund.payment_status, status,
          (extra as any).payment_method || null,
          (extra as any).payment_date || null,
          (extra as any).payment_txn_no || null,
          (extra as any).failure_reason || null,
          retryCount,
          (extra as any).receipt_info || null,
          (extra as any).payment_remark || null,
          (extra as any).operator || '操作员')
    })
    tx()
    return { success: true, retry_count: retryCount }
  })

  ipcMain.handle('rooms:list', () => qa(d(), 'SELECT * FROM rooms ORDER BY room_no'))

  ipcMain.handle('rooms:create', (_e, data) => {
    const stmt = d().prepare('INSERT INTO rooms (room_no, building, floor, area, monthly_rent, deposit_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    return { id: stmt.run(data.room_no, data.building, data.floor, data.area, data.monthly_rent, data.deposit_amount, data.status || 'vacant').lastInsertRowid }
  })

  ipcMain.handle('tenants:list', () => qa(d(), 'SELECT * FROM tenants ORDER BY name'))

  ipcMain.handle('tenants:create', (_e, data) => {
    const stmt = d().prepare('INSERT INTO tenants (name, phone, id_card, email) VALUES (?, ?, ?, ?)')
    return { id: stmt.run(data.name, data.phone, data.id_card, data.email).lastInsertRowid }
  })

  ipcMain.handle('summary:monthly', (_e, year, month) => {
    const d2 = d()
    const period = `${year}-${String(month).padStart(2, '0')}`
    const startDate = `${period}-01`
    const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD')

    const bills = q(d2, `
      SELECT COALESCE(SUM(amount_due),0) as receivable,
        COALESCE(SUM(amount_paid),0) as received
      FROM bills WHERE bill_period = ?
    `, period) || {}

    const arrears = q(d2, `
      SELECT COALESCE(SUM(amount_due - amount_paid),0) as total
      FROM bills WHERE bill_period <= ? AND status != 'paid'
    `, period)?.total || 0

    const refunds = q(d2, `
      SELECT COALESCE(SUM(refund_amount),0) as total,
        COALESCE(SUM(CASE WHEN payment_status='paid' THEN refund_amount ELSE 0 END),0) as paid
      FROM refunds WHERE strftime('%Y-%m', terminate_date) = ?
    `, period) || {}

    const refundsByStatus = qa(d2, `
      SELECT payment_status, COUNT(*) as count, COALESCE(SUM(refund_amount),0) as amount
      FROM refunds WHERE strftime('%Y-%m', terminate_date) = ?
      GROUP BY payment_status
    `, period)

    const badDebt = q(d2, `
      SELECT COALESCE(SUM(amount_due - amount_paid),0) as total
      FROM bills WHERE strftime('%Y-%m', due_date) <= date(?, '-6 months') AND status != 'paid'
    `, period)?.total || 0

    const unmatchedCount = q(d2, 'SELECT COUNT(*) as cnt FROM transactions WHERE matched=0 AND txn_date BETWEEN ? AND ?', startDate, endDate)?.cnt || 0
    const unmatchedAmount = q(d2, 'SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE matched=0 AND txn_date BETWEEN ? AND ?', startDate, endDate)?.total || 0

    const depositsByStatus = qa(d2, `
      SELECT status, COUNT(*) as count, COALESCE(SUM(amount),0) as amount
      FROM deposits GROUP BY status
    `)

    const dailyReceived = qa(d2, `
      SELECT t.txn_date as date, COALESCE(SUM(t.amount),0) as amount
      FROM transactions t
      WHERE t.txn_date BETWEEN ? AND ?
      GROUP BY t.txn_date ORDER BY t.txn_date
    `, startDate, endDate)

    const billStatusBreakdown = qa(d2, `
      SELECT status, COUNT(*) as count, COALESCE(SUM(amount_due),0) as amount
      FROM bills WHERE bill_period = ? GROUP BY status
    `, period)

    return {
      period,
      receivable: bills.receivable || 0,
      received: bills.received || 0,
      arrears: arrears || 0,
      refundTotal: refunds.total || 0,
      refundPaid: refunds.paid || 0,
      refundsByStatus,
      badDebt: badDebt || 0,
      unmatchedCount,
      unmatchedAmount: unmatchedAmount || 0,
      depositsByStatus,
      dailyReceived,
      billStatusBreakdown
    }
  })

  ipcMain.handle('summary:yearly', (_e, year) => {
    const d2 = d()
    const months = []
    for (let m = 1; m <= 12; m++) {
      const period = `${year}-${String(m).padStart(2, '0')}`
      const bills = q(d2, `
        SELECT COALESCE(SUM(amount_due),0) as receivable, COALESCE(SUM(amount_paid),0) as received
        FROM bills WHERE bill_period = ?
      `, period) || {}
      const refunds = q(d2, `
        SELECT COALESCE(SUM(refund_amount),0) as total
        FROM refunds WHERE strftime('%Y-%m', terminate_date) = ?
      `, period) || {}
      months.push({ month: m, receivable: bills.receivable || 0, received: bills.received || 0, refund: refunds.total || 0 })
    }
    return months
  })

  ipcMain.handle('summary:reconciliation', (_e, period) => {
    const d2 = d()
    const unallocatedTxns = qa(d2, `
      SELECT t.id, t.txn_date, t.amount, t.payer, t.remark, t.txn_no,
        COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0) as allocated_amount,
        t.amount - COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0) as remaining_amount,
        'unallocated_txn' as diff_type
      FROM transactions t
      WHERE (t.amount - COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0)) > 0.005
        AND strftime('%Y-%m', t.txn_date) = ?
    `, period)

    const partialBills = qa(d2, `
      SELECT b.id, b.bill_period, b.amount_due, b.amount_paid, b.amount_due - b.amount_paid as unpaid_amount,
        r.room_no, t.name as tenant_name, 'partial_bill' as diff_type
      FROM bills b
      LEFT JOIN rooms r ON b.room_id = r.id
      LEFT JOIN tenants t ON b.tenant_id = t.id
      WHERE b.status = 'partial' AND b.bill_period = ?
    `, period)

    const failedRefunds = qa(d2, `
      SELECT r.id, r.refund_no, r.refund_amount, r.payment_status, r.terminate_reason, r.retry_count,
        rm.room_no, t.name as tenant_name, r.terminate_date,
        CASE WHEN r.payment_status = 'failed' THEN 'failed_refund' ELSE 'processing_refund' END as diff_type
      FROM refunds r
      LEFT JOIN rooms rm ON r.room_id = rm.id
      LEFT JOIN tenants t ON r.tenant_id = t.id
      WHERE r.payment_status IN ('failed', 'processing')
        AND strftime('%Y-%m', r.terminate_date) = ?
    `, period)

    return { unallocatedTxns, partialBills, failedRefunds }
  })

  ipcMain.handle('dashboard:overview', () => {
    const d2 = d()
    const unmatchedTxns = qa(d2, `
      SELECT t.*,
        COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0) as allocated_amount,
        t.amount - COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0) as remaining_amount
      FROM transactions t
      WHERE (t.amount - COALESCE((SELECT SUM(amount) FROM bill_matches WHERE transaction_id = t.id), 0)) > 0.005
      ORDER BY t.txn_date DESC
      LIMIT 20
    `)
    const partialBills = qa(d2, `
      SELECT b.*, r.room_no, t.name as tenant_name, c.monthly_rent,
        (b.amount_due - b.amount_paid) as unpaid_amount
      FROM bills b
      LEFT JOIN rooms r ON b.room_id = r.id
      LEFT JOIN tenants t ON b.tenant_id = t.id
      LEFT JOIN contracts c ON b.contract_id = c.id
      WHERE b.status = 'partial'
      ORDER BY b.bill_period DESC
    `)
    const unconfirmedMatches = qa(d2, `
      SELECT bm.*, b.id as bill_id, b.bill_period, b.amount_due, b.amount_paid, r.room_no, t.name as tenant_name,
        tx.amount as txn_amount, tx.payer, tx.txn_date, tx.txn_no, tx.remark
      FROM bill_matches bm
      LEFT JOIN bills b ON bm.bill_id = b.id
      LEFT JOIN rooms r ON b.room_id = r.id
      LEFT JOIN tenants t ON b.tenant_id = t.id
      LEFT JOIN transactions tx ON bm.transaction_id = tx.id
      WHERE bm.confirmed = 0
      ORDER BY bm.id DESC
    `)
    const stats = {
      unmatchedCount: unmatchedTxns.length,
      unmatchedAmount: unmatchedTxns.reduce((a: number, b: any) => a + (b.remaining_amount || 0), 0),
      partialCount: partialBills.length,
      partialAmount: partialBills.reduce((a: number, b: any) => a + (b.unpaid_amount || 0), 0),
      unconfirmedCount: unconfirmedMatches.length,
      unconfirmedAmount: unconfirmedMatches.reduce((a: number, b: any) => a + (b.amount || 0), 0)
    }
    return { unmatchedTxns, partialBills, unconfirmedMatches, stats }
  })

  ipcMain.handle('seed:demo', () => {
    const d2 = d()
    const exists = q(d2, 'SELECT COUNT(*) as cnt FROM rooms')?.cnt || 0
    if (exists > 0) return { success: true, skipped: true }
    const tx = d2.transaction(() => {
      const roomsData = [
        ['A101', 'A栋', 1, 35, 2800, 5600],
        ['A102', 'A栋', 1, 40, 3200, 6400],
        ['A201', 'A栋', 2, 35, 2800, 5600],
        ['A202', 'A栋', 2, 45, 3600, 7200],
        ['B101', 'B栋', 1, 50, 4000, 8000],
        ['B102', 'B栋', 1, 55, 4400, 8800],
        ['B201', 'B栋', 2, 50, 4000, 8000],
        ['B202', 'B栋', 2, 60, 4800, 9600]
      ]
      const roomStmt = d2.prepare('INSERT OR IGNORE INTO rooms (room_no, building, floor, area, monthly_rent, deposit_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      const roomIds: number[] = []
      for (const r of roomsData) {
        const res = roomStmt.run(r[0], r[1], r[2], r[3], r[4], r[5], 'rented')
        roomIds.push(Number(res.lastInsertRowid) || (q(d2, 'SELECT id FROM rooms WHERE room_no=?', r[0])?.id || 0))
      }

      const tenantsData = [
        ['张伟', '13800138001', '110101199001010001'],
        ['李娜', '13800138002', '110101199002020002'],
        ['王强', '13800138003', '110101199003030003'],
        ['刘芳', '13800138004', '110101199004040004'],
        ['陈明', '13800138005', '110101199005050005'],
        ['赵静', '13800138006', '110101199006060006']
      ]
      const tenantStmt = d2.prepare('INSERT OR IGNORE INTO tenants (name, phone, id_card) VALUES (?, ?, ?)')
      const tenantIds: number[] = []
      for (const t of tenantsData) {
        const res = tenantStmt.run(t[0], t[1], t[2])
        tenantIds.push(Number(res.lastInsertRowid) || (q(d2, 'SELECT id FROM tenants WHERE phone=?', t[1])?.id || 0))
      }

      const contracts = [
        { room: 0, tenant: 0, start: '2025-01-01', end: '2026-12-31', rent: 2800, deposit: 5600 },
        { room: 1, tenant: 1, start: '2025-03-15', end: '2026-03-14', rent: 3200, deposit: 6400 },
        { room: 2, tenant: 2, start: '2025-06-01', end: '2026-05-31', rent: 2800, deposit: 5600 },
        { room: 3, tenant: 3, start: '2024-12-01', end: '2025-11-30', rent: 3600, deposit: 7200 },
        { room: 4, tenant: 4, start: '2025-02-01', end: '2026-01-31', rent: 4000, deposit: 8000 },
        { room: 5, tenant: 5, start: '2025-04-01', end: '2026-03-31', rent: 4400, deposit: 8800 }
      ]
      const contractStmt = d2.prepare('INSERT OR IGNORE INTO contracts (room_id, tenant_id, start_date, end_date, monthly_rent, deposit, payment_cycle, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      const contractIds: number[] = []
      for (let i = 0; i < contracts.length; i++) {
        const c = contracts[i]
        const res = contractStmt.run(roomIds[c.room], tenantIds[c.tenant], c.start, c.end, c.rent, c.deposit, 'monthly', i === 3 ? 'terminated' : 'active')
        contractIds.push(Number(res.lastInsertRowid) || (q(d2, 'SELECT id FROM contracts WHERE room_id=? AND tenant_id=?', roomIds[c.room], tenantIds[c.tenant])?.id || 0))
      }

      const billStmt = d2.prepare('INSERT OR IGNORE INTO bills (contract_id, room_id, tenant_id, bill_period, bill_type, amount_due, due_date, status, amount_paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      const now = dayjs()
      for (let i = 0; i < contracts.length; i++) {
        const c = contracts[i]
        const startPeriod = dayjs(c.start)
        for (let offset = 0; offset < 12; offset++) {
          const period = startPeriod.add(offset, 'month')
          if (period.isAfter(now)) continue
          const periodStr = period.format('YYYY-MM')
          const dueDate = period.startOf('month').add(5, 'day').format('YYYY-MM-DD')
          const paid = offset < 8 || (i !== 3)
          const partial = offset === 8 && i === 1
          billStmt.run(contractIds[i], roomIds[c.room], tenantIds[c.tenant], periodStr, 'rent', c.rent, dueDate,
            paid ? 'paid' : (partial ? 'partial' : 'unpaid'),
            paid ? c.rent : (partial ? c.rent * 0.6 : 0))
        }
      }

      const txnStmt = d2.prepare('INSERT OR IGNORE INTO transactions (txn_date, amount, payer, payee, payment_method, remark, txn_no, matched) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      const matchStmt = d2.prepare('INSERT OR IGNORE INTO bill_matches (bill_id, transaction_id, amount, match_type, confirmed) VALUES (?, ?, ?, ?, ?)')
      const bills = qa(d2, 'SELECT b.*, r.room_no, t.name as tenant_name FROM bills b LEFT JOIN rooms r ON b.room_id=r.id LEFT JOIN tenants t ON b.tenant_id=t.id WHERE b.status IN (\'paid\',\'partial\') ORDER BY bill_period')

      let txnCounter = 0
      for (const bill of bills) {
        const txnDate = dayjs(bill.due_date).subtract(1, 'day').format('YYYY-MM-DD')
        const payAmount = bill.amount_paid
        if (payAmount <= 0) continue
        txnCounter++
        const txnNo = `TXN${dayjs(txnDate).format('YYYYMMDD')}${String(txnCounter).padStart(6, '0')}`
        const txnRes = txnStmt.run(txnDate, payAmount, bill.tenant_name, '租赁公司', '银行转账', `${bill.room_no} ${bill.bill_period}租金`, txnNo, 1)
        const txnId = Number(txnRes.lastInsertRowid) || (q(d2, 'SELECT id FROM transactions WHERE txn_no=?', txnNo)?.id || 0)
        matchStmt.run(bill.id, txnId, payAmount, 'auto', 1)
      }

      const extraTxns = [
        { date: now.subtract(3, 'day').format('YYYY-MM-DD'), amt: 3200, payer: '李娜', remark: 'A102 10月租金', matched: 0 },
        { date: now.subtract(5, 'day').format('YYYY-MM-DD'), amt: 2800, payer: '王强', remark: 'A201 下期租金', matched: 0 },
        { date: now.subtract(7, 'day').format('YYYY-MM-DD'), amt: 1500, payer: '张伟', remark: '补交部分', matched: 0 },
        { date: now.subtract(1, 'day').format('YYYY-MM-DD'), amt: 8000, payer: '陈明', remark: 'B101 押金', matched: 0 }
      ]
      for (const et of extraTxns) {
        txnCounter++
        const txnNo = `TXN${dayjs(et.date).format('YYYYMMDD')}${String(txnCounter).padStart(6, '0')}`
        txnStmt.run(et.date, et.amt, et.payer, '租赁公司', '银行转账', et.remark, txnNo, et.matched)
      }

      const depStmt = d2.prepare('INSERT OR IGNORE INTO deposits (contract_id, room_id, tenant_id, deposit_type, amount, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?)')
      const depositStatuses = ['collected', 'collected', 'collected', 'refunded', 'frozen', 'disputed']
      const depositReasons = ['', '', '', '合同正常结束', '租客损坏墙面待评估', '租客对扣水电费有争议']
      for (let i = 0; i < contracts.length; i++) {
        const c = contracts[i]
        depStmt.run(contractIds[i], roomIds[c.room], tenantIds[c.tenant], 'rent', c.deposit, depositStatuses[i], depositReasons[i])
      }

      const refundStmt = d2.prepare('INSERT OR IGNORE INTO refunds (refund_no, contract_id, room_id, tenant_id, deposit_id, terminate_reason, terminate_date, deposit_amount, deduction_details, total_deduction, refund_amount, approver, approved_at, payment_status, payment_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      const deposits = qa(d2, 'SELECT * FROM deposits')
      const terminatedContractIndex = 3
      const termContract = contracts[terminatedContractIndex]
      const depForRefund = deposits.find(d => d.contract_id === contractIds[terminatedContractIndex])
      const deductions = JSON.stringify([{ type: '清洁费', amount: 300 }, { type: '维修费', amount: 200 }])
      refundStmt.run('RF20251130001', contractIds[terminatedContractIndex], roomIds[termContract.room], tenantIds[termContract.tenant],
        depForRefund ? depForRefund.id : null, '租客提前退租', '2025-11-30', termContract.deposit, deductions, 500,
        termContract.deposit - 500, '财务主管A', '2025-12-01 10:00:00', 'paid', '2025-12-02')

      const pendingDeposit = deposits.find(d => d.status === 'frozen')
      if (pendingDeposit) {
        const contractForPending = contracts.find(c => roomIds[c.room] === pendingDeposit.room_id)
        if (contractForPending) {
          const idx = contracts.indexOf(contractForPending)
          refundStmt.run('RF' + now.format('YYYYMMDDHHmmss'), contractIds[idx], pendingDeposit.room_id, pendingDeposit.tenant_id,
            pendingDeposit.id, '合同到期', now.subtract(2, 'day').format('YYYY-MM-DD'), contractForPending.deposit,
            JSON.stringify([{ type: '墙面修复', amount: 800 }]), 800, contractForPending.deposit - 800,
            null, null, 'pending', null)
        }
      }
    })
    tx()
    return { success: true }
  })
}
