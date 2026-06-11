/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      transactions: {
        list: (params?: any) => Promise<any>
        create: (data: any) => Promise<any>
        update: (id: number, data: any) => Promise<any>
        delete: (id: number) => Promise<any>
        bulkImport: (data: any[]) => Promise<any>
        search: (filters: any) => Promise<any>
      }
      bills: {
        list: (params?: any) => Promise<any>
        create: (data: any) => Promise<any>
        update: (id: number, data: any) => Promise<any>
        delete: (id: number) => Promise<any>
        getUnmatched: () => Promise<any>
        match: (data: any) => Promise<any>
        confirmMatch: (matchId: number, confirmed: boolean) => Promise<any>
      }
      deposits: {
        list: (params?: any) => Promise<any>
        create: (data: any) => Promise<any>
        update: (id: number, data: any) => Promise<any>
        changeStatus: (id: number, status: string, data?: any) => Promise<any>
      }
      refunds: {
        list: (params?: any) => Promise<any>
        create: (data: any) => Promise<any>
        update: (id: number, data: any) => Promise<any>
        approve: (id: number, approver: string) => Promise<any>
        updatePaymentStatus: (id: number, status: string) => Promise<any>
      }
      rooms: { list: () => Promise<any[]>; create: (data: any) => Promise<any> }
      tenants: { list: () => Promise<any[]>; create: (data: any) => Promise<any> }
      summary: {
        monthly: (year: number, month: number) => Promise<any>
        yearly: (year: number) => Promise<any[]>
      }
      seed: () => Promise<any>
    }
  }
}

export {}
