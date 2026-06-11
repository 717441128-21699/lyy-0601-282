import React, { useState } from 'react'
import { Layout as AntLayout, Menu, theme } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BankOutlined,
  SwapOutlined,
  SafetyCertificateOutlined,
  UndoOutlined,
  BarChartOutlined,
  HomeOutlined
} from '@ant-design/icons'

const { Header, Sider, Content } = AntLayout

const menuItems = [
  { key: '/transactions', icon: <BankOutlined />, label: '账户流水' },
  { key: '/bills', icon: <SwapOutlined />, label: '账单匹配' },
  { key: '/deposits', icon: <SafetyCertificateOutlined />, label: '押金台账' },
  { key: '/refunds', icon: <UndoOutlined />, label: '退款审批' },
  { key: '/summary', icon: <BarChartOutlined />, label: '月度汇总' }
]

const Layout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={220}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            paddingLeft: collapsed ? 0 : 20,
            color: '#fff',
            fontSize: collapsed ? 18 : 17,
            fontWeight: 600,
            background: 'rgba(255,255,255,0.05)',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <HomeOutlined style={{ marginRight: collapsed ? 0 : 10, fontSize: 20 }} />
          {!collapsed && '租赁财务管家'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ marginTop: 8 }}
        />
      </Sider>
      <AntLayout>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            height: 56
          }}
        >
          <div style={{ fontSize: 15, color: 'rgba(0,0,0,0.65)' }}>
            {menuItems.find(m => m.key === location.pathname)?.label as string || '工作台'}
          </div>
          <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
        </Header>
        <Content
          style={{
            margin: 16,
            padding: 0,
            background: '#f0f2f5',
            borderRadius: borderRadiusLG
          }}
        >
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  )
}

export default Layout
