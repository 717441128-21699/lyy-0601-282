import React, { useEffect, useState, useRef } from 'react'
import {
  Table, Button, Input, DatePicker, Form, Select, Modal, message, Space,
  Tag, Popconfirm, Upload, InputNumber, Row, Col
} from 'antd'
import {
  PlusOutlined, SearchOutlined, ImportOutlined, ReloadOutlined,
  EditOutlined, DeleteOutlined, DownloadOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'

interface Transaction {
  id: number
  txn_date: string
  amount: number
  payer: string
  payee: string
  payment_method: string
  remark: string
  txn_no: string
  matched: number
  matched_bill_ids?: string
  created_at: string
}

const { RangePicker } = DatePicker
const { Option } = Select

const Transactions: React.FC = () => {
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [searchForm] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [txnForm] = Form.useForm()
  const fileRef = useRef<any>(null)

  const loadData = async (filters: any = {}) => {
    setLoading(true)
    try {
      const res = filters.minAmount !== undefined || filters.payer || filters.remark || filters.startDate
        ? await window.api.transactions.search(filters)
        : await window.api.transactions.list({ page, pageSize, ...filters })
      setData(res.data)
      setTotal(res.total)
    } catch (e: any) {
      message.error('加载失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [page, pageSize])

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    const filters: any = {}
    if (values.amountRange) {
      filters.minAmount = values.amountRange[0]
      filters.maxAmount = values.amountRange[1]
    }
    if (values.payer) filters.payer = values.payer
    if (values.remark) filters.remark = values.remark
    if (values.dateRange) {
      filters.startDate = values.dateRange[0].format('YYYY-MM-DD')
      filters.endDate = values.dateRange[1].format('YYYY-MM-DD')
    }
    if (values.matched !== undefined) filters.matched = values.matched
    setPage(1)
    loadData(filters)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setPage(1)
    loadData()
  }

  const handleAdd = () => {
    setEditing(null)
    txnForm.resetFields()
    txnForm.setFieldsValue({
      txn_date: dayjs(),
      payment_method: '银行转账',
      payee: '租赁公司'
    })
    setModalOpen(true)
  }

  const handleEdit = (row: Transaction) => {
    setEditing(row)
    txnForm.setFieldsValue({
      ...row,
      txn_date: dayjs(row.txn_date)
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await txnForm.validateFields()
      const payload = {
        ...values,
        txn_date: values.txn_date.format('YYYY-MM-DD')
      }
      if (editing) {
        await window.api.transactions.update(editing.id, payload)
        message.success('修改成功')
      } else {
        await window.api.transactions.create(payload)
        message.success('添加成功')
      }
      setModalOpen(false)
      loadData()
    } catch (e: any) {
      if (e.errorFields) return
      message.error('保存失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await window.api.transactions.delete(id)
      message.success('删除成功')
      loadData()
    } catch (e: any) {
      message.error('删除失败')
    }
  }

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target!.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(ws)
        const mapped = rows.map((r, i) => ({
          txn_date: r['交易日期'] || r['日期'] || r['date'] ? dayjs(String(r['交易日期'] || r['日期'] || r['date'])).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
          amount: Number(r['金额'] || r['amount'] || 0),
          payer: String(r['付款人'] || r['对方户名'] || r['payer'] || ''),
          payee: String(r['收款人'] || r['payee'] || '租赁公司'),
          payment_method: String(r['支付方式'] || r['method'] || '银行转账'),
          remark: String(r['备注'] || r['摘要'] || r['remark'] || ''),
          txn_no: String(r['交易单号'] || r['流水号'] || r['txn_no'] || `IMP${Date.now()}${i}`)
        })).filter(r => r.amount > 0)
        if (mapped.length === 0) {
          message.warning('未解析到有效数据')
          return
        }
        const res = await window.api.transactions.bulkImport(mapped)
        message.success(`成功导入 ${res.inserted} 条记录`)
        loadData()
      } catch (err: any) {
        message.error('导入失败：' + err.message)
      }
    }
    reader.readAsBinaryString(file)
    return false
  }

  const columns: ColumnsType<Transaction> = [
    { title: '流水号', dataIndex: 'txn_no', width: 180, fixed: 'left' },
    { title: '交易日期', dataIndex: 'txn_date', width: 120, sorter: (a, b) => a.txn_date.localeCompare(b.txn_date) },
    {
      title: '金额', dataIndex: 'amount', width: 120,
      render: v => <span className="amount-positive">¥{Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>,
      sorter: (a, b) => a.amount - b.amount
    },
    { title: '付款人', dataIndex: 'payer', width: 140, ellipsis: true },
    { title: '收款人', dataIndex: 'payee', width: 120 },
    { title: '支付方式', dataIndex: 'payment_method', width: 100 },
    { title: '备注', dataIndex: 'remark', width: 200, ellipsis: true },
    {
      title: '匹配状态', dataIndex: 'matched', width: 100,
      render: (v, row) => v
        ? <Tag color="success">已匹配</Tag>
        : <Tag color={row.matched_bill_ids ? 'processing' : 'warning'}>{row.matched_bill_ids ? '部分匹配' : '未匹配'}</Tag>
    },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(row)}>编辑</Button>
          <Popconfirm title="确认删除该条流水？" onConfirm={() => handleDelete(row.id)} okText="删除" cancelText="取消">
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const totals = data.reduce((acc, r) => acc + r.amount, 0)
  const matchedTotal = data.filter(r => r.matched).reduce((acc, r) => acc + r.amount, 0)
  const unmatchedTotal = totals - matchedTotal

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title">账户流水</div>
        <Space>
          <Upload beforeUpload={handleFile} accept=".xlsx,.xls,.csv" showUploadList={false}>
            <Button icon={<ImportOutlined />} type="primary" ghost>导入流水</Button>
          </Upload>
          <Button icon={<DownloadOutlined />}>导出</Button>
          <Button icon={<PlusOutlined />} type="primary" onClick={handleAdd}>新增流水</Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadData()}>刷新</Button>
        </Space>
      </div>

      <div className="stat-cards">
        <div className="stat-card blue">
          <div className="label">本页总金额</div>
          <div className="value">¥{totals.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">共 {total} 条记录</div>
        </div>
        <div className="stat-card green">
          <div className="label">已匹配金额</div>
          <div className="value">¥{matchedTotal.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">{data.filter(r => r.matched).length} 条</div>
        </div>
        <div className="stat-card orange">
          <div className="label">未匹配金额</div>
          <div className="value">¥{unmatchedTotal.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
          <div className="sub">{data.filter(r => !r.matched).length} 条待核对</div>
        </div>
      </div>

      <div className="search-area">
        <Form form={searchForm} layout="inline" onFinish={handleSearch}>
          <Row gutter={16} style={{ width: '100%' }}>
            <Col span={8}>
              <Form.Item label="日期范围" name="dateRange">
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="金额范围" name="amountRange">
                <Space.Compact style={{ display: 'flex', width: '100%' }}>
                  <Form.Item name={['amountRange', 0]} noStyle>
                    <InputNumber style={{ width: '50%' }} placeholder="最小金额" min={0} />
                  </Form.Item>
                  <Form.Item name={['amountRange', 1]} noStyle>
                    <InputNumber style={{ width: '50%' }} placeholder="最大金额" min={0} />
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="匹配状态" name="matched">
                <Select allowClear placeholder="全部" style={{ width: '100%' }}>
                  <Option value={1}>已匹配</Option>
                  <Option value={0}>未匹配</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="付款人" name="payer">
                <Input placeholder="搜索付款人姓名" allowClear prefix={<SearchOutlined />} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="备注" name="remark">
                <Input placeholder="搜索备注关键字" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>搜索</Button>
                  <Button onClick={handleReset}>重置</Button>
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </div>

      <Table<Transaction>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        scroll={{ x: 1200 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: t => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) }
        }}
      />

      <Modal
        title={editing ? '编辑流水' : '新增流水'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <Form form={txnForm} layout="vertical" style={{ marginTop: 10 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="交易日期" name="txn_date" rules={[{ required: true, message: '请选择日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="金额" name="amount" rules={[{ required: true, message: '请输入金额' }]}>
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="付款人" name="payer" rules={[{ required: true, message: '请输入付款人' }]}>
                <Input placeholder="付款人姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="收款人" name="payee">
                <Input placeholder="收款人" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="支付方式" name="payment_method">
                <Select>
                  <Option value="银行转账">银行转账</Option>
                  <Option value="微信支付">微信支付</Option>
                  <Option value="支付宝">支付宝</Option>
                  <Option value="现金">现金</Option>
                  <Option value="POS刷卡">POS刷卡</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="交易单号" name="txn_no">
                <Input placeholder="可选，自动生成" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="备注" name="remark">
                <Input.TextArea rows={2} placeholder="备注信息" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default Transactions
