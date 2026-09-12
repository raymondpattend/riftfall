import * as THREE from 'three';
import type { WeaponId } from '../world-types';

/** Original, untextured arena equipment. Forward is -Z; the trigger grip is the origin. */
const palette = {
  chalk: 0xdde6d9, sage: 0x789b91, teal: 0x4dc9bd, tealLight: 0xacfff0,
  ink: 0x233b3d, dark: 0x15272a, rubber: 0x344649, steel: 0x769095,
  copper: 0xbb7858, copperLight: 0xe5ab79, ochre: 0xbfa36b,
  obsidian: 0x253036, bladeDark: 0x344b50, ember: 0xf48461, emberLight: 0xffc093,
};
const material = (color: number, metalness = 0.25, emissive = 0, intensity = 0) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.62, flatShading: true, emissive, emissiveIntensity: intensity });

function mesh(group: THREE.Group, geometry: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], name: string, position: [number,number,number] = [0,0,0]) {
  const part = new THREE.Mesh(geometry, mat);
  part.name = name;
  part.position.set(...position);
  part.castShadow = true;
  part.receiveShadow = true;
  group.add(part);
  return part;
}
function box(group: THREE.Group, size: [number,number,number], position: [number,number,number], mat: THREE.Material, name: string, rotate = 0) {
  const part = mesh(group, new THREE.BoxGeometry(...size), mat, name, position);
  part.rotation.x = rotate;
  return part;
}
function cylinder(group: THREE.Group, radius: number, length: number, position: [number,number,number], mat: THREE.Material, name: string, axis: 'y' | 'z' | 'x' = 'z', top = radius, sides = 8) {
  const part = mesh(group, new THREE.CylinderGeometry(top,radius,length,sides,1,false), mat, name, position);
  if (axis === 'z') part.rotation.x = Math.PI / 2;
  if (axis === 'x') part.rotation.z = Math.PI / 2;
  return part;
}
function profile(group: THREE.Group, points: [number,number][], width: number, mat: THREE.Material, name: string, x = 0) {
  const shape = new THREE.Shape(points.map(([z,y]) => new THREE.Vector2(z,y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1, curveSegments: 1 });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(width / 2, 0, 0);
  return mesh(group, geometry, mat, name, [x,0,0]);
}
function flatProfile(group: THREE.Group, points: [number,number][], thickness: number, mat: THREE.Material, name: string, z = 0) {
  const shape = new THREE.Shape(points.map(([x,y]) => new THREE.Vector2(x,y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1, curveSegments: 1 });
  geometry.translate(0,0,-thickness/2);
  return mesh(group, geometry, mat, name, [0,0,z]);
}
function facetedBlade(group: THREE.Group, rings: [number,number,number][], mats: THREE.Material[], name: string) {
  const vertices: number[] = [];
  const geometry = new THREE.BufferGeometry();
  const ringVertices = rings.map(([y,w,d]) => [[-w,y,0],[0,y,d],[w,y,0],[0,y,-d]]);
  let offset = 0;
  for (let r = 0; r < ringVertices.length - 1; r++) {
    for (let side = 0; side < 4; side++) {
      const next = (side+1)%4;
      const a=ringVertices[r][side], b=ringVertices[r][next], c=ringVertices[r+1][side], d=ringVertices[r+1][next];
      vertices.push(...a,...b,...c,...b,...d,...c);
      geometry.addGroup(offset,6,side % mats.length);
      offset += 6;
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  return mesh(group,geometry,mats,name);
}
function triggerGuard(group: THREE.Group, mat: THREE.Material, z = 0) {
  box(group,[0.072,0.035,0.19],[0,-0.115,z-0.09],mat,'Trigger guard base');
  box(group,[0.072,0.105,0.035],[0,-0.073,z-0.168],mat,'Trigger guard front',-0.22);
  box(group,[0.028,0.085,0.025],[0,-0.05,z-0.06],mat,'Trigger',-0.35);
}

function rifle() {
  const group = new THREE.Group();
  const alloy=material(palette.chalk), sage=material(palette.sage), dark=material(palette.dark), rubber=material(palette.rubber), steel=material(palette.steel,.6), light=material(palette.tealLight,.2,palette.teal,.65);
  profile(group,[[.16,.11],[.16,.22],[-.09,.26],[-.49,.22],[-.56,.15],[-.5,.055],[-.12,.055],[-.03,.1]],.14,alloy,'Angled alloy receiver');
  profile(group,[[.15,.21],[.16,.275],[-.39,.275],[-.44,.23]],.113,sage,'Sage top rail');
  profile(group,[[.11,.11],[.26,.17],[.34,.13],[.34,-.035],[.27,-.045],[.17,.035]],.104,sage,'Skeleton stock shoulder');
  box(group,[.145,.195,.045],[0,.045,.35],rubber,'Stock recoil pad');
  box(group,[.082,.205,.087],[0,-.056,.021],rubber,'Wrapped grip',-.19);
  box(group,[.094,.033,.095],[0,-.16,.041],sage,'Grip heel',-.19);
  triggerGuard(group,dark);
  profile(group,[[-.19,.077],[-.31,.068],[-.335,-.165],[-.24,-.2],[-.2,-.11]],.084,dark,'Curved magazine');
  box(group,[.103,.045,.117],[0,-.17,-.273],sage,'Magazine heel',.16);
  profile(group,[[-.33,.068],[-.55,.077],[-.56,.175],[-.39,.19]],.172,sage,'Forward handguard');
  cylinder(group,.033,.22,[0,.139,-.63],steel,'Exposed barrel');
  cylinder(group,.05,.088,[0,.139,-.781],dark,'Octagonal muzzle brake');
  cylinder(group,.033,.008,[0,.139,-.829],rubber,'Muzzle bore', 'z',.033,8);
  cylinder(group,.018,.01,[0,.139,-.835],dark,'Dark barrel opening');
  box(group,[.021,.053,.047],[0,.313,-.31],dark,'Front sight');
  box(group,[.13,.024,.062],[0,.296,.04],dark,'Rear sight base');
  for (const side of [-1,1]) {
    box(group,[.018,.073,.028],[side*.044,.326,.054],dark,`Rear sight ear ${side}`);
    profile(group,[[-.066,.128],[-.076,.203],[-.264,.203],[-.285,.127]],.014,sage,`Receiver side panel ${side}`,side*.077);
    box(group,[.016,.021,.115],[side*.087,.168,-.17],light,`Power indicator ${side}`);
    for(let i=0;i<3;i++) box(group,[.015,.043,.022],[side*.089,.136,-.382-i*.047],dark,`Handguard vent ${side}-${i}`,.15);
  }
  box(group,[.037,.034,.058],[.092,.227,.046],steel,'Charging handle');
  group.userData.muzzle = new THREE.Vector3(0,.139,-.843);
  return group;
}

function shotgun() {
  const group = new THREE.Group();
  const iron=material(palette.ink,.5), dark=material(palette.dark), copper=material(palette.copper,.45), pale=material(palette.copperLight,.35), rubber=material(palette.rubber), steel=material(palette.steel,.6);
  profile(group,[[.14,.18],[.13,.23],[-.28,.23],[-.34,.16],[-.27,.052],[-.05,.049],[.05,.094]],.16,iron,'Sloped heavy receiver');
  profile(group,[[.06,.111],[.27,.15],[.35,.1],[.35,-.07],[.21,-.046],[.04,.047]],.116,copper,'Copper stock');
  box(group,[.14,.183,.041],[0,.016,.37],dark,'Shoulder pad');
  box(group,[.089,.199,.095],[0,-.06,.025],rubber,'Shotgun grip',-.3);
  triggerGuard(group,dark);
  for(const side of [-1,1]) {
    cylinder(group,.046,.63,[side*.05,.15,-.59],iron,`Twin barrel ${side}`, 'z',.04,10);
    cylinder(group,.055,.045,[side*.05,.15,-.93],copper,`Muzzle cuff ${side}`, 'z',.055,10);
    cylinder(group,.035,.008,[side*.05,.15,-.956],dark,`Muzzle opening ${side}`, 'z',.035,10);
    box(group,[.022,.102,.24],[side*.086,.138,-.125],copper,`Receiver armor ${side}`);
    box(group,[.026,.032,.115],[side*.102,.158,-.12],dark,`Extraction port ${side}`);
  }
  box(group,[.22,.11,.24],[0,.053,-.55],copper,'Wide pump handle');
  for(let i=0;i<5;i++) box(group,[.23,.122,.016],[0,.052,-.458-i*.047],dark,`Pump grip ridge ${i}`);
  box(group,[.095,.018,.47],[0,.216,-.56],steel,'Sight rib');
  box(group,[.033,.035,.024],[0,.237,-.84],pale,'Copper bead sight');
  box(group,[.111,.035,.026],[0,.253,-.2],dark,'Rear notch sight');
  cylinder(group,.018,.105,[.105,.026,-.04],pale,'Shell brass', 'y');
  cylinder(group,.018,.095,[.105,.026,-.095],pale,'Second shell brass', 'y');
  cylinder(group,.018,.105,[.105,.026,-.15],pale,'Third shell brass', 'y');
  box(group,[.035,.024,.165],[.107,-.028,-.095],iron,'Shell carrier');
  group.userData.muzzle = new THREE.Vector3(0,.15,-.968);
  return group;
}

function sniper() {
  const group = new THREE.Group();
  const chalk=material(palette.chalk), ochre=material(palette.ochre,.4), dark=material(palette.dark), steel=material(palette.steel,.65), sage=material(palette.sage), lens=material(palette.teal,.4,palette.teal,.3);
  profile(group,[[.16,.13],[.14,.23],[-.4,.23],[-.48,.14],[-.4,.06],[-.11,.06],[-.02,.116]],.135,chalk,'Long white receiver');
  profile(group,[[.07,.12],[.24,.2],[.34,.15],[.34,.014],[.27,-.036],[.11,.042]],.1,ochre,'Adjustable precision stock');
  box(group,[.136,.2,.037],[0,.07,.357],dark,'Stock butt');
  box(group,[.13,.047,.17],[0,.199,.25],sage,'Cheek support');
  box(group,[.08,.195,.09],[0,-.051,.025],dark,'Precision grip',-.24);
  triggerGuard(group,dark);
  box(group,[.089,.151,.14],[0,-.007,-.199],dark,'Box magazine',.1);
  box(group,[.102,.03,.145],[0,-.09,-.207],ochre,'Magazine floor');
  cylinder(group,.024,.4,[0,.153,-.634],steel,'Precision barrel');
  cylinder(group,.039,.1,[0,.153,-.859],ochre,'Vented muzzle sleeve');
  cylinder(group,.024,.006,[0,.153,-.913],dark,'Bore');
  profile(group,[[-.285,.057],[-.61,.086],[-.62,.162],[-.415,.192]],.125,ochre,'Machined fore-end');
  for(const side of [-1,1]) {
    box(group,[.011,.056,.184],[side*.07,.15,-.254],sage,`Receiver inset ${side}`);
    for(let i=0;i<3;i++) box(group,[.012,.026,.032],[side*.068,.13,-.439-i*.052],dark,`Fore-end port ${side}-${i}`);
  }
  for(const z of [-.26,-.027]) {
    box(group,[.08,.063,.032],[0,.254,z],dark,`Optic riser ${z}`);
    cylinder(group,.058,.045,[0,.317,z],ochre,`Optic mounting collar ${z}`);
  }
  cylinder(group,.046,.38,[0,.318,-.12],dark,'Scope tube');
  cylinder(group,.072,.091,[0,.318,-.329],ochre,'Objective bell', 'z',.052,10);
  cylinder(group,.057,.071,[0,.318,.086],dark,'Eyepiece');
  cylinder(group,.046,.007,[0,.318,.124],lens,'Ocular glass');
  cylinder(group,.057,.007,[0,.318,-.378],lens,'Objective glass');
  cylinder(group,.033,.055,[0,.386,-.115],steel,'Elevation dial','y');
  cylinder(group,.026,.04,[.063,.319,-.115],steel,'Windage dial','x');
  box(group,[.055,.029,.08],[.087,.193,.008],steel,'Bolt handle');
  cylinder(group,.028,.043,[.114,.179,.017],dark,'Bolt knob','y');
  group.userData.muzzle = new THREE.Vector3(0,.153,-.924);
  return group;
}

function aote() {
  const group = new THREE.Group();
  const dark=material(palette.ink), steel=material(palette.steel,.55), sage=material(palette.sage,.5), edge=material(palette.tealLight,.25,palette.teal,.45), face=material(palette.teal,.45,palette.teal,.1), deep=material(0x347e7e,.5), darkFace=material(0x275d65,.6);
  facetedBlade(group,[[.2,.057,.029],[.3,.091,.044],[.99,.058,.033],[1.265,0,0]],[edge,face,darkFace,deep],'Four-facet teleport crystal');
  flatProfile(group,[[-.18,.151],[-.196,.198],[-.12,.254],[-.067,.201],[0,.169],[.067,.201],[.12,.254],[.196,.198],[.18,.151],[.084,.123],[-.084,.123]],.08,sage,'Swept rift crossguard');
  flatProfile(group,[[-.125,.222],[-.192,.174],[-.212,.24],[-.16,.272]],.052,edge,'Left crystal guard tip');
  flatProfile(group,[[.125,.222],[.192,.174],[.212,.24],[.16,.272]],.052,edge,'Right crystal guard tip');
  cylinder(group,.035,.255,[0,-.023,0],dark,'Hexagonal wrapped hilt','y',.029,6);
  for(let i=0;i<6;i++) cylinder(group,.038,.011,[0,-.126+i*.04,0],steel,`Hilt band ${i}`,'y',.038,6);
  cylinder(group,.047,.039,[0,.117,0],steel,'Upper collar','y',.039,6);
  cylinder(group,.043,.035,[0,-.168,0],sage,'Pommel collar','y',.033,6);
  const pommel=mesh(group,new THREE.OctahedronGeometry(.067),face,'Pointed teleport pommel',[0,-.219,0]);
  pommel.scale.set(.71,1.2,.71);
  for(const side of [-1,1]) {
    const socket=mesh(group,new THREE.OctahedronGeometry(.065),dark,'Rift jewel socket',[0,.164,side*.043]);
    socket.scale.set(1,.8,.32);
    const stone=mesh(group,new THREE.OctahedronGeometry(.049),edge,'Rift jewel',[0,.164,side*.062]);
    stone.scale.set(.78,1.05,.35);
    for(let i=0;i<4;i++) {
      const rune=box(group,[.013,.031,.004],[0,.387+i*.123,side*(.043-i*.003)],edge,`Blade rune ${side}-${i}`);
      rune.rotation.z=Math.PI/4;
    }
  }
  group.userData.bladeTip = new THREE.Vector3(0,1.265,0);
  return group;
}

function aotd() {
  const group = new THREE.Group();
  const obsidian=material(palette.obsidian,.58), darkFace=material(palette.bladeDark,.5), copper=material(palette.copper,.55), light=material(palette.copperLight,.45), ember=material(palette.ember,.35,palette.ember,.5), hot=material(palette.emberLight,.35,palette.ember,.7), rubber=material(palette.dark);
  facetedBlade(group,[[.195,.05,.031],[.32,.086,.038],[.92,.064,.033],[1.18,.032,.018],[1.33,0,0]],[darkFace,obsidian,obsidian,darkFace],'Obsidian dragon blade');
  for(const side of [-1,1]) {
    flatProfile(group,[[side*.055,.324],[side*.105,.346],[side*.087,.422],[side*.084,.568],[side*.07,.534]],.032,copper,`Basal blade fang ${side}`);
    flatProfile(group,[[0,.172],[side*.074,.26],[side*.133,.277],[side*.233,.351],[side*.206,.206],[side*.147,.228],[side*.107,.135],[side*.064,.17]],.067,obsidian,`Dragon wing guard ${side}`);
    flatProfile(group,[[side*.08,.23],[side*.136,.254],[side*.203,.309],[side*.17,.247],[side*.127,.233],[side*.102,.179]],.079,copper,`Dragon wing copper ridge ${side}`);
    flatProfile(group,[[side*.191,.266],[side*.233,.351],[side*.262,.388],[side*.245,.3],[side*.223,.246]],.039,light,`Wing talon ${side}`);
    flatProfile(group,[[side*.025,.31],[side*.007,.574],[side*.023,.607],[side*.005,.91],[side*.013,.957],[0,1.177],[side*.035,.71],[side*.027,.656],[side*.039,.4]],.003,ember,`Ember vein ${side}`,side*.035);
  }
  cylinder(group,.033,.261,[0,-.017,0],rubber,'Charred leather hilt','y',.028,8);
  for(let i=0;i<5;i++) {
    const wrap=box(group,[.064,.015,.063],[0,-.126+i*.05,0],copper,`Diagonal hilt binding ${i}`);
    wrap.rotation.z=.16;
  }
  cylinder(group,.051,.042,[0,.125,0],copper,'Guard collar','y',.043,8);
  cylinder(group,.048,.036,[0,-.176,0],copper,'Pommel ferrule','y',.033,8);
  const pommel = mesh(group,new THREE.OctahedronGeometry(.066),obsidian,'Dragon tooth pommel',[0,-.222,0]);
  pommel.scale.set(.85,1.2,.75);
  for(const side of [-1,1]) {
    flatProfile(group,[[-.056,.229],[-.048,.15],[0,.11],[.048,.15],[.056,.229],[.022,.21],[0,.242],[-.022,.21]],.026,copper,`Dragon face ${side}`,side*.05);
    for(const eye of [-1,1]) {
      const gem=mesh(group,new THREE.OctahedronGeometry(.017),hot,`Dragon eye ${side}-${eye}`,[eye*.025,.185,side*.069]);
      gem.scale.set(1,.5,.5);
    }
  }
  group.userData.bladeTip = new THREE.Vector3(0,1.33,0);
  return group;
}

export function createWeapon(id: WeaponId): THREE.Group {
  const group = ({ rifle, shotgun, sniper, aote, aotd }[id])();
  group.name = `Weapon: ${id}`;
  group.userData.weaponId = id;
  return group;
}

/** A right gloved hand at the grip, with the forearm trailing toward the camera. */
export function createHands(): THREE.Group {
  const group=new THREE.Group();
  group.name='Armored shooting hand';
  const glove=material(palette.dark), knuckle=material(palette.sage), sleeve=material(palette.ink), cuff=material(palette.chalk);
  box(group,[.129,.133,.107],[.021,-.095,.037],glove,'Glove palm',-.18);
  for(let i=0;i<4;i++) box(group,[.072,.021,.12],[-.035,-.041-i*.029,.017],glove,`Gripping finger ${i}`,.1);
  box(group,[.058,.083,.065],[.082,-.041,-.01],glove,'Thumb',-.43);
  box(group,[.106,.053,.031],[.033,-.058,.1],knuckle,'Knuckle plate');
  box(group,[.129,.047,.119],[.034,-.184,.066],cuff,'Pale wrist cuff',-.43);
  const arm=cylinder(group,.076,.27,[.052,-.298,.135],sleeve,'Faceted forearm','y',.061,7);
  arm.rotation.x=-.51;
  box(group,[.091,.127,.029],[.071,-.277,.227],knuckle,'Forearm armor',-.51);
  return group;
}

export const weaponIcons: Record<WeaponId,string> = {
  rifle:'/weapons/rifle.svg', shotgun:'/weapons/shotgun.svg', sniper:'/weapons/sniper.svg', aote:'/weapons/aote.svg', aotd:'/weapons/aotd.svg',
};
