import React, { useEffect, useState } from 'react'
import {
  Card, Row, Col, Select, Button, Space, Statistic, Table, Tag, Progress,
  Empty, DatePicker, Divider
} from 'antd'
import {
  ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined,
  DollarCircleOutlined, WarningOutlined, RedoOutlined
} from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'
import dayjs from 'dayjs'

const { Option } = Select
const { MonthPicker } = DatePicker

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
          <div className="sub">已付 ¥{summary.refundPaid.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
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
    </div>
  )
}

export default MonthlySummary
