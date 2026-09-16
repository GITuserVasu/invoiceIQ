import type { Pool } from "pg";
import { syncEntityFromSap } from "./connectors/sap.connector.js";
import { runEntityMatch } from "./matching/match.engine.js";

type ScheduledSapChannel = {
  tenantId: string;
  entityId: string;
  entityKey: string;
  connectionSettings: Record<string, unknown>;
};

type SchedulerOptions = {
  hour: number;
  minute: number;
  enabled: boolean;
};

function readSchedule(): SchedulerOptions {
  const [hourText, minuteText] = (process.env.SAP_SYNC_TIME || "18:00").split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return {
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 18,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0,
    enabled: process.env.SAP_SYNC_ENABLED !== "false",
  };
}

export class SapScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly options = readSchedule();

  constructor(private readonly pool: Pool) {}

  start(): void {
    if (!this.options.enabled) {
      console.log("[SAP] daily scheduler disabled");
      return;
    }
    this.scheduleNext();
    console.log(
      `[SAP] daily sync scheduled for ${String(this.options.hour).padStart(2, "0")}:${String(this.options.minute).padStart(2, "0")} local time`,
    );
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleNext(): void {
    const now = new Date();
    const next = new Date(now);
    next.setHours(this.options.hour, this.options.minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    this.timer = setTimeout(() => {
      void this.runOnce().finally(() => this.scheduleNext());
    }, next.getTime() - now.getTime());
  }

  async runOnce(): Promise<void> {
    if (this.running) {
      console.log("[SAP] previous daily sync is still running; skipping overlap");
      return;
    }
    this.running = true;

    let lockAcquired = false;
    try {
      const lock = await this.pool.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext('lexa:sap-daily-sync')) AS acquired",
      );
      lockAcquired = Boolean(lock.rows[0]?.acquired);
      if (!lockAcquired) {
        console.log("[SAP] another backend instance owns the daily sync lock");
        return;
      }

      const channels = await this.loadChannels();
      console.log(`[SAP] daily sync started for ${channels.length} configured channel(s)`);

      for (const channel of channels) {
        await this.syncChannel(channel);
      }

      console.log("[SAP] daily sync finished");
    } catch (error) {
      console.error("[SAP] daily sync failed:", error);
    } finally {
      if (lockAcquired) {
        await this.pool.query("SELECT pg_advisory_unlock(hashtext('lexa:sap-daily-sync'))");
      }
      this.running = false;
    }
  }

  private async loadChannels(): Promise<ScheduledSapChannel[]> {
    const result = await this.pool.query<ScheduledSapChannel>(
      `SELECT c.tenant_id AS "tenantId",
              c.entity_id AS "entityId",
              e.entity_key AS "entityKey",
              c.connection_settings AS "connectionSettings"
         FROM entity_intake_channels c
         JOIN entities e ON e.id = c.entity_id AND e.tenant_id = c.tenant_id
        WHERE c.channel_key = 'sap'
          AND c.is_enabled = true`,
    );
    return result.rows;
  }

  private async syncChannel(channel: ScheduledSapChannel): Promise<void> {
    try {
      const result = await syncEntityFromSap(
        this.pool,
        channel.tenantId,
        channel.entityId,
        channel.connectionSettings as never,
      );
      await this.pool.query(
        `UPDATE entity_intake_channels
            SET connection_status = $1,
                last_connected_at = CASE WHEN $1 = 'connected' THEN now() ELSE last_connected_at END,
                updated_at = now()
          WHERE tenant_id = $2 AND entity_id = $3 AND channel_key = 'sap'`,
        [result.status === "failed" ? "error" : "connected", channel.tenantId, channel.entityId],
      );

      if (result.status === "failed") {
        console.error(`[SAP] ${channel.entityKey} sync failed:`, result.errors);
        return;
      }

      const matches = await runEntityMatch(this.pool, channel.tenantId, channel.entityId);
      console.log(
        `[SAP] ${channel.entityKey}: fetched=${result.fetched}, inserted=${result.inserted}, matched=${matches.filter((match) => match.matchStatus === "matched").length}`,
      );
    } catch (error) {
      await this.pool.query(
        `UPDATE entity_intake_channels
            SET connection_status = 'error', updated_at = now()
          WHERE tenant_id = $1 AND entity_id = $2 AND channel_key = 'sap'`,
        [channel.tenantId, channel.entityId],
      );
      console.error(`[SAP] ${channel.entityKey} sync/matching error:`, error);
    }
  }
}
