import { initLoadingScreen } from './loading-screen.js';

const app = document.querySelector('#app');
initLoadingScreen();

import('./app.js').catch(error => {
  app.replaceChildren();
  const panel = document.createElement('main');
  panel.className = 'panel';
  panel.style.margin = '3rem auto';
  panel.style.maxWidth = '48rem';
  const title = document.createElement('h1');
  title.textContent = 'Unable to load the game';
  const detail = document.createElement('p');
  detail.textContent = error.message;
  const help = document.createElement('p');
  help.textContent = 'Check the level catalog and JSON paths, restart the server after changes, then refresh this page.';
  panel.append(title, detail, help);
  app.append(panel);
});
