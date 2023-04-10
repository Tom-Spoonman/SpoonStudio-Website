import Theme from './Theme.js';
import ParticleSystem from './particleSystem.js';

const canvas = document.getElementById('particleCanvas');
const themeToggle = document.getElementById('themeToggle');

const theme = new Theme();
theme.applySavedTheme();

const particleSystem = new ParticleSystem(canvas, theme, 6000, 50);
particleSystem.start();

themeToggle.addEventListener('change', () => {
  theme.toggleTheme();
  particleSystem.updateColors();
});

