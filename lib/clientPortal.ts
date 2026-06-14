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
    .select('id, stage, media_type, storage_path, public_url, file_name, mime_type, notes, created_at')
    .eq('production_order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('getOrderMediaForClient', error)
    return []
  }

  // Bucket is private — convert stored paths into short-lived signed URLs so
  // the <img>/<video> tags can actually load the media.
  const rows = (data ?? []) as Record<string, unknown>[]
  return Promise.all(
    rows.map(async row => {
      const path = row.storage_path as string | null
      let url = row.public_url as string
      if (path) {
        const { data: s } = await client.storage
          .from('production-media')
          .createSignedUrl(path, 60 * 60)
        if (s?.signedUrl) url = s.signedUrl
      }
      return { ...row, public_url: url } as OrderMedia
    }),
  )
}

export async function clientTransition(
  req: ClientTransitionRequest,
): Promise<ClientTransitionResponse> {
  const client = supabase()
  const token = client
    ? (await client.auth.getSession()).data.session?.access_token
    : null

  const res = await fetch('/api/client/transition', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body:    JSON.stringify(req),
  })
  return res.json() as Promise<ClientTransitionResponse>
}

export { getStageHistory } from '@/lib/workflowEngine'
