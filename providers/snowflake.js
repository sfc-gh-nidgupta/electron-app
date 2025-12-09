import { exec } from 'child_process';
import os from 'os';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';

function execAsync(command, options) {
  return new Promise((resolve, reject) => {
    exec(command, { ...options, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      if (error) {
        const msg = [stdout, stderr, error.message].filter(Boolean).join('\n').trim();
        reject(new Error(msg || 'Snowflake CLI error'));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function chatWithSnowflake(messages, connectionOverride) {
  const lastUser = [...(messages || [])].reverse().find(m => m?.role === 'user');
  const sql = (lastUser?.content || '').trim();
  if (!sql) {
    return { content: '(no SQL provided)' };
  }

  const connectionName = connectionOverride || process.env.SNOW_CONNECTION;
  const connectionFlag = connectionName ? `-c ${JSON.stringify(connectionName)}` : '';
  const outputFlag = '--output json';

  // Write SQL to a temp file to avoid shell-quoting issues
  const tmpDir = await mkdtemp(join(os.tmpdir(), 'electronchat-snow-'));
  const sqlPath = join(tmpDir, 'query.sql');
  await writeFile(sqlPath, sql, 'utf8');

  try {
    const cmd = `snow sql -f ${JSON.stringify(sqlPath)} ${connectionFlag} ${outputFlag}`;
    const { stdout } = await execAsync(cmd, { windowsHide: true });
    // Return raw JSON or pretty text if JSON parseable
    try {
      const parsed = JSON.parse(stdout);
      const rows = parsed?.result?.data || parsed?.data || parsed;
      if (Array.isArray(rows) && rows.length && typeof rows[0] === 'object') {
        const cols = Object.keys(rows[0]);
        const header = cols.join('\t');
        const body = rows.map(r => cols.map(c => String(r[c] ?? '')).join('\t')).join('\n');
        return { content: header + '\n' + body };
      }
      return { content: stdout };
    } catch {
      return { content: stdout || '(no output)' };
    }
  } finally {
    // Best-effort cleanup
    try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}


