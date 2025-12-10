#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'dist');

function removeDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }

  try {
    // Recursively remove all files and directories
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        removeDir(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    }

    fs.rmdirSync(dir);
  } catch (error) {
    console.error('Error removing dist:', error.message);
    process.exit(1);
  }
}

removeDir(distPath);
