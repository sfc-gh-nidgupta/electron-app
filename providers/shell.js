import { exec } from 'child_process';
import os from 'os';

export async function chatWithShell(messages) {
  const lastUser = [...(messages || [])].reverse().find(m => m?.role === 'user');
  const command = (lastUser?.content || '').trim();
  if (!command) {
    return { content: '(no command provided)' };
  }

  const shellPath = process.env.SHELL_PATH
    || (process.platform === 'win32'
      ? process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe'
      : process.env.SHELL || '/bin/bash');

  const timeoutMs = Number(process.env.SHELL_TIMEOUT_MS || 120000);
  const maxBuffer = 1024 * 1024 * 10; // 10 MB

  return new Promise((resolve) => {
    exec(command, {
      shell: shellPath,
      cwd: process.cwd(),
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer
    }, (error, stdout, stderr) => {
      let output = '';
      if (stdout) output += stdout;
      if (stderr) output += (output ? '\n' : '') + stderr;
      if (error && !output) output = error.message;
      resolve({ content: output || '(no output)' });
    });
  });
}


