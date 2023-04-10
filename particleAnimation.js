function initializeParticleAnimation() {
    const canvas = document.querySelector('#particleCanvas');
    const themeColors = JSON.parse(localStorage.getItem('theme')) || Theme.darkTheme;
    const particleSystem = new ParticleSystem(canvas, themeColors);
  
    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particleSystem.initParticles();
    });
  
    particleSystem.start();
  }
  
  initializeParticleAnimation();
  