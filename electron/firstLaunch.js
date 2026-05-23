import { execFile } from 'child_process';
import { resolveBinary } from './ollama.js';

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
  const needsModel = !(await modelInstalled(resolveBinary(), modelName));
  return { needsModel };
}
