(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const liveText = $('ar-live-text'), stepText = $('ar-step-description'), timerEl = $('ar-timer'), resultEl = $('ar-result');
    const video = $('webcam'), canvas = $('output_canvas');

    const libsOk = typeof THREE !== 'undefined' && THREE.GLTFLoader && typeof Hands !== 'undefined' && typeof Camera !== 'undefined';
    if (!libsOk) {
        window.launchAR = () => alert('AR libraries failed to load. Check your internet connection and reload.');
        window.exitAR = s => switchScreen(s); window.restartAR = () => {};
        console.error('ARCSS: required libraries (three, GLTFLoader, MediaPipe) are missing.');
        return;
    }

    const STEPS = {
        wait: 'Step 1: Show your hand to the camera to start tracking.',
        grab: 'Step 2: Pinch (thumb + index) on the RAM stick to pick it up.',
        move: 'Step 3: Move the RAM over the DIMM slot. The outline turns green when aligned, then release to seat it.',
        done: 'Step 4: RAM installed! Check your results.'
    };
    const PINCH_ON = 0.30, PINCH_OFF = 0.45;   // thumb-index distance / palm size (hysteresis)

    // ---------- Three.js ----------
    const scene = new THREE.Scene();
    const cam3 = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
    cam3.position.z = 5;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(3, 5, 4); scene.add(sun);

    // Motherboard + DIMM slot
    const board = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.04), new THREE.MeshStandardMaterial({ color: 0x0f3e24 }));
    const slot = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.05), new THREE.MeshStandardMaterial({ color: 0x151515 }));
    const latchMat = new THREE.MeshStandardMaterial({ color: 0xbfc3d9 });
    const latchL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.07), latchMat), latchR = latchL.clone();
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.06), new THREE.MeshBasicMaterial({ color: 0xff9100, wireframe: true }));
    glow.visible = false;
    scene.add(board, slot, latchL, latchR, glow);

    // RAM (model.glb, with a box fallback)
    const ram = new THREE.Group(); scene.add(ram);
    let ramModel = null;
    function setRamModel(obj) { ramModel = obj; ram.add(obj); fitRam(true); }
    new THREE.GLTFLoader().load('model.glb', g => setRamModel(g.scene), undefined, err => {
        console.warn('model.glb failed to load, using placeholder:', err);
        setRamModel(new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 0.04), new THREE.MeshStandardMaterial({ color: 0x2a6f4a })));
    });

    // Finger markers
    const fingerMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const thumbDot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), fingerMat);
    const indexDot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 16), fingerMat);
    thumbDot.visible = indexDot.visible = false; thumbDot.position.z = indexDot.position.z = 0.4;
    scene.add(thumbDot, indexDot);

    // ---------- Layout ----------
    let viewW = 1, viewH = 1, ramLen = 1;
    const slotPos = new THREE.Vector3(), dockPos = new THREE.Vector3();
    function layout() {
        renderer.setSize(innerWidth, innerHeight);
        cam3.aspect = innerWidth / innerHeight; cam3.updateProjectionMatrix();
        viewH = 2 * Math.tan(cam3.fov * Math.PI / 360) * cam3.position.z; viewW = viewH * cam3.aspect;
        ramLen = Math.min(1.3, viewW * 0.62);
        slotPos.set(0, -viewH * 0.12, 0.06);
        dockPos.set(0, viewH * 0.2, 0.2);
        board.position.set(0, slotPos.y, 0);
        board.scale.set(Math.min(viewW * 0.94, ramLen * 1.5), 0.75, 1);
        slot.position.copy(slotPos); slot.position.z = 0.03; slot.scale.set(ramLen * 1.06, 0.14, 1);
        glow.position.copy(slotPos); glow.position.z = 0.07; glow.scale.set(ramLen * 1.12, 0.2, 1);
        latchL.position.set(slotPos.x - ramLen * 0.56, slotPos.y, 0.05); latchR.position.set(slotPos.x + ramLen * 0.56, slotPos.y, 0.05);
        fitRam(false);
    }
    // Orient the model (longest axis = X, thinnest = Z), scale to ramLen and centre it
    function fitRam(reorient) {
        if (!ramModel) return;
        ram.position.set(0, 0, 0); ram.updateMatrixWorld(true);
        const size = new THREE.Vector3(), box = new THREE.Box3();
        if (reorient) {
            ramModel.scale.setScalar(1); ramModel.position.set(0, 0, 0);
            outer: for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
                ramModel.rotation.set(a * Math.PI / 2, b * Math.PI / 2, c * Math.PI / 2); ramModel.updateMatrixWorld(true);
                box.setFromObject(ramModel).getSize(size);
                if (size.x >= size.y - 1e-6 && size.y >= size.z - 1e-6) break outer;
            }
        }
        ramModel.scale.setScalar(1); ramModel.position.set(0, 0, 0); ramModel.updateMatrixWorld(true);
        box.setFromObject(ramModel).getSize(size);
        ramModel.scale.setScalar(ramLen / (size.x || 1)); ramModel.updateMatrixWorld(true);
        const center = box.setFromObject(ramModel).getCenter(new THREE.Vector3());
        ramModel.position.sub(center);
        ram.position.copy(state === 'done' ? slotPos : dockPos);
    }
    addEventListener('resize', layout);
    addEventListener('orientationchange', () => setTimeout(layout, 150));

    // ---------- Hand input ----------
    let input = null;   // latest MediaPipe reading, consumed by the render loop
    let handsInstance = null, camUtil = null, running = false, rafId = 0;

    function mapTo3D(nx, ny) {
        const sa = innerWidth / innerHeight, va = (video.videoWidth || innerWidth) / (video.videoHeight || innerHeight);
        let sx = 1, sy = 1, ox = 0, oy = 0;
        if (sa > va) { sy = va / sa; oy = (1 - sy) / 2; } else { sx = sa / va; ox = (1 - sx) / 2; }
        return { x: (((nx - ox) / sx) - 0.5) * viewW, y: -(((ny - oy) / sy) - 0.5) * viewH };
    }
    function onResults(res) {
        if (!running) return;
        const h = res.multiHandLandmarks && res.multiHandLandmarks[0];
        if (!h) return;
        const palm = Math.hypot(h[0].x - h[9].x, h[0].y - h[9].y) || 0.1;     // scale-invariant pinch
        const ratio = Math.hypot(h[4].x - h[8].x, h[4].y - h[8].y) / palm;
        const t = mapTo3D(h[4].x, h[4].y), i = mapTo3D(h[8].x, h[8].y);
        input = { t, i, mid: { x: (t.x + i.x) / 2, y: (t.y + i.y) / 2 }, ratio, time: performance.now() };
    }

    // ---------- Scenario ----------
    let state = 'wait', holding = false, errors = 0, startTime = 0, endTime = 0, seatAt = 0, msgUntil = 0;
    const setStep = (txt, color) => { stepText.innerText = txt; stepText.style.color = color || '#3b42c4'; };
    const flash = (txt) => { setStep(txt, '#f44336'); msgUntil = performance.now() + 2200; };
    const clampPos = p => { p.x = Math.max(-viewW / 2, Math.min(viewW / 2, p.x)); p.y = Math.max(-viewH / 2, Math.min(viewH / 2, p.y)); return p; };
    const aligned = () => Math.abs(ram.position.x - slotPos.x) < ramLen * 0.3 && Math.abs(ram.position.y - slotPos.y) < 0.28;

    function resetScenario() {
        state = 'wait'; holding = false; errors = 0; startTime = 0; endTime = 0; input = null;
        ram.position.copy(dockPos); ram.scale.setScalar(1); glow.visible = false;
        resultEl.style.display = 'none'; timerEl.innerText = '⏱ 0.0s';
        setStep(STEPS.wait);
    }
    function release() {
        holding = false;
        if (aligned()) { state = 'seating'; seatAt = performance.now(); }
        else { errors++; state = 'grab'; flash('Not aligned with the slot. Try again.'); }
    }
    function finish() {
        state = 'done'; endTime = performance.now();
        const sec = (endTime - startTime) / 1000, acc = Math.round(100 / (errors + 1));
        $('res-time').innerText = sec.toFixed(1) + 's'; $('res-acc').innerText = acc + '%'; $('res-err').innerText = errors;
        setStep(STEPS.done, '#00c853');
        saveSession({ task: 'RAM Installation', time: +sec.toFixed(1), errors, accuracy: acc, date: new Date().toISOString() });
        setTimeout(() => { if (state === 'done') resultEl.style.display = 'flex'; }, 700);
    }

    function tick() {
        rafId = requestAnimationFrame(tick);
        if (!running) return;
        const now = performance.now();
        const fresh = input && now - input.time < 300;

        if (fresh) {
            thumbDot.position.set(input.t.x, input.t.y, 0.4); indexDot.position.set(input.i.x, input.i.y, 0.4);
            thumbDot.visible = indexDot.visible = true;
            liveText.innerText = '🟢 TRACKING ACTIVE';
        } else {
            thumbDot.visible = indexDot.visible = false;
            liveText.innerText = '🔴 SEARCHING FOR HAND...';
        }

        if (state === 'wait' && fresh) { state = 'grab'; setStep(STEPS.grab); }

        if (state === 'grab' || state === 'move') {
            const pinching = fresh && input.ratio < (holding ? PINCH_OFF : PINCH_ON);
            if (!holding && pinching) {
                const d = Math.hypot(input.mid.x - ram.position.x, input.mid.y - ram.position.y);
                if (d < Math.max(0.5, ramLen * 0.6)) {      // must grab near the RAM
                    holding = true; state = 'move';
                    if (!startTime) startTime = now;
                    setStep(STEPS.move);
                }
            } else if (holding && !pinching) release();

            if (holding) {
                ram.position.lerp(clampPos(new THREE.Vector3(input.mid.x, input.mid.y, 0.3)), 0.4);
                ram.scale.setScalar(1.08);
                const ok = aligned();
                glow.visible = true; glow.material.color.setHex(ok ? 0x00ff66 : 0xff9100);
                fingerMat.color.setHex(ok ? 0x00ff66 : 0x00e5ff);
            } else {
                ram.scale.setScalar(1); glow.visible = false; fingerMat.color.setHex(0x00e5ff);
                const home = dockPos.clone(); home.y += Math.sin(now / 500) * 0.03;   // idle bob
                ram.position.lerp(home, 0.15);
            }
        } else if (state === 'seating') {
            ram.position.lerp(slotPos, 0.25); ram.scale.setScalar(1); glow.visible = false;
            if (now - seatAt > 450) finish();
        }

        if (startTime && state !== 'done') timerEl.innerText = '⏱ ' + ((now - startTime) / 1000).toFixed(1) + 's';
        if (msgUntil && now > msgUntil) { msgUntil = 0; if (state === 'grab') setStep(STEPS.grab); }
        renderer.render(scene, cam3);
    }

    // ---------- Records (localStorage) ----------
    function loadSessions() { try { return JSON.parse(localStorage.getItem('arcss_sessions') || '[]'); } catch (e) { return []; } }
    function saveSession(s) {
        try { localStorage.setItem('arcss_sessions', JSON.stringify([s].concat(loadSessions()).slice(0, 10))); } catch (e) { console.warn('Storage unavailable', e); }
        renderRecords();
    }
    function renderRecords() {
        const list = $('recent-list'), s = loadSessions();
        if (!list || !s.length) return;
        list.innerHTML = s.slice(0, 5).map(x => `<div class="recent-item">${x.task}: ${x.time}s · ${x.accuracy}% accuracy · ${x.errors} misplacement${x.errors === 1 ? '' : 's'}</div>`).join('');
    }

    // ---------- Public API ----------
    window.launchAR = function () {
        switchScreen('screen-ar');
        layout(); resetScenario();
        running = true; liveText.innerText = '🔴 INITIALIZING CAMERA...';
        cancelAnimationFrame(rafId); tick();

        if (!handsInstance) {
            handsInstance = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}` });
            handsInstance.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            handsInstance.onResults(onResults);
        }
        camUtil = new Camera(video, {
            onFrame: async () => { if (running) await handsInstance.send({ image: video }); },
            width: 640, height: 480, facingMode: 'environment'
        });
        camUtil.start().then(() => { liveText.innerText = '🟢 CAMERA READY'; })
            .catch(err => {
                console.error('Camera error:', err);
                liveText.innerText = '⚠️ CAMERA BLOCKED';
                setStep('Camera access failed. Allow camera permission and open this page over HTTPS.', '#f44336');
            });
    };
    window.restartAR = function () { resetScenario(); };
    window.exitAR = function (target) {
        running = false; cancelAnimationFrame(rafId);
        try { if (camUtil) camUtil.stop(); } catch (e) { }
        if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null; camUtil = null; input = null;
        resultEl.style.display = 'none';
        switchScreen(target);
    };

    layout(); renderRecords();
})();
