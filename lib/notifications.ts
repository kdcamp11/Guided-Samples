/**
 * Notification system — core logic
 *
 * Called by workflowEngine after every successful stage transition.
 * Creates in-app notification records and sends email (if prefs allow).
 *
 * Recipient routing:
 *   client   → order.user_email (brand owner who owns the order)
 *   supplier → order.supplier_email
 *   both     → both parties
 */

import { createClient } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductionStage } from '@/types/productionStages'

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'first_piece_ready'
  | 'first_piece_revision'
  | 'revision_requested'
  | 'sample_shipped'
  | 'sample_delivered'
  | 'bulk_approved'
  | 'tracking_uploaded'
  | 'order_delivered'
  | 'order_cancelled'
  | 'qc_passed'
  | 'order_packed'
  | 'deposit_due'
  | 'final_payment_due'

export type InAppNotification = {
  id:                   string
  production_order_id:  string
  recipient_email:      string
  type:                 NotificationType
  title:                string
  body:                 string
  is_read:              boolean
  created_at:           string
}

export type NotificationPreferences = {
  email_enabled:   boolean
  email_overrides: Partial<Record<NotificationType, boolean>>
}

// ─── Transition → notification map ───────────────────────────────────────────

type NotificationSpec = {
  recipient: 'client' | 'supplier' | 'both'
  type:      NotificationType
  title:     string
  body:      (meta: Record<string, unknown>) => string
}

const TRANSITION_NOTIFICATIONS: Partial<Record<ProductionStage, NotificationSpec>> = {
  FIRST_PIECE_REVIEW: {
    recipient: 'client',
    type:      'first_piece_ready',
    title:     'Your First Sample is Ready to Review',
    body:      () => 'Your factory has completed the first sample and shared photos for your approval. Log in to review and decide whether to ship or request changes.',
  },
  // Triggered when the client requests changes on the first-piece photos —
  // the order returns to production so the supplier can address the notes.
  FIRST_PIECE_IN_PRODUCTION: {
    recipient: 'supplier',
    type:      'first_piece_revision',
    title:     'Client Requested Changes to First Piece',
    body:      (m) => m.revision_notes
      ? `The client has requested changes before shipping: "${String(m.revision_notes).slice(0, 200)}". Please update the first piece and re-submit photos.`
      : 'The client has requested changes to the first piece. Check the order notes and re-submit photos when ready.',
  },
  REVISION_REQUIRED: {
    recipient: 'supplier',
    type:      'revision_requested',
    title:     'Revision Requested',
    body:      (m) => m.revision_notes
      ? `The client has requested changes: "${String(m.revision_notes).slice(0, 200)}"`
      : 'The client has requested revisions to the sample. Check the order for details.',
  },
  SAMPLE_SHIPPED: {
    recipient: 'client',
    type:      'sample_shipped',
    title:     'Sample Shipped',
    body:      (m) => m.carrier && m.tracking_number
      ? `Your sample is on its way via ${m.carrier}. Tracking: ${m.tracking_number}`
      : 'Your pre-production sample has been dispatched.',
  },
  SAMPLE_DELIVERED: {
    recipient: 'client',
    type:      'sample_delivered',
    title:     'Sample Delivered',
    body:      () => 'Your sample has arrived. GRACE is confirming delivery and will open it for your evaluation shortly.',
  },
  CLIENT_SAMPLE_EVALUATION: {
    recipient: 'client',
    type:      'sample_delivered',
    title:     'Your Sample is Ready to Evaluate',
    body:      () => 'Your sample delivery has been confirmed. Log in to review it and make your decision.',
  },
  BULK_PRODUCTION: {
    recipient: 'supplier',
    type:      'bulk_approved',
    title:     'Bulk Production Approved',
    body:      (m) => m.evaluation_notes
      ? `The client approved the sample and left a note: "${String(m.evaluation_notes).slice(0, 200)}"`
      : 'The client approved the sample. Begin bulk production.',
  },
  AWAITING_PRODUCTION_DEPOSIT: {
    recipient: 'client',
    type:      'deposit_due',
    title:     'Production Deposit Required',
    body:      () => 'Your sample is approved! Pay the 50% production deposit to authorize bulk manufacturing.',
  },
  QUALITY_CHECK: {
    recipient: 'client',
    type:      'qc_passed',
    title:     'Quality Check in Progress',
    body:      () => 'Bulk production is complete. Your order is undergoing final quality inspection.',
  },
  AWAITING_FINAL_PAYMENT: {
    recipient: 'client',
    type:      'final_payment_due',
    title:     'Final Payment Required',
    body:      () => 'Your order passed quality check. Pay the remaining balance to authorize shipment.',
  },
  READY_TO_SHIP: {
    recipient: 'supplier',
    type:      'bulk_approved',
    title:     'Final Payment Received — Ready to Ship',
    body:      () => 'The client has paid the final balance. Ship the bulk order and upload tracking details.',
  },
  PACKING: {
    recipient: 'client',
    type:      'order_packed',
    title:     'Order Being Packed',
    body:      () => 'Your order has passed quality inspection and is being packed for shipment.',
  },
  SHIPPED: {
    recipient: 'client',
    type:      'tracking_uploaded',
    title:     'Tracking Information Available',
    body:      (m) => m.carrier && m.tracking_number
      ? `Your bulk order has shipped via ${m.carrier}. Tracking: ${m.tracking_number}`
      : 'Your bulk order has been dispatched. Tracking information is now available.',
  },
  DELIVERED: {
    recipient: 'both',
    type:      'order_delivered',
    title:     'Order Delivered',
    body:      () => 'The order has been marked as delivered. Production is complete.',
  },
  CANCELLED: {
    recipient: 'both',
    type:      'order_cancelled',
    title:     'Order Cancelled',
    body:      (m) => m.cancellation_reason
      ? `The order has been cancelled. Reason: ${String(m.cancellation_reason).slice(0, 200)}`
      : 'The production order has been cancelled.',
  },
}

// ─── Core: create a notification record ──────────────────────────────────────

async function insertNotification(
  supabase:           ReturnType<typeof createClient>,
  orderId:            string,
  recipientEmail:     string,
  type:               NotificationType,
  title:              string,
  body:               string,
): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('notifications').insert({
    production_order_id: orderId,
    recipient_email:     recipientEmail,
    type,
    title,
    body,
  })
  if (error) console.error('notifications: insert failed', error)
}

// ─── Email sending via Resend ─────────────────────────────────────────────────

async function sendEmail(
  to:      string,
  subject: string,
  body:    string,
  orderId: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.graceenterprise.com'

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;padding:32px 16px;">
      <div style="margin-bottom:24px;">
        <div style="display:inline-block;background:#184D3E;border-radius:10px;padding:8px 12px;">
          <span style="color:white;font-weight:700;font-size:13px;letter-spacing:-0.3px;">GRACE</span>
        </div>
      </div>
      <h2 style="font-size:18px;font-weight:700;margin:0 0 8px;">${subject}</h2>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px;">${body}</p>
      <a href="${appUrl}/track"
         style="display:inline-block;background:#184D3E;color:white;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;">
        View Order
      </a>
      <p style="font-size:11px;color:#aaa;margin-top:32px;">
        GRACE Production Hub · You received this because you are part of production order ${orderId.slice(0, 8)}…
      </p>
    </body>
    </html>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({
        from:    'GRACE Production Hub <notifications@graceenterprise.com>',
        to:      [to],
        subject: `[GRACE] ${subject}`,
        html,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('notifications: email send failed', err)
    }
  } catch (e) {
    console.error('notifications: email fetch error', e)
  }
}

// ─── Preference check ─────────────────────────────────────────────────────────

async function emailEnabled(
  supabase:  ReturnType<typeof createClient>,
  email:     string,
  type:      NotificationType,
): Promise<boolean> {
  if (!supabase) return true
  const { data } = await supabase
    .from('notification_preferences')
    .select('email_enabled, email_overrides')
    .eq('user_email', email)
    .maybeSingle()
  if (!data) return true  // default: enabled
  const overrides = (data.email_overrides ?? {}) as Partial<Record<NotificationType, boolean>>
  if (type in overrides) return !!overrides[type]
  return data.email_enabled
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Called by workflowEngine after a successful stage transition.
 * Does NOT throw — notification failures must never break transitions.
 */
export async function triggerNotifications(params: {
  orderId:        string
  toStage:        ProductionStage
  metadata:       Record<string, unknown>
  clientEmail:    string | null
  supplierEmail:  string | null
  // Server contexts (e.g. the Stripe webhook) inject an authenticated client;
  // createClient() returns null outside the browser, which would silently drop
  // in-app notification inserts.
  client?:        SupabaseClient
}): Promise<void> {
  const { orderId, toStage, metadata, clientEmail, supplierEmail, client } = params

  const spec = TRANSITION_NOTIFICATIONS[toStage]
  if (!spec) return

  const supabase = (client ?? createClient()) as ReturnType<typeof createClient>
  const body     = spec.body(metadata)

  const targets: Array<{ email: string; label: 'client' | 'supplier' }> = []
  if ((spec.recipient === 'client' || spec.recipient === 'both') && clientEmail) {
    targets.push({ email: clientEmail, label: 'client' })
  }
  if ((spec.recipient === 'supplier' || spec.recipient === 'both') && supplierEmail) {
    targets.push({ email: supplierEmail, label: 'supplier' })
  }

  await Promise.allSettled(
    targets.map(async ({ email }) => {
      // In-app
      await insertNotification(supabase, orderId, email, spec.type, spec.title, body)
      // Email (if prefs allow)
      const sendMail = await emailEnabled(supabase, email, spec.type)
      if (sendMail) await sendEmail(email, spec.title, body, orderId)
    }),
  )
}

// ─── Client-side helpers ──────────────────────────────────────────────────────

export async function listNotifications(limit = 30): Promise<InAppNotification[]> {
  const supabase = createClient()
  if (!supabase) return []
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as InAppNotification[]
}

export async function markAllRead(): Promise<void> {
  const supabase = createClient()
  if (!supabase) return
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)
}

export async function markRead(id: string): Promise<void> {
  const supabase = createClient()
  if (!supabase) return
  await supabase.from('notifications').update({ is_read: true }).eq('id', id)
}

export async function getPreferences(): Promise<NotificationPreferences> {
  const supabase = createClient()
  if (!supabase) return { email_enabled: true, email_overrides: {} }
  const { data } = await supabase
    .from('notification_preferences')
    .select('email_enabled, email_overrides')
    .maybeSingle()
  if (!data) return { email_enabled: true, email_overrides: {} }
  return {
    email_enabled:   data.email_enabled,
    email_overrides: (data.email_overrides ?? {}) as NotificationPreferences['email_overrides'],
  }
}

export async function savePreferences(prefs: NotificationPreferences): Promise<void> {
  const res = await fetch('/api/notifications/preferences', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(prefs),
  })
  if (!res.ok) throw new Error('Failed to save preferences')
}
