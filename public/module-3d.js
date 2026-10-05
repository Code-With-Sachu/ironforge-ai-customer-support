/* =========================================================
   IRONFORGE FITNESS — module-3d.js
   Click-to-open premium 3D animated entries for each program
   "module" card (Strength, Weight Loss, Muscle Building,
   Personal Training, Functional Fitness).

   Opens a full-screen modal with its own Three.js stage. One
   WebGL renderer/scene is created lazily on first open and
   reused for every subsequent open (themed geometry is swapped
   in/out) to keep this light on memory and battery.

   Requires (loaded via CDN in index.html):
     three.module.js (same version as hero-3d.js)

   Table of Contents:
   1. Config + feature detection
   2. Shared particle helper
   3. Theme builders (strength / weightloss / muscle / personal / functional)
   4. ModuleStage — the reusable Three.js stage
   5. ModalController — DOM wiring, open/close, a11y
   6. Boot
   ========================================================= */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

(function () {
  'use strict';

  /* ============ 1. Config + feature detection ============ */

  var CONFIG = {
    colors: {
      bg: 0x0a0a0c,
      accent: 0xff3b30,
      accent2: 0xffb020,
      steel: 0x9a9aa0,
      steelDark: 0x2a2a2e,
      rim: 0xffffff
    },
    introDuration: 1.15 // seconds — themed parts assemble into place over this window
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

  /* ============ 2. Shared particle helper ============ */

  function makeParticles(count, color, size) {
    var positions = new Float32Array(count * 3);
    var speeds = new Float32Array(count);

    for (var i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
      speeds[i] = 0.12 + Math.random() * 0.3;
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    var mat = new THREE.PointsMaterial({
      color: color,
      size: size,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    var points = new THREE.Points(geo, mat);

    function update(pointsObj, speedsArr, dt, elapsed) {
      var pos = pointsObj.geometry.attributes.position.array;
      for (var i = 0; i < speedsArr.length; i++) {
        pos[i * 3 + 1] += speedsArr[i] * dt;
        if (pos[i * 3 + 1] > 3) pos[i * 3 + 1] = -3;
      }
      pointsObj.geometry.attributes.position.needsUpdate = true;
      pointsObj.rotation.y = elapsed * 0.02;
    }

    return { points: points, speeds: speeds, update: update };
  }

  /* ============ 3. Theme builders ============
     Each builder returns:
       {
         group,                // THREE.Group added to the scene
         parts: [{ mesh, from:{position,rotation,scale}, to:{...} }],
         idle: fn(group, elapsed, dt, reducedMotion),
         particles: { points, speeds, update }
       }
     "parts" assemble from -> to over CONFIG.introDuration (skipped,
     landing instantly at "to", when reducedMotion is true).
  --------------------------------------------------------------- */

  function buildStrength(mobile, colors) {
    var group = new THREE.Group();
    var segments = mobile ? 20 : 36;

    var steelMat = new THREE.MeshStandardMaterial({ color: colors.steel, metalness: 0.95, roughness: 0.28 });
    var plateMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, metalness: 0.75, roughness: 0.35 });
    var accentMat = new THREE.MeshStandardMaterial({
      color: colors.accent, metalness: 0.6, roughness: 0.3,
      emissive: colors.accent, emissiveIntensity: 0.4
    });

    var barLength = 5.6;
    var barGeo = new THREE.CylinderGeometry(0.08, 0.08, barLength, segments);
    barGeo.rotateZ(Math.PI / 2);
    group.add(new THREE.Mesh(barGeo, steelMat));

    var parts = [];
    [1, -1].forEach(function (dir) {
      var accentGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.09, segments);
      accentGeo.rotateZ(Math.PI / 2);
      var accentPlate = new THREE.Mesh(accentGeo, accentMat);
      var targetX = dir * (barLength / 2 - 0.5);
      group.add(accentPlate);
      parts.push({
        mesh: accentPlate,
        from: { position: { x: dir * 6, y: dir * 1.5, z: 0 }, rotation: { x: 0, y: Math.PI * dir, z: 0 }, scale: 0.3 },
        to: { position: { x: targetX, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 }
      });

      var plateGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.09, segments);
      plateGeo.rotateZ(Math.PI / 2);
      var plate = new THREE.Mesh(plateGeo, plateMat);
      var targetX2 = dir * (barLength / 2 - 0.62);
      group.add(plate);
      parts.push({
        mesh: plate,
        from: { position: { x: dir * 7, y: -dir * 1.2, z: 0 }, rotation: { x: 0, y: -Math.PI * dir, z: 0 }, scale: 0.3 },
        to: { position: { x: targetX2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 }
      });
    });

    group.rotation.set(0.15, 0.4, 0.05);
    group.scale.setScalar(mobile ? 0.8 : 1);
    var baseRot = group.rotation.clone();

    function idle(g, elapsed, dt, reduced) {
      if (reduced) { g.rotation.copy(baseRot); return; }
      g.rotation.y = baseRot.y + elapsed * 0.25;
      g.position.y = Math.sin(elapsed * 0.8) * 0.08;
    }

    return { group: group, parts: parts, idle: idle, particles: makeParticles(mobile ? 24 : 50, colors.accent2, mobile ? 0.03 : 0.024) };
  }

  function buildWeightLoss(mobile, colors) {
    var group = new THREE.Group();
    var segments = mobile ? 18 : 32;

    var bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, metalness: 0.5, roughness: 0.4 });
    var accentMat = new THREE.MeshStandardMaterial({
      color: colors.accent2, metalness: 0.6, roughness: 0.25,
      emissive: colors.accent2, emissiveIntensity: 0.35
    });

    var body = new THREE.Mesh(new THREE.SphereGeometry(1.05, segments, segments), bodyMat);
    body.scale.set(1, 0.92, 1);
    group.add(body);

    var handleGeo = new THREE.TorusGeometry(0.55, 0.11, 10, segments, Math.PI * 1.15);
    var handle = new THREE.Mesh(handleGeo, accentMat);
    group.add(handle);

    var parts = [
      { mesh: body,
        from: { position: { x: 0, y: -4.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 0.4 },
        to: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 } },
      { mesh: handle,
        from: { position: { x: 0, y: 4.5, z: 0 }, rotation: { x: 0, y: 0, z: Math.PI }, scale: 0.3 },
        to: { position: { x: 0, y: 1.15, z: 0 }, rotation: { x: 0, y: 0, z: Math.PI * 0.5 - Math.PI * 0.075 }, scale: 1 } }
    ];

    group.rotation.set(0.1, 0.3, 0);
    group.scale.setScalar(mobile ? 0.85 : 1);
    var baseRot = group.rotation.clone();

    function idle(g, elapsed, dt, reduced) {
      if (reduced) { g.rotation.copy(baseRot); return; }
      g.rotation.y = baseRot.y + elapsed * 0.3;
      g.position.y = Math.sin(elapsed * 1.1) * 0.1;
    }

    var particles = makeParticles(mobile ? 30 : 60, colors.accent2, mobile ? 0.03 : 0.026);
    for (var i = 0; i < particles.speeds.length; i++) { particles.speeds[i] *= 1.6; } // faster "burn" drift

    return { group: group, parts: parts, idle: idle, particles: particles };
  }

  function buildMuscle(mobile, colors) {
    var group = new THREE.Group();
    var segments = mobile ? 16 : 28;

    var steelMat = new THREE.MeshStandardMaterial({ color: colors.steel, metalness: 0.9, roughness: 0.3 });
    var headMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, metalness: 0.7, roughness: 0.35 });
    var accentMat = new THREE.MeshStandardMaterial({
      color: colors.accent, metalness: 0.6, roughness: 0.28,
      emissive: colors.accent, emissiveIntensity: 0.5
    });

    var barGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.7, segments);
    barGeo.rotateZ(Math.PI / 2);
    group.add(new THREE.Mesh(barGeo, steelMat));

    var parts = [];
    var rings = [];
    [1, -1].forEach(function (dir) {
      var headGroup = new THREE.Group();
      var hexGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.42, 6);
      hexGeo.rotateZ(Math.PI / 2);
      headGroup.add(new THREE.Mesh(hexGeo, headMat));

      var ringGeo = new THREE.TorusGeometry(0.5, 0.035, 8, segments);
      ringGeo.rotateY(Math.PI / 2);
      var ring = new THREE.Mesh(ringGeo, accentMat);
      headGroup.add(ring);
      rings.push(ring);

      var targetX = dir * 0.95;
      group.add(headGroup);
      parts.push({
        mesh: headGroup,
        from: { position: { x: dir * 5, y: dir * 2, z: dir * 1.5 }, rotation: { x: 0, y: Math.PI * 1.5 * dir, z: 0 }, scale: 0.35 },
        to: { position: { x: targetX, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 }
      });
    });

    group.rotation.set(0.2, 0.5, 0.1);
    group.scale.setScalar(mobile ? 0.95 : 1.15);
    var baseRot = group.rotation.clone();

    function idle(g, elapsed, dt, reduced) {
      if (reduced) { g.rotation.copy(baseRot); rings.forEach(function (r) { r.material.emissiveIntensity = 0.5; }); return; }
      g.rotation.y = baseRot.y + elapsed * 0.28;
      var pulse = 0.4 + Math.sin(elapsed * 2) * 0.15;
      rings.forEach(function (r) { r.material.emissiveIntensity = pulse; });
    }

    return { group: group, parts: parts, idle: idle, particles: makeParticles(mobile ? 20 : 44, colors.accent, mobile ? 0.026 : 0.02) };
  }

  function buildPersonal(mobile, colors) {
    var group = new THREE.Group();
    var segments = mobile ? 24 : 40;

    var ringMatA = new THREE.MeshStandardMaterial({ color: colors.accent, metalness: 0.5, roughness: 0.3, emissive: colors.accent, emissiveIntensity: 0.3 });
    var ringMatB = new THREE.MeshStandardMaterial({ color: colors.accent2, metalness: 0.5, roughness: 0.3, emissive: colors.accent2, emissiveIntensity: 0.3 });
    var coreMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.4 });

    var ringA = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 10, segments), ringMatA);
    var ringB = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 10, segments), ringMatB);
    var core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 20), coreMat);

    group.add(ringA); group.add(ringB); group.add(core);

    var parts = [
      { mesh: ringA,
        from: { position: { x: 0, y: 0, z: 0 }, rotation: { x: Math.PI * 1.4, y: 0, z: 0 }, scale: 0.4 },
        to: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 } },
      { mesh: ringB,
        from: { position: { x: 0, y: 0, z: 0 }, rotation: { x: -Math.PI, y: 0, z: 0 }, scale: 0.4 },
        to: { position: { x: 0, y: 0, z: 0 }, rotation: { x: Math.PI / 2, y: 0, z: 0 }, scale: 1 } },
      { mesh: core,
        from: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 0.01 },
        to: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 } }
    ];

    group.rotation.set(0.1, 0.35, 0);
    group.scale.setScalar(mobile ? 0.85 : 1);
    var baseRot = group.rotation.clone();

    function idle(g, elapsed, dt, reduced) {
      if (reduced) { g.rotation.copy(baseRot); return; }
      ringA.rotation.z = elapsed * 0.4;
      ringB.rotation.y = elapsed * 0.5 + Math.PI / 2;
      if (elapsed > CONFIG.introDuration) {
        core.scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.15);
      }
      g.rotation.y = baseRot.y + elapsed * 0.2;
    }

    return { group: group, parts: parts, idle: idle, particles: makeParticles(mobile ? 20 : 40, colors.accent2, mobile ? 0.024 : 0.02) };
  }

  function buildFunctional(mobile, colors) {
    var group = new THREE.Group();
    var segments = mobile ? 16 : 28;

    var bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, metalness: 0.5, roughness: 0.4 });
    var accentMat = new THREE.MeshStandardMaterial({
      color: colors.accent, metalness: 0.6, roughness: 0.25,
      emissive: colors.accent, emissiveIntensity: 0.35
    });
    var ropeMat = new THREE.MeshStandardMaterial({ color: colors.steelDark, metalness: 0.3, roughness: 0.6 });

    var body = new THREE.Mesh(new THREE.SphereGeometry(0.75, segments, segments), bodyMat);
    body.scale.set(1, 0.9, 1);
    group.add(body);

    var handleGeo = new THREE.TorusGeometry(0.4, 0.08, 10, segments, Math.PI * 1.15);
    var handle = new THREE.Mesh(handleGeo, accentMat);
    group.add(handle);

    var ropeCount = mobile ? 10 : 16;
    var ropeLinks = [];
    var parts = [
      { mesh: body,
        from: { position: { x: 0, y: -4, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 0.4 },
        to: { position: { x: 1.4, y: -0.3, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 } },
      { mesh: handle,
        from: { position: { x: 1.4, y: 3.5, z: 0 }, rotation: { x: 0, y: 0, z: Math.PI }, scale: 0.3 },
        to: { position: { x: 1.4, y: 0.55, z: 0 }, rotation: { x: 0, y: 0, z: Math.PI * 0.5 - Math.PI * 0.075 }, scale: 1 } }
    ];

    for (var i = 0; i < ropeCount; i++) {
      var linkGeo = new THREE.TorusGeometry(0.09, 0.03, 6, 10);
      var link = new THREE.Mesh(linkGeo, ropeMat);
      var x = -2.2 + (i / (ropeCount - 1)) * 3.2;
      group.add(link);
      ropeLinks.push({ mesh: link, baseX: x, phase: i * 0.55 });
      parts.push({
        mesh: link,
        from: { position: { x: x, y: 3 + i * 0.1, z: -1.4 }, rotation: { x: 0, y: 0, z: 0 }, scale: 0.2 },
        to: { position: { x: x, y: 0, z: -1.4 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 }
      });
    }

    group.rotation.set(0.12, 0.4, 0);
    group.scale.setScalar(mobile ? 0.85 : 1);
    var baseRot = group.rotation.clone();

    function idle(g, elapsed, dt, reduced) {
      if (reduced) { g.rotation.copy(baseRot); return; }
      g.rotation.y = baseRot.y + elapsed * 0.22;
      if (elapsed > CONFIG.introDuration) {
        ropeLinks.forEach(function (l) {
          l.mesh.position.y = Math.sin(elapsed * 3 + l.phase) * 0.35;
        });
      }
    }

    return { group: group, parts: parts, idle: idle, particles: makeParticles(mobile ? 22 : 46, colors.accent2, mobile ? 0.026 : 0.022) };
  }

  var THEMES = {
    strength: {
      index: '01', title: 'Strength Training',
      desc: 'Build raw power with progressive overload programming and expert form coaching.',
      cta: 'Start Strength Training', build: buildStrength
    },
    weightloss: {
      index: '02', title: 'Weight Loss',
      desc: 'High-intensity conditioning and nutrition guidance to burn fat and boost metabolism.',
      cta: 'Start Weight Loss', build: buildWeightLoss
    },
    muscle: {
      index: '03', title: 'Muscle Building',
      desc: 'Hypertrophy-focused training blocks designed to maximize lean muscle growth.',
      cta: 'Start Muscle Building', build: buildMuscle
    },
    personal: {
      index: '04', title: 'Personal Training',
      desc: 'One-on-one coaching tailored entirely to your goals, schedule, and pace.',
      cta: 'Start Personal Training', build: buildPersonal
    },
    functional: {
      index: '05', title: 'Functional Fitness',
      desc: 'Full-body movement training that builds real-world strength, mobility, and balance.',
      cta: 'Start Functional Fitness', build: buildFunctional
    }
  };

  /* ============ 4. ModuleStage — the reusable Three.js stage ============ */

  function ModuleStage(canvas) {
    this.canvas = canvas;
    this.reducedMotion = prefersReducedMotion();
    this.mobile = isMobileViewport();
    this.clock = new THREE.Clock(false);
    this.group = null;
    this.parts = [];
    this.idleFn = null;
    this.particles = null;
    this.particleSpeeds = null;
    this.particleUpdate = null;
    this.destroyed = false;
    this.running = false;

    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);

    this._initScene();
    window.addEventListener('resize', this._onResize);
  }

  ModuleStage.prototype._initScene = function () {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(CONFIG.colors.bg, 0.05);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0.3, 7);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.mobile,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    var ambient = new THREE.AmbientLight(0x2a2a30, 0.7);
    this.scene.add(ambient);

    this.keyLight = new THREE.SpotLight(CONFIG.colors.accent, 5, 30, Math.PI / 5, 0.4, 1.2);
    this.keyLight.position.set(3, 4, 5);
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.fillLight = new THREE.SpotLight(CONFIG.colors.accent2, 3, 30, Math.PI / 4, 0.5, 1.4);
    this.fillLight.position.set(-4, -1, 4);
    this.scene.add(this.fillLight);
    this.scene.add(this.fillLight.target);

    this.rimLight = new THREE.DirectionalLight(0xdfe4ff, 1);
    this.rimLight.position.set(-2, 3, -5);
    this.scene.add(this.rimLight);

    this._resizeRenderer();
  };

  ModuleStage.prototype._resizeRenderer = function () {
    var w = this.canvas.clientWidth || 1;
    var h = this.canvas.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  ModuleStage.prototype._onResize = function () {
    if (this.destroyed) return;
    this.mobile = isMobileViewport();
    this._resizeRenderer();
  };

  ModuleStage.prototype._clearGroup = function () {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); });
          else obj.material.dispose();
        }
      });
      this.group = null;
    }
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles.material.dispose();
      this.particles = null;
      this.particleSpeeds = null;
      this.particleUpdate = null;
    }
    this.parts = [];
    this.idleFn = null;
  };

  ModuleStage.prototype.loadTheme = function (key) {
    this._clearGroup();
    var theme = THEMES[key];
    if (!theme) return;

    var built = theme.build(this.mobile, CONFIG.colors);
    this.group = built.group;
    this.parts = built.parts || [];
    this.idleFn = built.idle || null;
    this.scene.add(this.group);

    if (built.particles) {
      this.particles = built.particles.points;
      this.particleSpeeds = built.particles.speeds;
      this.particleUpdate = built.particles.update;
      this.scene.add(this.particles);
    }
  };

  ModuleStage.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.clock.start(); // resets elapsed time to 0 — each open replays its entry animation
    this._raf = requestAnimationFrame(this._tick);
  };

  ModuleStage.prototype.stop = function () {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  };

  ModuleStage.prototype._tick = function () {
    if (this.destroyed || !this.running) return;
    this._raf = requestAnimationFrame(this._tick);

    var dt = Math.min(this.clock.getDelta(), 0.05);
    var elapsed = this.clock.elapsedTime;

    if (this.parts && this.parts.length) {
      var introDur = this.reducedMotion ? 0 : CONFIG.introDuration;
      var t = introDur > 0 ? Math.min(elapsed / introDur, 1) : 1;
      var eased = 1 - Math.pow(1 - t, 3);
      this.parts.forEach(function (p) {
        p.mesh.position.set(
          p.from.position.x + (p.to.position.x - p.from.position.x) * eased,
          p.from.position.y + (p.to.position.y - p.from.position.y) * eased,
          p.from.position.z + (p.to.position.z - p.from.position.z) * eased
        );
        p.mesh.rotation.set(
          p.from.rotation.x + (p.to.rotation.x - p.from.rotation.x) * eased,
          p.from.rotation.y + (p.to.rotation.y - p.from.rotation.y) * eased,
          p.from.rotation.z + (p.to.rotation.z - p.from.rotation.z) * eased
        );
        var s = p.from.scale + (p.to.scale - p.from.scale) * eased;
        p.mesh.scale.setScalar(s);
      });
    }

    if (this.idleFn) this.idleFn(this.group, elapsed, dt, this.reducedMotion);

    if (!this.reducedMotion) {
      if (this.particleUpdate) this.particleUpdate(this.particles, this.particleSpeeds, dt, elapsed);
      this.fillLight.intensity = 3 + Math.sin(elapsed * 0.9) * 0.4;
      this.keyLight.target.position.set(Math.sin(elapsed * 0.3) * 1.5, 0, 0);
      this.keyLight.target.updateMatrixWorld();
    }

    this.renderer.render(this.scene, this.camera);
  };

  ModuleStage.prototype.destroy = function () {
    this.destroyed = true;
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this._clearGroup();
    this.renderer.dispose();
  };

  /* ============ 5. ModalController — DOM wiring, open/close, a11y ============ */

  function ModalController() {
    this.modal = document.getElementById('moduleModal');
    this.canvas = document.getElementById('moduleModalCanvas');
    this.fallback = document.getElementById('moduleModalFallback');
    this.loading = document.getElementById('moduleModalLoading');
    this.closeBtn = document.getElementById('moduleModalClose');
    this.indexEl = document.getElementById('moduleModalIndex');
    this.titleEl = document.getElementById('moduleModalTitle');
    this.descEl = document.getElementById('moduleModalDesc');
    this.ctaEl = document.getElementById('moduleModalCta');
    this.content = document.getElementById('moduleModalContent');

    this.stage = null;
    this.webglOK = supportsWebGL();
    this.lastFocused = null;
    this.contentTimer = null;

    this._bind();
  }

  ModalController.prototype._bind = function () {
    var self = this;

    var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-module]'));
    triggers.forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.program-link')) return; // let "Learn More" navigate normally
        self.open(el.getAttribute('data-module'), el);
      });
      el.addEventListener('keydown', function (e) {
        if (e.target.closest && e.target.closest('.program-link')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          self.open(el.getAttribute('data-module'), el);
        }
      });
    });

    Array.prototype.slice.call(this.modal.querySelectorAll('[data-modal-close]')).forEach(function (el) {
      el.addEventListener('click', function () { self.close(); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && self.modal.classList.contains('open')) self.close();
    });

    this.ctaEl.addEventListener('click', function () { self.close(); });
  };

  ModalController.prototype.open = function (key, triggerEl) {
    var theme = THEMES[key];
    if (!theme) return;

    if (this.contentTimer) clearTimeout(this.contentTimer);

    this.lastFocused = triggerEl || document.activeElement;
    this.indexEl.textContent = theme.index;
    // Prefer the live card text (editable from the admin panel)
    var cardTitle = triggerEl && triggerEl.querySelector ? triggerEl.querySelector('.program-body h3') : null;
    var cardDesc = triggerEl && triggerEl.querySelector ? triggerEl.querySelector('.program-body p') : null;
    this.titleEl.textContent = cardTitle ? cardTitle.textContent : theme.title;
    this.descEl.textContent = cardDesc ? cardDesc.textContent : theme.desc;
    this.ctaEl.textContent = theme.cta;

    this.modal.classList.add('open');
    this.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    this.content.classList.remove('show');
    this.fallback.classList.remove('show');

    var self = this;

    if (this.webglOK) {
      this.loading.classList.add('show');
      requestAnimationFrame(function () {
        if (!self.stage) {
          try {
            self.stage = new ModuleStage(self.canvas);
          } catch (err) {
            console.error('Module 3D stage failed to initialize:', err);
            self.webglOK = false;
          }
        }
        if (self.stage) {
          self.stage._resizeRenderer();
          self.stage.loadTheme(key);
          self.stage.start();
          self.loading.classList.remove('show');
          var delay = self.stage.reducedMotion ? 150 : 1000;
          self.contentTimer = setTimeout(function () { self.content.classList.add('show'); }, delay);
        } else {
          self.loading.classList.remove('show');
          self.fallback.classList.add('show');
          self.contentTimer = setTimeout(function () { self.content.classList.add('show'); }, 150);
        }
      });
    } else {
      this.fallback.classList.add('show');
      this.contentTimer = setTimeout(function () { self.content.classList.add('show'); }, 150);
    }

    this.closeBtn.focus();
  };

  ModalController.prototype.close = function () {
    this.modal.classList.remove('open');
    this.modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    this.fallback.classList.remove('show');
    this.content.classList.remove('show');
    if (this.contentTimer) clearTimeout(this.contentTimer);
    if (this.stage) this.stage.stop();
    if (this.lastFocused && typeof this.lastFocused.focus === 'function') this.lastFocused.focus();
  };

  /* ============ 6. Boot ============ */

  function boot() {
    if (!document.getElementById('moduleModal')) return;
    try {
      new ModalController();
    } catch (err) {
      console.error('Module 3D modal failed to initialize:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
