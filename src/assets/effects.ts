import * as THREE from 'three';

interface Particle { position: THREE.Vector3; velocity: THREE.Vector3; color: THREE.Color; life: number; duration: number; size: number; spin: number; }
interface Trace { from: THREE.Vector3; to: THREE.Vector3; color: THREE.Color; life: number; }
interface Wave { position: THREE.Vector3; color: THREE.Color; life: number; radius: number; }
interface Detonation {
  group: THREE.Group; life: number; radius: number;
  core: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  wave: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  plumes: THREE.Mesh<THREE.DodecahedronGeometry, THREE.MeshStandardMaterial>[];
}

/** Bounded shared draw calls for hit shards, thick shot tracers and ability rings. */
export class CombatEffects {
  private readonly maxParticles = 192;
  private readonly maxTraces = 48;
  private readonly maxWaves = 12;
  private readonly particles: Particle[] = [];
  private readonly traces: Trace[] = [];
  private readonly waves: Wave[] = [];
  private readonly detonations: Detonation[] = [];
  private readonly shards: THREE.InstancedMesh;
  private readonly lines: THREE.InstancedMesh;
  private readonly cores: THREE.InstancedMesh;
  private readonly rings: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private disposed = false;

  constructor(private readonly scene: THREE.Scene) {
    this.shards = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      this.maxParticles,
    );
    this.shards.name = 'Impact shards';
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shards.count = 0;
    this.shards.frustumCulled = false;

    const traceGeometry=new THREE.CylinderGeometry(1,1,1,6);
    this.lines=new THREE.InstancedMesh(traceGeometry,new THREE.MeshBasicMaterial({color:0xffffff,depthWrite:false,toneMapped:false,fog:false}),this.maxTraces);
    this.cores=new THREE.InstancedMesh(traceGeometry,new THREE.MeshBasicMaterial({color:0xfffae5,depthWrite:false,toneMapped:false,fog:false}),this.maxTraces);
    this.lines.name='Shot tracers';this.cores.name='Bullet cores';
    for(const mesh of [this.lines,this.cores]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);}

    this.rings = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.96, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      this.maxWaves,
    );
    this.rings.name = 'Ability shockwaves';
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    scene.add(this.shards, this.lines, this.cores, this.rings);
  }

  burst(position: THREE.Vector3, color: number, count = 12): void {
    if (this.disposed) return;
    const total = Math.min(this.maxParticles, Math.max(0, Math.floor(count)));
    const excess = this.particles.length + total - this.maxParticles;
    if (excess > 0) this.particles.splice(0, excess);
    for (let i = 0; i < total; i++) {
      const angle = Math.random() * Math.PI * 2;
      const force = 1.4 + Math.random() * 3.2;
      const duration = 0.3 + Math.random() * 0.3;
      this.particles.push({
        position: position.clone(),
        velocity: new THREE.Vector3(Math.cos(angle) * force, 0.4 + Math.random() * 3.5, Math.sin(angle) * force),
        color: new THREE.Color(color).multiplyScalar(0.7 + Math.random() * 0.55),
        life: duration,
        duration,
        size: 0.035 + Math.random() * 0.045,
        spin: Math.random() * Math.PI * 2,
      });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffe8b6): void {
    if (this.disposed) return;
    if (this.traces.length >= this.maxTraces) this.traces.shift();
    this.traces.push({ from: from.clone(), to: to.clone(), color: new THREE.Color(color), life: 0.18 });
  }

  ring(position: THREE.Vector3, color: number, radius = 3): void {
    if (this.disposed) return;
    if (this.waves.length >= this.maxWaves) this.waves.shift();
    this.waves.push({ position: position.clone().add(new THREE.Vector3(0, 0.04, 0)), color: new THREE.Color(color), life: 0.55, radius: Math.max(0.1, radius) });
  }

  /** A bounded, playful blast. Its temporary meshes are fully removed after 1.6s. */
  nuke(position: THREE.Vector3, radius: number): void {
    if (this.disposed || !position.toArray().every(Number.isFinite)) return;
    if (this.detonations.length >= 3) this.clearDetonation(this.detonations.shift()!);
    const reach = Math.max(4, Math.min(32, Number.isFinite(radius) ? radius : 12));
    const group = new THREE.Group();
    group.name = 'Party nuke blast';
    group.position.copy(position);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffefb0, transparent: true, opacity: .7, depthWrite: false, toneMapped: false }));
    core.name = 'Soft detonation flash';
    core.position.y = .35;
    core.scale.setScalar(.25);
    const wave = new THREE.Mesh(new THREE.RingGeometry(.91, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffcc79, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    wave.name = 'Expanding nuke wave';
    wave.rotation.x = -Math.PI / 2;
    wave.position.y = .09;
    wave.scale.setScalar(.35);
    group.add(core, wave);
    const geometry = new THREE.DodecahedronGeometry(.5, 0);
    const dust = new THREE.MeshStandardMaterial({ color: 0xffbe85, emissive: 0xab5222, emissiveIntensity: .11, roughness: 1, flatShading: true, transparent: true, opacity: .58, depthWrite: false });
    const plumes: Detonation['plumes'] = [];
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(geometry, dust);
      const cap = i >= 4, angle = (i - 4) * Math.PI * 2 / 5;
      p.name = cap ? 'Confetti cloud crown' : 'Rising soft dust';
      p.userData.offset = new THREE.Vector3(cap ? Math.cos(angle) * .115 : Math.sin(i * 2) * .025, cap ? .27 : .025 + i * .06, cap ? Math.sin(angle) * .115 : Math.cos(i * 2) * .025);
      p.userData.width = cap ? .22 : .115;
      p.position.copy(p.userData.offset).multiplyScalar(reach);
      p.scale.setScalar(reach * p.userData.width * .32);
      p.rotation.set(i * .62, i * .87, i * .24);
      group.add(p);
      plumes.push(p);
    }
    this.scene.add(group);
    this.detonations.push({ group, life: 1.6, radius: reach, core, wave, plumes });
    const count = 84, excess = this.particles.length + count - this.maxParticles;
    if (excess > 0) this.particles.splice(0, excess);
    const colors = [0xffcb67, 0x63e3d5, 0xff87b0, 0xfff0bc];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 2 + Math.random() * reach * .46;
      const duration = 1.1 + Math.random() * .65;
      this.particles.push({ position: position.clone().add(new THREE.Vector3(0, .35, 0)), velocity: new THREE.Vector3(Math.cos(angle) * speed, 3 + Math.random() * 7, Math.sin(angle) * speed), color: new THREE.Color(colors[i % colors.length]), life: duration, duration, size: .065 + Math.random() * .09, spin: Math.random() * Math.PI * 2 });
    }
  }

  private clearDetonation(detonation: Detonation): void {
    this.scene.remove(detonation.group);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    detonation.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    detonation.group.clear();
  }

  update(dt: number): void {
    if (this.disposed) return;
    const delta = Math.max(0, Math.min(dt, 0.1));
    for (let i = this.detonations.length - 1; i >= 0; i--) {
      const blast = this.detonations[i];
      blast.life -= delta;
      if (blast.life <= 0) { this.clearDetonation(blast); this.detonations.splice(i, 1); continue; }
      const age = 1 - blast.life / 1.6;
      const spread = 1 - Math.pow(1 - age, 3);
      blast.wave.scale.setScalar(blast.radius * (.025 + spread * .975));
      blast.wave.material.opacity = .85 * Math.pow(1 - age, 1.5);
      blast.core.scale.setScalar(blast.radius * (.025 + Math.sin(Math.min(1, age * 3) * Math.PI) * .16));
      blast.core.material.opacity = .7 * Math.max(0, 1 - age * 3.2);
      for (const plume of blast.plumes) {
        plume.position.copy(plume.userData.offset).multiplyScalar(blast.radius);
        plume.position.y += age * blast.radius * .12;
        plume.scale.setScalar(blast.radius * plume.userData.width * (.32 + spread * .83));
        plume.rotation.y += delta * .27;
      }
      blast.plumes[0].material.opacity = .58 * Math.pow(1 - age, .85);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.velocity.y -= delta * 7;
      p.position.addScaledVector(p.velocity, delta);
      p.spin += delta * 5;
    }
    this.shards.count = this.particles.length;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      this.dummy.position.copy(p.position);
      this.dummy.rotation.set(p.spin, p.spin * 0.7, 0);
      this.dummy.scale.setScalar(p.size * Math.min(1, p.life / p.duration * 2));
      this.dummy.updateMatrix();
      this.shards.setMatrixAt(i, this.dummy.matrix);
      this.shards.setColorAt(i, p.color);
    }
    this.shards.instanceMatrix.needsUpdate = true;
    if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;

    for (let i = this.traces.length - 1; i >= 0; i--) {
      this.traces[i].life -= delta;
      if (this.traces[i].life <= 0) this.traces.splice(i, 1);
    }
    this.lines.count=this.cores.count=this.traces.length;
    for(let i=0;i<this.traces.length;i++){
      const t=this.traces[i], direction=t.to.clone().sub(t.from), length=direction.length();
      this.dummy.position.copy(t.from).lerp(t.to,.5);
      this.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
      const width=.035*Math.min(1,t.life/.07);
      this.dummy.scale.set(width,length,width);this.dummy.updateMatrix();this.lines.setMatrixAt(i,this.dummy.matrix);
      this.color.copy(t.color).lerp(new THREE.Color(0xffb34d),.6);this.lines.setColorAt(i,this.color);
      this.dummy.scale.set(width*.36,length,width*.36);this.dummy.updateMatrix();this.cores.setMatrixAt(i,this.dummy.matrix);
    }
    this.lines.instanceMatrix.needsUpdate=true;this.cores.instanceMatrix.needsUpdate=true;
    if(this.lines.instanceColor)this.lines.instanceColor.needsUpdate=true;

    for (let i = this.waves.length - 1; i >= 0; i--) {
      this.waves[i].life -= delta;
      if (this.waves[i].life <= 0) this.waves.splice(i, 1);
    }
    this.rings.count = this.waves.length;
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      const remaining = w.life / 0.55;
      this.dummy.position.copy(w.position);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      this.dummy.scale.setScalar(w.radius * (0.1 + (1 - remaining) * 0.9));
      this.dummy.updateMatrix();
      this.rings.setMatrixAt(i, this.dummy.matrix);
      this.color.copy(w.color).multiplyScalar(remaining);
      this.rings.setColorAt(i, this.color);
    }
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const object of [this.shards, this.lines, this.cores, this.rings]) {
      this.scene.remove(object);
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    }
    this.shards.dispose();this.lines.dispose();this.cores.dispose();
    this.rings.dispose();
    this.particles.length = 0;
    this.traces.length = 0;
    this.waves.length = 0;
    for (const blast of this.detonations) this.clearDetonation(blast);
    this.detonations.length = 0;
  }
}
