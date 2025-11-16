// galaxy.js  
(() => {
  const space = document.getElementById('space');
  const canvas = document.getElementById('shootingStars');
  const ctx = canvas.getContext('2d');

  // resize canvas
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // Shooting stars/comets
  class ShootingStar {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height * 0.5;
      this.len = Math.random() * 200 + 100;
      this.speed = Math.random() * 10 + 6;
      this.size = Math.random() * 1.5 + 0.5;
      this.angle = Math.PI + Math.random() * Math.PI / 4;
      this.opacity = Math.random() * 0.5 + 0.5;
    }
    update() {
      this.x += Math.cos(this.angle) * this.speed;
      this.y += Math.sin(this.angle) * this.speed;
      this.opacity -= 0.005;
      if (this.opacity <= 0) {
        this.reset();
      }
    }
    draw() {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(this.angle) * this.len,
                 this.y + Math.sin(this.angle) * this.len);
      ctx.strokeStyle = 'rgba(255,255,255,' + this.opacity + ')';
      ctx.lineWidth = this.size;
      ctx.stroke();
      ctx.restore();
    }
  }

  const stars = [];
  const starCount = 20;
  for (let i = 0; i < starCount; i++) {
    stars.push(new ShootingStar());
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(star => {
      star.update();
      star.draw();
    });
    requestAnimationFrame(animate);
  }
  animate();

  // Parallax effect: mouse move & scroll
  function handleParallax(e) {
    const layers = document.querySelectorAll('.stars, .layerNebula');
    const x = (e.clientX / window.innerWidth) - 0.5;
    const y = (e.clientY / window.innerHeight) - 0.5;

    layers.forEach((layer, idx) => {
      const factor = (idx + 1) * 5;  // vary factor per layer
      const translateX = -x * factor;
      const translateY = -y * factor;
      layer.style.transform = `translate(${translateX}px, ${translateY}px)`;
    });
  }
  window.addEventListener('mousemove', handleParallax);

  // Also link scroll for slight translation
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    const layers = document.querySelectorAll('.stars, .layerNebula');
    layers.forEach((layer, idx) => {
      const offset = scrollY * ((idx + 1) * 0.0005);
      layer.style.transform = `translateY(${offset}px)`;
    });
  });
})();
