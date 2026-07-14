'use strict';

const $ = (sel, el = document) => el.querySelector(sel);

const NEW_KEY = '__new__';

const state = {
  tabUrl: null,
  host: '',
  cookies: [],
  filter: '',
  openKey: null,
};

const keyOf = (c) => `${c.name}|${c.domain}|${c.path}|${c.storeId ?? ''}`;

function cookieUrl(c) {
  const host = c.domain.replace(/^\./, '');
  return `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`;
}

function toLocalInput(sec) {
  if (!sec) return '';
  const d = new Date(sec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fromLocalInput(v) {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ---------- data ---------- */

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    $('#host').textContent = 'このページでは使用できません';
    renderEmpty('http / https のページで開いてください');
    $('#count').textContent = '';
    return;
  }
  state.tabUrl = tab.url;
  state.host = new URL(tab.url).hostname;
  $('#host').textContent = state.host;
  await reload();
}

async function reload() {
  if (!state.tabUrl) return;
  const cookies = await chrome.cookies.getAll({ url: state.tabUrl });
  cookies.sort((a, b) => a.name.localeCompare(b.name) || a.domain.localeCompare(b.domain));
  state.cookies = cookies;
  render();
}

/* ---------- render ---------- */

function renderEmpty(msg) {
  const list = $('#list');
  list.textContent = '';
  const div = document.createElement('div');
  div.className = 'empty';
  const icon = document.createElement('span');
  icon.className = 'empty-icon';
  icon.textContent = '🍪';
  const text = document.createElement('p');
  text.textContent = msg;
  div.append(icon, text);
  list.append(div);
}

function render() {
  const list = $('#list');
  list.textContent = '';

  if (state.openKey === NEW_KEY) {
    list.append(buildItem(newCookieTemplate(), true));
  }

  const q = state.filter.toLowerCase();
  const visible = state.cookies.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q)
  );

  for (const c of visible) list.append(buildItem(c, false));

  if (!visible.length && state.openKey !== NEW_KEY) {
    renderEmpty(state.cookies.length ? '一致するCookieがありません' : 'このサイトのCookieはありません');
  }

  $('#count').textContent = `${state.cookies.length} 件のCookie${q ? `（${visible.length} 件表示）` : ''}`;
}

function newCookieTemplate() {
  return {
    name: '',
    value: '',
    domain: state.host,
    path: '/',
    secure: state.tabUrl.startsWith('https'),
    httpOnly: false,
    sameSite: 'lax',
    hostOnly: true,
    session: false,
    expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
  };
}

function buildItem(cookie, isNew) {
  const key = isNew ? NEW_KEY : keyOf(cookie);
  const node = $('#tpl-item').content.firstElementChild.cloneNode(true);

  $('.item-name', node).textContent = isNew ? '新しいCookie' : (cookie.name || '(名前なし)');
  $('.item-preview', node).textContent = isNew ? '' : cookie.value;

  const open = state.openKey === key;
  node.classList.toggle('open', open);
  $('.item-body', node).hidden = !open;

  $('.item-head', node).addEventListener('click', () => {
    state.openKey = open ? null : key;
    render();
  });

  if (open) fillForm(node, cookie, isNew);
  return node;
}

function fillForm(node, cookie, isNew) {
  const f = {
    name: $('.f-name', node),
    value: $('.f-value', node),
    domain: $('.f-domain', node),
    hostOnly: $('.f-hostonly', node),
    path: $('.f-path', node),
    sameSite: $('.f-samesite', node),
    expires: $('.f-expires', node),
    session: $('.f-session', node),
    secure: $('.f-secure', node),
    httpOnly: $('.f-httponly', node),
  };

  f.name.value = cookie.name;
  f.value.value = cookie.value;
  f.domain.value = cookie.domain;
  f.hostOnly.checked = !!cookie.hostOnly;
  f.path.value = cookie.path;
  f.sameSite.value = cookie.sameSite || 'unspecified';
  f.session.checked = !!cookie.session;
  f.expires.value = toLocalInput(cookie.expirationDate);
  f.secure.checked = !!cookie.secure;
  f.httpOnly.checked = !!cookie.httpOnly;

  const syncDisabled = () => {
    f.domain.disabled = f.hostOnly.checked;
    f.expires.disabled = f.session.checked;
  };
  syncDisabled();
  f.hostOnly.addEventListener('change', () => {
    if (f.hostOnly.checked) f.domain.value = f.domain.value.replace(/^\./, '');
    syncDisabled();
  });
  f.session.addEventListener('change', syncDisabled);

  const readForm = () => ({
    name: f.name.value.trim(),
    value: f.value.value,
    domain: f.domain.value.trim().toLowerCase(),
    hostOnly: f.hostOnly.checked,
    path: f.path.value.trim() || '/',
    sameSite: f.sameSite.value,
    session: f.session.checked,
    expirationDate: fromLocalInput(f.expires.value),
    secure: f.secure.checked,
    httpOnly: f.httpOnly.checked,
  });

  $('.a-save', node).addEventListener('click', () => saveCookie(isNew ? null : cookie, readForm()));

  const delBtn = $('.a-delete', node);
  if (isNew) {
    delBtn.textContent = 'キャンセル';
    delBtn.addEventListener('click', () => {
      state.openKey = null;
      render();
    });
  } else {
    delBtn.addEventListener('click', () => deleteCookie(cookie));
  }
}

/* ---------- mutations ---------- */

async function saveCookie(orig, form) {
  if (!form.domain) {
    toast('ドメインを入力してください', true);
    return;
  }
  if (form.sameSite === 'no_restriction' && !form.secure) {
    toast('SameSite=None には Secure が必要です', true);
    return;
  }
  try {
    if (orig) {
      await chrome.cookies.remove({ url: cookieUrl(orig), name: orig.name, storeId: orig.storeId });
    }
    const details = {
      url: cookieUrl(form),
      name: form.name,
      value: form.value,
      path: form.path,
      secure: form.secure,
      httpOnly: form.httpOnly,
      sameSite: form.sameSite,
    };
    if (orig?.storeId) details.storeId = orig.storeId;
    if (!form.hostOnly) details.domain = form.domain;
    if (!form.session && form.expirationDate) details.expirationDate = form.expirationDate;

    const saved = await chrome.cookies.set(details);
    if (!saved) throw new Error(chrome.runtime.lastError?.message || '保存に失敗しました');
    state.openKey = keyOf(saved);
    toast('保存しました');
    await reload();
  } catch (e) {
    toast(`保存エラー: ${e.message}`, true);
  }
}

async function deleteCookie(cookie) {
  try {
    await chrome.cookies.remove({ url: cookieUrl(cookie), name: cookie.name, storeId: cookie.storeId });
    state.openKey = null;
    toast(`「${cookie.name}」を削除しました`);
    await reload();
  } catch (e) {
    toast(`削除エラー: ${e.message}`, true);
  }
}

async function deleteAll() {
  const targets = [...state.cookies];
  let ok = 0;
  for (const c of targets) {
    try {
      await chrome.cookies.remove({ url: cookieUrl(c), name: c.name, storeId: c.storeId });
      ok++;
    } catch { /* continue */ }
  }
  state.openKey = null;
  toast(`${ok} 件のCookieを削除しました`);
  await reload();
}

/* ---------- import / export ---------- */

async function exportCookies() {
  if (!state.cookies.length) {
    toast('エクスポートするCookieがありません', true);
    return;
  }
  await navigator.clipboard.writeText(JSON.stringify(state.cookies, null, 2));
  toast(`${state.cookies.length} 件をクリップボードにコピーしました`);
}

function envKey(name) {
  return name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}

async function exportEnv() {
  if (!state.cookies.length) {
    toast('コピーするCookieがありません', true);
    return;
  }
  const text = state.cookies.map((c) => `${envKey(c.name)}=${c.value}`).join('\n');
  await navigator.clipboard.writeText(text);
  toast(`${state.cookies.length} 件をenv形式でコピーしました`);
}

async function importCookies(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    toast('JSONを解析できません', true);
    return;
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  let ok = 0;
  let fail = 0;
  for (const c of items) {
    if (!c || typeof c !== 'object' || typeof c.name !== 'string') {
      fail++;
      continue;
    }
    try {
      const domain = (c.domain || state.host).toLowerCase();
      const details = {
        url: cookieUrl({ ...c, domain }),
        name: c.name,
        value: String(c.value ?? ''),
        path: c.path || '/',
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        sameSite: ['no_restriction', 'lax', 'strict', 'unspecified'].includes(c.sameSite)
          ? c.sameSite
          : 'unspecified',
      };
      if (!c.hostOnly) details.domain = domain;
      if (!c.session && c.expirationDate) details.expirationDate = Number(c.expirationDate);
      const saved = await chrome.cookies.set(details);
      saved ? ok++ : fail++;
    } catch {
      fail++;
    }
  }
  toast(`インポート: 成功 ${ok} 件${fail ? ` / 失敗 ${fail} 件` : ''}`, !ok && !!fail);
  await reload();
}

/* ---------- events ---------- */

$('#search').addEventListener('input', (e) => {
  state.filter = e.target.value;
  render();
});

$('#btn-reload').addEventListener('click', () => {
  reload();
  toast('再読み込みしました');
});

$('#btn-add').addEventListener('click', () => {
  if (!state.tabUrl) return;
  state.openKey = NEW_KEY;
  render();
  $('#list .f-name')?.focus();
});

$('#btn-export').addEventListener('click', () => exportCookies().catch((e) => toast(e.message, true)));

$('#btn-env').addEventListener('click', () => exportEnv().catch((e) => toast(e.message, true)));

$('#btn-import').addEventListener('click', () => {
  const panel = $('#import-panel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) $('#import-text').focus();
});
$('#btn-import-cancel').addEventListener('click', () => {
  $('#import-panel').hidden = true;
  $('#import-text').value = '';
});
$('#btn-import-run').addEventListener('click', async () => {
  const text = $('#import-text').value.trim();
  if (!text) return;
  await importCookies(text);
  $('#import-panel').hidden = true;
  $('#import-text').value = '';
});

{
  let confirmTimer;
  $('#btn-clear').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (btn.classList.contains('confirming')) {
      btn.classList.remove('confirming');
      clearTimeout(confirmTimer);
      deleteAll();
    } else {
      btn.classList.add('confirming');
      btn.title = 'もう一度クリックで全削除';
      toast('もう一度クリックすると全削除します');
      confirmTimer = setTimeout(() => {
        btn.classList.remove('confirming');
        btn.title = 'すべて削除';
      }, 3000);
    }
  });
}

init();
