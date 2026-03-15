#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GITHUB_USER = 'Harshchanchad4';
const REPO_NAME = 'claude-skills';
const BRANCH = 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/${BRANCH}`;
const API_BASE = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents`;

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const log = {
  info: (msg) => console.log(`${COLORS.cyan}ℹ${COLORS.reset} ${msg}`),
  success: (msg) => console.log(`${COLORS.green}✔${COLORS.reset} ${msg}`),
  error: (msg) => console.log(`${COLORS.red}✖${COLORS.reset} ${msg}`),
  warn: (msg) => console.log(`${COLORS.yellow}⚠${COLORS.reset} ${msg}`),
  title: (msg) => console.log(`\n${COLORS.bold}${COLORS.cyan}${msg}${COLORS.reset}\n`),
};

const fetchJSON = (url) =>
  new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'claude-skills-cli' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Failed to parse response')); }
      });
    }).on('error', reject);
  });

const fetchText = (url) =>
  new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'claude-skills-cli' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });

const zipFolder = (folderPath, outputZip) => {
  try {
    execSync(`cd "${path.dirname(folderPath)}" && zip -r "${outputZip}" "${path.basename(folderPath)}"`, { stdio: 'pipe' });
    return true;
  } catch {
    try {
      execSync(`powershell Compress-Archive -Path "${folderPath}" -DestinationPath "${outputZip}"`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
};

// COMMANDS

const cmdAdd = async (skillName) => {
  if (!skillName) {
    log.error('Please provide a skill name. Usage: npx claude-skills add <skill-name>');
    process.exit(1);
  }

  log.title(`Installing skill: ${skillName}`);
  log.info(`Fetching from github.com/${GITHUB_USER}/${REPO_NAME}...`);

  // Check skill exists
  const contents = await fetchJSON(`${API_BASE}/${skillName}`).catch(() => null);
  if (!contents || contents.message === 'Not Found') {
    log.error(`Skill "${skillName}" not found in registry.`);
    log.info(`Run: npx claude-skills list  — to see available skills.`);
    process.exit(1);
  }

  // Create local skill folder
  const outDir = path.join(process.cwd(), skillName);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Download all files in the skill folder
  const files = Array.isArray(contents) ? contents : [contents];
  for (const file of files) {
    if (file.type === 'file') {
      log.info(`Downloading ${file.name}...`);
      const content = await fetchText(`${RAW_BASE}/${skillName}/${file.name}`);
      fs.writeFileSync(path.join(outDir, file.name), content, 'utf8');
    }
  }

  // Zip the folder
  const zipPath = path.join(process.cwd(), `${skillName}.zip`);
  const zipped = zipFolder(outDir, zipPath);

  // Cleanup folder, keep only zip
  fs.rmSync(outDir, { recursive: true, force: true });

  log.success(`Skill "${skillName}" downloaded!`);
  console.log('');

  if (zipped) {
    log.success(`Zip ready: ${COLORS.bold}${skillName}.zip${COLORS.reset}`);
  } else {
    log.warn(`Could not auto-zip. Folder saved at: ${outDir}`);
    log.warn('Manually zip it before uploading.');
  }

  console.log('');
  log.title('Next steps:');
  console.log(`  1. Go to ${COLORS.cyan}claude.ai → Settings → Customize → Skills${COLORS.reset}`);
  console.log(`  2. Click ${COLORS.bold}"+"${COLORS.reset} → Upload a skill`);
  console.log(`  3. Upload ${COLORS.bold}${skillName}.zip${COLORS.reset}`);
  console.log(`  4. Toggle it ${COLORS.green}ON${COLORS.reset} and start using it!\n`);
};

const cmdList = async () => {
  log.title(`Available skills by ${GITHUB_USER}`);

  const contents = await fetchJSON(API_BASE).catch(() => null);
  if (!contents || contents.message === 'Not Found') {
    log.error('Could not fetch skill registry. Check your internet connection.');
    process.exit(1);
  }

  const skills = contents.filter((item) => item.type === 'dir');
  if (skills.length === 0) {
    log.warn('No skills published yet.');
    return;
  }

  for (const skill of skills) {
    // Try to read description from SKILL.md frontmatter
    const raw = await fetchText(`${RAW_BASE}/${skill.name}/SKILL.md`).catch(() => '');
    const descMatch = raw.match(/description:\s*[>|]?\s*\n?\s*(.+)/);
    const desc = descMatch ? descMatch[1].trim().replace(/^>?\s*/, '') : 'No description';
    console.log(`  ${COLORS.bold}${COLORS.cyan}${skill.name}${COLORS.reset}  —  ${desc}`);
  }

  console.log('');
  log.info(`Install any skill with: ${COLORS.bold}npx claude-skills add <skill-name>${COLORS.reset}\n`);
};

const cmdHelp = () => {
  log.title('claude-skills CLI');
  console.log(`  ${COLORS.bold}npx claude-skills list${COLORS.reset}              List all available skills`);
  console.log(`  ${COLORS.bold}npx claude-skills add <name>${COLORS.reset}        Download & zip a skill`);
  console.log(`  ${COLORS.bold}npx claude-skills help${COLORS.reset}              Show this help\n`);
  console.log(`  ${COLORS.cyan}Examples:${COLORS.reset}`);
  console.log(`    npx claude-skills add stock-analysis`);
  console.log(`    npx claude-skills add mern-dev\n`);
};

// ROUTER
const [,, command, ...args] = process.argv;

switch (command) {
  case 'add':    await cmdAdd(args[0]); break;
  case 'list':   await cmdList(); break;
  case 'help':
  default:       cmdHelp(); break;
}