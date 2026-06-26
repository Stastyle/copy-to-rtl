document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'dark');

const appsList = document.getElementById('appsList');
const customName = document.getElementById('customName');
const customKeyword = document.getElementById('customKeyword');
const addCustomBtn = document.getElementById('addCustomBtn');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');

let apps = [];

function slugify(text) {
  return `custom-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`;
}

function renderApps() {
  appsList.innerHTML = '';

  apps.forEach((app, index) => {
    const row = document.createElement('div');
    row.className = 'app-row';

    const label = document.createElement('label');
    label.className = 'app-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = app.enabled;
    checkbox.addEventListener('change', () => {
      apps[index].enabled = checkbox.checked;
    });

    const info = document.createElement('div');
    info.className = 'app-info';

    const name = document.createElement('span');
    name.className = 'app-name';
    name.textContent = app.name;

    const keywords = document.createElement('span');
    keywords.className = 'app-keywords';
    keywords.textContent = app.keywords.join(', ');

    info.append(name, keywords);
    label.append(checkbox, info);
    row.appendChild(label);

    if (!app.builtin) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-icon remove-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove custom app';
      removeBtn.addEventListener('click', () => {
        apps.splice(index, 1);
        renderApps();
      });
      row.appendChild(removeBtn);
    }

    appsList.appendChild(row);
  });
}

function addCustomApp() {
  const name = customName.value.trim();
  const keyword = customKeyword.value.trim();

  if (!name || !keyword) return;

  apps.push({
    id: slugify(name),
    name,
    keywords: [keyword],
    enabled: true,
    builtin: false,
  });

  customName.value = '';
  customKeyword.value = '';
  renderApps();
}

addCustomBtn.addEventListener('click', addCustomApp);

customKeyword.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addCustomApp();
});

saveBtn.addEventListener('click', async () => {
  await window.monitoringSettings.saveApps(apps);
  window.monitoringSettings.close();
});

cancelBtn.addEventListener('click', () => {
  window.monitoringSettings.close();
});

window.monitoringSettings.getApps().then((loadedApps) => {
  apps = structuredClone(loadedApps);
  renderApps();
});