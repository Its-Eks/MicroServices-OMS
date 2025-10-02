import { DatabaseService } from './database.service';

export type SlaStatus = 'ok' | 'warning' | 'breached' | 'unknown';

export interface SlaResult {
  status: SlaStatus;
  elapsedHours: number;
  slaHours: number;
  dueAt?: string;
  context?: Record<string, unknown>;
}

// PRD-aligned thresholds for ORDER workflow states
const orderStateSlaHours: Record<string, { warning: number; breach: number }> = {
  created: { warning: 1, breach: 2 },
  validated: { warning: 2, breach: 4 },
  enriched: { warning: 4, breach: 8 },
  fno_submitted: { warning: 8, breach: 24 },
  fno_accepted: { warning: 2, breach: 4 },
  installation_scheduled: { warning: 4, breach: 8 },
  in_progress: { warning: 24, breach: 48 },
  installed: { warning: 2, breach: 4 },
  activated: { warning: 1, breach: 2 },
  completed: { warning: 0, breach: 0 },
  cancelled: { warning: 0, breach: 0 },
  // service_change
  change_scheduled: { warning: 4, breach: 8 },
  changed: { warning: 2, breach: 4 },
  // disconnect
  disconnection_scheduled: { warning: 4, breach: 8 },
  disconnected: { warning: 2, breach: 4 },
};

// PRD-aligned thresholds for ONBOARDING canonical steps
const onboardingStepSlaHours: Record<string, number> = {
  initiated: 2,
  welcome_sent: 2,
  service_setup: 24,
  equipment_ordered: 48,
  equipment_shipped: 72,
  installation_scheduled: 24,
  installation_completed: 24,
  service_activated: 12,
  follow_up: 168,
  completed: 0,
};

export class SlaService {
  constructor(private db: DatabaseService) {}

  private parseUtcDate(input: any): Date | null {
    if (!input) return null;
    try {
      if (input instanceof Date) return input;
      const s = String(input);
      // If timestamp has no timezone info, treat it as UTC by appending 'Z'
      const hasTz = /z$|[\+\-]\d{2}:?\d{2}$/i.test(s);
      const normalized = hasTz ? s : (s.endsWith('Z') ? s : `${s}Z`);
      const d = new Date(normalized);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  private computeStatus(elapsed: number, warning: number, breach: number): SlaStatus {
    if (breach <= 0 && warning <= 0) return 'unknown';
    if (elapsed >= breach) return 'breached';
    if (elapsed >= warning) return 'warning';
    return 'ok';
  }

  async getOrderSla(orderId: string): Promise<SlaResult> {
    // Pull minimal order context
    const r = await this.db.query(
      `SELECT id, status AS current_state, updated_at, created_at, order_type
       FROM orders WHERE id = $1`,
      [orderId]
    );
    if (r.rows.length === 0) {
      return { status: 'unknown', elapsedHours: 0, slaHours: 0 };
    }
    const row = r.rows[0];
    const rawState: string = (row.current_state || '').toString();
    const state: string = rawState.toLowerCase().trim().replace(/\s+/g, '_');
    const timestamps = {
      stateChangedAt: this.parseUtcDate(row.updated_at),
      createdAt: this.parseUtcDate(row.created_at),
    };
    const basis = timestamps.stateChangedAt || timestamps.createdAt || new Date();
    const nowMs = Date.now();
    const elapsedHours = Math.max(0, (nowMs - basis.getTime()) / 3600000);
    const isTerminal = state === 'completed' || state === 'cancelled';
    const defaultThresholds = isTerminal ? { warning: 0, breach: 0 } : { warning: 4, breach: 8 };
    const thresholds = orderStateSlaHours[state] || defaultThresholds;
    const status = this.computeStatus(elapsedHours, thresholds.warning, thresholds.breach);
    const slaHours = thresholds.breach || thresholds.warning || 0;
    const dueAt = slaHours > 0 ? new Date(basis.getTime() + slaHours * 3600000).toISOString() : undefined;
    return {
      status,
      elapsedHours,
      slaHours,
      dueAt,
      context: { state, orderType: row.order_type }
    };
  }

  async getOnboardingSla(onboardingId: string): Promise<SlaResult> {
    const r = await this.db.query(
      `SELECT id, order_id, current_step, started_at, completed_at, updated_at
         FROM customer_onboarding WHERE id = $1`,
      [onboardingId]
    );
    if (r.rows.length === 0) return { status: 'unknown', elapsedHours: 0, slaHours: 0 };
    const row = r.rows[0];
    // If linked to an order, delegate to order SLA for unified behavior
    if (row.order_id) {
      return await this.getOrderSla(row.order_id);
    }
    const step: string = (row.current_step || '').toString();
    const basis = this.parseUtcDate(row.updated_at) || this.parseUtcDate(row.started_at) || new Date();
    const nowMs = Date.now();
    const elapsedHours = Math.max(0, (nowMs - basis.getTime()) / 3600000);
    const slaHours = onboardingStepSlaHours[step] ?? 0;
    let status: SlaStatus = 'unknown';
    if (slaHours === 0) status = step === 'completed' ? 'ok' : 'unknown';
    else status = this.computeStatus(elapsedHours, Math.max(1, Math.floor(slaHours * 0.5)), slaHours);
    const dueAt = slaHours > 0 ? new Date(basis.getTime() + slaHours * 3600000).toISOString() : undefined;
    return { status, elapsedHours, slaHours, dueAt, context: { step } };
  }
}


