import React, { useEffect, useState } from 'react'
import {
  Table, Button, Modal, message, Space, Tag, Form, Input, Select, InputNumber,
  Row, Col, Card, Drawer, Descriptions, Divider, List, DatePicker, Popconfirm,
  Steps, Empty, Avatar
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, ReloadOutlined, EyeOutlined, CheckOutlined,
  SendOutlined, DollarOutlined, UserOutlined, FileTextOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'

interface Refund {
  id: number
  refund_no: string
  contract_id?: number
  room_id: number
  tenant_id?: number
  deposit_id?: number
  terminate_reason: string
  terminate_date: string
  deposit_amount: number
  deduction_details?: string
  total_deduction: number
  refund_amount: number
  approver?: string
  approved_at?: string
  payment_status: 'pending' | 'processing' | 'paid' | 'failed'
  payment_date?: string
  payment_method?: string
  payment_txn_no?: string
  remark?: string
  created_at: string
  room_no: string
  tenant_name: string
}

const { Option } = Select
const { TextArea } = Input
const { Step } = Steps

const paymentColor: Record<string, string> = {
  pending: 'orange',
  processing: 'blue',
  paid: 'green',
  failed: 'red'
}
const paymentText: Record<string, string> = {
  pending: '待付款',
  processing: '付款中',
  paid: '已付款',
  failed: '付款失败'
}

const RefundApproval: React.FC = () => {
  const [data, setData] = useState<Refund[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [paymentFilter, setPaymentFilter] = useState<string>()

  const [addOpen, setAddOpen] = useState(false)
  const [addForm] = Form.useForm()
  const [rooms, setRooms] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [deposits, setDeposits] = useState<any[]>([])

  const [detailOpen, setDetailOpen] = useState(false)
  const [currentRefund, setCurrentRefund] = useState<Refund | null>(null)

  const [deductions, setDeductions] = useState<{ type: string; amount: number }[]>([{ type: '', amount: 0 }])

  const loadData = async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (paymentFilter) params.paymentStatus = paymentFilter
      const res = await window.api.refunds.list(params)
      setData(res.data)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }

  const loadDict = async () => {
    const [r, t, d] = await Promise.all([
      window.api.rooms.list(), window.api.tenants.list(),
      window.api.deposits.list({ pageSize: 1000, status: 'collected' })
    ])
    setRooms(r); setTenants(t); setDeposits(d.data || [])
  }

  useEffect(() => { loadData(); loadDict() }, [page, pageSize, paymentFilter])

  const calcRefund = () => {
    const deposit = addForm.getFieldValue('deposit_amount') || 0
    const total = deductions.reduce((a, b) => a + (Number(b.amount) || 0), 0)
    addForm.setFieldsValue({
      total_deduction: Number(total.toFixed(2)),
      refund_amount: Number((deposit - total).toFixed(2))
    })
  }

  const handleAddSubmit = async () => {
    try {
      const values = await addForm.validateFields()
      const payload = {
        ...values,
        terminate_date: values.terminate_date.format('YYYY-MM-DD'),
        deduction_details: deductions.filter(d => d.type && d.amount > 0)
      }
      const res = await window.api.refunds.create(payload)
      message.success('创建成功，退款单：' + res.refundNo)
      setAddOpen(false)
      setDeductions([{ type: '', amount: 0 }])
      loadData()
    } catch (e: any) {
      if (e.errorFields) return
      message.error('创建失败')
    }
  }

  const handleApprove = async (id: number) => {
    Modal.confirm({
      title: '审批通过',
      content: '确认该退款申请？审批后将进入付款流程。',
      okText: '确认审批',
      okType: 'primary',
      onOk: async () => {
        try {
          await window.api.refunds.approve(id, '当前操作员')
          message.success('审批通过')
          loadData()
        } catch { message.error('操作失败') }
      }
    })
  }

  const handlePaymentStatus = async (id: number, status: string) => {
    try {
      await window.api.refunds.updatePaymentStatus(id, status)
      message.success('状态已更新')
      loadData()
    } catch { message.error('操作失败') }
  }

  const getSteps = (r: Refund) => {
    const steps: { title: string; status: 'wait' | 'process' | 'finish' | 'error'; description: string }[] = [
      { title: '提交申请', status: 'finish', description: dayjs(r.created_at).format('YYYY-MM-DD HH:mm') },
      { title: '财务审批', status: r.approver ? 'finish' : 'process', description: r.approver ? `${r.approver} · ${dayjs(r.approved_at).format('YYYY-MM-DD HH:mm')}` : '待审批' },
      { title: '执行付款', status: r.payment_status === 'paid' ? 'finish' : r.approver ? 'process' : 'wait', description: r.payment_status === 'paid' && r.payment_date ? `${r.payment_method || ''} · ${dayjs(r.payment_date).format('YYYY-MM-DD')}` : (r.approver ? '待付款' : '—') }
    ]
    return steps
  }

  const stats = {
    pending: data.filter(r => !r.approver).length,
    approved: data.filter(r => r.approver && r.payment_status !== 'paid').length,
    paid: data.filter(r => r.payment_status === 'paid').length
  }
  const pendingAmt = data.filter(r => !r.approver).reduce((a, b) => a + b.refund_amount, 0)
  const paidAmt = data.filter(r => r.payment_status === 'paid').reduce((a, b) => a + b.refund_amount, 0)

  const columns: ColumnsType<Refund> = [
    { title: '退款单号', dataIndex: 'refund_no', width: 180, fixed: 'left', render: v => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '房间号', dataIndex: 'room_no', width: 90 },
    { title: '租客', dataIndex: 'tenant_name', width: 100 },
    { title: '退租日期', dataIndex: 'terminate_date', width: 110 },
    {
      title: '押金', dataIndex: 'deposit_amount', width: 110,
      render: v => `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    },
    {
      title: '扣费合计', dataIndex: 'total_deduction', width: 110,
      render: v => v > 0 ? <span className="amount-negative">-¥{Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span> : '—'
    },
    {
      title: '退款金额', dataIndex: 'refund_amount', width: 120,
      render: v => <span style={{ color: '#1677ff', fontWeight: 600 }}>¥{Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    },
    {
      title: '审批状态', width: 100,
      render: (_, r) => r.approver
        ? <Tag color="success" icon={<CheckOutlined />}>{r.approver}</Tag>
        : <Tag color="warning">待审批</Tag>
    },
    {
      title: '付款进度', dataIndex: 'payment_status', width: 100,
      render: v => <Tag color={paymentColor[v]}>{paymentText[v]}</Tag>
    },
    {
      title: '退租原因', dataIndex: 'terminate_reason', width: 150, ellipsis: true
    },
    {
      title: '操作', width: 240, fixed: 'right',
      render: (_, r) => (
        <Space wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => { setCurrentRefund(r); setDetailOpen(true) }}>详情</Button>
          {!r.approver && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleApprove(r.id)}>审批</Button>}
          {r.approver && r.payment_status === 'pending' && (
            <Popconfirm title="确认已执行付款？" onConfirm={() => handlePaymentStatus(r.id, 'paid')} okText="确认付款">
              <Button size="small" icon={<DollarOutlined />}>标记付款</Button>
            </Popconfirm>
          )}
          {r.approver && r.payment_status !== 'paid' && r.payment_status !== 'pending' && (
            <Select size="small" value={r.payment_status} style={{ width: 100 }}
              onChange={v => handlePaymentStatus(r.id, v)}>
              <Option value="pending">待付款</Option>
              <Option value="processing">付款中</Option>
              <Option value="paid">已付款</Option>
              <Option value="failed">付款失败</Option>
            </Select>
          )}
        </Space>
      )
    }
  ]

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">退款审批</div>
        <Space>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => {
            addForm.resetFields()
            setDeductions([{ type: '', amount: 0 }])
            addForm.setFieldsValue({ deposit_amount: 0, total_deduction: 0, refund_amount: 0, terminate_date: dayjs() })
            setAddOpen(true)
          }}>新建退款单</Button>
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>
      </div>

      <div className="stat-cards">
        <div className="stat-card orange">
          <div className="label">待审批</div>
          <div className="value">{stats.pending} 笔</div>
          <div className="sub">¥{pendingAmt.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="stat-card blue">
          <div className="label">待付款</div>
          <div className="value">{stats.approved} 笔</div>
        </div>
        <div className="stat-card green">
          <div className="label">已完成退款</div>
          <div className="value">{stats.paid} 笔</div>
          <div className="sub">¥{paidAmt.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="stat-card purple">
          <div className="label">退款单总数</div>
          <div className="value">{total} 笔</div>
        </div>
      </div>

      <Card style={{ marginBottom: 16 }} size="small">
        <Row gutter={16} align="middle">
          <Col span={3} style={{ fontWeight: 500 }}>付款进度：</Col>
          <Col span={21}>
            <Space size={8}>
              <Tag.CheckableTag checked={!paymentFilter} onChange={v => v && setPaymentFilter(undefined)}>全部</Tag.CheckableTag>
              {Object.entries(paymentText).map(([k, v]) => (
                <Tag.CheckableTag key={k} checked={paymentFilter === k} onChange={ch => ch && setPaymentFilter(k)}>
                  {v}
                </Tag.CheckableTag>
              ))}
              <Tag.CheckableTag checked={paymentFilter === 'pending_approval'}
                onChange={ch => ch && setPaymentFilter('pending')}>
                待审批
              </Tag.CheckableTag>
            </Space>
          </Col>
        </Row>
      </Card>

      <Table<Refund>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        scroll={{ x: 1500 }}
        pagination={{
          current: page, pageSize, total, showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) }
        }}
      />

      <Drawer
        title="退款单详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={620}
        extra={<Button onClick={() => setDetailOpen(false)}>关闭</Button>}
      >
        {currentRefund && (
          <>
            <Card size="small" style={{ background: '#f0f5ff', marginBottom: 16 }}>
              <Row gutter={24}>
                <Col span={12}>
                  <div style={{ color: '#666', fontSize: 12 }}>退款单号</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{currentRefund.refund_no}</div>
                </Col>
                <Col span={12}>
                  <div style={{ color: '#666', fontSize: 12 }}>创建时间</div>
                  <div>{dayjs(currentRefund.created_at).format('YYYY-MM-DD HH:mm:ss')}</div>
                </Col>
              </Row>
            </Card>

            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="房间号">{currentRefund.room_no}</Descriptions.Item>
              <Descriptions.Item label="租客">{currentRefund.tenant_name}</Descriptions.Item>
              <Descriptions.Item label="退租日期">{currentRefund.terminate_date}</Descriptions.Item>
              <Descriptions.Item label="退租原因">{currentRefund.terminate_reason}</Descriptions.Item>
              <Descriptions.Item label="押金额度" span={2}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>
                  ¥{Number(currentRefund.deposit_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </span>
              </Descriptions.Item>
            </Descriptions>

            {currentRefund.deduction_details && (() => {
              const list = JSON.parse(currentRefund.deduction_details)
              if (!list || list.length === 0) return null
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 500, marginBottom: 8 }}>扣分明细</div>
                  <Card size="small">
                    <List
                      dataSource={list}
                      renderItem={(it: any) => (
                        <List.Item>
                          <List.Item.Meta
                            avatar={<Avatar icon={<FileTextOutlined />} style={{ background: '#fff7e6', color: '#fa8c16' }} />}
                            title={it.type}
                          />
                          <span className="amount-negative" style={{ fontSize: 16, fontWeight: 600 }}>
                            -¥{Number(it.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </span>
                        </List.Item>
                      )}
                    />
                    <Divider style={{ margin: '8px 0' }} />
                    <Row justify="end">
                      <Space size={30}>
                        <span>扣费合计：<strong className="amount-negative">-¥{Number(currentRefund.total_deduction).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</strong></span>
                        <span>实退金额：<strong style={{ fontSize: 18, color: '#1677ff' }}>¥{Number(currentRefund.refund_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</strong></span>
                      </Space>
                    </Row>
                  </Card>
                </div>
              )
            })()}

            <Divider orientation="left" plain>审批流程</Divider>
            <Steps direction="vertical" size="small" current={currentRefund.approver ? (currentRefund.payment_status === 'paid' ? 3 : 2) : 1}
              items={getSteps(currentRefund)} />

            <Divider orientation="left" plain>付款信息</Divider>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="付款状态">
                <Tag color={paymentColor[currentRefund.payment_status]}>{paymentText[currentRefund.payment_status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="付款方式">{currentRefund.payment_method || '—'}</Descriptions.Item>
              <Descriptions.Item label="付款日期">{currentRefund.payment_date ? dayjs(currentRefund.payment_date).format('YYYY-MM-DD') : '—'}</Descriptions.Item>
              <Descriptions.Item label="交易号">{currentRefund.payment_txn_no || '—'}</Descriptions.Item>
            </Descriptions>

            {currentRefund.remark && (
              <>
                <Divider orientation="left" plain>备注</Divider>
                <div style={{ padding: 12, background: '#fafafa', borderRadius: 6, color: '#666' }}>
                  {currentRefund.remark}
                </div>
              </>
            )}
          </>
        )}
      </Drawer>

      <Modal
        title="新建退款单"
        open={addOpen}
        onOk={handleAddSubmit}
        onCancel={() => setAddOpen(false)}
        okText="提交审批"
        cancelText="取消"
        width={720}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 10 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="选择房间" name="room_id" rules={[{ required: true }]}>
                <Select placeholder="选择房间" showSearch optionFilterProp="children"
                  onChange={(roomId) => {
                    const dep = deposits.find((d: any) => d.room_id === roomId)
                    if (dep) {
                      addForm.setFieldsValue({ deposit_id: dep.id, deposit_amount: dep.amount, tenant_id: dep.tenant_id })
                      calcRefund()
                    }
                  }}>
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
              <Form.Item label="退租日期" name="terminate_date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="关联押金" name="deposit_id">
                <Select allowClear placeholder="选择押金单" showSearch>
                  {deposits.map((d: any) => <Option key={d.id} value={d.id}>{d.room_no} - ¥{d.amount}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="退租原因" name="terminate_reason" rules={[{ required: true, message: '请说明退租原因' }]}>
                <Select placeholder="选择或输入">
                  <Option value="合同到期">合同到期</Option>
                  <Option value="租客提前退租">租客提前退租</Option>
                  <Option value="双方协商解约">双方协商解约</Option>
                  <Option value="违约退租">违约退租</Option>
                  <Option value="其他">其他</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="押金额度 (¥)" name="deposit_amount">
                <InputNumber style={{ width: '100%' }} min={0} disabled />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain>扣费明细</Divider>
          <div style={{ background: '#fafafa', padding: 12, borderRadius: 6, marginBottom: 12 }}>
            {deductions.map((d, i) => (
              <Row key={i} gutter={8} style={{ marginBottom: i === deductions.length - 1 ? 0 : 8 }} align="middle">
                <Col span={10}>
                  <Input
                    placeholder="扣费项目 (如：清洁费、维修费)"
                    value={d.type}
                    onChange={e => {
                      const next = [...deductions]; next[i].type = e.target.value; setDeductions(next); calcRefund()
                    }}
                  />
                </Col>
                <Col span={10}>
                  <InputNumber
                    style={{ width: '100%' }} placeholder="金额" min={0} prefix="¥"
                    value={d.amount}
                    onChange={v => {
                      const next = [...deductions]; next[i].amount = Number(v) || 0; setDeductions(next); calcRefund()
                    }}
                  />
                </Col>
                <Col span={4}>
                  <Space>
                    <Button type="text" danger icon={<span style={{ fontSize: 18 }}>-</span>}
                      disabled={deductions.length === 1}
                      onClick={() => {
                        const next = deductions.filter((_, idx) => idx !== i)
                        setDeductions(next); setTimeout(calcRefund, 0)
                      }} />
                    <Button type="text" icon={<span style={{ fontSize: 16 }}>+</span>}
                      onClick={() => {
                        setDeductions([...deductions, { type: '', amount: 0 }])
                      }} />
                  </Space>
                </Col>
              </Row>
            ))}
          </div>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="扣费合计 (¥)" name="total_deduction">
                <InputNumber style={{ width: '100%' }} min={0} disabled />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="应退金额 (¥)" name="refund_amount" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} prefix="¥" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="备注" name="remark">
            <TextArea rows={2} placeholder="补充说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default RefundApproval
