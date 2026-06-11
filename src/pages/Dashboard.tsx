import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Tag, Space, Button, Tabs, Statistic, Row, Col, Badge, message,
  Empty, Modal, Checkbox, Alert, Tooltip, Select
} from 'antd'
import {
  DashboardOutlined, UnorderedListOutlined, WarningOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  LinkOutlined, ReloadOutlined, ThunderboltOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'

const { TabPane } = Tabs
const { Option } = Select

export default function Dashboard() {
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('unmatched')
  const [data, setData] = useState<any>({
    unmatchedTxns: [],
    partialBills: [],
    unconfirmedMatches: [],
    stats: { unmatchedCount: 0, unmatchedAmount: 0, partialCount: 0, partialAmount: 0, unconfirmedCount: 0, unconfirmedAmount: 0 }
  })
  const [selectedUnmatched, setSelectedUnmatched] = useState<number[]>([])
  const [selectedUnconfirmed, setSelectedUnconfirmed] = useState<number[]>([])
  const [batchMatchOpen, setBatchMatchOpen] = useState(false)
  const [batchTargetBill, setBatchTargetBill] = useState<any>(null)
  const navigate = useNavigate()

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await window.api.dashboard.overview()
      setData(res)
    } catch (e) {
      message.error('加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const navigateToMatching = (params?: Record<string, string>) => {
    const search = params ? '?' + new URLSearchParams(params).toString() : ''
    navigate('/bill-matching' + search)
  }

  const handleConfirmOneMatch = async (matchId: number) => {
    try {
      await window.api.bills.confirmMatch(matchId, true)
      message.success('已确认')
      loadData()
    } catch { message.error('操作失败') }
  }

  const handleBatchConfirm = async () => {
    if (selectedUnconfirmed.length === 0) return
    Modal.confirm({
      title: `批量确认 ${selectedUnconfirmed.length} 条匹配记录？`,
      content: '确认后所有选中的匹配记录将被标记为"已确认"',
      okText: '全部确认',
      okType: 'primary',
      onOk: async () => {
        try {
          await window.api.bills.batchConfirm(selectedUnconfirmed)
          message.success(`已确认 ${selectedUnconfirmed.length} 条`)
          setSelectedUnconfirmed([])
          loadData()
        } catch { message.error('批量确认失败') }
      }
    })
  }

  const handleBatchAllocate = () => {
    if (selectedUnmatched.length === 0) return
    const selectedTxns = data.unmatchedTxns.filter((t: any) => selectedUnmatched.includes(t.id))
    const payer = selectedTxns[0]?.payer
    const samePayer = selectedTxns.every((t: any) => t.payer === payer)
    const totalRemaining = selectedTxns.reduce((a: number, b: any) => a + (b.remaining_amount || b.amount), 0)
    if (!samePayer) {
      message.warning('批量分配仅支持同一付款人的流水')
      return
    }
    const matchedBills = data.partialBills.filter((b: any) => b.tenant_name === payer)
    setBatchTargetBill({ txns: selectedTxns, payer, totalRemaining, matchedBills })
    setBatchMatchOpen(true)
  }

  const executeBatchMatch = async () => {
    if (!batchTargetBill) return
    try {
      const matches = batchTargetBill.matchedBills.map((bill: any) => ({
        billId: bill.id,
        transactionId: batchTargetBill.txns[0]?.id,
        amount: Math.min(batchTargetBill.totalRemaining, bill.unpaid_amount),
        matchType: 'manual'
      }))
      if (batchTargetBill.txns.length > 1) {
        for (const txn of batchTargetBill.txns) {
          for (const bill of batchTargetBill.matchedBills.slice(0, 1)) {
            const remain = bill.unpaid_amount
            const txnRemain = txn.remaining_amount || txn.amount
            await window.api.bills.match({
              billId: bill.id,
              transactionId: txn.id,
              amount: Number(Math.min(txnRemain, remain).toFixed(2)),
              matchType: 'manual'
            })
          }
        }
      } else {
        const res = await window.api.bills.batchMatch(matches)
        message.success(`批量分配完成，成功 ${res.results?.filter((r: any) => !r.skipped).length || 0} 条`)
      }
      setBatchMatchOpen(false)
      setSelectedUnmatched([])
      loadData()
    } catch { message.error('批量分配失败') }
  }

  const unmatchedColumns = [
    {
      title: <Checkbox indeterminate={selectedUnmatched.length > 0 && selectedUnmatched.length < data.unmatchedTxns.length}
        checked={selectedUnmatched.length === data.unmatchedTxns.length && data.unmatchedTxns.length > 0}
        onChange={e => setSelectedUnmatched(e.target.checked ? data.unmatchedTxns.map((t: any) => t.id) : [])} />,
      width: 40,
      render: (_: any, r: any) => <Checkbox checked={selectedUnmatched.includes(r.id)}
        onChange={e => setSelectedUnmatched(e.target.checked ? [...selectedUnmatched, r.id] : selectedUnmatched.filter(id => id !== r.id))} />
    },
    { title: '日期', dataIndex: 'txn_date', width: 110 },
    { title: '付款人', dataIndex: 'payer', width: 100 },
    {
      title: '剩余可分配', dataIndex: 'remaining_amount', width: 150,
      sorter: (a: any, b: any) => (a.remaining_amount || a.amount) - (b.remaining_amount || b.amount),
      render: (v: number, r: any) => {
        const allocated = r.allocated_amount || 0
        const remaining = v || r.amount
        const isPartial = allocated > 0.005
        return (
          <Space direction="vertical" size={0} style={{ lineHeight: 1.4 }}>
            <span style={{ color: '#52c41a', fontWeight: 600 }}>
              ¥{remaining.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </span>
            {isPartial && (
              <span style={{ color: '#999', fontSize: 12 }}>
                总额 ¥{r.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                · 已分配 ¥{allocated.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </span>
            )}
          </Space>
        )
      }
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    {
      title: '操作', width: 120, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Button type="primary" size="small" icon={<LinkOutlined />}
          onClick={() => navigateToMatching({ payer: r.payer || '' })}>去匹配</Button>
      )
    }
  ]

  const partialColumns = [
    { title: '房间', dataIndex: 'room_no', width: 90 },
    { title: '租客', dataIndex: 'tenant_name', width: 90 },
    { title: '账期', dataIndex: 'bill_period', width: 90 },
    {
      title: '账单金额', dataIndex: 'amount_due', width: 120,
      render: (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    },
    {
      title: '已收', dataIndex: 'amount_paid', width: 120,
      render: (v: number) => <span style={{ color: '#52c41a' }}>¥{v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    },
    {
      title: '待收', dataIndex: 'unpaid_amount', width: 120,
      render: (v: number) => <span style={{ color: '#cf1322', fontWeight: 600 }}>¥{v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    },
    {
      title: '操作', width: 120, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Button type="primary" size="small" icon={<LinkOutlined />}
          onClick={() => navigateToMatching({ room: r.room_no || '', period: r.bill_period || '' })}>继续匹配</Button>
      )
    }
  ]

  const unconfirmedColumns = [
    {
      title: <Checkbox indeterminate={selectedUnconfirmed.length > 0 && selectedUnconfirmed.length < data.unconfirmedMatches.length}
        checked={selectedUnconfirmed.length === data.unconfirmedMatches.length && data.unconfirmedMatches.length > 0}
        onChange={e => setSelectedUnconfirmed(e.target.checked ? data.unconfirmedMatches.map((m: any) => m.id) : [])} />,
      width: 40,
      render: (_: any, r: any) => <Checkbox checked={selectedUnconfirmed.includes(r.id)}
        onChange={e => setSelectedUnconfirmed(e.target.checked ? [...selectedUnconfirmed, r.id] : selectedUnconfirmed.filter(id => id !== r.id))} />
    },
    { title: '房间', dataIndex: 'room_no', width: 80 },
    { title: '租客', dataIndex: 'tenant_name', width: 80 },
    { title: '账期', dataIndex: 'bill_period', width: 80 },
    { title: '付款人', dataIndex: 'payer', width: 80 },
    {
      title: '匹配金额', dataIndex: 'amount', width: 110,
      render: (v: number) => <span style={{ color: '#fa8c16', fontWeight: 600 }}>¥{v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    },
    { title: '流水日期', dataIndex: 'txn_date', width: 100 },
    {
      title: '方式', dataIndex: 'match_type', width: 80,
      render: (v: string) => <Tag color={v === 'auto' ? 'default' : 'geekblue'}>{v === 'auto' ? '自动' : '人工'}</Tag>
    },
    {
      title: '操作', width: 120, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" type="primary" icon={<CheckCircleOutlined />}
            onClick={() => handleConfirmOneMatch(r.id)}>确认</Button>
          <Button size="small" onClick={() => navigateToMatching({ room: r.room_no || '' })}>查看</Button>
        </Space>
      )
    }
  ]

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title"><DashboardOutlined /> 核对工作台</div>
        <Space>
          <span style={{ color: '#666' }}>{dayjs().format('YYYY-MM-DD HH:mm')}</span>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small" hoverable style={{ cursor: 'pointer' }} onClick={() => setActiveTab('unmatched')}>
            <Statistic title={<Space><WarningOutlined style={{ color: '#faad14' }} /> 待匹配流水</Space>}
              value={data.stats.unmatchedCount} suffix="笔" valueStyle={{ color: '#faad14' }} />
            <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
              未分配 ¥{Number(data.stats.unmatchedAmount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" hoverable style={{ cursor: 'pointer' }} onClick={() => setActiveTab('partial')}>
            <Statistic title={<Space><ClockCircleOutlined style={{ color: '#1890ff' }} /> 部分到账账单</Space>}
              value={data.stats.partialCount} suffix="笔" valueStyle={{ color: '#1890ff' }} />
            <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
              待收 ¥{Number(data.stats.partialAmount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" hoverable style={{ cursor: 'pointer' }} onClick={() => setActiveTab('unconfirmed')}>
            <Statistic title={<Space><ExclamationCircleOutlined style={{ color: '#f5222d' }} /> 已匹配待确认</Space>}
              value={data.stats.unconfirmedCount} suffix="笔" valueStyle={{ color: '#f5222d' }} />
            <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
              涉及 ¥{Number(data.stats.unconfirmedAmount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Card>
        </Col>
      </Row>

      {(selectedUnmatched.length > 0 || selectedUnconfirmed.length > 0) && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={
            <Space>
              {selectedUnmatched.length > 0 && (
                <span>已选 <strong>{selectedUnmatched.length}</strong> 条待匹配流水
                  <Button size="small" type="primary" icon={<ThunderboltOutlined />} style={{ marginLeft: 8 }}
                    onClick={handleBatchAllocate}>批量分配</Button>
                </span>
              )}
              {selectedUnconfirmed.length > 0 && (
                <span>已选 <strong>{selectedUnconfirmed.length}</strong> 条待确认
                  <Button size="small" type="primary" icon={<CheckCircleOutlined />} style={{ marginLeft: 8 }}
                    onClick={handleBatchConfirm}>批量确认</Button>
                </span>
              )}
              <Button size="small" onClick={() => { setSelectedUnmatched([]); setSelectedUnconfirmed([]) }}>取消选择</Button>
            </Space>
          }
        />
      )}

      <Card size="small">
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab={<Badge count={data.stats.unmatchedCount} offset={[10, 2]}><Space><UnorderedListOutlined /> 待匹配流水</Space></Badge>} key="unmatched">
            <Table rowKey="id" size="small" loading={loading} columns={unmatchedColumns}
              dataSource={data.unmatchedTxns} pagination={{ pageSize: 10, showSizeChanger: false }}
              locale={{ emptyText: <Empty description="全部匹配完成，做得好！" /> }} />
          </TabPane>
          <TabPane tab={<Badge count={data.stats.partialCount} offset={[10, 2]}><Space><ClockCircleOutlined /> 部分到账账单</Space></Badge>} key="partial">
            <Table rowKey="id" size="small" loading={loading} columns={partialColumns}
              dataSource={data.partialBills} pagination={{ pageSize: 10, showSizeChanger: false }}
              locale={{ emptyText: <Empty description="没有部分到账的账单" /> }} />
          </TabPane>
          <TabPane tab={<Badge count={data.stats.unconfirmedCount} offset={[10, 2]}><Space><ExclamationCircleOutlined /> 待确认匹配</Space></Badge>} key="unconfirmed">
            <Table rowKey="id" size="small" loading={loading} columns={unconfirmedColumns}
              dataSource={data.unconfirmedMatches} pagination={{ pageSize: 10, showSizeChanger: false }}
              locale={{ emptyText: <Empty description="所有匹配都已确认，做得好！" /> }} />
          </TabPane>
        </Tabs>
      </Card>

      <Modal title="批量分配预览" open={batchMatchOpen} onOk={executeBatchMatch}
        onCancel={() => setBatchMatchOpen(false)} okText="确认分配" width={620}>
        {batchTargetBill && (
          <div>
            <Alert type="info" showIcon style={{ marginBottom: 16 }}
              message={`付款人：${batchTargetBill.payer} | 总剩余可分配：¥${batchTargetBill.totalRemaining.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`}
            />
            <div style={{ fontWeight: 500, marginBottom: 8 }}>将分配到以下账单：</div>
            <Table rowKey="id" size="small" pagination={false}
              dataSource={batchTargetBill.matchedBills}
              columns={[
                { title: '房间', dataIndex: 'room_no', width: 80 },
                { title: '租客', dataIndex: 'tenant_name', width: 80 },
                { title: '账期', dataIndex: 'bill_period', width: 80 },
                { title: '待收', dataIndex: 'unpaid_amount', width: 120,
                  render: (v: number) => <span style={{ color: '#cf1322' }}>¥{v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span> }
              ]}
            />
            {batchTargetBill.matchedBills.length === 0 && (
              <Empty description="该付款人名下没有部分到账的账单，请在账单匹配页面手动操作" />
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
