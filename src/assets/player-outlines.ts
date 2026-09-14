import * as THREE from 'three';

/** A silhouette-only overlay. The arena never enters the mask, so walls cannot hide its edges. */
export class PlayerOutlines {
 private target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
 private white=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
 private red=new THREE.MeshBasicMaterial({color:0xff3434,toneMapped:false});
 private overlay=new THREE.Scene();
 private camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 private material=new THREE.ShaderMaterial({
  transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
  uniforms:{mask:{value:this.target.texture},pixel:{value:new THREE.Vector2(1,1)}},
  vertexShader:'varying vec2 uvMask; void main(){ uvMask=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader:`uniform sampler2D mask; uniform vec2 pixel; varying vec2 uvMask;
   void main(){
    vec4 center=texture2D(mask,uvMask), edge=vec4(0.); float outer=0.;
    for(int i=0;i<12;i++){
     float angle=float(i)*6.2831853/12.;vec2 dir=vec2(cos(angle),sin(angle))*pixel;
     vec4 sampleColor=texture2D(mask,uvMask+dir*2.);
     if(sampleColor.a>edge.a)edge=sampleColor;
     outer=max(outer,texture2D(mask,uvMask+dir*3.).a);
    }
    float a=max(outer,edge.a)*(1.-center.a);
    if(a<.01)discard;
    gl_FragColor=vec4(edge.a>.1?edge.rgb:vec3(.12,.16,.17),a*.96);
   }`,
 });
 private quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);
 constructor(){this.overlay.add(this.quad);this.target.texture.name='Player silhouette mask';}
 render(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,players:{group:THREE.Group;hit:boolean}[]){
  if(!players.some(p=>p.group.visible))return;
  const size=renderer.getDrawingBufferSize(new THREE.Vector2());
  if(this.target.width!==size.x||this.target.height!==size.y)this.target.setSize(size.x,size.y);
  const ratio=renderer.getPixelRatio();this.material.uniforms.pixel.value.set(ratio/size.x,ratio/size.y);
  const saved:{mesh:THREE.Mesh;material:THREE.Material|THREE.Material[];layers:number}[]=[];
  const background=scene.background,layer=camera.layers.mask,autoClear=renderer.autoClear,shadows=renderer.shadowMap.enabled;
  const target=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  try{
   for(const player of players)if(player.group.visible)player.group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    saved.push({mesh:object,material:object.material,layers:object.layers.mask});
    object.layers.enable(1);object.material=player.hit?this.red:this.white;
   });
   scene.background=null;camera.layers.set(1);renderer.shadowMap.enabled=false;
   renderer.setRenderTarget(this.target);renderer.setClearColor(0,0);renderer.autoClear=true;renderer.render(scene,camera);
  }finally{
   for(const entry of saved){entry.mesh.material=entry.material;entry.mesh.layers.mask=entry.layers;}
   scene.background=background;camera.layers.mask=layer;renderer.shadowMap.enabled=shadows;
   renderer.setRenderTarget(target);renderer.setClearColor(clear,alpha);renderer.autoClear=autoClear;
  }
  renderer.autoClear=false;renderer.render(this.overlay,this.camera);renderer.autoClear=autoClear;
 }
 dispose(){this.target.dispose();this.white.dispose();this.red.dispose();this.material.dispose();this.quad.geometry.dispose();}
}
