class Particle {
    constructor(canvasWidth, canvasHeight) {
      this.x = Math.random() * canvasWidth;
      this.y = Math.random() * canvasHeight;
      this.vx = Math.random() * 0.5 - 0.25;
      this.vy = Math.random() * 0.5 - 0.25;
      this.ax = Math.random() * 0.02 - 0.01;
      this.ay = Math.random() * 0.02 - 0.01;
      this.size = Math.random() * 1.8 + 1;
      this.friction = 0.94;
    }
  
    update(canvasWidth, canvasHeight) {
      this.vx += this.ax;
      this.vy += this.ay;
      this.vx *= this.friction;
      this.vy *= this.friction;
      this.x += this.vx;
      this.y += this.vy;
  
      if (this.x < 0 || this.x > canvasWidth) {
        this.vx = -this.vx;
        this.ax = -this.ax;
      }
  
      if (this.y < 0 || this.y > canvasHeight) {
        this.vy = -this.vy;
        this.ay = -this.ay;
      }
    }
  
    draw(ctx, particleColor) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
      ctx.fillStyle = particleColor;
      ctx.fill();
    }
  }

  export default Particle;