import type { Pool } from 'pg';
import { PaymentService } from './payment.service';

interface ReconcilerOptions {
  runIntervalMs?: number;
  batchSize?: number;
  minAgeMinutes?: number;
}

export class ReconcilerService {
  private db: Pool;
  private paymentService: PaymentService;
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly minAgeMinutes: number;

  constructor(db: Pool, paymentService: PaymentService, options?: ReconcilerOptions) {
    this.db = db;
    this.paymentService = paymentService;
    this.intervalMs = options?.runIntervalMs ?? 6 * 60 * 60 * 1000; // default: 6 hours
    this.batchSize = options?.batchSize ?? 50;
    this.minAgeMinutes = options?.minAgeMinutes ?? 10; // skip very fresh links
  }

  public start(): void {
    if (this.timer) return;
    // Initial delayed run to avoid colliding with cold start
    this.timer = setInterval(() => {
      this.reconcileOnce().catch((err) => {
        console.warn('[Reconciler] reconcileOnce failed:', err?.message || err);
      });
    }, this.intervalMs);

    // Kick off one run soon after start
    setTimeout(() => {
      this.reconcileOnce().catch((err) => {
        console.warn('[Reconciler] initial reconcileOnce failed:', err?.message || err);
      });
    }, Math.min(60_000, Math.floor(this.intervalMs / 10)));

    console.log(`[Reconciler] Started with interval ${Math.round(this.intervalMs / (60 * 1000))} minutes`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Reconciler] Stopped');
    }
  }

  public async reconcileOnce(): Promise<void> {
    // Find pending/unknown links that are older than threshold
    const { rows } = await this.db.query(
      `SELECT id, order_id, peach_checkout_id, stripe_session_id, status
       FROM payment_links
       WHERE status IN ('pending','unknown')
         AND created_at < NOW() - ($1::interval)
       ORDER BY created_at ASC
       LIMIT $2`,
      [`${this.minAgeMinutes} minutes`, this.batchSize]
    );

    if (rows.length === 0) {
      console.log('[Reconciler] No pending payments to reconcile');
      return;
    }

    console.log(`[Reconciler] Reconciling ${rows.length} pending payments...`);
    for (const row of rows) {
      const ref: string | null = row.peach_checkout_id;
      const sessionId: string | null = row.stripe_session_id;

      try {
        if (ref && typeof (this.paymentService as any).confirmPeachReference === 'function') {
          const result = await (this.paymentService as any).confirmPeachReference(ref);
          if (result?.success) {
            console.log(`[Reconciler] Peach payment confirmed for order ${result.orderId} [ref=${ref}]`);
          }
          continue;
        }

        if (sessionId && typeof (this.paymentService as any).confirmCheckoutSession === 'function') {
          const result = await (this.paymentService as any).confirmCheckoutSession(sessionId);
          if (result?.success) {
            console.log(`[Reconciler] Stripe payment confirmed for order ${result.orderId} [session=${sessionId}]`);
          }
          continue;
        }

        console.log(`[Reconciler] Skipped ${row.id}: no recognizable reference or provider method`);
      } catch (err: any) {
        const message = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : (err?.message || String(err));
        console.warn(`[Reconciler] Reconcile failed for ${row.id}:`, message);
      }
    }
  }
}


