#!/usr/bin/env node
// Generates version.json and .env.production.local with a build stamp
const fs = require('fs');
const path = require('path');

function generate() {
  const buildTime = new Date();
  const timestamp = buildTime.getTime();
  const iso = buildTime.toISOString();
  const versionObj = { version: timestamp, iso, commit: process.env.GIT_COMMIT || '' };

  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'version.json'), JSON.stringify(versionObj, null, 2));

  // .env.production.local for Vite
  const envFile = path.join(__dirname, '..', '.env.production.local');
  fs.writeFileSync(envFile, `VITE_BUILD_VERSION=${timestamp}\nVITE_BUILD_ISO=${iso}\n`);

  // Inject placeholder replacement into service-worker (simple token)
  const swPath = path.join(publicDir, 'service-worker.js');
  if (fs.existsSync(swPath)) {
    let sw = fs.readFileSync(swPath, 'utf-8');
    sw = sw.replace(/const CACHE_VERSION =[^;]+;/, `const CACHE_VERSION = '${timestamp}';`);
    fs.writeFileSync(swPath, sw);
  }

  console.log('Version artifacts generated:', versionObj);
}

generate();
