import React, { useEffect, useState } from 'react'
import {
  Card, Row, Col, Select, Button, Space, Statistic, Table, Tag, Progress,
  Empty, DatePicker, Divider, Tabs, message
} from 'antd'
import {
  ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined,
  DollarCircleOutlined, WarningOutlined, RedoOutlined, DownloadOutlined
} from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'
import dayjs from 'dayjs'

const { Option } = Select
const { MonthPicker } = DatePicker
const { TabPane } = Tabs

const depositText: Record<string, string> = {
  collected: '已收取',
  frozen: '已冻结',
  deducted: '已扣减',
  refunded: '已退还',
  disputed: '争议中'
}
const depositColors: Record<string, string> = {
  collected: '#52c41a',
  frozen: '#1677ff',
  deducted: '#fa8c16',
  refunded: '#8c8c8c',
  disputed: '#ff4d4f'
}

const billStatusColors: Record<string, string> = {
  paid: '#52c41a',
  partial: '#fa8c16',
  unpaid: '#ff4d4f'
}
const billStatusText: Record<string, string> = {
  paid: '已缴清',
  partial: '部分缴清',
  unpaid: '未缴清'
}

const MonthlySummary: React.FC = () => {
  const now = dayjs()
  const [year, setYear] = useState(now.year())
  const [month, setMonth] = useState(now.month() + 1)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<any>(null)
  const [yearly, setYearly] = useState<any[]>([])
  const [reconcileData, setReconcileData] = useState<any>(null)
  const [reconcileLoading, setReconcileLoading] = useState(false)

  const period = `${year}-${String(month).padStart(2, '0')}`

  const loadReconcile = async () => {
    setReconcileLoading(true)
    try {
      const res = await window.api.summary.reconciliation(period)
      setReconcileData(res)
    } catch { message.error('加载对账数据失败') }
    finally { setReconcileLoading(false) }
  }

  const exportReconcile = () => {
    if (!reconcileData) return
    const allRows = [
      ...reconcileData.unallocatedTxns.map((r: any) => ({ type: '未分配流水', id: r.id, date: r.txn_date, room: '-', tenant: r.payer, amount: r.remaining_amount, detail: r.remark || '-' })),
      ...reconcileData.partialBills.map((r: any) => ({ type: '部分到账账单', id: r.id, date: r.bill_period, room: r.room_no, tenant: r.tenant_name, amount: r.unpaid_amount, detail: `已收${r.amount_paid}/${r.amount_due}` })),
      ...reconcileData.failedRefunds.map((r: any) => ({ type: r.payment_status === 'failed' ? '失败退款' : '处理中退款', id: r.refund_no, date: r.terminate_date, room: r.room_no, tenant: r.tenant_name, amount: r.refund_amount, detail: r.terminate_reason || '-' }))
    ]
    const csv = '\uFEFF类型,编号,日期,房间,关联人,金额,明细\n' + allRows.map((r: any) =>
      `${r.type},${r.id},${r.date},${r.room},${r.tenant},${r.amount},${r.detail}`
    ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `对账差异_${period}.csv`; a.click()
    URL.revokeObjectURL(url)
    message.success('已导出')
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [m, y] = await Promise.all([
        window.api.summary.monthly(year, month),
        window.api.summary.yearly(year)
      ])
      setSummary(m)
      setYearly(y)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [year, month])

  if (!summary) {
    return <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 500 }}>
      <Empty description="加载中..." />
    </div>
  }

  const receivableRate = summary.receivable > 0 ? (summary.received / summary.receivable) * 100 : 0
  const pieData = (summary.depositsByStatus || []).map((d: any) => ({
    name: depositText[d.status] || d.status,
    value: d.amount,
    count: d.count
  }))

  const billPie = (summary.billStatusBreakdown || []).map((b: any) => ({
    name: billStatusText[b.status] || b.status,
    value: b.amount,
    count: b.count,
    color: billStatusColors[b.status]
  }))

  const yearlyChart = yearly.map(m => ({
    name: `${m.month}月`,
    应收: m.receivable,
    实收: m.received,
    退款: m.refund
  }))

  const dailyChart = (summary.dailyReceived || []).map((d: any) => ({
    name: dayjs(d.date).format('D') + '日',
    金额: d.amount
  }))

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">月度汇总 · {year}年{month}月</div>
        <Space>
          <MonthPicker
            value={dayjs(`${year}-${String(month).padStart(2, '0')}`)}
            onChange={v => { if (v) { setYear(v.year()); setMonth(v.month() + 1) } }}
            allowClear={false}
            style={{ width: 180 }}
          />
          <Select value={year} style={{ width: 110 }} onChange={setYear}>
            {[0, 1, 2].map(o => (
              <Option key={now.year() - o} value={now.year() - o}>{now.year() - o}年</Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>
      </div>

      <div className="stat-cards">
        <div className="stat-card blue">
          <div className="label">应收金额</div>
          <div className="value">¥{summary.receivable.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">本月账单总额</div>
        </div>
        <div className="stat-card green">
          <div className="label">实收金额</div>
          <div className="value">¥{summary.received.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">
            收缴率 <ArrowUpOutlined /> {receivableRate.toFixed(1)}%
          </div>
        </div>
        <div className="stat-card red">
          <div className="label">欠费总额</div>
          <div className="value">¥{summary.arrears.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">含历史累计欠费</div>
        </div>
        <div className="stat-card orange">
          <div className="label">退款发生</div>
          <div className="value">¥{summary.refundTotal.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">
            已付 ¥{summary.refundPaid.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            <span style={{ marginLeft: 8 }}>待付 ¥{Math.max(0, (summary.refundTotal || 0) - (summary.refundPaid || 0)).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
          </div>
          {summary.refundsByStatus && summary.refundsByStatus.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
              <Space wrap size={[12, 4]}>
                {summary.refundsByStatus.map((s: any) => {
                  const statusMap: any = {
                    pending: { label: '待付款', color: '#faad14' },
                    processing: { label: '付款中', color: '#1890ff' },
                    paid: { label: '已付款', color: '#52c41a' },
                    failed: { label: '失败', color: '#ff4d4f' }
                  }
                  const info = statusMap[s.payment_status] || { label: s.payment_status, color: '#999' }
                  return (
                    <div key={s.payment_status} style={{ fontSize: 12 }}>
                      <span style={{ color: info.color, marginRight: 4 }}>●</span>
                      {info.label} <strong>{s.count} 笔 / ¥{Number(s.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  )
                })}
              </Space>
            </div>
          )}
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #8c8c8c, #595959)' }}>
          <div className="label">坏账预警</div>
          <div className="value">¥{summary.badDebt.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">超6月未缴</div>
        </div>
        <div className="stat-card purple">
          <div className="label">待核对流水</div>
          <div className="value">{summary.unmatchedCount} 条</div>
          <div className="sub">¥{summary.unmatchedAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card title="收缴进度" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>本月收缴</span>
                  <strong>{receivableRate.toFixed(1)}%</strong>
                </div>
                <Progress percent={Number(receivableRate.toFixed(0))} status={receivableRate >= 90 ? 'success' : receivableRate >= 70 ? 'active' : 'exception'} />
              </div>
              <Statistic
                title="本月净收入"
                prefix={<DollarCircleOutlined />}
                value={summary.received - summary.refundPaid}
                precision={2}
                valueStyle={{ color: '#1677ff' }}
                style={{ marginTop: 8 }}
              />
              <Row gutter={8}>
                <Col span={12}>
                  <Statistic
                    title="超6月坏账"
                    value={summary.badDebt}
                    precision={2}
                    prefix={<WarningOutlined />}
                    valueStyle={{ color: '#ff4d4f', fontSize: 16 }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="待核对"
                    value={summary.unmatchedCount}
                    suffix="条"
                    prefix={<RedoOutlined />}
                    valueStyle={{ color: '#fa8c16', fontSize: 16 }}
                  />
                </Col>
              </Row>
            </Space>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="押金分布 (按金额)" size="small">
            {pieData.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    outerRadius={70}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_: any, i: number) => (
                      <Cell key={i} fill={Object.values(depositColors)[i % 5]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="本月账单状态" size="small">
            {billPie.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={billPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    innerRadius={45} outerRadius={75}
                    label={({ name, value }) => `${name} ¥${Number(value).toLocaleString()}`}
                  >
                    {billPie.map((b: any, i: number) => (
                      <Cell key={i} fill={b.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      <div className="charts-row">
        <Card title="每日收款趋势" size="small" style={{ minHeight: 360 }}>
          {dailyChart.length === 0 ? <Empty description="本月暂无收款数据" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={dailyChart} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colAmt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1677ff" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#1677ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={v => `¥${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: any) => [`¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`, '收款']}
                />
                <Area type="monotone" dataKey="金额" stroke="#1677ff" strokeWidth={2} fill="url(#colAmt)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title={year + '年 收支趋势'} size="small" style={{ minHeight: 360 }}>
          {yearlyChart.every((m: any) => m.应收 === 0 && m.实收 === 0)
            ? <Empty description="暂无年度数据" />
            : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={yearlyChart} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={v => `¥${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: any) => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`}
                  />
                  <Legend />
                  <Bar dataKey="应收" fill="#91caff" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="实收" fill="#52c41a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="退款" fill="#ff7875" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </Card>
      </div>

      <Divider orientation="left" plain style={{ marginTop: 24 }}>押金明细</Divider>
      <Card size="small">
        <Table<{ key: string; status: string; count: number; amount: number }>
          rowKey="status"
          size="small"
          pagination={false}
          dataSource={(summary.depositsByStatus || []).map((d: any) => ({
            key: d.status,
            status: d.status,
            count: d.count,
            amount: d.amount
          }))}
          columns={[
            {
              title: '状态', dataIndex: 'status', width: 160,
              render: (v: string) => <Tag color={depositColors[v]} icon={<span style={{ width: 8, height: 8, background: depositColors[v], borderRadius: '50%', display: 'inline-block', marginRight: 4 }} />}>{depositText[v] || v}</Tag>
            },
            {
              title: '笔数', dataIndex: 'count', width: 120,
              render: (v: number) => <strong>{v}</strong>
            },
            {
              title: '金额 (¥)', dataIndex: 'amount',
              render: (v: number) => <span style={{ fontWeight: 600 }}>{Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
            },
            {
              title: '占比', width: 260,
              render: (_, r) => {
                const total = (summary.depositsByStatus || []).reduce((a: number, b: any) => a + b.amount, 0)
                const pct = total > 0 ? (r.amount / total) * 100 : 0
                return <Progress percent={Number(pct.toFixed(1))} showInfo strokeColor={depositColors[r.status]} />
              }
            }
          ]}
        />
      </Card>

      <Card title="对账差异视图" size="small" style={{ marginTop: 16 }}
        extra={<Space>
          <Button icon={<ReloadOutlined />} size="small" loading={reconcileLoading} onClick={loadReconcile}>加载数据</Button>
          <Button icon={<DownloadOutlined />} size="small" disabled={!reconcileData} onClick={exportReconcile}>导出 CSV</Button>
        </Space>}
      >
        {!reconcileData ? (
          <Empty description="点击「加载数据」查看对账差异" />
        ) : (
          <Tabs defaultActiveKey="all">
            <TabPane tab={`全部 (${reconcileData.unallocatedTxns.length + reconcileData.partialBills.length + reconcileData.failedRefunds.length})`} key="all">
              <Table rowKey={(r: any) => `${r.diff_type}_${r.id}`} size="small" pagination={{ pageSize: 20 }}
                dataSource={[
                  ...reconcileData.unallocatedTxns,
                  ...reconcileData.partialBills,
                  ...reconcileData.failedRefunds
                ]}
                columns={[
                  {
                    title: '类型', width: 120, dataIndex: 'diff_type',
                    render: (v: string) => {
                      const map: any = { unallocated_txn: { text: '未分配流水', color: 'orange' }, partial_bill: { text: '部分到账', color: 'blue' }, failed_refund: { text: '失败退款', color: 'red' }, processing_refund: { text: '处理中退款', color: 'purple' } }
                      const info = map[v] || { text: v, color: 'default' }
                      return <Tag color={info.color}>{info.text}</Tag>
                    }
                  },
                  { title: '日期', dataIndex: 'txn_date', width: 100, render: (_: any, r: any) => r.txn_date || r.bill_period || r.terminate_date || '-' },
                  { title: '房间', dataIndex: 'room_no', width: 80 },
                  { title: '关联人', dataIndex: 'payer', width: 90, render: (_: any, r: any) => r.payer || r.tenant_name || '-' },
                  {
                    title: '差异金额', width: 130,
                    render: (_: any, r: any) => {
                      const amt = r.remaining_amount || r.unpaid_amount || r.refund_amount || 0
                      return <span style={{ color: '#cf1322', fontWeight: 600 }}>¥{Number(amt).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
                    }
                  },
                  { title: '明细', dataIndex: 'remark', ellipsis: true, render: (_: any, r: any) => r.remark || r.terminate_reason || '-' }
                ]}
              />
            </TabPane>
            <TabPane tab={`未分配流水 (${reconcileData.unallocatedTxns.length})`} key="txn">
              <Table rowKey="id" size="small" pagination={false} dataSource={reconcileData.unallocatedTxns}
                columns={[
                  { title: '日期', dataIndex: 'txn_date', width: 100 },
                  { title: '付款人', dataIndex: 'payer', width: 90 },
                  { title: '总额', dataIndex: 'amount', width: 110, render: (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` },
                  { title: '剩余', dataIndex: 'remaining_amount', width: 110, render: (v: number) => <span style={{ color: '#fa8c16', fontWeight: 600 }}>¥{Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span> },
                  { title: '备注', dataIndex: 'remark', ellipsis: true }
                ]}
              />
            </TabPane>
            <TabPane tab={`部分到账 (${reconcileData.partialBills.length})`} key="bill">
              <Table rowKey="id" size="small" pagination={false} dataSource={reconcileData.partialBills}
                columns={[
                  { title: '房间', dataIndex: 'room_no', width: 80 },
                  { title: '租客', dataIndex: 'tenant_name', width: 90 },
                  { title: '账期', dataIndex: 'bill_period', width: 90 },
                  { title: '应收', dataIndex: 'amount_due', width: 110, render: (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` },
                  { title: '待收', dataIndex: 'unpaid_amount', width: 110, render: (v: number) => <span style={{ color: '#cf1322', fontWeight: 600 }}>¥{Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span> }
                ]}
              />
            </TabPane>
            <TabPane tab={`退款异常 (${reconcileData.failedRefunds.length})`} key="refund">
              <Table rowKey="id" size="small" pagination={false} dataSource={reconcileData.failedRefunds}
                columns={[
                  { title: '退款单号', dataIndex: 'refund_no', width: 120 },
                  { title: '房间', dataIndex: 'room_no', width: 80 },
                  { title: '租客', dataIndex: 'tenant_name', width: 90 },
                  { title: '退款金额', dataIndex: 'refund_amount', width: 110, render: (v: number) => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` },
                  { title: '状态', dataIndex: 'payment_status', width: 100,
                    render: (v: string) => <Tag color={v === 'failed' ? 'red' : 'purple'}>{v === 'failed' ? '失败' : '处理中'}</Tag> },
                  { title: '原因', dataIndex: 'terminate_reason', ellipsis: true }
                ]}
              />
            </TabPane>
          </Tabs>
        )}
      </Card>
    </div>
  )
}

export default MonthlySummary
