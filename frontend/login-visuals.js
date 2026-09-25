/* ══════════════════════════════════════════════════════════
   Login Page Visual Effects — Phase 5
   tsParticles v2 (bundle) — particles in login left panel
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  function initParticles() {
    var container = document.getElementById("login-particles");
    if (!container) {
      console.warn("[login-visuals] #login-particles not found");
      return;
    }

    if (typeof tsParticles === "undefined") {
      console.warn("[login-visuals] tsParticles not loaded");
      return;
    }

    // v2 API — tsParticles.load(id, options)
    tsParticles.load("login-particles", {
      fpsLimit: 40,
      detectRetina: true,
      fullScreen: { enable: false },
      background: { color: "transparent" },
      particles: {
        number: {
          value: 35,
          density: { enable: true, value_area: 900 }
        },
        color: { value: "#4da3ff" },
        shape: { type: "circle" },
        opacity: {
          value: { min: 0.08, max: 0.30 },
          random: true,
          anim: { enable: false }
        },
        size: {
          value: { min: 1, max: 2.5 },
          random: true
        },
        links: {
          enable: true,
          distance: 130,
          color: "#2583df",
          opacity: 0.18,
          width: 1
        },
        move: {
          enable: true,
          speed: 0.45,
          direction: "none",
          random: false,
          straight: false,
          out_mode: "bounce",
          attract: { enable: false }
        }
      },
      interactivity: {
        detectsOn: "canvas",
        events: {
          onHover: { enable: false },
          onClick: { enable: false },
          resize: true
        }
      }
    }).then(function () {
      console.log("[login-visuals] Particles initialized");
    }).catch(function (e) {
      console.error("[login-visuals] Particles failed:", e);
    });
  }

  // Run when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initParticles);
  } else {
    initParticles();
  }
})();
