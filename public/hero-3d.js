/* =========================================================
   IRONFORGE FITNESS — hero-3d.js
   Cinematic WebGL hero: procedural barbell, particle field,
   mouse parallax, scroll-driven camera + object transitions.

   Requires (loaded via CDN in index.html, in this order):
     three.module.js
     GSAP + ScrollTrigger (optional — degrades gracefully)

   Table of Contents:
   1. Config + feature detection
   2. IronforgeHero class
      - Scene / camera / renderer setup
      - Lighting rig
      - Procedural barbell (Blender-replaceable)
      - Particle field ("forge dust")
      - Ground glow / rim light plane
      - Mouse parallax
      - Scroll-driven camera + object animation
      - Render loop with visibility + reduced-motion guards
      - Resize + cleanup
   3. Boot
   ========================================================= */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

(function () {
  'use strict';

  /* ============ 1. Config + feature detection ============ */

  var CONFIG = {
    colors: {
      bg: 0x0a0a0c,
      accent: 0xff3b30,      // --color-accent
      accent2: 0xffb020,     // --color-accent-2
      steel: 0x9a9aa0,
      steelDark: 0x2a2a2e,
      rim: 0xffffff
    },
    particleCount: {
      desktop: 260,
      mobile: 90
    },
    dpr: {
      desktop: Math.min(window.devicePixelRatio || 1, 2),
      mobile: Math.min(window.devicePixelRatio || 1, 1.5)
    }
  };

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isMobileViewport() {
    return window.innerWidth < 768;
  }

  function supportsWebGL() {
    try {
      var canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  /* ============ 2. IronforgeHero class ============ */

  function IronforgeHero(canvas) {
    this.canvas = canvas;
    this.container = canvas.closest('.hero');
    this.reducedMotion = prefersReducedMotion();
    this.mobile = isMobileViewport();

    this.mouse = { x: 0, y: 0 };        // normalized -1..1
    this.mouseTarget = { x: 0, y: 0 };
    this.scrollProgress = 0;             // 0..1 across hero height
    this.isVisible = true;
    this.destroyed = false;
    this.clock = new THREE.Clock();

    this._onResize = this._onResize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._tick = this._tick.bind(this);

    this._initScene();
    this._initLights();
    this._buildBarbell();
    this._buildParticles();
    this._buildGroundGlow();
    this._bindEvents();
    this._initScrollTrigger();
    this._initVisibilityGuard();

    this._tick();
  }

  IronforgeHero.prototype._initScene = function () {
    var width = this.container.clientWidth;
    var height = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(CONFIG.colors.bg, this.mobile ? 0.045 : 0.035);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    this.camera.position.set(0, 0.4, 9);
    this.cameraBasePosition = this.camera.position.clone();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.mobile,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(this.mobile ? CONFIG.dpr.mobile : CONFIG.dpr.desktop);
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.rigGroup = new THREE.Group();
    this.scene.add(this.rigGroup);
  };

  IronforgeHero.prototype._initLights = function () {
    var ambient = new THREE.AmbientLight(0x2a2a30, 0.6);
    this.scene.add(ambient);

    // Key light — warm accent, forge-like
    this.keyLight = new THREE.SpotLight(CONFIG.colors.accent, 6, 30, Math.PI / 5, 0.4, 1.2);
    this.keyLight.position.set(4, 5, 6);
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    // Secondary accent — amber rim from the opposite side
    this.fillLight = new THREE.SpotLight(CONFIG.colors.accent2, 3.2, 30, Math.PI / 4, 0.5, 1.4);
    this.fillLight.position.set(-5, -2, 4);
    this.scene.add(this.fillLight);
    this.scene.add(this.fillLight.target);

    // Cool rim light from behind for edge definition on metal
    this.rimLight = new THREE.DirectionalLight(0xdfe4ff, 1.1);
    this.rimLight.position.set(-3, 3, -6);
    this.scene.add(this.rimLight);

    // Soft top-down white highlight for the steel plates
    this.topLight = new THREE.PointLight(CONFIG.colors.rim, 1.4, 20, 2);
    this.topLight.position.set(0, 4, 2);
    this.scene.add(this.topLight);
  };

  /* ---- Procedural barbell ----------------------------------------
     This geometry is intentionally built from primitives so the
     hero works with zero external assets. Swap this method's
     contents for a GLTFLoader call (see README) once a sculpted
     Blender export is available — the rest of the class (lighting,
     scroll hooks, animation loop) does not need to change.
  ------------------------------------------------------------------- */
  IronforgeHero.prototype._buildBarbell = function () {
    var group = new THREE.Group();
    var segments = this.mobile ? 24 : 48;

    var steelMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.steel,
      metalness: 0.95,
      roughness: 0.28,
      envMapIntensity: 1.2
    });

    var darkSteelMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.steelDark,
      metalness: 0.9,
      roughness: 0.4
    });

    var plateMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1d,
      metalness: 0.75,
      roughness: 0.35
    });

    var accentRingMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.accent,
      metalness: 0.6,
      roughness: 0.3,
      emissive: CONFIG.colors.accent,
      emissiveIntensity: 0.35
    });

    // Bar
    var barLength = 7.2;
    var barGeo = new THREE.CylinderGeometry(0.09, 0.09, barLength, segments);
    barGeo.rotateZ(Math.PI / 2);
    var bar = new THREE.Mesh(barGeo, steelMat);
    group.add(bar);

    // Knurling suggestion — thin ring grooves via a subtle torus array
    var knurlCount = this.mobile ? 0 : 10;
    for (var k = 0; k < knurlCount; k++) {
      var t = (k / (knurlCount - 1)) * 1.2 - 0.6;
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.095, 0.006, 6, segments),
        darkSteelMat
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.x = t;
      group.add(ring);
    }

    // Plates — layered pairs at each end for depth
    var plateRadii = [0.95, 0.78, 0.6];
    var plateThickness = 0.09;
    var plateGap = 0.02;

    function buildPlateStack(xStart, direction) {
      var x = xStart;
      plateRadii.forEach(function (radius, i) {
        var plateGeo = new THREE.CylinderGeometry(radius, radius, plateThickness, segments);
        plateGeo.rotateZ(Math.PI / 2);
        var mat = i === 0 ? accentRingMat : plateMat;
        var plate = new THREE.Mesh(plateGeo, mat);
        plate.position.x = x;
        group.add(plate);

        // center bore ring for realism
        if (i === 0) {
          var boreGeo = new THREE.TorusGeometry(0.12, 0.02, 8, segments);
          boreGeo.rotateY(Math.PI / 2);
          var bore = new THREE.Mesh(boreGeo, darkSteelMat);
          bore.position.x = x;
          group.add(bore);
        }

        x += direction * (plateThickness + plateGap);
      });
    }

    buildPlateStack(barLength / 2 - 0.55, 1);
    buildPlateStack(-(barLength / 2 - 0.55), -1);

    // Collars — small accent-colored clamps
    [1, -1].forEach(function (dir) {
      var collarGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.16, segments);
      collarGeo.rotateZ(Math.PI / 2);
      var collar = new THREE.Mesh(collarGeo, accentRingMat);
      collar.position.x = dir * (barLength / 2 - 0.85);
      group.add(collar);
    });

    group.rotation.set(0.18, 0.5, 0.08);
    group.scale.setScalar(this.mobile ? 0.72 : 0.85);

    this.barbell = group;
    this.rigGroup.add(group);

    // Base rotation values used by the render loop / scroll hooks
    this._barbellBaseRotation = group.rotation.clone();
  };

  IronforgeHero.prototype._buildParticles = function () {
    var count = this.mobile ? CONFIG.particleCount.mobile : CONFIG.particleCount.desktop;
    var positions = new Float32Array(count * 3);
    var speeds = new Float32Array(count);

    for (var i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
      speeds[i] = 0.15 + Math.random() * 0.35;
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    var mat = new THREE.PointsMaterial({
      color: CONFIG.colors.accent2,
      size: this.mobile ? 0.028 : 0.022,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geo, mat);
    this.particleSpeeds = speeds;
    this.scene.add(this.particles);
  };

  IronforgeHero.prototype._buildGroundGlow = function () {
    var geo = new THREE.CircleGeometry(6, 48);
    var mat = new THREE.MeshBasicMaterial({
      color: CONFIG.colors.accent,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    var glow = new THREE.Mesh(geo, mat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -2.4;
    this.scene.add(glow);
    this.groundGlow = glow;
  };

  /* ---- Events ---- */

  IronforgeHero.prototype._bindEvents = function () {
    window.addEventListener('resize', this._onResize);
    if (!this.mobile && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      window.addEventListener('mousemove', this._onMouseMove, { passive: true });
    }
  };

  IronforgeHero.prototype._onMouseMove = function (e) {
    this.mouseTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
  };

  IronforgeHero.prototype._onResize = function () {
    var width = this.container.clientWidth;
    var height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);

    var nowMobile = isMobileViewport();
    if (nowMobile !== this.mobile) {
      this.mobile = nowMobile;
      this.renderer.setPixelRatio(this.mobile ? CONFIG.dpr.mobile : CONFIG.dpr.desktop);
    }
  };

  /* ---- Scroll-driven camera + barbell transitions ---- */

  IronforgeHero.prototype._initScrollTrigger = function () {
    var self = this;

    if (this.reducedMotion) {
      // Skip camera travel entirely; keep a static, calm composition.
      return;
    }

    if (window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      window.ScrollTrigger.create({
        trigger: this.container,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.6,
        onUpdate: function (self_st) {
          self.scrollProgress = self_st.progress;
        }
      });
    } else {
      // Fallback: plain scroll listener, no external deps required.
      window.addEventListener('scroll', function () {
        var rect = self.container.getBoundingClientRect();
        var total = rect.height || window.innerHeight;
        var p = 1 - Math.max(0, Math.min(1, rect.bottom / (total + window.innerHeight)));
        self.scrollProgress = Math.max(0, Math.min(1, p));
      }, { passive: true });
    }
  };

  /* ---- Visibility guard: pause render loop when hero is offscreen ---- */

  IronforgeHero.prototype._initVisibilityGuard = function () {
    var self = this;
    if (!('IntersectionObserver' in window)) return;

    this._io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        self.isVisible = entry.isIntersecting;
      });
    }, { threshold: 0.01 });

    this._io.observe(this.container);

    document.addEventListener('visibilitychange', function () {
      self.isVisible = self.isVisible && !document.hidden;
    });
  };

  /* ---- Render loop ---- */

  IronforgeHero.prototype._tick = function () {
    if (this.destroyed) return;
    this._raf = requestAnimationFrame(this._tick);

    if (!this.isVisible) return;

    var dt = Math.min(this.clock.getDelta(), 0.05);
    var elapsed = this.clock.elapsedTime;

    // Smooth (lerp) mouse follow — no jitter, no distraction.
    this.mouse.x += (this.mouseTarget.x - this.mouse.x) * 0.04;
    this.mouse.y += (this.mouseTarget.y - this.mouse.y) * 0.04;

    if (this.barbell) {
      if (this.reducedMotion) {
        // Static, calm composition: hold the base pose, no continuous
        // rotation/float/parallax/camera travel.
        this.barbell.rotation.copy(this._barbellBaseRotation);
        this.barbell.position.set(0, 0, 0);
        this.barbell.scale.setScalar(this.mobile ? 0.72 : 0.85);
      } else {
        // Idle slow rotation
        this.barbell.rotation.y = this._barbellBaseRotation.y + elapsed * 0.12;

        // Mouse parallax tilt (very subtle)
        this.barbell.rotation.x = this._barbellBaseRotation.x + this.mouse.y * 0.12;
        this.barbell.rotation.z = this._barbellBaseRotation.z + this.mouse.x * -0.06;

        // Gentle float
        this.barbell.position.y = Math.sin(elapsed * 0.6) * 0.12;

        // Scroll-driven exit: barbell recedes + rotates away as user scrolls past hero
        var p = this.scrollProgress;
        this.barbell.position.z = -p * 4.5;
        this.barbell.position.x = p * 2.2;
        this.barbell.rotation.y += p * 1.4;
        var scale = (this.mobile ? 0.72 : 0.85) * (1 - p * 0.25);
        this.barbell.scale.setScalar(scale);
      }
    }

    if (this.particles && !this.reducedMotion) {
      var pos = this.particles.geometry.attributes.position.array;
      for (var i = 0; i < this.particleSpeeds.length; i++) {
        pos[i * 3 + 1] += this.particleSpeeds[i] * dt;
        if (pos[i * 3 + 1] > 4.5) pos[i * 3 + 1] = -4.5;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
      this.particles.rotation.y = elapsed * 0.015;
    }

    if (this.reducedMotion) {
      // Camera stays put; no parallax, no scroll travel.
      this.camera.position.copy(this.cameraBasePosition);
      this.camera.lookAt(0, 0, 0);
    } else {
      // Camera parallax + scroll travel
      var camX = this.cameraBasePosition.x + this.mouse.x * 0.5;
      var camY = this.cameraBasePosition.y - this.mouse.y * 0.3 + this.scrollProgress * 1.1;
      var camZ = this.cameraBasePosition.z - this.scrollProgress * 2.2;
      this.camera.position.x += (camX - this.camera.position.x) * 0.06;
      this.camera.position.y += (camY - this.camera.position.y) * 0.06;
      this.camera.position.z += (camZ - this.camera.position.z) * 0.06;
      this.camera.lookAt(0, 0, 0);

      // Lighting reacts subtly to mouse — reads as "alive" without being gimmicky
      this.keyLight.target.position.set(this.mouse.x * 2, this.mouse.y * 1.2, 0);
      this.keyLight.target.updateMatrixWorld();
      this.fillLight.intensity = 3.2 + Math.sin(elapsed * 0.8) * 0.4;
    }

    this.renderer.render(this.scene, this.camera);
  };

  IronforgeHero.prototype.destroy = function () {
    this.destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('mousemove', this._onMouseMove);
    if (this._io) this._io.disconnect();
    this.renderer.dispose();
  };

  /* ============ 3. Boot ============ */

  function boot() {
    var canvas = document.getElementById('heroCanvas');
    if (!canvas) return;

    if (!supportsWebGL()) {
      // Existing video/image background remains fully functional —
      // the site degrades gracefully with zero 3D.
      document.documentElement.classList.add('no-webgl');
      return;
    }

    try {
      window.ironforgeHero = new IronforgeHero(canvas);
      document.documentElement.classList.add('has-webgl');
    } catch (err) {
      console.error('IRONFORGE 3D hero failed to initialize:', err);
      document.documentElement.classList.add('no-webgl');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
