const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Set canvas size
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();

// Physics constants
let G = 400;
let backgroundColor = "#f5f5f5";
let particleColor = { r: 80, g: 80, b: 80 };
let particleAttractionEnabled = false;
let connectionDistance = 100;

// Cursor position
let mouse = {
  x: canvas.width / 2,
  y: canvas.height / 2,
};

// Particle class
class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.mass = 1;
    this.radius = 1.2;
    // Random slow drift like dust
    this.driftX = (Math.random() - 0.5) * 0.1;
    this.driftY = (Math.random() - 0.5) * 0.1 + 0.05; // Slight upward tendency
    this.time = Math.random() * 1000;
    this.baseAlpha = 0.25 + Math.random() * 0.2;
  }

  applyForce(fx, fy) {
    this.vx += fx / this.mass;
    this.vy += fy / this.mass;
  }

  update() {
    this.time += 0.01;

    // Calculate distance to mouse
    const dx = mouse.x - this.x;
    const dy = mouse.y - this.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);

    // Only apply gravitational force if mouse is close enough
    const interactionRadius = 200;
    if (dist < interactionRadius && dist > 1) {
      const force = G / distSq;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      this.applyForce(fx, fy);
    }

    // Particle-to-particle attraction
    if (particleAttractionEnabled) {
      particles.forEach((other) => {
        if (other === this) return;

        const dx2 = other.x - this.x;
        const dy2 = other.y - this.y;
        const distSq2 = dx2 * dx2 + dy2 * dy2;
        const dist2 = Math.sqrt(distSq2);

        // Apply weaker force for particle-to-particle (to avoid clustering too much)
        if (dist2 > 5 && dist2 < 150) {
          const force = (G * 0.02) / distSq2; // Much weaker than cursor attraction
          const fx2 = (dx2 / dist2) * force;
          const fy2 = (dy2 / dist2) * force;

          this.applyForce(fx2, fy2);
        }
      });
    }

    // Apply slow drift (like dust floating)
    this.vx += this.driftX + Math.sin(this.time) * 0.01;
    this.vy += this.driftY + Math.cos(this.time * 0.7) * 0.01;

    // Apply strong damping to return to slow drift
    this.vx *= 0.95;
    this.vy *= 0.95;

    // Update position
    this.x += this.vx;
    this.y += this.vy;

    // Wrap around edges
    if (this.x < -10) this.x = canvas.width + 10;
    if (this.x > canvas.width + 10) this.x = -10;
    if (this.y < -10) this.y = canvas.height + 10;
    if (this.y > canvas.height + 10) this.y = -10;
  }

  draw() {
    // Subtle pulsing alpha like dust catching light
    const pulse = Math.sin(this.time * 0.5) * 0.05;
    const alpha = this.baseAlpha + pulse;

    ctx.fillStyle = `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, ${alpha})`;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Create particles
let particles = [];

function createParticles(count) {
  for (let i = 0; i < count; i++) {
    particles.push(
      new Particle(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
      ),
    );
  }
}

// Initialize particles
createParticles(200);

// Mouse tracking
window.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

// Touch support for mobile
window.addEventListener("touchmove", (e) => {
  e.preventDefault();
  mouse.x = e.touches[0].clientX;
  mouse.y = e.touches[0].clientY;
});

// Control panel event listeners
document.getElementById("bgColor").addEventListener("input", (e) => {
  backgroundColor = e.target.value;
  document.body.style.background = backgroundColor;
});

document.getElementById("particleColor").addEventListener("input", (e) => {
  const hex = e.target.value;
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  particleColor = { r, g, b };
});

document.getElementById("gravity").addEventListener("input", (e) => {
  G = parseInt(e.target.value);
  document.getElementById("gravityValue").textContent = G;
});

document.getElementById("particleCount").addEventListener("input", (e) => {
  const newCount = parseInt(e.target.value);
  document.getElementById("countValue").textContent = newCount;

  // Adjust particle count
  if (newCount > particles.length) {
    createParticles(newCount - particles.length);
  } else if (newCount < particles.length) {
    particles = particles.slice(0, newCount);
  }
});

document
  .getElementById("particleAttraction")
  .addEventListener("change", (e) => {
    particleAttractionEnabled = e.target.checked;
  });

document.getElementById("connectDistance").addEventListener("input", (e) => {
  connectionDistance = parseInt(e.target.value);
  document.getElementById("connectValue").textContent = connectionDistance;
});

// Config toggle button
document.getElementById("configToggle").addEventListener("click", () => {
  document.getElementById("controls").classList.toggle("open");
});

// Animation loop
function animate() {
  // Clear canvas completely for clean dust effect
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw connections between nearby particles
  if (connectionDistance > 0) {
    ctx.strokeStyle = `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, 0.15)`;
    ctx.lineWidth = 0.5;

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < connectionDistance) {
          // Fade the line based on distance
          const alpha = (1 - dist / connectionDistance) * 0.3;
          ctx.strokeStyle = `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, ${alpha})`;

          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }

  // Update and draw particles
  particles.forEach((particle) => {
    particle.update();
    particle.draw();
  });

  requestAnimationFrame(animate);
}

// Handle window resize
window.addEventListener("resize", () => {
  resizeCanvas();
});

// Start animation
animate();
