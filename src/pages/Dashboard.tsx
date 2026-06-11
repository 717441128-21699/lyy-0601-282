import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Tag, Space, Button, Tabs, Statistic, Row, Col, Badge, message,
  Empty, Descriptions, Modal, Checkbox
} from 'antd'
import {
  DashboardOutlined, UnorderedListOutlined, WarningOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  LinkOutlined, ReloadOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'

const { TabPane } = Tabs

export default function Dashboard() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>({
    unmatchedTxns: [],
    partialBills: [],
    unconfirmedMatches: [],
    stats: { unmatchedCount: 0, unmatchedAmount: 0, partialCount: 0, partialAmount: 0, unconfirmedCount: 0, unconfirmedAmount: 0 }
  })
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

  const handleConfirmMatch = async (matchId: number, billId: number) => {
    Modal.confirm({
      title: '确认该匹配记录？',
      content: '确认后该匹配记录将被标记为"已确认"',
      okText: '确认',
      okType: 'primary',
      onOk: async () => {
        await window.api.bills.confirmMatch(matchId, true)
        message.success('已确认')
        loadData()
      }
    })
  }

  const unmatchedColumns = [
    { title: '日期', dataIndex: 'txn_date', width: 120 },
    { title: '付款人', dataIndex: 'payer', width: 120 },
    {
      title: '金额', dataIndex: 'amount', width: 140,
      render: (v: number, r: any) => {
        const allocated = r.allocated_amount || 0
        const remaining = r.remaining_amount || v
        const isPartial = allocated > 0.005
        return (
          <Space direction="vertical" size={0} style={{ lineHeight: 1.4 }}>
            <span style={{ color: '#52c41a', fontWeight: 600 }}>
              剩余 ¥{remaining.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </span>
            {isPartial && (
              <span style={{ color: '#999', fontSize: 12 }}>
                总额 ¥{v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </span>
            )}
          </Space>
        )
      }
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    {
      title: '操作', width: 140, fixed: 'right' as const,
      render: () => (
        <Button type="primary" size="small" icon={<LinkOutlined />}
          onClick={() => navigate('/bill-matching')}>去匹配</Button>
      )
    }
  ]

  const partialColumns = [
    { title: '房间', dataIndex: 'room_no', width: 100 },
    { title: '租客', dataIndex: 'tenant_name', width: 100 },
    { title: '账期', dataIndex: 'bill_period', width: 100 },
    {
      title: '账单金额', dataIndex: 'amount_due', width: 130,
      render: (v: number) => `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    },
    {
      title: '已收金额', dataIndex: 'amount_paid', width: 130,
      render: (v: number) => <span style={{ color: '#52c41a' }}>¥{v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    },
    {
      title: '待收', dataIndex: 'unpaid_amount', width: 130,
      render: (v: number) => <span style={{ color: '#cf1322', fontWeight: 600 }}>¥{v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    },
    {
      title: '操作', width: 140, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Button type="primary" size="small" icon={<LinkOutlined />}
          onClick={() => navigate('/bill-matching')}>继续匹配</Button>
      )
    }
  ]

  const unconfirmedColumns = [
    { title: '房间', dataIndex: 'room_no', width: 100 },
    { title: '租客', dataIndex: 'tenant_name', width: 100 },
    { title: '账期', dataIndex: 'bill_period', width: 100 },
    { title: '付款人', dataIndex: 'payer', width: 120 },
    {
      title: '匹配金额', dataIndex: 'amount', width: 130,
      render: (v: number) => <span style={{ color: '#fa8c16', fontWeight: 600 }}>¥{v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    },
    {
      title: '流水日期', dataIndex: 'txn_date', width: 120
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    {
      title: '匹配方式', dataIndex: 'match_type', width: 100,
      render: (v: string) => (
        <Tag color={v === 'auto' ? 'default' : 'geekblue'}>
          {v === 'auto' ? '自动匹配' : '人工匹配'}
        </Tag>
      )
    },
    {
      title: '操作', width: 140, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" type="primary" icon={<CheckCircleOutlined />}
            onClick={() => handleConfirmMatch(r.id, r.bill_id)}>确认</Button>
          <Button size="small" onClick={() => navigate('/bill-matching')}>查看</Button>
        </Space>
      )
    }
  ]

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">
          <Space>
            <DashboardOutlined />
            核对工作台
          </Space>
        </div>
        <Space>
          <span style={{ color: '#666' }}>
            上次更新：{dayjs().format('YYYY-MM-DD HH:mm:ss')}
          </span>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title={<Space><WarningOutlined style={{ color: '#faad14' }} /> 待匹配流水</Space>}
              value={data.stats.unmatchedCount}
              suffix="笔"
              valueStyle={{ color: '#faad14' }}
              precision={0}
            />
            <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
              未分配金额 ¥{Number(data.stats.unmatchedAmount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title={<Space><ClockCircleOutlined style={{ color: '#1890ff' }} /> 部分到账账单</Space>}
              value={data.stats.partialCount}
              suffix="笔"
              valueStyle={{ color: '#1890ff' }}
              precision={0}
            />
            <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
              待收金额 ¥{Number(data.stats.partialAmount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title={<Space><ExclamationCircleOutlined style={{ color: '#f5222d' }} /> 已匹配待确认</Space>}
              value={data.stats.unconfirmedCount}
              suffix="笔"
              valueStyle={{ color: '#f5222d' }}
              precision={0}
            />
            <div style={{ color: '#999', fontSize: 13, marginTop: 4 }}>
              涉及金额 ¥{Number(data.stats.unconfirmedAmount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        tabList={[
          { key: 'unmatched', tab: <Badge count={data.stats.unmatchedCount} offset={[10, 2]}><Space><UnorderedListOutlined /> 待匹配流水</Space></Badge> },
          { key: 'partial', tab: <Badge count={data.stats.partialCount} offset={[10, 2]}><Space><ClockCircleOutlined /> 部分到账账单</Space></Badge> },
          { key: 'unconfirmed', tab: <Badge count={data.stats.unconfirmedCount} offset={[10, 2]}><Space><ExclamationCircleOutlined /> 待确认匹配</Space></Badge> }
        ]}
      >
        <Tabs defaultActiveKey="unmatched" onChange={() => { }}>
          <TabPane tab="" key="unmatched">
            <Table
              rowKey="id"
              size="small"
              loading={loading}
              columns={unmatchedColumns}
              dataSource={data.unmatchedTxns}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              locale={{ emptyText: <Empty description="全部匹配完成，做得好！" /> }}
            />
          </TabPane>
          <TabPane tab="" key="partial">
            <Table
              rowKey="id"
              size="small"
              loading={loading}
              columns={partialColumns}
              dataSource={data.partialBills}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              locale={{ emptyText: <Empty description="没有部分到账的账单" /> }}
            />
          </TabPane>
          <TabPane tab="" key="unconfirmed">
            <Table
              rowKey="id"
              size="small"
              loading={loading}
              columns={unconfirmedColumns}
              dataSource={data.unconfirmedMatches}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              locale={{ emptyText: <Empty description="所有匹配都已确认，做得好！" /> }}
            />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  )
}
