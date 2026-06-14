import { createClient } from '@/lib/supabase'
import type { ProductionOrder } from '@/types/production'
import type { OrderMedia } from '@/types/supplier'
import type { ClientTransitionRequest, ClientTransitionResponse } from '@/types/client'

function supabase() {
  return createClient()
}

export async function listClientOrders(): Promise<ProductionOrder[] | null> {
  const client = supabase()
  if (!client) return null
  const { data, error } = await client
    .from('production_orders')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('listClientOrders', error)
    return null
  }
  return data as ProductionOrder[]
}

export async function getClientOrder(orderId: string): Promise<ProductionOrder | null> {
  const client = supabase()
  if (!client) return null
  const { data, error } = await client
    .from('production_orders')
    .select('*')
    .eq('id', orderId)
    .single()
  if (error) {
    console.error('getClientOrder', error)
    return null
  }
  return data as ProductionOrder
}

export async function getOrderMediaForClient(orderId: string): Promise<OrderMedia[]> {
  const client = supabase()
  if (!client) return []
  const { data, error } = await client
    .from('production_order_media')
    .select('id, stage, media_type, public_url, file_name, mime_type, notes, created_at')
    .eq('production_order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('getOrderMediaForClient', error)
    return []
  }
  return (data ?? []) as OrderMedia[]
}

export async function clientTransition(
  req: ClientTransitionRequest,
): Promise<ClientTransitionResponse> {
  const res = await fetch('/api/client/transition', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(req),
  })
  return res.json() as Promise<ClientTransitionResponse>
}

export { getStageHistory } from '@/lib/workflowEngine'
