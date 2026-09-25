// Run with Playwright browser_run_code_unsafe(filename) against the local Vite
// Kakuriyo page. This instruments the real module response in this browser only.
// Then call page.__cameraReview.start('Digit2' or 'Digit4'), followed by
// page.__cameraReview.capture([8, 16, ...]) in short batches. Times are absolute.
// finish() verifies natural completion and exact foliage restoration.
async (page) => {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(page.url())) {
    throw new Error('Use the local Vite Kakuriyo page.');
  }
  await page.unroute('**/src/yokai/main.ts*');
  await page.route('**/src/yokai/main.ts*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + `
      window.__STORY_SPEED__ = 0;
      window.__cameraReviewScene = { THREE, scene, camera, storyWorld,
        storyPlayer, beginTale, TALES, worldGroundY, castle, village };
    ` });
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__cameraReviewScene);
  let tale, elapsed = 0;
  page.__cameraReview = {
    async start(key) {
      if (!['Digit2', 'Digit4'].includes(key)) throw new Error('Choose Digit2 or Digit4.');
      tale = key === 'Digit2' ? 'tanuki' : 'oni'; elapsed = 0;
      return page.evaluate((key) => {
        const r = window.__cameraReviewScene;
        r.storyPlayer.stop();
        r.baseline = [];
        r.storyWorld.foliage.traverse(o => {
          if (o.isInstancedMesh) r.baseline.push([o, o.instanceMatrix.array.slice()]);
        });
        r.failures = []; r.samples = 0; r.minCameraDistance = Infinity;
        r.key = key; r.ray = new r.THREE.Raycaster(); r.ray.camera = r.camera;
        r.beginTale(world => {
          const story = r.TALES[key](world);
          story.shots.forEach((shot, index) => {
            const enter = shot.onEnter;
            shot.onEnter = () => { r.shot = index; enter?.(); };
          });
          r.duration = story.shots.reduce((n, s) => n + s.duration, 0);
          return story;
        });
        return { duration: r.duration };
      }, key);
    },
    async capture(times) {
      const frames = [];
      for (const seconds of times) {
        if (seconds < elapsed) throw new Error('Capture times must increase.');
        const state = await page.evaluate(({ duration, elapsed }) => {
          const r = window.__cameraReviewScene, T = r.THREE;
          const steps = Math.round(duration * 60);
          for (let i = 0; i < steps; i++) {
            r.storyPlayer.update((elapsed + i / 60), 1 / 60);
            if (!r.storyPlayer.isActive() || i % 6 !== 0) continue;
            r.samples++;
            const p = r.camera.position;
            if (!p.toArray().every(Number.isFinite) || p.y < r.worldGroundY(p.x, p.z) + 25.9) {
              r.failures.push({ shot: r.shot, issue: 'camera ground clearance', position: p.toArray() });
            }
            const root = r.scene.getObjectByName(r.key === 'Digit2' ? 'tanuki-moon-story' : 'oni-kodama-story');
            const actor = r.key === 'Digit2' && root.children[3].visible ? root.children[3] : root.children[0];
            // Intro/watcher shots intentionally feature another subject.
            if (r.key === 'Digit2' && [0, 2].includes(r.shot)) continue;
            const center = actor.position.clone().add(new T.Vector3(0, r.key === 'Digit2' ? 40 : 70, 0));
            const distance = center.distanceTo(p);
            r.minCameraDistance = Math.min(r.minCameraDistance, distance);
            if (distance < 100) r.failures.push({ shot: r.shot, issue: 'camera collapsed onto actor', distance, at: actor.position.toArray(), camera: p.toArray() });
            r.camera.updateMatrixWorld();
            const projected = center.clone().project(r.camera);
            if (Math.abs(projected.x) > 0.95 || Math.abs(projected.y) > 0.95 || projected.z > 1) {
              r.failures.push({ shot: r.shot, issue: 'subject outside frame', projected: projected.toArray() });
            }
            r.scene.updateMatrixWorld(true);
            for (let a = 0; a < 8; a++) {
              r.ray.set(center, new T.Vector3(Math.cos(a * Math.PI / 4), 0, Math.sin(a * Math.PI / 4)));
              r.ray.far = r.key === 'Digit2' ? 23 : 30;
              const hit = r.ray.intersectObjects([r.castle.group, r.village.group], true)
                .find(h => h.object.isMesh && h.object.visible);
              if (hit) { r.failures.push({ shot: r.shot, issue: 'actor intersects structure', at: actor.position.toArray() }); break; }
            }
          }
          return { shot: r.shot, active: r.storyPlayer.isActive(), failures: r.failures.slice(0, 8) };
        }, { duration: seconds - elapsed, elapsed });
        elapsed = seconds;
        const path = `C:/GITHUB/invisibleacropolis-ops.github.io/.captures/${tale}-review-${seconds}.png`;
        await page.screenshot({ path, scale: 'css' });
        frames.push({ seconds, path, ...state });
      }
      return frames;
    },
    async finish() {
      const result = await page.evaluate(() => {
        const r = window.__cameraReviewScene;
        const active = r.storyPlayer.isActive();
        // Preserve natural-completion status before explicitly cleaning up.
        r.storyPlayer.stop();
        const restored = r.baseline.every(([mesh, values]) => values.every((v, i) => v === mesh.instanceMatrix.array[i]));
        return { naturallyFinished: !active, restored, samples: r.samples,
          minCameraDistance: r.minCameraDistance, failures: r.failures.slice(0, 20), failureCount: r.failures.length };
      });
      if (!result.naturallyFinished || !result.restored || result.failureCount) throw new Error(JSON.stringify(result));
      return result;
    },
  };
  return 'Real story review ready; start, capture, then finish. Inspect the saved PNGs as well as the assertions.';
}
