import type { BrowserAction, BrowserState } from './browser';
document.documentElement.dataset.platform = window.browser.platform;

const tabList = document.querySelector<HTMLDivElement>('#tabs')!;
let currentId = 0;
const tabElements = new Map<number, HTMLDivElement>();

function send(action: BrowserAction): void {
  window.browser.act(action);
}

document
  .getElementById('new-tab')!
  .addEventListener('click', () => send({ type: 'new' }));

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
    element.title = [tab.title, tab.url, tab.error].filter(Boolean).join('\n');
    element.classList.toggle('error', Boolean(tab.error));
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
  if (changed)
    tabElements
      .get(state.activeId)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

window.browser.onState(render);
window.browser.ready();
