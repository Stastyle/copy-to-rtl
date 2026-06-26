const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_APPS = [
  { id: 'claude', name: 'Claude', keywords: ['claude', 'anthropic'], enabled: true, builtin: true },
  { id: 'gemini', name: 'Gemini', keywords: ['gemini'], enabled: false, builtin: true },
  { id: 'chatgpt', name: 'ChatGPT', keywords: ['chatgpt', 'openai'], enabled: false, builtin: true },
  { id: 'copilot', name: 'Copilot', keywords: ['copilot'], enabled: false, builtin: true },
  { id: 'grok', name: 'Grok', keywords: ['grok'], enabled: false, builtin: true },
];

let monitoredApps = structuredClone(DEFAULT_APPS);

function getStorePath() {
  return path.join(app.getPath('userData'), 'monitored-apps.json');
}

function mergeWithDefaults(saved) {
  const builtins = DEFAULT_APPS.map((defaultApp) => {
    const savedApp = saved.find((item) => item.id === defaultApp.id);
    if (!savedApp) return structuredClone(defaultApp);
    return {
      ...defaultApp,
      enabled: Boolean(savedApp.enabled),
      keywords: savedApp.keywords?.length ? savedApp.keywords : defaultApp.keywords,
    };
  });

  const custom = saved
    .filter((item) => item.builtin === false || !DEFAULT_APPS.some((d) => d.id === item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      keywords: item.keywords || [],
      enabled: Boolean(item.enabled),
      builtin: false,
    }));

  return [...builtins, ...custom];
}

function loadMonitoredApps() {
  try {
    const saved = JSON.parse(fs.readFileSync(getStorePath(), 'utf8'));
    monitoredApps = mergeWithDefaults(saved);
  } catch {
    monitoredApps = structuredClone(DEFAULT_APPS);
  }
  return monitoredApps;
}

function saveMonitoredApps(apps) {
  monitoredApps = apps;
  fs.writeFileSync(getStorePath(), JSON.stringify(apps, null, 2), 'utf8');
  return monitoredApps;
}

function getMonitoredApps() {
  return monitoredApps;
}

// Matches against the active window title only. Matching clipboard HTML was
// dropped because it triggered on any copied content that merely mentioned a
// keyword (e.g. a web page containing the word "claude"), regardless of source.
function matchMonitoredApp(windowTitle) {
  const titleLower = (windowTitle || '').toLowerCase();

  for (const monitoredApp of monitoredApps) {
    if (!monitoredApp.enabled) continue;

    for (const keyword of monitoredApp.keywords) {
      const keywordLower = keyword.toLowerCase().trim();
      if (!keywordLower) continue;

      if (titleLower.includes(keywordLower)) {
        return {
          appId: monitoredApp.id,
          appName: monitoredApp.name,
          windowTitle,
        };
      }
    }
  }

  return null;
}

module.exports = {
  DEFAULT_APPS,
  loadMonitoredApps,
  saveMonitoredApps,
  getMonitoredApps,
  matchMonitoredApp,
};