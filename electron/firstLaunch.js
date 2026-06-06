import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import { app } from 'electron';

// A flag file written after a successful first-launch setup.
// Faster and more reliable than shelling out to `ollama list`.
const flagFile = () => path.join(app.getPath('userData'), '.setup_complete');

export function isSetupComplete() {
  return existsSync(flagFile());
}

export async function markSetupComplete() {
  await writeFile(flagFile(), new Date().toISOString(), 'utf8');
}
