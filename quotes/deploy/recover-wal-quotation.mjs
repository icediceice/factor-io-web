// Recover a deleted quotation and its lines from pre-delete SQLite WAL frames.
import { DatabaseSync } from 'node:sqlite';
import {
  copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { tx, audit } from '../lib/db.mjs';

export function extractFromWal(dbPath, targetId = 10) {
  const walPath = `${dbPath}-wal`;
  if (!existsSync(walPath)) throw new Error(`WAL file missing: ${walPath}`);
  const walBytes = readFileSync(walPath);
  if (walBytes.length < 32) throw new Error(`WAL file too small (${walBytes.length} bytes)`);

  const pageSize = walBytes.readUInt32BE(8) || 4096;
  const frameSize = 24 + pageSize;
  const totalFrames = Math.floor((walBytes.length - 32) / frameSize);
  const commitOffsets = [];
  for (let i = 0; i < totalFrames; i++) {
    const offset = 32 + i * frameSize;
    const dbPagesAtCommit = walBytes.readUInt32BE(offset + 4);
    if (dbPagesAtCommit > 0) {
      commitOffsets.push(offset + frameSize);
    }
  }

  for (const endByte of commitOffsets) {
    const workDir = mkdtempSync(join(tmpdir(), 'quotes-wal-recover-'));
    try {
      const tmpDb = join(workDir, 'quotes.db');
      const tmpWal = `${tmpDb}-wal`;
      copyFileSync(dbPath, tmpDb);
      writeFileSync(tmpWal, walBytes.subarray(0, endByte));
      const probe = new DatabaseSync(tmpDb);
      try {
        const quotation = probe.prepare('SELECT * FROM quotations WHERE id = ?').get(targetId);
        if (quotation) {
          const lines = probe.prepare(
            'SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY position, id'
          ).all(targetId);
          const revisions = probe.prepare(
            'SELECT * FROM quotation_revisions WHERE quotation_id = ? ORDER BY rev'
          ).all(targetId);
          return { quotation, lines, revisions, walEndByte: endByte };
        }
      } finally {
        probe.close();
      }
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
  throw new Error(`quotation id=${targetId} not found in any WAL commit frame (${commitOffsets.length} commits scanned)`);
}

export function recoverWalQuotation(dbPath, { targetId = 10, apply = false } = {}) {
  const liveCheck = new DatabaseSync(dbPath, { readOnly: true });
  let existing = null;
  try {
    existing = liveCheck.prepare('SELECT * FROM quotations WHERE id = ?').get(targetId);
    if (existing) {
      const lines = liveCheck.prepare('SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY position, id').all(targetId);
      return { alreadyPresent: true, quotation: existing, lines };
    }
  } finally {
    liveCheck.close();
  }

  const recovered = extractFromWal(dbPath, targetId);
  if (!apply) return { alreadyPresent: false, applied: false, ...recovered };

  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    return tx(db, () => {
      const q = recovered.quotation;
      const qCols = Object.keys(q);
      db.prepare(
        `INSERT INTO quotations (${qCols.join(', ')}) VALUES (${qCols.map(() => '?').join(', ')})`
      ).run(...qCols.map((c) => q[c]));

      for (const l of recovered.lines) {
        const lCols = Object.keys(l);
        db.prepare(
          `INSERT INTO quotation_lines (${lCols.join(', ')}) VALUES (${lCols.map(() => '?').join(', ')})`
        ).run(...lCols.map((c) => l[c]));
      }

      const delAudit = db.prepare(
        "SELECT id, detail FROM audit_log WHERE action = 'quotation.delete' AND entity_id = ? ORDER BY id DESC LIMIT 1"
      ).get(String(q.id));
      if (delAudit) {
        const parsed = JSON.parse(delAudit.detail || '{}');
        parsed.snapshot = {
          quotation: q,
          lines: recovered.lines,
          revisions: recovered.revisions,
        };
        db.prepare('UPDATE audit_log SET detail = ? WHERE id = ?').run(JSON.stringify(parsed), delAudit.id);
      }

      audit(db, 'wal-recovery', 'quotation.restore', 'quotation', q.id, {
        number: q.number,
        client_id: q.client_id,
        lines: recovered.lines.length,
        source: 'quotes.db-wal',
        wal_end_byte: recovered.walEndByte,
      });

      return {
        alreadyPresent: false,
        applied: true,
        quotation: { id: q.id, number: q.number, client_id: q.client_id, status: q.status, created_at: q.created_at, sow_json: q.sow_json },
        lines: recovered.lines,
      };
    });
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--db' || !['--dry-run', '--apply'].includes(args[2])) {
    throw new Error('usage: node deploy/recover-wal-quotation.mjs --db ABSOLUTE_PATH --dry-run|--apply');
  }
  if (!isAbsolute(args[1]) || !existsSync(args[1])) {
    throw new Error(`database missing or path is not absolute: ${args[1]}`);
  }
  const dbPath = realpathSync(args[1]);
  const res = recoverWalQuotation(dbPath, { targetId: 10, apply: args[2] === '--apply' });
  console.log(JSON.stringify({
    alreadyPresent: res.alreadyPresent,
    applied: res.applied,
    quotation: {
      id: res.quotation.id,
      number: res.quotation.number,
      client_id: res.quotation.client_id,
      status: res.quotation.status,
      created_at: res.quotation.created_at,
      sow_len: (res.quotation.sow_json ?? '').length,
    },
    lines: res.lines,
  }, null, 2));
}
