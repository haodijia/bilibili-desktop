import type { BrowserAction, BrowserState } from './browser';

const tabList = document.querySelector<HTMLDivElement>('#tabs')!;
const address = document.querySelector<HTMLInputElement>('#address')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;
const back = document.querySelector<HTMLButtonElement>('#back')!;
const forward = document.querySelector<HTMLButtonElement>('#forward')!;
const reload = document.querySelector<HTMLButtonElement>('#reload')!;
const margin = document.querySelector<HTMLButtonElement>('#margin')!;
let currentId = 0;
const tabElements = new Map<number, HTMLDivElement>();

function send(action: BrowserAction): void {
  window.browser.act(action);
}

for (const [id, type] of [
  ['new-tab', 'new'],
  ['back', 'back'],
  ['forward', 'forward'],
  ['reload', 'reload'],
  ['home', 'home'],
  ['margin', 'margin'],
] as const) {
  document.getElementById(id)!.addEventListener('click', () => send({ type }));
}

document.querySelector('#address-form')!.addEventListener('submit', (event) => {
  event.preventDefault();
  send({ type: 'navigate', value: address.value });
  address.blur();
});
address.addEventListener('focus', () => address.select());
address.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    address.blur();
    send({ type: 'select', id: currentId });
  }
});

tabList.addEventListener('keydown', (event) => {
  const elements = [...tabElements.values()];
  const index = elements.findIndex(
    (element) => element === document.activeElement,
  );
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const element =
      elements[(index + offset + elements.length) % elements.length];
    if (element) {
      send({ type: 'select', id: Number(element.dataset.id) });
      element.focus();
    }
  }
});

function render(state: BrowserState): void {
  const active = state.tabs.find((tab) => tab.id === state.activeId);
  const changed = currentId !== state.activeId;
  currentId = state.activeId;
  for (const [id, element] of tabElements) {
    if (!state.tabs.some((tab) => tab.id === id)) {
      element.remove();
      tabElements.delete(id);
    }
  }
  for (const tab of state.tabs) {
    let element = tabElements.get(tab.id);
    if (!element) {
      element = document.createElement('div');
      element.className = 'tab';
      element.setAttribute('role', 'tab');
      element.dataset.id = String(tab.id);
      const icon = document.createElement('span');
      icon.className = 'tab-icon';
      icon.setAttribute('aria-hidden', 'true');
      const title = document.createElement('span');
      title.className = 'tab-title';
      const close = document.createElement('button');
      close.className = 'close-tab';
      close.textContent = '×';
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        send({ type: 'close', id: tab.id });
      });
      element.append(icon, title, close);
      element.addEventListener('click', () =>
        send({ type: 'select', id: tab.id }),
      );
      element.addEventListener('auxclick', (event) => {
        if (event.button === 1) send({ type: 'close', id: tab.id });
      });
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ')
          send({ type: 'select', id: tab.id });
      });
      tabList.append(element);
      tabElements.set(tab.id, element);
    }
    element.classList.toggle('active', tab.id === state.activeId);
    element.classList.toggle('loading', tab.loading);
    element.setAttribute('aria-selected', String(tab.id === state.activeId));
    element.tabIndex = tab.id === state.activeId ? 0 : -1;
    element.title = `${tab.title}\n${tab.url}`;
    element.querySelector('.tab-icon')!.textContent = tab.loading
      ? ''
      : tab.audible
        ? '♫'
        : '▤';
    element.querySelector('.tab-title')!.textContent = tab.title;
    element
      .querySelector('button')!
      .setAttribute('aria-label', `关闭 ${tab.title}`);
  }
  if (document.activeElement !== address || changed)
    address.value = active?.url ?? '';
  back.disabled = !state.canGoBack;
  forward.disabled = !state.canGoForward;
  reload.classList.toggle('is-loading', active?.loading ?? false);
  reload.setAttribute('aria-label', active?.loading ? '停止加载' : '重新加载');
  reload.title = active?.loading ? '停止加载' : '重新加载 (⌘R)';
  margin.setAttribute('aria-expanded', String(state.marginOpen));
  status.textContent = active?.error ?? '';
  status.hidden = !active?.error;
  address.title = active?.error || active?.url || '';
  if (changed)
    tabElements
      .get(state.activeId)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

window.browser.onState(render);
window.browser.onFocusAddress(() => {
  address.focus();
  address.select();
});
window.browser.ready();
