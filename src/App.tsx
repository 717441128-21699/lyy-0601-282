import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Transactions from './pages/Transactions'
import BillMatching from './pages/BillMatching'
import DepositLedger from './pages/DepositLedger'
import RefundApproval from './pages/RefundApproval'
import MonthlySummary from './pages/MonthlySummary'
import Dashboard from './pages/Dashboard'
import { App as AntdApp } from 'antd'

const App: React.FC = () => {
  const { message } = AntdApp.useApp()

  useEffect(() => {
    const init = async () => {
      try {
        await window.api.seed()
      } catch (e) {
        console.error('Seed error:', e)
      }
    }
    init()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="bill-matching" element={<BillMatching />} />
          <Route path="deposits" element={<DepositLedger />} />
          <Route path="refunds" element={<RefundApproval />} />
          <Route path="summary" element={<MonthlySummary />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
