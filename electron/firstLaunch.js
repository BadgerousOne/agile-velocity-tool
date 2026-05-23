import { existsSync } from 'fs';
import { execFile } from 'child_process';
import path from 'path';
import { app } from 'electron';

export function managedBinaryPath() {
  return path.join(app.getPath('userData'), 'ollama', 'bin', 'ollama');
}

function modelInstalled(binaryPath, modelName) {
  return new Promise(resolve => {
    execFile(binaryPath, ['list'], { timeout: 10000 }, (err, stdout) => {
      if (err) { resolve(false); return; }
      resolve(stdout.split('\n').some(line =>
        line.toLowerCase().startsWith(modelName.toLowerCase())
      ));
    });
  });
}

export async function check(modelName = 'llama3.2') {
  const binaryPath = managedBinaryPath();
  const needsBinary = !existsSync(binaryPath);
  if (needsBinary) return { needsBinary: true, needsModel: true };
  const needsModel = !(await modelInstalled(binaryPath, modelName));
  return { needsBinary: false, needsModel };
}
