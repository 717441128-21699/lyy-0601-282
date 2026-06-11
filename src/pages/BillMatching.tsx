import React, { useEffect, useState } from 'react'
import {
  Table, Button, Modal, message, Space, Tag, Form, Select, InputNumber,
  Card, Row, Col, Tabs, Input, Tooltip, Checkbox, List, Empty, Divider, Badge
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  LinkOutlined, CheckCircleOutlined, CloseCircleOutlined, SearchOutlined,
  ThunderboltOutlined, ReloadOutlined, PlusOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'

interface Bill {
  id: number
  room_id: number
  tenant_id: number
  contract_id?: number
  bill_period: string
  bill_type: string
  amount_due: number
  amount_paid: number
  due_date: string
  status: 'unpaid' | 'partial' | 'paid'
  remark?: string
  room_no: string
  tenant_name: string
  matches?: string
}

interface Txn {
  id: number
  txn_date: string
  amount: number
  payer: string
  remark: string
  txn_no: string
  matched: number
}

const { Option } = Select
const { TabPane } = Tabs

const statusColor: Record<string, string> = {
  unpaid: 'red',
  partial: 'orange',
  paid: 'green'
}
const statusText: Record<string, string> = {
  unpaid: '未缴清',
  partial: '部分缴清',
  paid: '已缴清'
}

const BillMatching: React.FC = () => {
  const [bills, setBills] = useState<Bill[]>([])
  const [unmatchedTxns, setUnmatchedTxns] = useState<Txn[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [statusFilter, setStatusFilter] = useState<string>()
  const [searchText, setSearchText] = useState('')

  const [matchOpen, setMatchOpen] = useState(false)
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [selectedTxns, setSelectedTxns] = useState<Map<number, number>>(new Map())
  const [matchForm] = Form.useForm()

  const [autoRunLoading, setAutoRunLoading] = useState(false)

  const loadBills = async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (statusFilter) params.status = statusFilter
      const res = await window.api.bills.list(params)
      let filtered = res.data
      if (searchText) {
        const s = searchText.toLowerCase()
        filtered = filtered.filter((b: Bill) =>
          b.room_no?.toLowerCase().includes(s) ||
          b.tenant_name?.toLowerCase().includes(s) ||
          b.bill_period.includes(s)
        )
      }
      setBills(filtered)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }

  const loadUnmatched = async () => {
    try {
      const res = await window.api.bills.getUnmatched()
      setUnmatchedTxns(res.unmatchedTxns || [])
    } catch {}
  }

  useEffect(() => {
    loadBills()
    loadUnmatched()
  }, [page, pageSize, statusFilter])

  useEffect(() => { loadBills() }, [searchText])

  const openMatch = (bill: Bill) => {
    setSelectedBill(bill)
    setSelectedTxns(new Map())
    matchForm.resetFields()
    setMatchOpen(true)
  }

  const toggleTxn = (txnId: number, amount: number, checked: boolean) => {
    const next = new Map(selectedTxns)
    if (checked) {
      next.set(txnId, amount)
    } else {
      next.delete(txnId)
    }
    setSelectedTxns(next)
  }

  const handleMatchSubmit = async () => {
    if (!selectedBill) return
    if (selectedTxns.size === 0) {
      message.warning('请至少选择一条流水')
      return
    }
    const remain = selectedBill.amount_due - selectedBill.amount_paid
    const selectedTotal = Array.from(selectedTxns.values()).reduce((a, b) => a + b, 0)
    try {
      for (const [txnId, amount] of selectedTxns) {
        const alloc = selectedTotal > remain
          ? (amount / selectedTotal) * remain
          : amount
        await window.api.bills.match({
          billId: selectedBill.id,
          transactionId: txnId,
          amount: Number(alloc.toFixed(2)),
          matchType: 'manual'
        })
      }
      message.success('匹配成功')
      setMatchOpen(false)
      loadBills()
      loadUnmatched()
    } catch (e: any) {
      message.error('匹配失败：' + e.message)
    }
  }

  const runAutoMatch = async () => {
    setAutoRunLoading(true)
    try {
      let count = 0
      const { unmatchedTxns: txns, unpaidBills } = await window.api.bills.getUnmatched()
      for (const txn of txns || []) {
        const matches = (unpaidBills || []).filter((b: any) => {
          const remain = b.amount_due - (b.amount_paid || 0)
          if (remain <= 0) return false
          const payerMatch = b.tenant_name && txn.payer && b.tenant_name === txn.payer
          const roomMatch = txn.remark?.includes(b.room_no)
          const amountMatch = Math.abs(txn.amount - remain) < 0.01 || txn.amount <= remain
          return amountMatch && (payerMatch || roomMatch)
        })
        for (const bill of matches.slice(0, 1)) {
          const remain = bill.amount_due - (bill.amount_paid || 0)
          const alloc = Math.min(txn.amount, remain)
          try {
            await window.api.bills.match({
              billId: bill.id, transactionId: txn.id, amount: Number(alloc.toFixed(2)), matchType: 'auto'
            })
            count++
          } catch {}
        }
      }
      message.success(`自动匹配完成，成功 ${count} 条`)
      loadBills()
      loadUnmatched()
    } catch (e: any) {
      message.error('自动匹配失败')
    } finally {
      setAutoRunLoading(false)
    }
  }

  const handleConfirmOneMatch = async (matchId: number, confirmed: boolean) => {
    try {
      await window.api.bills.confirmMatch(matchId, confirmed)
      message.success(confirmed ? '已确认' : '已取消确认')
      loadBills()
    } catch (e: any) {
      message.error('操作失败')
    }
  }

  const parseMatches = (s?: string) => {
    if (!s) return []
    try {
      const arr = JSON.parse('[' + s + ']')
      return Array.isArray(arr) ? arr : []
    } catch { return [] }
  }

  const columns: ColumnsType<Bill> = [
    { title: '账期', dataIndex: 'bill_period', width: 110, fixed: 'left' },
    { title: '房间号', dataIndex: 'room_no', width: 100 },
    { title: '租客', dataIndex: 'tenant_name', width: 110 },
    {
      title: '应缴', dataIndex: 'amount_due', width: 110,
      render: v => <span>¥{Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    },
    {
      title: '已缴', dataIndex: 'amount_paid', width: 110,
      render: v => <span className="amount-positive">¥{Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    },
    {
      title: '欠缴', width: 110,
      render: (_, r) => <span className="amount-negative">¥{(r.amount_due - r.amount_paid).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    },
    { title: '截止日', dataIndex: 'due_date', width: 110 },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: v => <Tag color={statusColor[v]}>{statusText[v]}</Tag>
    },
    {
      title: '匹配记录', width: 340,
      render: (_, r) => {
        const ms = parseMatches(r.matches)
        if (ms.length === 0) return <span style={{ color: '#999' }}>无</span>
        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {ms.map((m: any, i: number) => (
              <div key={i} style={{
                padding: '6px 8px',
                background: m.confirmed ? '#f6ffed' : '#fffbe6',
                border: `1px solid ${m.confirmed ? '#b7eb8f' : '#ffe58f'}`,
                borderRadius: 4,
                fontSize: 12,
                lineHeight: 1.6
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <Badge status={m.confirmed ? 'success' : 'warning'} text={
                      <strong style={{ color: m.confirmed ? '#389e0d' : '#d48806' }}>
                        ¥{Number(m.amount).toFixed(2)}
                      </strong>
                    } />
                    {m.payer && <Tag color="blue" style={{ margin: 0 }}>{m.payer}</Tag>}
                    <Tag color={m.match_type === 'auto' ? 'default' : 'geekblue'}>
                      {m.match_type === 'auto' ? '自动匹配' : '人工匹配'}
                    </Tag>
                  </Space>
                  {m.confirmed
                    ? <Button size="small" type="text" danger
                        onClick={(e) => { e.stopPropagation(); handleConfirmOneMatch(m.id, false) }}>取消确认</Button>
                    : <Button size="small" type="link"
                        onClick={(e) => { e.stopPropagation(); handleConfirmOneMatch(m.id, true) }}>确认</Button>
                  }
                </div>
                <div style={{ color: '#999', marginTop: 2 }}>
                  {m.txn_date} · {m.txn_no || '—'}
                </div>
              </div>
            ))}
          </Space>
        )
      }
    },
    {
      title: '操作', width: 180, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Button size="small" type="primary" ghost icon={<LinkOutlined />} onClick={() => openMatch(r)}>匹配流水</Button>
        </Space>
      )
    }
  ]

  const unpaid = bills.filter(b => b.status !== 'paid')
  const totalDue = bills.reduce((a, b) => a + b.amount_due, 0)
  const totalPaid = bills.reduce((a, b) => a + b.amount_paid, 0)
  const totalArrear = totalDue - totalPaid
  const unmatchedSum = unmatchedTxns.reduce((a, t) => a + t.amount, 0)

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">账单匹配</div>
        <Space>
          <Button
            icon={<ThunderboltOutlined />}
            type="primary"
            onClick={runAutoMatch}
            loading={autoRunLoading}
          >自动匹配</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { loadBills(); loadUnmatched() }}>刷新</Button>
        </Space>
      </div>

      <div className="stat-cards">
        <div className="stat-card blue">
          <div className="label">应收总额</div>
          <div className="value">¥{totalDue.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">共 {bills.length} 张账单</div>
        </div>
        <div className="stat-card green">
          <div className="label">实收总额</div>
          <div className="value">¥{totalPaid.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">占比 {totalDue > 0 ? ((totalPaid / totalDue) * 100).toFixed(1) : 0}%</div>
        </div>
        <div className="stat-card red">
          <div className="label">欠费总额</div>
          <div className="value">¥{totalArrear.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">{unpaid.length} 张未结清</div>
        </div>
        <div className="stat-card orange">
          <div className="label">待匹配流水</div>
          <div className="value">{unmatchedTxns.length} 条</div>
          <div className="sub">¥{unmatchedSum.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      <Card style={{ marginBottom: 16 }} size="small">
        <Row gutter={24} align="middle">
          <Col span={6}>
            <Select
              placeholder="全部状态"
              allowClear
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={v => { setStatusFilter(v); setPage(1) }}
            >
              <Option value="unpaid">未缴清</Option>
              <Option value="partial">部分缴清</Option>
              <Option value="paid">已缴清</Option>
            </Select>
          </Col>
          <Col span={8}>
            <Input
              placeholder="搜索房间号 / 租客姓名 / 账期"
              prefix={<SearchOutlined />}
              allowClear
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </Col>
          <Col span={10} style={{ textAlign: 'right', color: '#666', fontSize: 13 }}>
            提示：选择账单后点击「匹配流水」可关联收款记录，支持部分收款、多人付款后人工确认
          </Col>
        </Row>
      </Card>

      <Tabs defaultActiveKey="bills">
        <TabPane tab={`账单列表 (${total})`} key="bills">
          <Table<Bill>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={bills}
            scroll={{ x: 1300 }}
            pagination={{
              current: page, pageSize, total, showSizeChanger: true,
              onChange: (p, ps) => { setPage(p); setPageSize(ps) }
            }}
          />
        </TabPane>
        <TabPane tab={`未匹配流水 (${unmatchedTxns.length})`} key="txns">
          <Card>
            {unmatchedTxns.length === 0 ? <Empty description="暂无未匹配流水" /> : (
              <List
                dataSource={unmatchedTxns}
                renderItem={(t: Txn) => (
                  <List.Item
                    key={t.id}
                    actions={[<Button size="small" type="link" onClick={() => {
                      message.info('请切换到账单列表，选择目标账单进行匹配')
                    }}>去匹配</Button>]}
                  >
                    <List.Item.Meta
                      avatar={<div style={{
                        width: 40, height: 40, background: '#e6f4ff', borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#1677ff', fontWeight: 600
                      }}>{t.payer?.[0] || '?'}</div>}
                      title={
                        <Space>
                          <strong style={{ fontSize: 14 }}>{t.payer}</strong>
                          <Tag color="orange">未匹配</Tag>
                          <span style={{ color: '#999', fontSize: 12 }}>{t.txn_no}</span>
                        </Space>
                      }
                      description={
                        <Space size={20}>
                          <span>日期：{t.txn_date}</span>
                          <span className="amount-positive" style={{ fontSize: 16, fontWeight: 600 }}>
                            ¥{t.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </span>
                          {t.remark && <span style={{ color: '#666' }}>备注：{t.remark}</span>}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </TabPane>
      </Tabs>

      <Modal
        title={selectedBill ? `匹配流水 - ${selectedBill.room_no} / ${selectedBill.bill_period}` : '匹配流水'}
        open={matchOpen}
        onOk={handleMatchSubmit}
        onCancel={() => setMatchOpen(false)}
        okText="确认匹配"
        cancelText="取消"
        width={760}
        destroyOnClose
      >
        {selectedBill && (
          <div>
            <Card size="small" style={{ background: '#f6ffed', marginBottom: 16 }}>
              <Row gutter={24}>
                <Col span={6}><div style={{ color: '#666' }}>房间</div><div style={{ fontWeight: 600 }}>{selectedBill.room_no}</div></Col>
                <Col span={6}><div style={{ color: '#666' }}>租客</div><div style={{ fontWeight: 600 }}>{selectedBill.tenant_name}</div></Col>
                <Col span={6}><div style={{ color: '#666' }}>账期</div><div style={{ fontWeight: 600 }}>{selectedBill.bill_period}</div></Col>
                <Col span={6}>
                  <div style={{ color: '#666' }}>待收金额</div>
                  <div style={{ fontWeight: 600, color: '#cf1322', fontSize: 18 }}>
                    ¥{(selectedBill.amount_due - selectedBill.amount_paid).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </div>
                </Col>
              </Row>
            </Card>

            <div style={{ fontWeight: 500, marginBottom: 10 }}>
              选择流水用于匹配（可多选，金额按比例分配，支持部分收款和多人付款）
            </div>

            <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
              {unmatchedTxns.length === 0 ? <Empty description="暂无可选流水" /> : (
                unmatchedTxns.map(t => (
                  <div key={t.id} style={{
                    padding: '10px 12px', marginBottom: 6,
                    background: selectedTxns.has(t.id) ? '#e6f4ff' : '#fafafa',
                    borderRadius: 6, border: selectedTxns.has(t.id) ? '1px solid #91caff' : '1px solid #f0f0f0'
                  }}>
                    <Row align="middle">
                      <Col span={1}>
                        <Checkbox
                          checked={selectedTxns.has(t.id)}
                          onChange={e => toggleTxn(t.id, t.amount, e.target.checked)}
                        />
                      </Col>
                      <Col span={6}><strong>{t.payer}</strong></Col>
                      <Col span={6} style={{ color: '#1677ff', fontWeight: 600, fontSize: 15 }}>
                        ¥{t.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </Col>
                      <Col span={5} style={{ color: '#666', fontSize: 13 }}>{t.txn_date}</Col>
                      <Col span={6} style={{ color: '#666', fontSize: 12 }}>{t.remark || '—'}</Col>
                    </Row>
                  </div>
                ))
              )}
            </div>

            <Divider style={{ margin: '16px 0' }} />
            <Row justify="space-between">
              <Col>
                <Space size={30}>
                  <span style={{ color: '#666' }}>
                    已选 <strong style={{ color: '#1677ff' }}>{selectedTxns.size}</strong> 条流水
                  </span>
                  <span style={{ color: '#666' }}>
                    已选金额：<strong style={{ color: '#52c41a', fontSize: 18 }}>
                      ¥{Array.from(selectedTxns.values()).reduce((a, b) => a + b, 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </strong>
                  </span>
                </Space>
              </Col>
              <Col>
                <Space size={20}>
                  <span style={{ color: '#666' }}>
                    待收金额：<strong style={{ color: '#cf1322', fontSize: 18 }}>
                      ¥{(selectedBill.amount_due - selectedBill.amount_paid).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </strong>
                  </span>
                  <span style={{ color: '#666' }}>
                    剩余可分配：<strong style={{ color: '#fa8c16', fontSize: 18 }}>
                      ¥{Math.max(0, (selectedBill.amount_due - selectedBill.amount_paid) - Array.from(selectedTxns.values()).reduce((a, b) => a + b, 0)).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </strong>
                  </span>
                </Space>
              </Col>
            </Row>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default BillMatching
