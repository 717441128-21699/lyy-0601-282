import React, { useEffect, useState } from 'react'
import {
  Table, Button, Modal, message, Space, Tag, Form, Input, Select, InputNumber,
  Row, Col, Card, Tooltip, Drawer, Timeline, Divider, Descriptions, Radio
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, ReloadOutlined, EyeOutlined, SafetyOutlined,
  MinusCircleOutlined, CheckCircleOutlined, WarningOutlined, QuestionCircleOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'

interface Deposit {
  id: number
  contract_id?: number
  room_id: number
  tenant_id?: number
  deposit_type: string
  amount: number
  status: 'collected' | 'frozen' | 'deducted' | 'refunded' | 'disputed'
  transaction_id?: number
  freeze_reason?: string
  deduct_amount?: number
  deduct_reason?: string
  dispute_reason?: string
  refund_transaction_id?: number
  remark?: string
  room_no: string
  tenant_name: string
  created_at: string
  updated_at: string
}

const { Option } = Select
const { TextArea } = Input

const statusConfig: Record<string, { color: string; text: string; icon: any }> = {
  collected: { color: 'green', text: '已收取', icon: <SafetyOutlined /> },
  frozen: { color: 'blue', text: '已冻结', icon: <WarningOutlined /> },
  deducted: { color: 'orange', text: '已扣减', icon: <MinusCircleOutlined /> },
  refunded: { color: 'default', text: '已退还', icon: <CheckCircleOutlined /> },
  disputed: { color: 'red', text: '有争议', icon: <QuestionCircleOutlined /> }
}

const DepositLedger: React.FC = () => {
  const [data, setData] = useState<Deposit[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [statusFilter, setStatusFilter] = useState<string>()

  const [detailOpen, setDetailOpen] = useState(false)
  const [currentDeposit, setCurrentDeposit] = useState<Deposit | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm()
  const [rooms, setRooms] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])

  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [targetStatus, setTargetStatus] = useState<string>('')
  const [statusForm] = Form.useForm()
  const [stats, setStats] = useState<any>({ byStatus: { collected: { count: 0, amount: 0 }, frozen: { count: 0, amount: 0 }, deducted: { count: 0, amount: 0 }, refunded: { count: 0, amount: 0 }, disputed: { count: 0, amount: 0 } }, total: 0, totalAmount: 0 })

  const loadData = async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (statusFilter) params.status = statusFilter
      const [listRes, statsRes] = await Promise.all([
        window.api.deposits.list(params),
        window.api.deposits.stats()
      ])
      setData(listRes.data)
      setTotal(listRes.total)
      setStats(statsRes)
    } finally {
      setLoading(false)
    }
  }

  const loadDict = async () => {
    const [r, t] = await Promise.all([window.api.rooms.list(), window.api.tenants.list()])
    setRooms(r); setTenants(t)
  }

  useEffect(() => { loadData(); loadDict() }, [page, pageSize, statusFilter])

  const openStatusChange = (dep: Deposit, newStatus: string) => {
    setCurrentDeposit(dep)
    setTargetStatus(newStatus)
    statusForm.resetFields()
    setStatusModalOpen(true)
  }

  const handleStatusSubmit = async () => {
    if (!currentDeposit) return
    try {
      const values = await statusForm.validateFields()
      await window.api.deposits.changeStatus(currentDeposit.id, targetStatus, values)
      message.success('状态更新成功')
      setStatusModalOpen(false)
      loadData()
    } catch (e: any) {
      if (e.errorFields) return
      message.error('操作失败')
    }
  }

  const handleAddSubmit = async () => {
    try {
      const values = await addForm.validateFields()
      await window.api.deposits.create(values)
      message.success('添加成功')
      setAddOpen(false)
      loadData()
    } catch (e: any) {
      if (e.errorFields) return
      message.error('添加失败')
    }
  }

  const genTimeline = (d: Deposit) => {
    const items = [
      { color: 'green', children: <><b>{dayjs(d.created_at).format('YYYY-MM-DD HH:mm')}</b> 押金收取 ¥{d.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</> }
    ]
    if (d.status !== 'collected') {
      if (d.freeze_reason) items.push({ color: 'blue', children: <><b>{dayjs(d.updated_at).format('YYYY-MM-DD HH:mm')}</b> 冻结：{d.freeze_reason}</> })
      if (d.deduct_amount) items.push({ color: 'orange', children: <><b>{dayjs(d.updated_at).format('YYYY-MM-DD HH:mm')}</b> 扣减 ¥{Number(d.deduct_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}：{d.deduct_reason}</> })
      if (d.status === 'disputed') items.push({ color: 'red', children: <><b>{dayjs(d.updated_at).format('YYYY-MM-DD HH:mm')}</b> 争议：{d.dispute_reason}</> })
      if (d.status === 'refunded') items.push({ color: 'gray', children: <><b>{dayjs(d.updated_at).format('YYYY-MM-DD HH:mm')}</b> 押金已退还</> })
    }
    return items
  }

  const statusCounts = {
    collected: stats.byStatus.collected.count,
    frozen: stats.byStatus.frozen.count,
    deducted: stats.byStatus.deducted.count,
    refunded: stats.byStatus.refunded.count,
    disputed: stats.byStatus.disputed.count
  }
  const totalAmount = stats.totalAmount
  const available = stats.byStatus.collected.amount

  const columns: ColumnsType<Deposit> = [
    { title: '房间号', dataIndex: 'room_no', width: 100, fixed: 'left' },
    { title: '租客', dataIndex: 'tenant_name', width: 110 },
    {
      title: '押金类型', dataIndex: 'deposit_type', width: 100,
      render: v => v === 'rent' ? '租金押金' : (v === 'utility' ? '水电押金' : v)
    },
    {
      title: '押金金额', dataIndex: 'amount', width: 130,
      render: v => <span style={{ fontWeight: 600 }}>¥{Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    },
    {
      title: '扣减金额', width: 120,
      render: (_, r) => r.deduct_amount ? <span className="amount-negative">¥{Number(r.deduct_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span> : '—'
    },
    {
      title: '当前状态', dataIndex: 'status', width: 110,
      render: v => {
        const s = statusConfig[v]
        return <Tag icon={s.icon} color={s.color}>{s.text}</Tag>
      }
    },
    {
      title: '备注 / 原因', width: 200, ellipsis: true,
      render: (_, r) => r.freeze_reason || r.deduct_reason || r.dispute_reason || r.remark || '—'
    },
    { title: '登记时间', dataIndex: 'created_at', width: 160, render: v => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作', width: 280, fixed: 'right',
      render: (_, r) => (
        <Space wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => { setCurrentDeposit(r); setDetailOpen(true) }}>详情</Button>
          {r.status === 'collected' && (
            <>
              <Button size="small" onClick={() => openStatusChange(r, 'frozen')}>冻结</Button>
              <Button size="small" onClick={() => openStatusChange(r, 'deducted')}>扣减</Button>
            </>
          )}
          {r.status === 'frozen' && (
            <Button size="small" type="primary" ghost onClick={() => openStatusChange(r, 'collected')}>解冻</Button>
          )}
          {(r.status === 'collected' || r.status === 'frozen') && (
            <Button size="small" danger onClick={() => openStatusChange(r, 'disputed')}>争议</Button>
          )}
        </Space>
      )
    }
  ]

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">押金台账</div>
        <Space>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => { addForm.resetFields(); setAddOpen(true) }}>登记押金</Button>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>
      </div>

      <div className="stat-cards">
        <div className="stat-card purple">
          <div className="label">押金总额</div>
          <div className="value">¥{totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">共 {total} 笔</div>
        </div>
        <div className="stat-card green">
          <div className="label">正常持有</div>
          <div className="value">{statusCounts.collected} 笔</div>
          <div className="sub">¥{available.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="stat-card blue">
          <div className="label">已冻结</div>
          <div className="value">{statusCounts.frozen} 笔</div>
        </div>
        <div className="stat-card orange">
          <div className="label">已扣减</div>
          <div className="value">{statusCounts.deducted} 笔</div>
        </div>
        <div className="stat-card red">
          <div className="label">争议中</div>
          <div className="value">{statusCounts.disputed} 笔</div>
        </div>
        <div className="stat-card">
          <div className="label">已退还</div>
          <div className="value">{statusCounts.refunded} 笔</div>
        </div>
      </div>

      <Card style={{ marginBottom: 16 }} size="small">
        <Row gutter={16} align="middle">
          <Col span={3} style={{ fontWeight: 500 }}>状态筛选：</Col>
          <Col span={21}>
            <Space size={8} wrap>
              <Tag.CheckableTag checked={!statusFilter} onChange={v => v && setStatusFilter(undefined)}>全部</Tag.CheckableTag>
              {Object.entries(statusConfig).map(([k, v]) => (
                <Tag.CheckableTag
                  key={k}
                  checked={statusFilter === k}
                  onChange={ch => ch && setStatusFilter(k)}
                >{v.text}</Tag.CheckableTag>
              ))}
            </Space>
          </Col>
        </Row>
      </Card>

      <Table<Deposit>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        scroll={{ x: 1350 }}
        pagination={{
          current: page, pageSize, total, showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) }
        }}
      />

      <Drawer
        title="押金详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={560}
        extra={<Button onClick={() => setDetailOpen(false)}>关闭</Button>}
      >
        {currentDeposit && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="房间号">{currentDeposit.room_no}</Descriptions.Item>
              <Descriptions.Item label="租客">{currentDeposit.tenant_name}</Descriptions.Item>
              <Descriptions.Item label="押金类型">{currentDeposit.deposit_type === 'rent' ? '租金押金' : currentDeposit.deposit_type}</Descriptions.Item>
              <Descriptions.Item label="押金金额">
                <span style={{ fontSize: 18, fontWeight: 600, color: '#1677ff' }}>
                  ¥{currentDeposit.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="当前状态">
                <Tag icon={statusConfig[currentDeposit.status].icon} color={statusConfig[currentDeposit.status].color}>
                  {statusConfig[currentDeposit.status].text}
                </Tag>
              </Descriptions.Item>
              {currentDeposit.deduct_amount !== undefined && currentDeposit.deduct_amount > 0 && (
                <Descriptions.Item label="扣减金额">
                  <span className="amount-negative">¥{Number(currentDeposit.deduct_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>原因：{currentDeposit.deduct_reason || '—'}</div>
                </Descriptions.Item>
              )}
              {currentDeposit.freeze_reason && (
                <Descriptions.Item label="冻结原因">{currentDeposit.freeze_reason}</Descriptions.Item>
              )}
              {currentDeposit.dispute_reason && (
                <Descriptions.Item label="争议说明">{currentDeposit.dispute_reason}</Descriptions.Item>
              )}
              <Descriptions.Item label="登记时间">{dayjs(currentDeposit.created_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" plain>变更记录</Divider>
            <Timeline items={genTimeline(currentDeposit)} />
          </>
        )}
      </Drawer>

      <Modal
        title="登记押金"
        open={addOpen}
        onOk={handleAddSubmit}
        onCancel={() => setAddOpen(false)}
        okText="保存"
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 10 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="房间" name="room_id" rules={[{ required: true }]}>
                <Select placeholder="选择房间" showSearch optionFilterProp="children">
                  {rooms.map(r => <Option key={r.id} value={r.id}>{r.room_no}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="租客" name="tenant_id" rules={[{ required: true }]}>
                <Select placeholder="选择租客" showSearch optionFilterProp="children">
                  {tenants.map(t => <Option key={t.id} value={t.id}>{t.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="押金类型" name="deposit_type" initialValue="rent">
                <Select>
                  <Option value="rent">租金押金</Option>
                  <Option value="utility">水电押金</Option>
                  <Option value="other">其他</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="押金金额" name="amount" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="备注" name="remark">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={`${currentDeposit?.room_no} - ${targetStatus === 'frozen' ? '冻结押金' : targetStatus === 'collected' ? '解冻押金' : targetStatus === 'deducted' ? '扣减押金' : '标记争议'}`}
        open={statusModalOpen}
        onOk={handleStatusSubmit}
        onCancel={() => setStatusModalOpen(false)}
        okText="确认"
        destroyOnClose
      >
        <Form form={statusForm} layout="vertical" style={{ marginTop: 10 }}>
          {targetStatus === 'frozen' && (
            <Form.Item label="冻结原因" name="freeze_reason" rules={[{ required: true, message: '请说明冻结原因' }]}>
              <TextArea rows={3} placeholder="如：房间设备损坏待确认、水电费未结清等" />
            </Form.Item>
          )}
          {targetStatus === 'deducted' && (
            <>
              <Form.Item label="扣减金额" name="deduct_amount" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} max={currentDeposit?.amount} prefix="¥" />
              </Form.Item>
              <Form.Item label="扣减原因" name="deduct_reason" rules={[{ required: true }]}>
                <TextArea rows={3} placeholder="详细说明扣减原因" />
              </Form.Item>
            </>
          )}
          {targetStatus === 'disputed' && (
            <Form.Item label="争议说明" name="dispute_reason" rules={[{ required: true }]}>
              <TextArea rows={3} placeholder="描述争议事项" />
            </Form.Item>
          )}
          {targetStatus === 'collected' && (
            <div style={{ color: '#52c41a' }}>确认将该押金解冻，恢复为正常持有状态？</div>
          )}
        </Form>
      </Modal>
    </div>
  )
}

export default DepositLedger
