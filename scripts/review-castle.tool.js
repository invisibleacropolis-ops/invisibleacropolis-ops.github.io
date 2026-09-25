// Local-browser verification of the actual scene. This only instruments the served
// module response; no test hooks ship in the production bundle.
async (page) => {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(page.url())) throw new Error('Use the local Vite page.');
  await page.unroute('**/src/yokai/main.ts*');
  await page.route('**/src/yokai/main.ts*', async route => {
    const response = await route.fetch();
    let body = (await response.text()).replace('const animate = () => {', 'const animate = () => { if (window.__castlePaused) { requestAnimationFrame(animate); return; }');
    body += `
      window.__castlePaused = true;
      window.__castleReview = { THREE, scene, camera, renderer, cinematic, castle, spirits,
        architecture, village, terrain, storyPlayer, storyWorld, beginTale, TALES, worldGroundY,
        setView(p,t) { freeFlight=true;camera.position.set(...p);camera.lookAt(...t);ui.dismissIntro();cinematic.render(0); },
        measure() { renderer.info.autoReset=false;renderer.info.reset();const t=performance.now();cinematic.render(0);const ms=performance.now()-t;const stats={...renderer.info.render};renderer.info.autoReset=true;return {ms,...stats}; }
      };`;
    await route.fulfill({response,body});
  });
  await page.reload();await page.waitForFunction(()=>!!window.__castleReview);
  page.__castleReview = {
    async simulate(seconds=1000, dt=.25) {
      return page.evaluate(async ({seconds,dt}) => {
        const r=window.__castleReview, nav=await import('/src/yokai/castleLayout.ts');
        const visitors=r.spirits.group.children.filter(o=>o.userData.castleVisitor);
        const stats=visitors.map(o=>({name:o.children[0].name,seen:new Set(),returns:0,lastTrips:0}));
        const failures=[],ray=new r.THREE.Raycaster();ray.camera=r.camera;
        const blockers=[r.castle.group,r.architecture.group,r.village.group];
        r.scene.updateMatrixWorld(true);
        for(let i=0;i<seconds/dt;i++) {
          r.spirits.update(i*dt,dt);
          visitors.forEach((o,j)=>{
            const s=o.userData.castleVisitor;
            s.visited.forEach(id=>stats[j].seen.add(id));
            if(stats[j].lastTrips>0 && s.trips===0) stats[j].returns++;
            stats[j].lastTrips=s.trips;
            if(!s.route.length || i%8!==0) return;
            if(!nav.castleSegmentClear(r.castle.navigation,o.position,o.position,s.radius) && failures.length<15) failures.push({issue:'envelope collision',name:stats[j].name,at:o.position.toArray()});
            if(Math.abs(o.position.y-r.castle.groundY(o.position.x,o.position.z))>.1 && failures.length<15) failures.push({issue:'floor height',name:stats[j].name});
            for(let a=0;a<8;a++) {
              ray.set(o.position.clone().add(new r.THREE.Vector3(0,38,0)),new r.THREE.Vector3(Math.cos(a*Math.PI/4),0,Math.sin(a*Math.PI/4)));
              ray.far=s.radius;
              const hit=ray.intersectObjects(blockers,true).find(h=>h.object.visible && !(Array.isArray(h.object.material)?h.object.material:[h.object.material]).every(m=>m.transparent || m instanceof r.THREE.ShaderMaterial));
              if(hit && failures.length<15) {failures.push({issue:'mesh collision',name:stats[j].name,object:hit.object.name,at:o.position.toArray()});break;}
            }
          });
        }
        return {seconds,dt,failures,visitors:stats.map(s=>({...s,seen:[...s.seen]}))};
      },{seconds,dt});
    },
    async surfaces() {
      return page.evaluate(()=>{
        const r=window.__castleReview,T=r.THREE,l=r.castle.navigation;
        const ray=new T.Raycaster(),failures=[];let samples=0;
        r.scene.updateMatrixWorld(true);
        for(const [a,b] of l.edges) {
          const from=l.byId.get(a).position,to=l.byId.get(b).position;
          const steps=Math.ceil(from.distanceTo(to)/12);
          for(let i=0;i<=steps;i++) {
            const p=from.clone().lerp(to,i/steps),y=r.castle.groundY(p.x,p.z);
            ray.set(new T.Vector3(p.x,y+4,p.z),new T.Vector3(0,-1,0));ray.far=9;
            const hit=ray.intersectObjects([r.terrain,r.castle.group],true)[0];samples++;
            if((!hit || Math.abs(hit.point.y-y)>3) && failures.length<20) failures.push({edge:[a,b],at:p.toArray(),expected:y,actual:hit?.point.y,object:hit?.object.name});
          }
        }
        return {samples,failures};
      });
    }
  };
  return 'Castle browser review ready: simulate(seconds, dt), surfaces(), and window.__castleReview.setView/measure';
}
