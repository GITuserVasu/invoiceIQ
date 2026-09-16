/**
 * connectors/mail.connector.ts
 *
 * Mail connector — fetches invoice PDF/XML attachments from:
 *   • Gmail        (OAuth2 via refresh token + Gmail REST API)
 *   • Microsoft365 (OAuth2 client-credentials + Graph API)
 *   • IMAP         (raw TCP using Node.js `net` module)
 *
 * All connectors produce entity_processing_batches rows and return a
 * ConnectorSyncResult so the caller can act on inserted / skipped counts.
 *
 * Node.js built-in `fetch` is used for all HTTP calls — no external HTTP
 * client packages are required.
 *
 * NOTE (IMAP): The raw-socket IMAP implementation below covers the
 * essential SEARCH UNSEEN + FETCH flow.  For production deployments we
 * strongly recommend replacing it with the `imapflow` npm package
 * (https://imapflow.com) which handles IMAP quirks, TLS negotiation,
 * IDLE, and literal-string responses reliably.
 */

import * as tls from 'node:tls';
import * as net2 from 'node:net';
import type { Pool } from 'pg';
import type { MailConfig, ConnectorSyncResult, DocumentType } from './types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const GMAIL_TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE   = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GRAPH_API_BASE   = 'https://graph.microsoft.com/v1.0/me';

/** Attachment MIME types we are interested in. */
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/xml',
  'text/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'image/tiff',
]);

// ─── Helper: detect document type from filename / subject ─────────────────────

function detectDocumentType(filename: string, subject = ''): DocumentType {
  const haystack = (filename + ' ' + subject).toLowerCase();

  if (/\binv(oice)?\b/.test(haystack))               return 'invoice';
  if (/\b(po|purchase[_\s-]?order)\b/.test(haystack)) return 'purchase_order';
  if (/\b(grn|goods[_\s-]?receipt|delivery[_\s-]?note)\b/.test(haystack)) return 'goods_receipt';
  if (/\b(eway|ewb|e-?way[_\s-]?bill)\b/.test(haystack)) return 'eway_bill';
  if (/\bcredit[_\s-]?note\b/.test(haystack))         return 'credit_note';
  if (/\bdebit[_\s-]?note\b/.test(haystack))          return 'debit_note';
  if (/\bremittance\b/.test(haystack))                return 'remittance_advice';
  if (/\bdelivery\b/.test(haystack))                  return 'proof_of_delivery';

  // Most email attachments in AP flows are invoices.
  return 'invoice';
}

// ─── Helper: base64url → base64 (standard) ────────────────────────────────────

function base64urlToBase64(base64url: string): string {
  return base64url.replace(/-/g, '+').replace(/_/g, '/');
}

// ─── Helper: insert entity_processing_batches row ─────────────────────────────

async function insertProcessingBatch(
  pool: Pool,
  tenantId: string,
  entityId: string,
  filename: string,
  docType: DocumentType,
  attachmentData: string,   // base64-encoded file content
  sourceRef: string,        // e.g. Gmail message ID
  sourceChannel: string,
  fileSizeBytes: number,
): Promise<string> {
  const batchId = `MAIL-${entityId.slice(0, 8).toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const result = await pool.query<{ batch_id: string }>(
    `INSERT INTO entity_processing_batches (
        batch_id,
        tenant_id,
        entity_id,
        source_channel,
        document_type,
        pdf_count,
        page_count,
        status,
        data
     ) VALUES ($1, $2, $3, $4, $5, 1, 1, 'processing', $6::jsonb)
     RETURNING batch_id`,
    [
      batchId,
      tenantId,
      entityId,
      sourceChannel,
      docType,
      JSON.stringify({
        source_ref: sourceRef,
        original_filename: filename,
        file_content_base64: attachmentData,
        file_size_bytes: fileSizeBytes,
      }),
    ],
  );
  return result.rows[0].batch_id;
}

// ─────────────────────────────────────────────────────────────────────────────
// GmailConnector
// ─────────────────────────────────────────────────────────────────────────────

export class GmailConnector {
  constructor(
    private pool: Pool,
    private tenantId: string,
    private entityId: string,
    private config: MailConfig,
  ) {}

  // ── Public entry point ─────────────────────────────────────────────────────

  async sync(): Promise<ConnectorSyncResult> {
    const startedAt = new Date();
    const result: ConnectorSyncResult = {
      source: 'mail',
      entityKey: this.entityId,
      startedAt,
      status: 'success',
      fetched: 0,
      inserted: 0,
      skipped: 0,
      errors: [],
      documents: [],
    };

    try {
      const token      = await this.refreshAccessToken();
      const query      = this.config.searchQuery ?? 'has:attachment';
      const messageIds = await this.listMessages(token, query);

      result.fetched = messageIds.length;

      for (const messageId of messageIds) {
        try {
          const message     = await this.getMessage(token, messageId);
          const subject     = this.getHeader(message.payload?.headers ?? [], 'Subject');
          const attachments = this.extractAttachments(message);

          // Fetch large attachments that only have an attachmentId (not inline data)
          const hydratedAttachments = await Promise.all(
            attachments.map(async (att) => {
              if (att.data) return att;
              if (!att.attachmentId) return null;
              const data = await this.fetchAttachmentData(token, messageId, att.attachmentId);
              return data ? { ...att, data } : null;
            }),
          );

          for (const att of hydratedAttachments) {
            if (!att || !att.data) {
              result.skipped++;
              continue;
            }

            const docType = detectDocumentType(att.filename, subject);
            const base64Standard = base64urlToBase64(att.data);

            try {
              const batchId = await insertProcessingBatch(
                this.pool,
                this.tenantId,
                this.entityId,
                att.filename,
                docType,
                base64Standard,
                messageId,
                'mail',
                att.size,
              );

              result.inserted++;
              result.documents.push({
                type: docType,
                sourceRef: messageId,
                sourceChannel: 'mail',
                documentDate: new Date().toISOString().slice(0, 10),
                currency: 'INR',
                subtotal: 0,
                cgstAmount: 0,
                sgstAmount: 0,
                igstAmount: 0,
                cessAmount: 0,
                totalAmount: 0,
                lineItems: [],
                rawPayload: { messageId, filename: att.filename, batchId, subject },
                attachmentPath: `mail://gmail/${messageId}/${att.filename}`,
              });
            } catch (dbErr) {
              result.errors.push(`DB insert failed for ${att.filename}: ${(dbErr as Error).message}`);
            }
          }
        } catch (msgErr) {
          result.errors.push(`Message ${messageId}: ${(msgErr as Error).message}`);
        }
      }
    } catch (err) {
      result.status  = 'failed';
      result.errors.push((err as Error).message);
    }

    result.completedAt = new Date();
    if (result.errors.length > 0 && result.status !== 'failed') {
      result.status = 'partial';
    }
    return result;
  }

  // ── Private: refresh OAuth2 access token ──────────────────────────────────

  private async refreshAccessToken(): Promise<string> {
    if (!this.config.oauthRefreshToken) {
      throw new Error('Gmail: oauthRefreshToken is required in MailConfig');
    }

    // OAuth2 client credentials are expected as env vars to avoid storing
    // secrets inside the config object.
    const clientId     = process.env.GMAIL_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET environment variables must be set',
      );
    }

    const body = new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: this.config.oauthRefreshToken,
      grant_type:    'refresh_token',
    });

    const response = await fetch(GMAIL_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gmail token refresh failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as { access_token: string };
    return json.access_token;
  }

  // ── Private: list matching message IDs ────────────────────────────────────

  private async listMessages(token: string, query: string): Promise<string[]> {
    const url = new URL(`${GMAIL_API_BASE}/messages`);
    url.searchParams.set('q', query);
    url.searchParams.set('maxResults', '50');

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gmail listMessages failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as {
      messages?: Array<{ id: string }>;
    };

    return (json.messages ?? []).map((m) => m.id);
  }

  // ── Private: fetch full message payload ───────────────────────────────────

  private async getMessage(token: string, messageId: string): Promise<any> {
    const url = `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}?format=full`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gmail getMessage ${messageId} failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  // ── Private: fetch attachment data by attachmentId ────────────────────────

  private async fetchAttachmentData(
    token: string,
    messageId: string,
    attachmentId: string,
  ): Promise<string | null> {
    const url = `${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return null;

    const json = (await response.json()) as { data?: string };
    return json.data ?? null;
  }

  // ── Private: extract attachment metadata from message parts ───────────────

  private extractAttachments(
    message: any,
  ): Array<{
    filename: string;
    mimeType: string;
    data: string | null;
    attachmentId: string | null;
    size: number;
  }> {
    const results: ReturnType<GmailConnector['extractAttachments']> = [];

    const walkParts = (parts: any[]): void => {
      for (const part of parts ?? []) {
        const filename: string = (part.filename ?? '').trim();
        const mimeType: string = (part.mimeType ?? '').toLowerCase();

        if (filename && ACCEPTED_MIME_TYPES.has(mimeType)) {
          const body = part.body ?? {};
          results.push({
            filename,
            mimeType,
            data:         body.data         ?? null,
            attachmentId: body.attachmentId ?? null,
            size:         body.size         ?? 0,
          });
        }

        if (part.parts) {
          walkParts(part.parts);
        }
      }
    };

    walkParts([message.payload]);
    return results;
  }

  // ── Private: extract a named header value ─────────────────────────────────

  private getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
    return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ImapConnector
//
// NOTE: This implementation uses Node.js built-in `net`/`tls` modules to
// speak raw IMAP over a socket.  It handles the common IMAP 4rev1 command
// sequence required for AP attachment retrieval.
//
// For production use we strongly recommend replacing this with the
// `imapflow` npm package (https://imapflow.com).  imapflow handles:
//   • TLS certificate validation
//   • IMAP literal-string responses (large messages)
//   • IDLE push notifications
//   • Connection pooling
// ─────────────────────────────────────────────────────────────────────────────

interface ImapSession {
  write: (data: string) => void;
  destroy: () => void;
  readLine: () => Promise<string>;
  readUntil: (tag: string) => Promise<string[]>;
}

export class ImapConnector {
  constructor(
    private pool: Pool,
    private tenantId: string,
    private entityId: string,
    private config: MailConfig,
  ) {}

  // ── Public entry point ─────────────────────────────────────────────────────

  async sync(): Promise<ConnectorSyncResult> {
    const startedAt = new Date();
    const result: ConnectorSyncResult = {
      source: 'mail',
      entityKey: this.entityId,
      startedAt,
      status: 'success',
      fetched: 0,
      inserted: 0,
      skipped: 0,
      errors: [],
      documents: [],
    };

    let session: ImapSession | null = null;

    try {
      session = await this.connectToImap();

      // Authenticate
      await this.imapCommand(session, 'A001', `LOGIN "${this.config.username}" "${this.config.password}"`);

      // Select mailbox
      const folder = this.config.folder ?? 'INBOX';
      await this.imapCommand(session, 'A002', `SELECT "${folder}"`);

      // Search for unseen messages with attachments
      const searchLines = await this.imapCommand(session, 'A003', 'SEARCH UNSEEN');
      const seqNums      = this.parseSearchResponse(searchLines);

      result.fetched = seqNums.length;

      for (const seqNum of seqNums) {
        try {
          const rawMime = await this.fetchRawMessage(session, seqNum);
          const parts   = this.parseMimeParts(rawMime);

          for (const part of parts) {
            if (!ACCEPTED_MIME_TYPES.has(part.mimeType.toLowerCase())) {
              result.skipped++;
              continue;
            }

            const docType = this.detectDocumentType(part.filename);

            try {
              await insertProcessingBatch(
                this.pool,
                this.tenantId,
                this.entityId,
                part.filename,
                docType,
                part.data,
                `imap-seq-${seqNum}`,
                'mail',
                Buffer.from(part.data, 'base64').length,
              );
              result.inserted++;
              result.documents.push({
                type: docType,
                sourceRef: `imap-seq-${seqNum}`,
                sourceChannel: 'mail',
                documentDate: new Date().toISOString().slice(0, 10),
                currency: 'USD',
                subtotal: 0,
                cgstAmount: 0,
                sgstAmount: 0,
                igstAmount: 0,
                cessAmount: 0,
                totalAmount: 0,
                lineItems: [],
                rawPayload: { seqNum, filename: part.filename },
              });
            } catch (dbErr) {
              result.errors.push(`DB insert failed for ${part.filename}: ${(dbErr as Error).message}`);
            }
          }
        } catch (msgErr) {
          result.errors.push(`IMAP seq ${seqNum}: ${(msgErr as Error).message}`);
        }
      }

      await this.imapCommand(session, 'A999', 'LOGOUT');
    } catch (err) {
      result.status = 'failed';
      result.errors.push((err as Error).message);
    } finally {
      session?.destroy();
    }

    result.completedAt = new Date();
    if (result.errors.length > 0 && result.status !== 'failed') {
      result.status = 'partial';
    }
    return result;
  }

  // ── Private: open TCP (or TLS) connection to IMAP server ──────────────────

  private async connectToImap(): Promise<ImapSession> {
    const host  = this.config.imapHost  ?? 'imap.gmail.com';
    const port  = this.config.imapPort  ?? 993;
    const useTls = port === 993 || port === 465;

    return new Promise((resolve, reject) => {
      const lineBuffer: string[] = [];
      const lineResolvers: Array<(line: string) => void> = [];
      let   partial = '';

      const onData = (data: Buffer) => {
        partial += data.toString('utf8');
        const lines = partial.split('\r\n');
        partial = lines.pop() ?? '';     // last fragment may be incomplete

        for (const line of lines) {
          if (lineResolvers.length > 0) {
            lineResolvers.shift()!(line);
          } else {
            lineBuffer.push(line);
          }
        }
      };

      const socket: tls.TLSSocket | net2.Socket = useTls
        ? tls.connect({ host, port, rejectUnauthorized: true }, () => {
            socket.on('data', onData);
            resolve(buildSession());
          })
        : net2.createConnection({ host, port }, () => {
            socket.on('data', onData);
            resolve(buildSession());
          });

      socket.on('error', reject);

      const buildSession = (): ImapSession => ({
        write: (data: string) => socket.write(data),
        destroy: () => socket.destroy(),
        readLine: () =>
          new Promise<string>((res) => {
            if (lineBuffer.length > 0) {
              res(lineBuffer.shift()!);
            } else {
              lineResolvers.push(res);
            }
          }),
        readUntil: async (tag: string): Promise<string[]> => {
          const lines: string[] = [];
          while (true) {
            const line = await buildSession().readLine();
            lines.push(line);
            if (line.startsWith(tag + ' ')) break;
          }
          return lines;
        },
      });
    });
  }

  // ── Private: send an IMAP command and collect the tagged response ──────────

  private async imapCommand(
    session: ImapSession,
    tag: string,
    command: string,
  ): Promise<string[]> {
    session.write(`${tag} ${command}\r\n`);
    const lines: string[] = [];

    while (true) {
      const line = await session.readLine();
      lines.push(line);
      if (line.startsWith(`${tag} `)) {
        if (line.includes('NO') || line.includes('BAD')) {
          throw new Error(`IMAP command failed: ${line}`);
        }
        break;
      }
    }

    return lines;
  }

  // ── Private: parse SEARCH response to get sequence numbers ────────────────

  private parseSearchResponse(lines: string[]): number[] {
    for (const line of lines) {
      if (line.startsWith('* SEARCH')) {
        const parts = line.slice('* SEARCH'.length).trim().split(/\s+/);
        return parts.filter(Boolean).map(Number).filter((n) => !isNaN(n));
      }
    }
    return [];
  }

  // ── Private: fetch raw RFC 2822 message ───────────────────────────────────

  private async fetchRawMessage(session: ImapSession, seqNum: number): Promise<string> {
    session.write(`F${seqNum} FETCH ${seqNum} (RFC822)\r\n`);
    const lines: string[] = [];
    let collecting = false;

    while (true) {
      const line = await session.readLine();

      if (!collecting && line.startsWith(`* ${seqNum} FETCH`)) {
        collecting = true;
        continue;
      }

      if (collecting) {
        if (line.startsWith(`F${seqNum} `)) break;
        lines.push(line);
      }
    }

    return lines.join('\r\n');
  }

  // ── Private: naïve MIME multipart parser ──────────────────────────────────
  // Extracts base64-encoded attachment parts from a raw RFC 2822 message.

  private parseMimeParts(
    raw: string,
  ): Array<{ filename: string; mimeType: string; data: string }> {
    const results: Array<{ filename: string; mimeType: string; data: string }> = [];

    // Find boundary
    const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);
    if (!boundaryMatch) return results;

    const boundary = '--' + boundaryMatch[1];
    const sections  = raw.split(boundary);

    for (const section of sections) {
      const filenameMatch = section.match(/filename="?([^"\r\n]+)"?/i);
      const ctMatch       = section.match(/Content-Type:\s*([^\r\n;]+)/i);
      const cteMatch      = section.match(/Content-Transfer-Encoding:\s*base64/i);

      if (!filenameMatch || !ctMatch || !cteMatch) continue;

      const filename = filenameMatch[1].trim();
      const mimeType = ctMatch[1].trim().toLowerCase();

      // The base64 data starts after the blank line following the headers
      const headerBodySplit = section.indexOf('\r\n\r\n');
      if (headerBodySplit === -1) continue;

      const rawData = section
        .slice(headerBodySplit + 4)
        .replace(/\r\n/g, '')
        .trim();

      if (rawData) {
        results.push({ filename, mimeType, data: rawData });
      }
    }

    return results;
  }

  // ── Private: detect document type from filename ───────────────────────────

  private detectDocumentType(filename: string): DocumentType {
    return detectDocumentType(filename);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Microsoft365Connector
// ─────────────────────────────────────────────────────────────────────────────

export class Microsoft365Connector {
  constructor(
    private pool: Pool,
    private tenantId: string,
    private entityId: string,
    private config: MailConfig,
  ) {}

  // ── Public entry point ─────────────────────────────────────────────────────

  async sync(): Promise<ConnectorSyncResult> {
    const startedAt = new Date();
    const result: ConnectorSyncResult = {
      source: 'mail',
      entityKey: this.entityId,
      startedAt,
      status: 'success',
      fetched: 0,
      inserted: 0,
      skipped: 0,
      errors: [],
      documents: [],
    };

    try {
      const token    = await this.getGraphToken();
      const messages = await this.fetchMessages(token);

      result.fetched = messages.length;

      for (const message of messages) {
        try {
          const subject     = (message.subject ?? '') as string;
          const attachments = await this.getAttachments(token, message.id as string);

          for (const att of attachments) {
            const filename: string = att.name ?? 'attachment';
            const mimeType: string = (att.contentType ?? '').toLowerCase();

            if (!ACCEPTED_MIME_TYPES.has(mimeType)) {
              result.skipped++;
              continue;
            }

            // Graph API returns content as base64 in att.contentBytes
            const contentBytes: string = att.contentBytes ?? '';
            if (!contentBytes) {
              result.skipped++;
              continue;
            }

            const docType = detectDocumentType(filename, subject);

            try {
              const batchId = await insertProcessingBatch(
                this.pool,
                this.tenantId,
                this.entityId,
                filename,
                docType,
                contentBytes,
                message.id as string,
                'mail',
                Buffer.from(contentBytes, 'base64').length,
              );

              result.inserted++;
              result.documents.push({
                type: docType,
                sourceRef: message.id as string,
                sourceChannel: 'mail',
                documentDate: new Date().toISOString().slice(0, 10),
                currency: 'INR',
                subtotal: 0,
                cgstAmount: 0,
                sgstAmount: 0,
                igstAmount: 0,
                cessAmount: 0,
                totalAmount: 0,
                lineItems: [],
                rawPayload: { messageId: message.id, filename, batchId, subject },
                attachmentPath: `mail://m365/${message.id}/${filename}`,
              });
            } catch (dbErr) {
              result.errors.push(`DB insert failed for ${filename}: ${(dbErr as Error).message}`);
            }
          }
        } catch (msgErr) {
          result.errors.push(`M365 message ${message.id}: ${(msgErr as Error).message}`);
        }
      }
    } catch (err) {
      result.status = 'failed';
      result.errors.push((err as Error).message);
    }

    result.completedAt = new Date();
    if (result.errors.length > 0 && result.status !== 'failed') {
      result.status = 'partial';
    }
    return result;
  }

  // ── Private: acquire Graph API access token (client credentials flow) ──────

  private async getGraphToken(): Promise<string> {
    const aadTenantId    = process.env.AZURE_TENANT_ID;
    const clientId       = process.env.AZURE_CLIENT_ID;
    const clientSecret   = process.env.AZURE_CLIENT_SECRET;

    if (!aadTenantId || !clientId || !clientSecret) {
      throw new Error(
        'AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET environment variables must be set',
      );
    }

    const tokenUrl = `https://login.microsoftonline.com/${aadTenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      scope:         'https://graph.microsoft.com/.default',
      grant_type:    'client_credentials',
    });

    const response = await fetch(tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`M365 token acquisition failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as { access_token: string };
    return json.access_token;
  }

  // ── Private: list messages that have attachments ───────────────────────────

  private async fetchMessages(token: string): Promise<any[]> {
    const url = `${GRAPH_API_BASE}/messages?$filter=hasAttachments eq true&$top=50&$select=id,subject,receivedDateTime,from`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Graph fetchMessages failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as { value?: any[] };
    return json.value ?? [];
  }

  // ── Private: get attachment list for a message ────────────────────────────

  private async getAttachments(token: string, messageId: string): Promise<any[]> {
    const url = `${GRAPH_API_BASE}/messages/${encodeURIComponent(messageId)}/attachments`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Graph getAttachments ${messageId} failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as { value?: any[] };
    return json.value ?? [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * syncEntityFromMail
 *
 * Selects the appropriate connector based on config.provider and runs the
 * full sync cycle, returning a unified ConnectorSyncResult.
 *
 * @example
 * ```typescript
 * const result = await syncEntityFromMail(pool, tenantId, entityId, {
 *   provider: 'gmail',
 *   mailbox:  'ap@acme.com',
 *   username: 'ap@acme.com',
 *   oauthRefreshToken: process.env.GMAIL_REFRESH_TOKEN!,
 *   folder:   'INBOX',
 *   syncFrequency: '0 * * * *',
 *   searchQuery: 'has:attachment subject:invoice',
 * });
 * console.log(`Inserted ${result.inserted} batches`);
 * ```
 */
export async function syncEntityFromMail(
  pool: Pool,
  tenantId: string,
  entityId: string,
  config: MailConfig,
): Promise<ConnectorSyncResult> {
  switch (config.provider) {
    case 'gmail':
      return new GmailConnector(pool, tenantId, entityId, config).sync();

    case 'microsoft365':
      return new Microsoft365Connector(pool, tenantId, entityId, config).sync();

    case 'imap':
      return new ImapConnector(pool, tenantId, entityId, config).sync();

    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unknown mail provider: ${_exhaustive}`);
    }
  }
}
