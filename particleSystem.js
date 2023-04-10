import Particle from './Particle.js';

class ParticleSystem {
  constructor(canvas, theme, particleAmount = 10000, connectingLineThreshold = 20) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = theme;
    this.particleAmount = particleAmount;
    this.connectingLineThreshold = connectingLineThreshold;
    this.particles = [];
    this.init();
  }

  // Initialize the particle system
  init() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.createParticles();
    this.updateColors();
  }

  // Create particles based on the particleAmount property
  createParticles() {
    const numberOfParticles = (this.canvas.width * this.canvas.height) / this.particleAmount;
    for (let i = 0; i < numberOfParticles; i++) {
      this.particles.push(new Particle(this.canvas.width, this.canvas.height));
    }
  }

  // Update colors based on the current theme
  updateColors() {
    const savedTheme = localStorage.getItem('theme');
    const themeColors = savedTheme ? JSON.parse(savedTheme) : this.theme.darkTheme;

    this.backgroundColor = themeColors.backgroundColor;
    this.particleColor = themeColors.particleColor;
    this.lineColor = themeColors.lineColor;
  }

  // Animate the particles and connecting lines
  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const particle of this.particles) {
      particle.update(this.canvas.width, this.canvas.height);
      particle.draw(this.ctx, this.particleColor);
    }

    this.connectParticles();

    requestAnimationFrame(() => this.animate());
  }

  // Connect particles with lines if they are within the connectingLineThreshold distance
  connectParticles() {
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const dx = this.particles[i].x - this.particles[j].x;
        const dy = this.particles[i].y - this.particles[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.connectingLineThreshold) {
          this.ctx.beginPath();
          this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
          this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
          this.ctx.strokeStyle = this.lineColor;
          this.ctx.lineWidth = 2;
          this.ctx.stroke();
        }
      }
    }
  }

  // Start the animation loop
  start() {
    this.animate();
  }
}

export default ParticleSystem;
