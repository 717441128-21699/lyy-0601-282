import { contextBridge, ipcRenderer } from 'electron'

const api = {
  transactions: {
    list: (params?: any) => ipcRenderer.invoke('transactions:list', params),
    create: (data: any) => ipcRenderer.invoke('transactions:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('transactions:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('transactions:delete', id),
    bulkImport: (data: any[]) => ipcRenderer.invoke('transactions:bulkImport', data),
    search: (filters: any) => ipcRenderer.invoke('transactions:search', filters)
  },
  bills: {
    list: (params?: any) => ipcRenderer.invoke('bills:list', params),
    create: (data: any) => ipcRenderer.invoke('bills:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('bills:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('bills:delete', id),
    getUnmatched: () => ipcRenderer.invoke('bills:getUnmatched'),
    match: (data: any) => ipcRenderer.invoke('bills:match', data),
    confirmMatch: (matchId: number, confirmed: boolean) => ipcRenderer.invoke('bills:confirmMatch', matchId, confirmed)
  },
  deposits: {
    list: (params?: any) => ipcRenderer.invoke('deposits:list', params),
    stats: () => ipcRenderer.invoke('deposits:stats'),
    create: (data: any) => ipcRenderer.invoke('deposits:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('deposits:update', id, data),
    changeStatus: (id: number, status: string, data?: any) => ipcRenderer.invoke('deposits:changeStatus', id, status, data)
  },
  refunds: {
    list: (params?: any) => ipcRenderer.invoke('refunds:list', params),
    create: (data: any) => ipcRenderer.invoke('refunds:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('refunds:update', id, data),
    approve: (id: number, approver: string) => ipcRenderer.invoke('refunds:approve', id, approver),
    updatePaymentStatus: (id: number, status: string) => ipcRenderer.invoke('refunds:updatePaymentStatus', id, status)
  },
  rooms: {
    list: () => ipcRenderer.invoke('rooms:list'),
    create: (data: any) => ipcRenderer.invoke('rooms:create', data)
  },
  tenants: {
    list: () => ipcRenderer.invoke('tenants:list'),
    create: (data: any) => ipcRenderer.invoke('tenants:create', data)
  },
  summary: {
    monthly: (year: number, month: number) => ipcRenderer.invoke('summary:monthly', year, month),
    yearly: (year: number) => ipcRenderer.invoke('summary:yearly', year)
  },
  seed: () => ipcRenderer.invoke('seed:demo')
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
