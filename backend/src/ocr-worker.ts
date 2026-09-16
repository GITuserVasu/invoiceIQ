import path from "node:path";
import type { Pool } from "pg";

type PendingBatch = {
  id: string;
  batch_id: string;
  tenant_id: string;
  entity_id: string;
  mime_type: string | null;
  stored_file_path: string | null;
};

export class OcrWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly pool: Pool,
    private readonly ocrUrl = process.env.OCR_SERVICE_URL?.trim() || "http://127.0.0.1:8100",
    private readonly intervalMs = Number(process.env.OCR_POLL_INTERVAL_MS || 5000),
  ) {}

  start(): void {
    if (this.timer) return;
    void this.processNext();
    this.timer = setInterval(() => void this.processNext(), this.intervalMs);
    console.log(`[OCR] worker started, polling every ${this.intervalMs}ms`);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async claimBatch(): Promise<PendingBatch | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<PendingBatch>(
        `SELECT b.id, b.batch_id, b.tenant_id, b.entity_id,
                COALESCE(b.mime_type, b.data->>'mime_type') AS mime_type,
                COALESCE(b.stored_file_path, b.data->>'stored_file_path') AS stored_file_path
           FROM entity_processing_batches b
          WHERE b.status = 'processing'
            AND COALESCE(b.processing_attempts, 0) < 3
          ORDER BY b.created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1`,
      );
      const batch = result.rows[0];
      if (!batch) {
        await client.query("COMMIT");
        return null;
      }
      await client.query(
        `UPDATE entity_processing_batches
            SET processing_attempts = COALESCE(processing_attempts, 0) + 1,
                active_step = 1,
                ocr_started_at = COALESCE(ocr_started_at, NOW()),
                updated_at = NOW()
          WHERE id = $1`,
        [batch.id],
      );
      await client.query("COMMIT");
      return batch;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async processNext(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const batch = await this.claimBatch();
      if (batch) await this.processBatch(batch);
    } catch (error) {
      console.error("[OCR] worker cycle failed:", error);
    } finally {
      this.running = false;
    }
  }

  private async processBatch(batch: PendingBatch): Promise<void> {
    const supported = new Set(["image/jpeg", "image/png", "image/tiff"]);
    if (!batch.stored_file_path) {
      await this.failBatch(batch.id, "Stored document path is missing");
      return;
    }
    if (!supported.has(batch.mime_type || "")) {
      await this.failBatch(
        batch.id,
        `OCR worker currently supports JPEG, PNG, and TIFF uploads; received ${batch.mime_type || "unknown"}`,
      );
      return;
    }

    try {
      const response = await fetch(`${this.ocrUrl}/process`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.OCR_SERVICE_TOKEN
            ? { "x-service-token": process.env.OCR_SERVICE_TOKEN }
            : {}),
        },
        body: JSON.stringify({
          tenant_id: batch.tenant_id,
          entity_id: batch.entity_id,
          image_path: path.resolve(batch.stored_file_path),
          batch_id: batch.batch_id,
          channel_key: "upload",
        }),
      });
      if (!response.ok) {
        throw new Error(`OCR service returned HTTP ${response.status}: ${await response.text()}`);
      }
      await this.pool.query(
        `UPDATE entity_processing_batches
            SET status = 'completed',
                active_step = 4,
                completed_steps = ARRAY[1,2,3,4],
                ocr_completed_at = NOW(),
                last_error = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [batch.id],
      );
    } catch (error) {
      await this.failBatch(
        batch.id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async failBatch(batchRowId: string, message: string): Promise<void> {
    const batch = await this.pool.query<{ tenant_id: string; entity_id: string; batch_id: string }>(
      `SELECT tenant_id, entity_id, batch_id
         FROM entity_processing_batches
        WHERE id=$1`,
      [batchRowId],
    );
    await this.pool.query(
      `UPDATE entity_processing_batches
          SET status = CASE
                         WHEN COALESCE(processing_attempts, 0) >= 3 THEN 'failed'
                         ELSE 'processing'
                       END,
              last_error = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [batchRowId, message.slice(0, 1000)],
    );
    if (batch.rows[0]) {
      await this.pool.query(
        `UPDATE supplier_submissions
            SET status='needs_information', error_message=$1, updated_at=NOW()
          WHERE tenant_id=$2 AND entity_id=$3 AND metadata->>'batch_id'=$4`,
        [message.slice(0, 1000), batch.rows[0].tenant_id, batch.rows[0].entity_id, batch.rows[0].batch_id],
      );
    }
  }
}
