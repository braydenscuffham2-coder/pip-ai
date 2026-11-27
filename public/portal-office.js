// Pip Portal: the 3D office (three.js addons, the floor, the stations). Loaded by portal.html after first paint (see loadPart there).
// Readable on purpose: edit it here. The page checks that it loaded before it uses it.
// three.js r170 addons (MIT, three.js authors), bundled for this one-file page: RoundedBoxGeometry, CSS3DRenderer, RoomEnvironment, Reflector, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, BokehPass.
function threeAddons(t){"use strict";const{ACESFilmicToneMapping:e,AdditiveBlending:r,AgXToneMapping:s,BackSide:i,BoxGeometry:n,BufferGeometry:o,CineonToneMapping:a,Clock:l,Color:c,ColorManagement:u,Float32BufferAttribute:h,HalfFloatType:d,LinearToneMapping:p,Matrix4:f,Mesh:m,MeshBasicMaterial:v,MeshDepthMaterial:g,MeshStandardMaterial:x,NearestFilter:b,NeutralToneMapping:C,NoBlending:M,Object3D:S,OrthographicCamera:y,PerspectiveCamera:T,Plane:w,PointLight:D,Quaternion:_,RGBADepthPacking:U,RawShaderMaterial:P,ReinhardToneMapping:R,SRGBTransfer:B,Scene:E,ShaderMaterial:A,UniformsUtils:F,Vector2:O,Vector3:N,Vector4:z,WebGLRenderTarget:k}=t,{RoundedBoxGeometry:I}=(()=>{const t=new N;function getUv(e,r,s,i,n,o){const a=2*Math.PI*n/4,l=Math.max(o-2*n,0),c=Math.PI/4;t.copy(r),t[i]=0,t.normalize();const u=.5*a/(a+l),h=1-t.angleTo(e)/c;if(1===Math.sign(t[s]))return h*u;return l/(a+l)+u+u*(1-h)}return{RoundedBoxGeometry:class RoundedBoxGeometry extends n{constructor(t=1,e=1,r=1,s=2,i=.1){if(s=2*s+1,i=Math.min(t/2,e/2,r/2,i),super(1,1,1,s,s,s),1===s)return;const n=this.toNonIndexed();this.index=null,this.attributes.position=n.attributes.position,this.attributes.normal=n.attributes.normal,this.attributes.uv=n.attributes.uv;const o=new N,a=new N,l=new N(t,e,r).divideScalar(2).subScalar(i),c=this.attributes.position.array,u=this.attributes.normal.array,h=this.attributes.uv.array,d=c.length/6,p=new N,f=.5/s;for(let s=0,n=0;s<c.length;s+=3,n+=2){o.fromArray(c,s),a.copy(o),a.x-=Math.sign(a.x)*f,a.y-=Math.sign(a.y)*f,a.z-=Math.sign(a.z)*f,a.normalize(),c[s+0]=l.x*Math.sign(o.x)+a.x*i,c[s+1]=l.y*Math.sign(o.y)+a.y*i,c[s+2]=l.z*Math.sign(o.z)+a.z*i,u[s+0]=a.x,u[s+1]=a.y,u[s+2]=a.z;switch(Math.floor(s/d)){case 0:p.set(1,0,0),h[n+0]=getUv(p,a,"z","y",i,r),h[n+1]=1-getUv(p,a,"y","z",i,e);break;case 1:p.set(-1,0,0),h[n+0]=1-getUv(p,a,"z","y",i,r),h[n+1]=1-getUv(p,a,"y","z",i,e);break;case 2:p.set(0,1,0),h[n+0]=1-getUv(p,a,"x","z",i,t),h[n+1]=getUv(p,a,"z","x",i,r);break;case 3:p.set(0,-1,0),h[n+0]=1-getUv(p,a,"x","z",i,t),h[n+1]=1-getUv(p,a,"z","x",i,r);break;case 4:p.set(0,0,1),h[n+0]=1-getUv(p,a,"x","y",i,t),h[n+1]=1-getUv(p,a,"y","x",i,e);break;case 5:p.set(0,0,-1),h[n+0]=getUv(p,a,"x","y",i,t),h[n+1]=1-getUv(p,a,"y","x",i,e)}}}}}})(),{CSS3DObject:L,CSS3DRenderer:j}=(()=>{const t=new N,e=new _,r=new N;class CSS3DObject extends S{constructor(t=document.createElement("div")){super(),this.isCSS3DObject=!0,this.element=t,this.element.style.position="absolute",this.element.style.pointerEvents="auto",this.element.style.userSelect="none",this.element.setAttribute("draggable",!1),this.addEventListener("removed",function(){this.traverse(function(t){t.element instanceof t.element.ownerDocument.defaultView.Element&&null!==t.element.parentNode&&t.element.remove()})})}copy(t,e){return super.copy(t,e),this.element=t.element.cloneNode(!0),this}}const s=new f,i=new f;return{CSS3DObject:CSS3DObject,CSS3DRenderer:class CSS3DRenderer{constructor(n={}){const o=this;let a,l,c,u;const h={camera:{style:""},objects:new WeakMap},d=void 0!==n.element?n.element:document.createElement("div");d.style.overflow="hidden",this.domElement=d;const p=document.createElement("div");p.style.transformOrigin="0 0",p.style.pointerEvents="none",d.appendChild(p);const f=document.createElement("div");function epsilon(t){return Math.abs(t)<1e-10?0:t}function getCameraCSSMatrix(t){const e=t.elements;return"matrix3d("+epsilon(e[0])+","+epsilon(-e[1])+","+epsilon(e[2])+","+epsilon(e[3])+","+epsilon(e[4])+","+epsilon(-e[5])+","+epsilon(e[6])+","+epsilon(e[7])+","+epsilon(e[8])+","+epsilon(-e[9])+","+epsilon(e[10])+","+epsilon(e[11])+","+epsilon(e[12])+","+epsilon(-e[13])+","+epsilon(e[14])+","+epsilon(e[15])+")"}function getObjectCSSMatrix(t){const e=t.elements;return"translate(-50%,-50%)"+("matrix3d("+epsilon(e[0])+","+epsilon(e[1])+","+epsilon(e[2])+","+epsilon(e[3])+","+epsilon(-e[4])+","+epsilon(-e[5])+","+epsilon(-e[6])+","+epsilon(-e[7])+","+epsilon(e[8])+","+epsilon(e[9])+","+epsilon(e[10])+","+epsilon(e[11])+","+epsilon(e[12])+","+epsilon(e[13])+","+epsilon(e[14])+","+epsilon(e[15])+")")}function hideObject(t){t.isCSS3DObject&&(t.element.style.display="none");for(let e=0,r=t.children.length;e<r;e++)hideObject(t.children[e])}function renderObject(n,a,l,c){if(!1!==n.visible){if(n.isCSS3DObject){const c=!0===n.layers.test(l.layers),u=n.element;if(u.style.display=!0===c?"":"none",!0===c){let c;n.onBeforeRender(o,a,l),n.isCSS3DSprite?(s.copy(l.matrixWorldInverse),s.transpose(),0!==n.rotation2D&&s.multiply(i.makeRotationZ(n.rotation2D)),n.matrixWorld.decompose(t,e,r),s.setPosition(t),s.scale(r),s.elements[3]=0,s.elements[7]=0,s.elements[11]=0,s.elements[15]=1,c=getObjectCSSMatrix(s)):c=getObjectCSSMatrix(n.matrixWorld);const d=h.objects.get(n);if(void 0===d||d.style!==c){u.style.transform=c;const t={style:c};h.objects.set(n,t)}u.parentNode!==f&&f.appendChild(u),n.onAfterRender(o,a,l)}}for(let t=0,e=n.children.length;t<e;t++)renderObject(n.children[t],a,l,c)}else hideObject(n)}f.style.transformStyle="preserve-3d",p.appendChild(f),this.getSize=function(){return{width:a,height:l}},this.render=function(t,e){const r=e.projectionMatrix.elements[5]*u;let s,i;e.view&&e.view.enabled?(p.style.transform=`translate( ${-e.view.offsetX*(a/e.view.width)}px, ${-e.view.offsetY*(l/e.view.height)}px )`,p.style.transform+=`scale( ${e.view.fullWidth/e.view.width}, ${e.view.fullHeight/e.view.height} )`):p.style.transform="",!0===t.matrixWorldAutoUpdate&&t.updateMatrixWorld(),null===e.parent&&!0===e.matrixWorldAutoUpdate&&e.updateMatrixWorld(),e.isOrthographicCamera&&(s=-(e.right+e.left)/2,i=(e.top+e.bottom)/2);const n=e.view&&e.view.enabled?e.view.height/e.view.fullHeight:1,o=e.isOrthographicCamera?`scale( ${n} )scale(`+r+")translate("+epsilon(s)+"px,"+epsilon(i)+"px)"+getCameraCSSMatrix(e.matrixWorldInverse):`scale( ${n} )translateZ(`+r+"px)"+getCameraCSSMatrix(e.matrixWorldInverse),d=(e.isPerspectiveCamera?"perspective("+r+"px) ":"")+o+"translate("+c+"px,"+u+"px)";h.camera.style!==d&&(f.style.transform=d,h.camera.style=d),renderObject(t,t,e,o)},this.setSize=function(t,e){a=t,l=e,c=a/2,u=l/2,d.style.width=t+"px",d.style.height=e+"px",p.style.width=t+"px",p.style.height=e+"px",f.style.width=t+"px",f.style.height=e+"px"}}}}})(),{RoomEnvironment:Q}=(()=>{function createAreaLightMaterial(t){const e=new v;return e.color.setScalar(t),e}return{RoomEnvironment:class RoomEnvironment extends E{constructor(){super();const t=new n;t.deleteAttribute("uv");const e=new x({side:i}),r=new x,s=new D(16777215,900,28,2);s.position.set(.418,16.199,.3),this.add(s);const o=new m(t,e);o.position.set(-.757,13.219,.717),o.scale.set(31.713,28.305,28.591),this.add(o);const a=new m(t,r);a.position.set(-10.906,2.009,1.846),a.rotation.set(0,-.195,0),a.scale.set(2.328,7.905,4.651),this.add(a);const l=new m(t,r);l.position.set(-5.607,-.754,-.758),l.rotation.set(0,.994,0),l.scale.set(1.97,1.534,3.955),this.add(l);const c=new m(t,r);c.position.set(6.167,.857,7.803),c.rotation.set(0,.561,0),c.scale.set(3.927,6.285,3.687),this.add(c);const u=new m(t,r);u.position.set(-2.017,.018,6.124),u.rotation.set(0,.333,0),u.scale.set(2.002,4.566,2.064),this.add(u);const h=new m(t,r);h.position.set(2.291,-.756,-2.621),h.rotation.set(0,-.286,0),h.scale.set(1.546,1.552,1.496),this.add(h);const d=new m(t,r);d.position.set(-2.193,-.369,-5.547),d.rotation.set(0,.516,0),d.scale.set(3.875,3.487,2.986),this.add(d);const p=new m(t,createAreaLightMaterial(50));p.position.set(-16.116,14.37,8.208),p.scale.set(.1,2.428,2.739),this.add(p);const f=new m(t,createAreaLightMaterial(50));f.position.set(-16.109,18.021,-8.207),f.scale.set(.1,2.425,2.751),this.add(f);const v=new m(t,createAreaLightMaterial(17));v.position.set(14.904,12.198,-1.832),v.scale.set(.15,4.265,6.331),this.add(v);const g=new m(t,createAreaLightMaterial(43));g.position.set(-.462,8.89,14.52),g.scale.set(4.38,5.441,.088),this.add(g);const b=new m(t,createAreaLightMaterial(20));b.position.set(3.235,11.486,-12.541),b.scale.set(2.5,2,.1),this.add(b);const C=new m(t,createAreaLightMaterial(100));C.position.set(0,20,0),C.scale.set(1,.1,1),this.add(C)}dispose(){const t=new Set;this.traverse(e=>{e.isMesh&&(t.add(e.geometry),t.add(e.material))});for(const e of t)e.dispose()}}}})(),{Reflector:V}=(()=>{class Reflector extends m{constructor(t,e={}){super(t),this.isReflector=!0,this.type="Reflector",this.camera=new T;const r=this,s=void 0!==e.color?new c(e.color):new c(8355711),i=e.textureWidth||512,n=e.textureHeight||512,o=e.clipBias||0,a=e.shader||Reflector.ReflectorShader,l=void 0!==e.multisample?e.multisample:4,u=new w,h=new N,p=new N,m=new N,v=new f,g=new N(0,0,-1),x=new z,b=new N,C=new N,M=new z,S=new f,y=this.camera,D=new k(i,n,{samples:l,type:d}),_=new A({name:void 0!==a.name?a.name:"unspecified",uniforms:F.clone(a.uniforms),fragmentShader:a.fragmentShader,vertexShader:a.vertexShader});_.uniforms.tDiffuse.value=D.texture,_.uniforms.color.value=s,_.uniforms.textureMatrix.value=S,this.material=_,this.onBeforeRender=function(t,e,s){if(p.setFromMatrixPosition(r.matrixWorld),m.setFromMatrixPosition(s.matrixWorld),v.extractRotation(r.matrixWorld),h.set(0,0,1),h.applyMatrix4(v),b.subVectors(p,m),b.dot(h)>0)return;b.reflect(h).negate(),b.add(p),v.extractRotation(s.matrixWorld),g.set(0,0,-1),g.applyMatrix4(v),g.add(m),C.subVectors(p,g),C.reflect(h).negate(),C.add(p),y.position.copy(b),y.up.set(0,1,0),y.up.applyMatrix4(v),y.up.reflect(h),y.lookAt(C),y.far=s.far,y.updateMatrixWorld(),y.projectionMatrix.copy(s.projectionMatrix),S.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),S.multiply(y.projectionMatrix),S.multiply(y.matrixWorldInverse),S.multiply(r.matrixWorld),u.setFromNormalAndCoplanarPoint(h,p),u.applyMatrix4(y.matrixWorldInverse),x.set(u.normal.x,u.normal.y,u.normal.z,u.constant);const i=y.projectionMatrix;M.x=(Math.sign(x.x)+i.elements[8])/i.elements[0],M.y=(Math.sign(x.y)+i.elements[9])/i.elements[5],M.z=-1,M.w=(1+i.elements[10])/i.elements[14],x.multiplyScalar(2/x.dot(M)),i.elements[2]=x.x,i.elements[6]=x.y,i.elements[10]=x.z+1-o,i.elements[14]=x.w,r.visible=!1;const n=t.getRenderTarget(),a=t.xr.enabled,l=t.shadowMap.autoUpdate;t.xr.enabled=!1,t.shadowMap.autoUpdate=!1,t.setRenderTarget(D),t.state.buffers.depth.setMask(!0),!1===t.autoClear&&t.clear(),t.render(e,y),t.xr.enabled=a,t.shadowMap.autoUpdate=l,t.setRenderTarget(n);const c=s.viewport;void 0!==c&&t.state.viewport(c),r.visible=!0},this.getRenderTarget=function(){return D},this.dispose=function(){D.dispose(),r.material.dispose()}}}return Reflector.ReflectorShader={name:"ReflectorShader",uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},vertexShader:"\n\t\tuniform mat4 textureMatrix;\n\t\tvarying vec4 vUv;\n\n\t\t#include <common>\n\t\t#include <logdepthbuf_pars_vertex>\n\n\t\tvoid main() {\n\n\t\t\tvUv = textureMatrix * vec4( position, 1.0 );\n\n\t\t\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\n\t\t\t#include <logdepthbuf_vertex>\n\n\t\t}",fragmentShader:"\n\t\tuniform vec3 color;\n\t\tuniform sampler2D tDiffuse;\n\t\tvarying vec4 vUv;\n\n\t\t#include <logdepthbuf_pars_fragment>\n\n\t\tfloat blendOverlay( float base, float blend ) {\n\n\t\t\treturn( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );\n\n\t\t}\n\n\t\tvec3 blendOverlay( vec3 base, vec3 blend ) {\n\n\t\t\treturn vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );\n\n\t\t}\n\n\t\tvoid main() {\n\n\t\t\t#include <logdepthbuf_fragment>\n\n\t\t\tvec4 base = texture2DProj( tDiffuse, vUv );\n\t\t\tgl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );\n\n\t\t\t#include <tonemapping_fragment>\n\t\t\t#include <colorspace_fragment>\n\n\t\t}"},{Reflector:Reflector}})(),{CopyShader:G}={CopyShader:{name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:"\n\n\t\tvarying vec2 vUv;\n\n\t\tvoid main() {\n\n\t\t\tvUv = uv;\n\t\t\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\n\t\t}",fragmentShader:"\n\n\t\tuniform float opacity;\n\n\t\tuniform sampler2D tDiffuse;\n\n\t\tvarying vec2 vUv;\n\n\t\tvoid main() {\n\n\t\t\tvec4 texel = texture2D( tDiffuse, vUv );\n\t\t\tgl_FragColor = opacity * texel;\n\n\n\t\t}"}},{Pass:W,FullScreenQuad:H}=(()=>{const t=new y(-1,1,1,-1,0,1);const e=new class FullscreenTriangleGeometry extends o{constructor(){super(),this.setAttribute("position",new h([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new h([0,2,0,0,2,0],2))}};return{Pass:class Pass{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}},FullScreenQuad:class FullScreenQuad{constructor(t){this._mesh=new m(e,t)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,t)}get material(){return this._mesh.material}set material(t){this._mesh.material=t}}}})(),{ShaderPass:Z}={ShaderPass:class Z extends W{constructor(t,e){super(),this.textureID=void 0!==e?e:"tDiffuse",t instanceof A?(this.uniforms=t.uniforms,this.material=t):t&&(this.uniforms=F.clone(t.uniforms),this.material=new A({name:void 0!==t.name?t.name:"unspecified",defines:Object.assign({},t.defines),uniforms:this.uniforms,vertexShader:t.vertexShader,fragmentShader:t.fragmentShader})),this.fsQuad=new H(this.material)}render(t,e,r){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=r.texture),this.fsQuad.material=this.material,this.renderToScreen?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(e),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this.fsQuad.render(t))}dispose(){this.material.dispose(),this.fsQuad.dispose()}}},{MaskPass:K,ClearMaskPass:X}={MaskPass:class K extends W{constructor(t,e){super(),this.scene=t,this.camera=e,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(t,e,r){const s=t.getContext(),i=t.state;let n,o;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0),this.inverse?(n=0,o=1):(n=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(s.REPLACE,s.REPLACE,s.REPLACE),i.buffers.stencil.setFunc(s.ALWAYS,n,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),t.setRenderTarget(r),this.clear&&t.clear(),t.render(this.scene,this.camera),t.setRenderTarget(e),this.clear&&t.clear(),t.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(s.EQUAL,1,4294967295),i.buffers.stencil.setOp(s.KEEP,s.KEEP,s.KEEP),i.buffers.stencil.setLocked(!0)}},ClearMaskPass:class X extends W{constructor(){super(),this.needsSwap=!1}render(t){t.state.buffers.stencil.setLocked(!1),t.state.buffers.stencil.setTest(!1)}}},{EffectComposer:$}={EffectComposer:class ${constructor(t,e){if(this.renderer=t,this._pixelRatio=t.getPixelRatio(),void 0===e){const r=t.getSize(new O);this._width=r.width,this._height=r.height,(e=new k(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:d})).texture.name="EffectComposer.rt1"}else this._width=e.width,this._height=e.height;this.renderTarget1=e,this.renderTarget2=e.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Z(G),this.copyPass.material.blending=M,this.clock=new l}swapBuffers(){const t=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=t}addPass(t){this.passes.push(t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(t,e){this.passes.splice(e,0,t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(t){const e=this.passes.indexOf(t);-1!==e&&this.passes.splice(e,1)}isLastEnabledPass(t){for(let e=t+1;e<this.passes.length;e++)if(this.passes[e].enabled)return!1;return!0}render(t){void 0===t&&(t=this.clock.getDelta());const e=this.renderer.getRenderTarget();let r=!1;for(let e=0,s=this.passes.length;e<s;e++){const s=this.passes[e];if(!1!==s.enabled){if(s.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(e),s.render(this.renderer,this.writeBuffer,this.readBuffer,t,r),s.needsSwap){if(r){const e=this.renderer.getContext(),r=this.renderer.state.buffers.stencil;r.setFunc(e.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,t),r.setFunc(e.EQUAL,1,4294967295)}this.swapBuffers()}void 0!==K&&(s instanceof K?r=!0:s instanceof X&&(r=!1))}}this.renderer.setRenderTarget(e)}reset(t){if(void 0===t){const e=this.renderer.getSize(new O);this._pixelRatio=this.renderer.getPixelRatio(),this._width=e.width,this._height=e.height,(t=this.renderTarget1.clone()).setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=t,this.renderTarget2=t.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(t,e){this._width=t,this._height=e;const r=this._width*this._pixelRatio,s=this._height*this._pixelRatio;this.renderTarget1.setSize(r,s),this.renderTarget2.setSize(r,s);for(let t=0;t<this.passes.length;t++)this.passes[t].setSize(r,s)}setPixelRatio(t){this._pixelRatio=t,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}}},{RenderPass:Y}={RenderPass:class Y extends W{constructor(t,e,r=null,s=null,i=null){super(),this.scene=t,this.camera=e,this.overrideMaterial=r,this.clearColor=s,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this._oldClearColor=new c}render(t,e,r){const s=t.autoClear;let i,n;t.autoClear=!1,null!==this.overrideMaterial&&(n=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),null!==this.clearColor&&(t.getClearColor(this._oldClearColor),t.setClearColor(this.clearColor,t.getClearAlpha())),null!==this.clearAlpha&&(i=t.getClearAlpha(),t.setClearAlpha(this.clearAlpha)),1==this.clearDepth&&t.clearDepth(),t.setRenderTarget(this.renderToScreen?null:r),!0===this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),t.render(this.scene,this.camera),null!==this.clearColor&&t.setClearColor(this._oldClearColor),null!==this.clearAlpha&&t.setClearAlpha(i),null!==this.overrideMaterial&&(this.scene.overrideMaterial=n),t.autoClear=s}}},{LuminosityHighPassShader:q}={LuminosityHighPassShader:{name:"LuminosityHighPassShader",shaderID:"luminosityHighPass",uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new c(0)},defaultOpacity:{value:0}},vertexShader:"\n\n\t\tvarying vec2 vUv;\n\n\t\tvoid main() {\n\n\t\t\tvUv = uv;\n\n\t\t\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\n\t\t}",fragmentShader:"\n\n\t\tuniform sampler2D tDiffuse;\n\t\tuniform vec3 defaultColor;\n\t\tuniform float defaultOpacity;\n\t\tuniform float luminosityThreshold;\n\t\tuniform float smoothWidth;\n\n\t\tvarying vec2 vUv;\n\n\t\tvoid main() {\n\n\t\t\tvec4 texel = texture2D( tDiffuse, vUv );\n\n\t\t\tfloat v = luminance( texel.xyz );\n\n\t\t\tvec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );\n\n\t\t\tfloat alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );\n\n\t\t\tgl_FragColor = mix( outputColor, texel, alpha );\n\n\t\t}"}},{UnrealBloomPass:J}=(()=>{class UnrealBloomPass extends W{constructor(t,e,s,i){super(),this.strength=void 0!==e?e:1,this.radius=s,this.threshold=i,this.resolution=void 0!==t?new O(t.x,t.y):new O(256,256),this.clearColor=new c(0,0,0),this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let n=Math.round(this.resolution.x/2),o=Math.round(this.resolution.y/2);this.renderTargetBright=new k(n,o,{type:d}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let t=0;t<this.nMips;t++){const e=new k(n,o,{type:d});e.texture.name="UnrealBloomPass.h"+t,e.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(e);const r=new k(n,o,{type:d});r.texture.name="UnrealBloomPass.v"+t,r.texture.generateMipmaps=!1,this.renderTargetsVertical.push(r),n=Math.round(n/2),o=Math.round(o/2)}const a=q;this.highPassUniforms=F.clone(a.uniforms),this.highPassUniforms.luminosityThreshold.value=i,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new A({uniforms:this.highPassUniforms,vertexShader:a.vertexShader,fragmentShader:a.fragmentShader}),this.separableBlurMaterials=[];const l=[3,5,7,9,11];n=Math.round(this.resolution.x/2),o=Math.round(this.resolution.y/2);for(let t=0;t<this.nMips;t++)this.separableBlurMaterials.push(this.getSeperableBlurMaterial(l[t])),this.separableBlurMaterials[t].uniforms.invSize.value=new O(1/n,1/o),n=Math.round(n/2),o=Math.round(o/2);this.compositeMaterial=this.getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=e,this.compositeMaterial.uniforms.bloomRadius.value=.1;this.compositeMaterial.uniforms.bloomFactors.value=[1,.8,.6,.4,.2],this.bloomTintColors=[new N(1,1,1),new N(1,1,1),new N(1,1,1),new N(1,1,1),new N(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors;const u=G;this.copyUniforms=F.clone(u.uniforms),this.blendMaterial=new A({uniforms:this.copyUniforms,vertexShader:u.vertexShader,fragmentShader:u.fragmentShader,blending:r,depthTest:!1,depthWrite:!1,transparent:!0}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new c,this.oldClearAlpha=1,this.basic=new v,this.fsQuad=new H(null)}dispose(){for(let t=0;t<this.renderTargetsHorizontal.length;t++)this.renderTargetsHorizontal[t].dispose();for(let t=0;t<this.renderTargetsVertical.length;t++)this.renderTargetsVertical[t].dispose();this.renderTargetBright.dispose();for(let t=0;t<this.separableBlurMaterials.length;t++)this.separableBlurMaterials[t].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this.basic.dispose(),this.fsQuad.dispose()}setSize(t,e){let r=Math.round(t/2),s=Math.round(e/2);this.renderTargetBright.setSize(r,s);for(let t=0;t<this.nMips;t++)this.renderTargetsHorizontal[t].setSize(r,s),this.renderTargetsVertical[t].setSize(r,s),this.separableBlurMaterials[t].uniforms.invSize.value=new O(1/r,1/s),r=Math.round(r/2),s=Math.round(s/2)}render(t,e,r,s,i){t.getClearColor(this._oldClearColor),this.oldClearAlpha=t.getClearAlpha();const n=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),i&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this.fsQuad.material=this.basic,this.basic.map=r.texture,t.setRenderTarget(null),t.clear(),this.fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this.fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this.fsQuad.render(t);let o=this.renderTargetBright;for(let e=0;e<this.nMips;e++)this.fsQuad.material=this.separableBlurMaterials[e],this.separableBlurMaterials[e].uniforms.colorTexture.value=o.texture,this.separableBlurMaterials[e].uniforms.direction.value=UnrealBloomPass.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[e]),t.clear(),this.fsQuad.render(t),this.separableBlurMaterials[e].uniforms.colorTexture.value=this.renderTargetsHorizontal[e].texture,this.separableBlurMaterials[e].uniforms.direction.value=UnrealBloomPass.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[e]),t.clear(),this.fsQuad.render(t),o=this.renderTargetsVertical[e];this.fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this.fsQuad.render(t),this.fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,i&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(r),this.fsQuad.render(t)),t.setClearColor(this._oldClearColor,this.oldClearAlpha),t.autoClear=n}getSeperableBlurMaterial(t){const e=[];for(let r=0;r<t;r++)e.push(.39894*Math.exp(-.5*r*r/(t*t))/t);return new A({defines:{KERNEL_RADIUS:t},uniforms:{colorTexture:{value:null},invSize:{value:new O(.5,.5)},direction:{value:new O(.5,.5)},gaussianCoefficients:{value:e}},vertexShader:"varying vec2 vUv;\n\t\t\t\tvoid main() {\n\t\t\t\t\tvUv = uv;\n\t\t\t\t\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\t\t\t\t}",fragmentShader:"#include <common>\n\t\t\t\tvarying vec2 vUv;\n\t\t\t\tuniform sampler2D colorTexture;\n\t\t\t\tuniform vec2 invSize;\n\t\t\t\tuniform vec2 direction;\n\t\t\t\tuniform float gaussianCoefficients[KERNEL_RADIUS];\n\n\t\t\t\tvoid main() {\n\t\t\t\t\tfloat weightSum = gaussianCoefficients[0];\n\t\t\t\t\tvec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;\n\t\t\t\t\tfor( int i = 1; i < KERNEL_RADIUS; i ++ ) {\n\t\t\t\t\t\tfloat x = float(i);\n\t\t\t\t\t\tfloat w = gaussianCoefficients[i];\n\t\t\t\t\t\tvec2 uvOffset = direction * invSize * x;\n\t\t\t\t\t\tvec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;\n\t\t\t\t\t\tvec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;\n\t\t\t\t\t\tdiffuseSum += (sample1 + sample2) * w;\n\t\t\t\t\t\tweightSum += 2.0 * w;\n\t\t\t\t\t}\n\t\t\t\t\tgl_FragColor = vec4(diffuseSum/weightSum, 1.0);\n\t\t\t\t}"})}getCompositeMaterial(t){return new A({defines:{NUM_MIPS:t},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:"varying vec2 vUv;\n\t\t\t\tvoid main() {\n\t\t\t\t\tvUv = uv;\n\t\t\t\t\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\t\t\t\t}",fragmentShader:"varying vec2 vUv;\n\t\t\t\tuniform sampler2D blurTexture1;\n\t\t\t\tuniform sampler2D blurTexture2;\n\t\t\t\tuniform sampler2D blurTexture3;\n\t\t\t\tuniform sampler2D blurTexture4;\n\t\t\t\tuniform sampler2D blurTexture5;\n\t\t\t\tuniform float bloomStrength;\n\t\t\t\tuniform float bloomRadius;\n\t\t\t\tuniform float bloomFactors[NUM_MIPS];\n\t\t\t\tuniform vec3 bloomTintColors[NUM_MIPS];\n\n\t\t\t\tfloat lerpBloomFactor(const in float factor) {\n\t\t\t\t\tfloat mirrorFactor = 1.2 - factor;\n\t\t\t\t\treturn mix(factor, mirrorFactor, bloomRadius);\n\t\t\t\t}\n\n\t\t\t\tvoid main() {\n\t\t\t\t\tgl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +\n\t\t\t\t\t\tlerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +\n\t\t\t\t\t\tlerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +\n\t\t\t\t\t\tlerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +\n\t\t\t\t\t\tlerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );\n\t\t\t\t}"})}}return UnrealBloomPass.BlurDirectionX=new O(1,0),UnrealBloomPass.BlurDirectionY=new O(0,1),{UnrealBloomPass:UnrealBloomPass}})(),{OutputShader:tt}={OutputShader:{name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:"\n\t\tprecision highp float;\n\n\t\tuniform mat4 modelViewMatrix;\n\t\tuniform mat4 projectionMatrix;\n\n\t\tattribute vec3 position;\n\t\tattribute vec2 uv;\n\n\t\tvarying vec2 vUv;\n\n\t\tvoid main() {\n\n\t\t\tvUv = uv;\n\t\t\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\n\t\t}",fragmentShader:"\n\t\n\t\tprecision highp float;\n\n\t\tuniform sampler2D tDiffuse;\n\n\t\t#include <tonemapping_pars_fragment>\n\t\t#include <colorspace_pars_fragment>\n\n\t\tvarying vec2 vUv;\n\n\t\tvoid main() {\n\n\t\t\tgl_FragColor = texture2D( tDiffuse, vUv );\n\n\t\t\t// tone mapping\n\n\t\t\t#ifdef LINEAR_TONE_MAPPING\n\n\t\t\t\tgl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );\n\n\t\t\t#elif defined( REINHARD_TONE_MAPPING )\n\n\t\t\t\tgl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );\n\n\t\t\t#elif defined( CINEON_TONE_MAPPING )\n\n\t\t\t\tgl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );\n\n\t\t\t#elif defined( ACES_FILMIC_TONE_MAPPING )\n\n\t\t\t\tgl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );\n\n\t\t\t#elif defined( AGX_TONE_MAPPING )\n\n\t\t\t\tgl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );\n\n\t\t\t#elif defined( NEUTRAL_TONE_MAPPING )\n\n\t\t\t\tgl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );\n\n\t\t\t#endif\n\n\t\t\t// color space\n\n\t\t\t#ifdef SRGB_TRANSFER\n\n\t\t\t\tgl_FragColor = sRGBTransferOETF( gl_FragColor );\n\n\t\t\t#endif\n\n\t\t}"}},{OutputPass:et}={OutputPass:class et extends W{constructor(){super();const t=tt;this.uniforms=F.clone(t.uniforms),this.material=new P({name:t.name,uniforms:this.uniforms,vertexShader:t.vertexShader,fragmentShader:t.fragmentShader}),this.fsQuad=new H(this.material),this._outputColorSpace=null,this._toneMapping=null}render(t,r,i){this.uniforms.tDiffuse.value=i.texture,this.uniforms.toneMappingExposure.value=t.toneMappingExposure,this._outputColorSpace===t.outputColorSpace&&this._toneMapping===t.toneMapping||(this._outputColorSpace=t.outputColorSpace,this._toneMapping=t.toneMapping,this.material.defines={},u.getTransfer(this._outputColorSpace)===B&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===p?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===R?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===a?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===e?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===s?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===C&&(this.material.defines.NEUTRAL_TONE_MAPPING=""),this.material.needsUpdate=!0),!0===this.renderToScreen?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(r),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this.fsQuad.render(t))}dispose(){this.material.dispose(),this.fsQuad.dispose()}}},{BokehShader:rt}={BokehShader:{name:"BokehShader",defines:{DEPTH_PACKING:1,PERSPECTIVE_CAMERA:1},uniforms:{tColor:{value:null},tDepth:{value:null},focus:{value:1},aspect:{value:1},aperture:{value:.025},maxblur:{value:.01},nearClip:{value:1},farClip:{value:1e3}},vertexShader:"\n\n\t\tvarying vec2 vUv;\n\n\t\tvoid main() {\n\n\t\t\tvUv = uv;\n\t\t\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\n\t\t}",fragmentShader:"\n\n\t\t#include <common>\n\n\t\tvarying vec2 vUv;\n\n\t\tuniform sampler2D tColor;\n\t\tuniform sampler2D tDepth;\n\n\t\tuniform float maxblur; // max blur amount\n\t\tuniform float aperture; // aperture - bigger values for shallower depth of field\n\n\t\tuniform float nearClip;\n\t\tuniform float farClip;\n\n\t\tuniform float focus;\n\t\tuniform float aspect;\n\n\t\t#include <packing>\n\n\t\tfloat getDepth( const in vec2 screenPosition ) {\n\t\t\t#if DEPTH_PACKING == 1\n\t\t\treturn unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );\n\t\t\t#else\n\t\t\treturn texture2D( tDepth, screenPosition ).x;\n\t\t\t#endif\n\t\t}\n\n\t\tfloat getViewZ( const in float depth ) {\n\t\t\t#if PERSPECTIVE_CAMERA == 1\n\t\t\treturn perspectiveDepthToViewZ( depth, nearClip, farClip );\n\t\t\t#else\n\t\t\treturn orthographicDepthToViewZ( depth, nearClip, farClip );\n\t\t\t#endif\n\t\t}\n\n\n\t\tvoid main() {\n\n\t\t\tvec2 aspectcorrect = vec2( 1.0, aspect );\n\n\t\t\tfloat viewZ = getViewZ( getDepth( vUv ) );\n\n\t\t\tfloat factor = ( focus + viewZ ); // viewZ is <= 0, so this is a difference equation\n\n\t\t\tvec2 dofblur = vec2 ( clamp( factor * aperture, -maxblur, maxblur ) );\n\n\t\t\tvec2 dofblur9 = dofblur * 0.9;\n\t\t\tvec2 dofblur7 = dofblur * 0.7;\n\t\t\tvec2 dofblur4 = dofblur * 0.4;\n\n\t\t\tvec4 col = vec4( 0.0 );\n\n\t\t\tcol += texture2D( tColor, vUv.xy );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.15,  0.37 ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.37,  0.15 ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.40,  0.0  ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.37, -0.15 ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.15, -0.37 ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.15,  0.37 ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.37,  0.15 ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.37, -0.15 ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.15, -0.37 ) * aspectcorrect ) * dofblur );\n\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.15,  0.37 ) * aspectcorrect ) * dofblur9 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.37,  0.15 ) * aspectcorrect ) * dofblur9 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.37, -0.15 ) * aspectcorrect ) * dofblur9 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.15, -0.37 ) * aspectcorrect ) * dofblur9 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.15,  0.37 ) * aspectcorrect ) * dofblur9 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.37,  0.15 ) * aspectcorrect ) * dofblur9 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.37, -0.15 ) * aspectcorrect ) * dofblur9 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.15, -0.37 ) * aspectcorrect ) * dofblur9 );\n\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur7 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.40,  0.0  ) * aspectcorrect ) * dofblur7 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur7 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur7 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur7 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur7 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur7 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur7 );\n\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur4 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.4,   0.0  ) * aspectcorrect ) * dofblur4 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur4 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.0,  -0.4  ) * aspectcorrect ) * dofblur4 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur4 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.4,   0.0  ) * aspectcorrect ) * dofblur4 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur4 );\n\t\t\tcol += texture2D( tColor, vUv.xy + ( vec2(  0.0,   0.4  ) * aspectcorrect ) * dofblur4 );\n\n\t\t\tgl_FragColor = col / 41.0;\n\t\t\tgl_FragColor.a = 1.0;\n\n\t\t}"}},{BokehPass:st}={BokehPass:class st extends W{constructor(t,e,r){super(),this.scene=t,this.camera=e;const s=void 0!==r.focus?r.focus:1,i=void 0!==r.aperture?r.aperture:.025,n=void 0!==r.maxblur?r.maxblur:1;this.renderTargetDepth=new k(1,1,{minFilter:b,magFilter:b,type:d}),this.renderTargetDepth.texture.name="BokehPass.depth",this.materialDepth=new g,this.materialDepth.depthPacking=U,this.materialDepth.blending=M;const o=rt,a=F.clone(o.uniforms);a.tDepth.value=this.renderTargetDepth.texture,a.focus.value=s,a.aspect.value=e.aspect,a.aperture.value=i,a.maxblur.value=n,a.nearClip.value=e.near,a.farClip.value=e.far,this.materialBokeh=new A({defines:Object.assign({},o.defines),uniforms:a,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.uniforms=a,this.fsQuad=new H(this.materialBokeh),this._oldClearColor=new c}render(t,e,r){this.scene.overrideMaterial=this.materialDepth,t.getClearColor(this._oldClearColor);const s=t.getClearAlpha(),i=t.autoClear;t.autoClear=!1,t.setClearColor(16777215),t.setClearAlpha(1),t.setRenderTarget(this.renderTargetDepth),t.clear(),t.render(this.scene,this.camera),this.uniforms.tColor.value=r.texture,this.uniforms.nearClip.value=this.camera.near,this.uniforms.farClip.value=this.camera.far,this.renderToScreen?(t.setRenderTarget(null),this.fsQuad.render(t)):(t.setRenderTarget(e),t.clear(),this.fsQuad.render(t)),this.scene.overrideMaterial=null,t.setClearColor(this._oldClearColor),t.setClearAlpha(s),t.autoClear=i}setSize(t,e){this.materialBokeh.uniforms.aspect.value=t/e,this.renderTargetDepth.setSize(t,e)}dispose(){this.renderTargetDepth.dispose(),this.materialDepth.dispose(),this.materialBokeh.dispose(),this.fsQuad.dispose()}}};return{RoundedBoxGeometry:I,CSS3DObject:L,CSS3DRenderer:j,RoomEnvironment:Q,Reflector:V,CopyShader:G,Pass:W,FullScreenQuad:H,ShaderPass:Z,MaskPass:K,ClearMaskPass:X,EffectComposer:$,RenderPass:Y,LuminosityHighPassShader:q,UnrealBloomPass:J,OutputShader:tt,OutputPass:et,BokehShader:rt,BokehPass:st}}


// ---------- The floor: your team at work, in Pip's world ----------
// A three.js r170 scene drawn from the Portal's own data. Every teammate is a Pip-family character at a desk, every
// piece of furniture is made of Pip's pearl glass, and the camera can fly to any desk and look over a shoulder.
// It only shows; every action stays in the Portal's HTML. createOffice(THREE, threeAddons(THREE), opts) returns the API.
function createOffice(THREE, X, opts) {
  "use strict";
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const back = (x, s = 1.7) => { x = clamp(x); return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
  const bump = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(x * Math.PI));
  const C = { aqua: "#5eead9", violet: "#9b86ff", lilac: "#cfc3ff", ink: "#14162b", gold: "#e3a008" };
  const LIGHT = { working: C.aqua, needs: "#f2b02a", build: C.violet, ready: "#cfc3ff" };
  const pastel = (hex, k) => new THREE.Color("#ffffff").lerp(new THREE.Color(hex), k);
  const RM = () => !!(opts.reduce && opts.reduce());
  const PHONE = () => innerWidth < 720 || innerHeight < 560; // phones, short windows and 200% zoom get the compact layout
  const T = () => (window.PIP_TEST && window.PIP_TEST.now != null ? window.PIP_TEST.now : performance.now() / 1000); // tests can drive the clock to record frames

  // ---------------- renderer, tiers, the look ----------------
  let tier = opts.tier || (window.PIP_TEST && window.PIP_TEST.tier) || (PHONE() ? "mid" : "high");
  const canvas = document.createElement("canvas"); canvas.className = "fl-gl"; canvas.setAttribute("aria-hidden", "true");
  opts.host.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.02;
  renderer.localClippingEnabled = true;
  const prFor = () => Math.min(devicePixelRatio || 1, tier === "high" ? 2 : tier === "mid" ? 1.75 : 1.5);
  renderer.setPixelRatio(prFor());
  const css = new X.CSS3DRenderer(); css.domElement.className = "fl-css"; opts.cssHost.append(css.domElement);
  const cssScene = new THREE.Scene(), KCSS = 1000, cssCam = new THREE.PerspectiveCamera(); // the HTML layer works in millimetres, so the browser can hit-test it
  function syncCssCam() { cssCam.fov = camera.fov; cssCam.aspect = camera.aspect; cssCam.near = camera.near * KCSS; cssCam.far = camera.far * KCSS; cssCam.position.copy(camera.position).multiplyScalar(KCSS); cssCam.quaternion.copy(camera.quaternion); cssCam.updateProjectionMatrix(); cssCam.updateMatrixWorld(true); }
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(new X.RoomEnvironment(), 0.04).texture; pmrem.dispose();
  scene.environment = env;
  const FOG = new THREE.Color("#f4f2f7"), FOG_DIM = new THREE.Color("#e4e1ec");
  scene.fog = new THREE.Fog(FOG.clone(), 13, 50);
  const hemi = new THREE.HemisphereLight("#ffffff", "#cfcae2", 0.9); scene.add(hemi);
  const key = new THREE.DirectionalLight("#fff6ea", 3.6); key.position.set(5, 10, 8); scene.add(key);
  const fill = new THREE.DirectionalLight("#dfe3ff", 0.55); fill.position.set(-7, 4, -5); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 220);
  // Layers: 0 is seen by you and by the floor's mirror; 1 only by you (small desk things, things lying on the floor);
  // 2 only by the mirror (lighter stand-ins for clouds and topiaries). The reflection looks the same and costs far less.
  const MAIN = 1, MIRROR = 2; camera.layers.enable(MAIN);
  const onlyMain = (...os) => { for (const o of os) if (o) o.traverse((c) => c.layers.set(MAIN)); };
  const onlyMirror = (o) => o.traverse((c) => c.layers.set(MIRROR));

  // ---------------- helpers ----------------
  function canvasTex(w, h, draw) { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
  function radial(stops, size = 128) { return canvasTex(size, size, (g) => { const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); for (const [a, c] of stops) gr.addColorStop(a, c); g.fillStyle = gr; g.fillRect(0, 0, size, size); }); }
  function softRect(w, h, blur, rgba) { return canvasTex(256, 256, (g) => { g.filter = `blur(${blur}px)`; g.fillStyle = rgba; const mx = 128 * (1 - w), my = 128 * (1 - h); g.beginPath(); g.roundRect(mx, my, 256 - 2 * mx, 256 - 2 * my, 40); g.fill(); }); }
  const onSphere = (obj, dir, r = 1) => { const n = dir.clone().normalize(); obj.position.copy(n.clone().multiplyScalar(r)); obj.lookAt(n.clone().multiplyScalar(r + 1)); return obj; };
  const shadowTex = radial([[0, "rgba(58,52,96,.40)"], [0.5, "rgba(58,52,96,.15)"], [1, "rgba(58,52,96,0)"]]);
  const glowTex = radial([[0, "rgba(255,255,255,.9)"], [0.5, "rgba(255,255,255,.3)"], [1, "rgba(255,255,255,0)"]]);
  const contactTex = softRect(0.62, 0.62, 10, "rgba(70,64,104,.5)");
  const deskShadowTex = softRect(0.6, 0.5, 22, "rgba(70,64,104,.36)");
  function blob(w, d, tex = shadowTex, o = 1, add = false, color) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: o, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, color: color || "#ffffff" }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = -2; return m;
  }
  function rrShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false); s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false); return s;
  }
  function extrude(shape, depth, bevel, seg = 5, curve = 28) { const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.0005, depth - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: curve }); g.translate(0, 0, bevel - depth / 2); g.computeVertexNormals(); return g; }
  function slab(w, d, t, r, bevel = 0.018, seg = 5) { const b = Math.min(bevel, t / 2 - 0.0005); const g = extrude(rrShape(w - 2 * b, d - 2 * b, Math.max(0.002, r - b)), t, b, seg); g.rotateX(-Math.PI / 2); return g; }
  function shapeUV(geo, w, h) { const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5); return geo; }
  const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  function label(text, { w = 512, h = 128, bg = null, color = "#0b0d1f", font = "600 54px Geist", pad = 30, align = "left", radius = 0 } = {}) {
    return canvasTex(w, h, (g) => { if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, radius); g.fill(); } g.fillStyle = color; g.font = font; g.textBaseline = "middle"; g.textAlign = align; g.fillText(text, align === "center" ? w / 2 : pad, h / 2 + 2); });
  }

  // ---------------- one material family: everything in the room is made of Pip's pearl ----------------
  function pearlStuff({ color = "#ffffff", flank = C.lilac, belly = "#a9eee5", fk = 0.3, bk = 0.4, rough = 0.34, cc = 1, ccr = 0.08, sheen = 0.3, sheenColor = "#ffffff", irid = 0.08, rim = 0.16, envI = 0.45, emissive = null, emissiveK = 0, metal = 0 } = {}) {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, clearcoat: cc, clearcoatRoughness: ccr, sheen, sheenRoughness: 0.5, sheenColor: new THREE.Color(sheenColor), iridescence: irid, iridescenceIOR: 1.3, iridescenceThicknessRange: [160, 480], envMapIntensity: envI });
    m.envMap = env; if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = emissiveK; }
    const u = { uFlank: { value: new THREE.Color(flank) }, uBelly: { value: new THREE.Color(belly) }, uFk: { value: fk }, uBk: { value: bk }, uRim: { value: rim } };
    m.userData.u = u;
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, u);
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWN;").replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal);");
      s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWN; uniform vec3 uFlank, uBelly; uniform float uFk, uBk, uRim;")
        .replace("#include <color_fragment>", "#include <color_fragment>\n{ vec3 n = normalize(vWN); float side = 1. - abs(n.y); float under = smoothstep(.15, -.9, n.y); vec3 c = vec3(1.); c = mix(c, uFlank, side * uFk); c = mix(c, uBelly, under * uBk); diffuseColor.rgb *= c; }")
        .replace("#include <opaque_fragment>", "{ float nv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0., 1.); outgoingLight += vec3(.86, .87, 1.) * uRim * pow(1. - nv, 3.); }\n#include <opaque_fragment>");
    };
    m.customProgramCacheKey = () => "pearlStuff";
    return m;
  }
  const M = {
    desk: pearlStuff({ fk: 0.1, bk: 0.35, rough: 0.3 }),
    leg: pearlStuff({ color: "#fdfcff", fk: 0.16, bk: 0.4, rough: 0.32 }),
    shell: pearlStuff({ fk: 0.14, bk: 0.3, rough: 0.26, irid: 0.14 }),
    silver: pearlStuff({ color: "#eceef6", flank: "#c9c4ec", fk: 0.35, bk: 0.3, rough: 0.2, metal: 0.25, envI: 1.1 }),
    key: pearlStuff({ fk: 0.2, bk: 0.3, rough: 0.38, cc: 0.6, rim: 0.2 }),
    ink: new THREE.MeshPhysicalMaterial({ color: "#141629", roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.1 }),
    slate: new THREE.MeshPhysicalMaterial({ color: "#3d3f5f", roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.18, envMapIntensity: 1.0 }),
    cushion: new THREE.MeshStandardMaterial({ color: "#2c2d45", roughness: 0.85 }),
    lilacGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color("#d4c6ff").multiplyScalar(1.4) }),
    kraft: pearlStuff({ color: "#fcefcf", flank: "#f0d7a2", belly: "#ecd096", fk: 0.4, bk: 0.3, rough: 0.5, cc: 0.45, irid: 0, rim: 0.22, emissive: "#fbe8bf", emissiveK: 0.16 }),
    paper: pearlStuff({ color: "#fdfcf8", flank: "#ece6f5", fk: 0.3, bk: 0.2, rough: 0.6, cc: 0.1, irid: 0, rim: 0.15 }),
    mint: pearlStuff({ color: "#d3f2e3", flank: "#8fd8bb", belly: "#5eead9", fk: 0.55, bk: 0.6, rough: 0.4, cc: 0.7, sheen: 0.6, sheenColor: "#eafff6", rim: 0.4 }),
    cloud: pearlStuff({ flank: "#e7e1ff", belly: "#d7f4f0", fk: 0.35, bk: 0.5, rough: 0.85, cc: 0, sheen: 0.9, irid: 0, rim: 0.55, emissive: "#ffffff", emissiveK: 0.18 }),
    gold: pearlStuff({ color: "#ffd36a", flank: "#f2a93b", belly: "#ffe8a8", fk: 0.5, bk: 0.3, rough: 0.2, metal: 0.3, irid: 0.2, rim: 0.4, emissive: "#ffb000", emissiveK: 0.12 }),
    rose: pearlStuff({ color: "#ffc2d2", flank: "#ff7d98", belly: "#ffd9e3", fk: 0.5, bk: 0.3, rough: 0.2, irid: 0.2, rim: 0.4, emissive: "#ff7d98", emissiveK: 0.1 }),
    water: pearlStuff({ color: "#cfe6ff", flank: "#5b9dff", belly: "#bff5ee", fk: 0.45, bk: 0.4, rough: 0.12, irid: 0.3, rim: 0.5, emissive: "#5b9dff", emissiveK: 0.08 }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  };
  // Pip's own glass, with a teammate tint
  function pearl(team, pip, coreK = 0.22) {
    const m = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.55, sheenRoughness: 0.5, sheenColor: pip ? new THREE.Color("#e6dcff") : new THREE.Color(team).lerp(new THREE.Color("#ffffff"), 0.55), iridescence: pip ? 0.28 : 0.2, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 520], envMapIntensity: 0.85 });
    m.envMap = env;
    const u = { uTeam: { value: new THREE.Color(team || C.violet) }, uPip: { value: pip ? 1 : 0 }, uCore: { value: new THREE.Color(pip ? C.aqua : team) }, uCoreK: { value: coreK }, uRim: { value: 0.55 } };
    m.userData.u = u;
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, u);
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vObjN;").replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvObjN = normalize(normal);");
      s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vObjN; uniform vec3 uTeam, uCore; uniform float uPip, uCoreK, uRim;")
        .replace("#include <color_fragment>", `#include <color_fragment>
{ vec3 n = normalize(vObjN); float belly = smoothstep(.15, -.95, n.y * .8 - n.x * .35); float flank = smoothstep(.35, 1.0, abs(n.x)) * .7 + smoothstep(.2, -.6, n.z) * .3; float crown = smoothstep(.2, 1., n.x * .6 + n.y * .5); vec3 c;
  if (uPip > .5) { c = vec3(.985, .975, 1.0); c = mix(c, vec3(.80, .76, 1.0), flank * .75); c = mix(c, vec3(.58, .93, .89), belly * .80); c = mix(c, vec3(1.0, .93, .97), crown * .25); }
  else { vec3 pale = mix(vec3(1.), uTeam, .17), deep = mix(vec3(1.), uTeam, .36); c = pale; c = mix(c, deep, flank * .55); c = mix(c, deep, belly * .5); c = mix(c, vec3(1.), crown * .4); }
  diffuseColor.rgb *= c; }`)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n{ float nv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0., 1.); totalEmissiveRadiance += uCore * uCoreK * (.10 + .55 * pow(nv, 2.2) + .35 * pow(nv, 9.0)); }")
        .replace("#include <opaque_fragment>", "{ float nv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0., 1.); outgoingLight += vec3(.84, .86, 1.0) * uRim * pow(1. - nv, 3.0); }\n#include <opaque_fragment>");
    };
    m.customProgramCacheKey = () => "pipPearl";
    return m;
  }
  const gloss = (color, extra = {}) => { const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, ...extra }); m.envMap = env; return m; };

  // ---------------- a Pip-family character (the Marketplace body and headset) ----------------
  const G = { sphere: new THREE.SphereGeometry(1, 64, 48), sphereHi: new THREE.SphereGeometry(1, 96, 72), eye: new THREE.SphereGeometry(1, 28, 20), glint: new THREE.SphereGeometry(1, 14, 10), dot: new THREE.SphereGeometry(1, 10, 8), hand: new THREE.SphereGeometry(0.24, 32, 24), bulb: new THREE.SphereGeometry(0.085, 28, 20), arc: new THREE.TorusGeometry(0.085, 0.02, 8, 24, Math.PI), smile: new THREE.TorusGeometry(0.06, 0.014, 8, 24, Math.PI), cheek: new THREE.CircleGeometry(0.15, 24) };
  const cheekMat = new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(255,140,185,.85)"], [0.55, "rgba(255,160,200,.42)"], [1, "rgba(255,190,215,0)"]]), transparent: true, depthWrite: false });
  const haloTex = radial([[0, "rgba(255,255,255,.9)"], [0.3, "rgba(255,255,255,.45)"], [1, "rgba(255,255,255,0)"]]);
  const eyeMat = gloss(C.ink, { roughness: 0.15, envMapIntensity: 1.3 }), whiteMat = new THREE.MeshBasicMaterial({ color: "#ffffff" }), inkMat = new THREE.MeshBasicMaterial({ color: C.ink });
  const mouthMat = new THREE.MeshBasicMaterial({ color: "#2a1830" }), tongueMat = new THREE.MeshBasicMaterial({ color: "#ff8fb5" });
  const stalkGeo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(0, 0, 0), V(-0.02, 0.31, -0.04), V(0.12, 0.53, -0.02)), 16, 0.026, 8);
  const headsetParts = (() => {
    const band = new THREE.TorusGeometry(1.09, 0.06, 14, 72, Math.PI), cup = new THREE.CylinderGeometry(0.29, 0.31, 0.2, 40), rim = new THREE.TorusGeometry(0.29, 0.04, 10, 40), cap = new THREE.CylinderGeometry(0.17, 0.17, 0.03, 32);
    const boom = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-1.13, -0.08, 0.1), V(-1.05, -0.42, 0.5), V(-0.72, -0.62, 0.84), V(-0.38, -0.62, 1.0)]), 30, 0.032, 10);
    return { band, cup, rim, cap, boom, mic: new THREE.SphereGeometry(0.075, 20, 14) };
  })();
  function buildMate({ team, pip = false, headset = true }) {
    const root = new THREE.Group(), squash = new THREE.Group(), head = new THREE.Group(); root.add(squash); squash.add(head);
    const skin = pearl(team, pip), body = new THREE.Mesh(pip ? G.sphereHi : G.sphere, skin); head.add(body);
    const face = new THREE.Group(); head.add(face);
    const eyes = [-1, 1].map((s) => {
      const h = onSphere(new THREE.Group(), V(s * 0.31, 0.14, 0.94)); face.add(h);
      const eye = new THREE.Mesh(G.eye, eyeMat); eye.scale.set(0.118, 0.168, 0.05); h.add(eye);
      const glint = new THREE.Mesh(G.glint, whiteMat); glint.scale.set(0.038, 0.046, 0.02); glint.position.set(-0.04, 0.068, 0.045); h.add(glint);
      const glint2 = new THREE.Mesh(G.dot, whiteMat); glint2.scale.setScalar(0.014); glint2.position.set(0.04, -0.055, 0.045); h.add(glint2);
      const arc = new THREE.Mesh(G.arc, inkMat); arc.position.z = 0.03; h.add(arc);
      return { eye, glint, glint2, arc, s };
    });
    for (const s of [-1, 1]) { const ck = onSphere(new THREE.Mesh(G.cheek, cheekMat), V(s * 0.56, -0.1, 0.82), 1.006); ck.scale.y = 0.72; face.add(ck); }
    const ma = onSphere(new THREE.Group(), V(0, -0.13, 0.99)); face.add(ma);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.095, 32, Math.PI, Math.PI), mouthMat); mouth.position.z = 0.012; ma.add(mouth);
    const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24, Math.PI, Math.PI), tongueMat); tongue.position.set(0, -0.042, 0.016); ma.add(tongue);
    const smile = new THREE.Mesh(G.smile, inkMat); smile.rotation.z = Math.PI; smile.position.z = 0.012; ma.add(smile);
    const ant = new THREE.Group(); ant.position.set(0, 0.97, -0.06); head.add(ant);
    ant.add(new THREE.Mesh(stalkGeo, gloss(pip ? C.violet : "#aaa6dc", { roughness: 0.3 })));
    const bulbMat = new THREE.MeshPhysicalMaterial({ color: C.aqua, emissive: C.aqua, emissiveIntensity: 1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 }); bulbMat.envMap = env;
    const bulb = new THREE.Mesh(G.bulb, bulbMat); bulb.position.set(0.12, 0.53, -0.02); ant.add(bulb);
    const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, color: C.aqua });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), haloMat); halo.position.copy(bulb.position); ant.add(halo);
    const handSkin = pearl(team, pip, 0.12);
    const hands = [-1, 1].map(() => { const g = new THREE.Mesh(G.hand, handSkin); root.add(g); return g; });
    let mic = null;
    if (headset) {
      const hs = new THREE.Group(); head.add(hs);
      const band = new THREE.Mesh(headsetParts.band, M.slate); band.rotation.x = -0.34; hs.add(band);
      for (const s of [-1, 1]) {
        const cup = new THREE.Mesh(headsetParts.cup, M.slate); cup.rotation.z = Math.PI / 2; cup.position.set(s * 1.08, 0, 0); hs.add(cup);
        const rim = new THREE.Mesh(headsetParts.rim, M.lilacGlow); rim.rotation.y = Math.PI / 2; rim.position.set(s * 0.985, 0, 0); hs.add(rim);
        const cap = new THREE.Mesh(headsetParts.cap, M.cushion); cap.rotation.z = Math.PI / 2; cap.position.set(s * 1.19, 0, 0); hs.add(cap);
      }
      hs.add(new THREE.Mesh(headsetParts.boom, M.slate));
      mic = new THREE.Mesh(headsetParts.mic, new THREE.MeshBasicMaterial({ color: "#2c2d45" })); mic.position.set(-0.36, -0.62, 1.01); hs.add(mic);
    }
    const q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
    function apply(Y) {
      root.position.copy(Y.pos); squash.scale.set(Y.sx, Y.sy, Y.sx); squash.position.y = (Y.sy - 1) * 0.9;
      head.rotation.set(Y.pitch, Y.yaw, Y.roll);
      for (const e of eyes) {
        const st = e.s < 0 ? Y.eyeL : Y.eyeR, open = st === "open" || st === "wide" || st === "squint";
        const k = open ? Math.max(0.06, 1 - Y.blink) * (st === "wide" ? 1.18 : st === "squint" ? 0.5 : 1) : 0;
        e.eye.visible = e.glint.visible = e.glint2.visible = k > 0.1;
        e.eye.scale.set(0.118 * (st === "wide" ? 1.12 : 1), 0.168 * k, 0.05);
        e.glint.visible = e.glint.visible && k > 0.4; e.glint2.visible = e.glint.visible;
        e.arc.visible = !open || k <= 0.1; e.arc.rotation.z = st === "happy" ? 0 : Math.PI; e.arc.position.y = st === "happy" ? -0.02 : 0.02;
      }
      const K = clamp(Y.mouth); mouth.visible = tongue.visible = K > 0.08; smile.visible = !mouth.visible;
      mouth.scale.set(1 + Y.mouthW * 0.3, 0.35 + K * 1.1, 1); tongue.scale.set(1, 0.5 + K * 0.5, 1); tongue.position.y = -0.02 - K * 0.03;
      skin.userData.u.uCoreK.value = Y.coreK; handSkin.userData.u.uCoreK.value = Y.coreK * 0.5;
      bulbMat.color.set(Y.bulb); bulbMat.emissive.set(Y.bulb); bulbMat.emissiveIntensity = 0.3 + Y.bulbK * 4.5;
      haloMat.color.set(Y.bulb); haloMat.opacity = 0.2 + Y.bulbK * 0.6; halo.visible = Y.bulbK > 0.05; bulb.scale.setScalar(0.85 + Y.bulbK * 0.3);
      ant.rotation.set(Y.antX, 0, Y.antZ);
      if (mic) mic.material.color.set(Y.micOn ? new THREE.Color(C.aqua).multiplyScalar(6) : "#2c2d45");
      halo.quaternion.copy(camera.quaternion).premultiply(q.copy(ant.getWorldQuaternion(q2)).invert());
      hands.forEach((h, i) => { h.position.copy(Y.hands[i]); h.scale.setScalar(Y.handS[i]); h.visible = Y.handS[i] > 0.02; });
    }
    return { root, head, body, apply, hands, skin, mic, bulb, ant };
  }
  const baseY = () => ({ pos: V(), sx: 1, sy: 1, pitch: 0, yaw: 0, roll: 0, eyeL: "open", eyeR: "open", blink: 0, mouth: 0, mouthW: 0, coreK: 0.22, bulb: C.aqua, bulbK: 0.7, antX: 0, antZ: 0, hands: [V(-1.25, -0.5, 0.2), V(1.25, -0.5, 0.2)], handS: [1, 1], micOn: false });
  function blendY(cur, tgt, k) { // smooth everything continuous; switch eyes at once
    cur.pos.lerp(tgt.pos, k); cur.sx = lerp(cur.sx, tgt.sx, k); cur.sy = lerp(cur.sy, tgt.sy, k);
    for (const f of ["pitch", "yaw", "roll", "mouth", "mouthW", "coreK", "bulbK", "antX", "antZ"]) cur[f] = lerp(cur[f], tgt[f], k);
    cur.hands[0].lerp(tgt.hands[0], k); cur.hands[1].lerp(tgt.hands[1], k); cur.handS[0] = lerp(cur.handS[0], tgt.handS[0], k); cur.handS[1] = lerp(cur.handS[1], tgt.handS[1], k);
    cur.eyeL = tgt.eyeL; cur.eyeR = tgt.eyeR; cur.blink = tgt.blink; cur.bulb = tgt.bulb; cur.micOn = tgt.micOn;
  }
  const cloneY = (Y) => Object.assign(baseY(), Y, { pos: Y.pos.clone(), hands: Y.hands.map((h) => h.clone()), handS: Y.handS.slice() });

  // ---------------- the room: endless, white, lit like the inside of a cloud ----------------
  const ringX = () => (PHONE() ? 2.05 : 2.6);
  let reflector = null, floorMat = null, ringMesh = null, glowMesh = null;
  const rings = [], rm4 = new THREE.Matrix4(), rc = new THREE.Color();
  function placeRings() { for (const r of rings) { const x = Math.sign(r.x) * ringX(); rm4.makeTranslation(x, 3.0, r.z); ringMesh.setMatrixAt(r.i, rm4); rm4.makeTranslation(x, 2.999, r.z); glowMesh.setMatrixAt(r.i, rm4); } ringMesh.instanceMatrix.needsUpdate = glowMesh.instanceMatrix.needsUpdate = true; ringMesh.computeBoundingSphere(); glowMesh.computeBoundingSphere(); }
  {
    floorMat = new THREE.MeshStandardMaterial({ color: "#f3f1f2", roughness: 0.55, envMapIntensity: 0.3, transparent: true, opacity: 0.91 });
    // the mirror shows only near the desks; further out the floor turns solid so a far reflection never shimmers
    floorMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>\n#ifdef USE_FOG\ngl_FragColor.a = mix(gl_FragColor.a, 1.0, smoothstep(11.0, 26.0, vFogDepth));\n#endif"); };
    floorMat.customProgramCacheKey = () => "pip-floor";
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), floorMat); floor.rotation.x = -Math.PI / 2; floor.renderOrder = -10; scene.add(floor); onlyMain(floor);
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 300), new THREE.MeshStandardMaterial({ color: "#f1eff8", roughness: 0.42, envMapIntensity: 0.5, transparent: true, opacity: 0.6 }));
    runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.001, -140); runner.renderOrder = -9; scene.add(runner); onlyMain(runner);
    const seamTex = canvasTex(4, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "#c9b8ff"); gr.addColorStop(0.7, "#d9d0ff"); gr.addColorStop(1, "#9cf2e6"); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); });
    var seamMat = new THREE.MeshBasicMaterial({ map: seamTex, color: new THREE.Color("#ffffff").multiplyScalar(5) });
    for (const s of [-1, 1]) { const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 160), seamMat); seam.rotation.x = -Math.PI / 2; seam.position.set(s * 1.25, 0.003, -70); scene.add(seam); onlyMain(seam); }
    // halo lights: a ring of light over every desk and on down the room
    // drawn as two instanced meshes (one for the rings, one for their glow), so the whole ceiling costs two draw calls
    const ringGeo = new THREE.TorusGeometry(0.52, 0.036, 12, 96), ringGlow = radial([[0, "rgba(255,255,255,0)"], [0.62, "rgba(255,255,255,0)"], [0.78, "rgba(255,255,255,.55)"], [0.86, "rgba(255,255,255,.18)"], [1, "rgba(255,255,255,0)"]], 256);
    const glowGeo = new THREE.PlaneGeometry(1.6, 1.6); glowGeo.rotateX(Math.PI / 2); ringGeo.rotateX(Math.PI / 2);
    const slots = []; for (let z = 7.5, row = 0; z > -80; z -= 2.8, row++) for (const x of [-2.6, 2.6]) slots.push({ row, z, x });
    ringMesh = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffffff" }), slots.length);
    glowMesh = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ map: ringGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: "#ffffff" }), slots.length);
    slots.forEach((r, i) => { rings.push(Object.assign(r, { i })); ringMesh.setColorAt(i, new THREE.Color(1, 1, 1)); glowMesh.setColorAt(i, new THREE.Color(0, 0, 0)); });
    placeRings(); scene.add(ringMesh, glowMesh); onlyMain(ringMesh, glowMesh);
    const end = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,252,246,.6)"], [1, "rgba(255,255,255,0)"]], 256), transparent: true, depthWrite: false, fog: false, color: new THREE.Color("#ffffff").multiplyScalar(2.4) }));
    end.position.set(0, 4, -78); scene.add(end); var endMat = end.material;
    const shaftTex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(255,255,255,.6)"); gr.addColorStop(0.6, "rgba(255,255,255,.16)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, "rgba(0,0,0,1)"); gx.addColorStop(0.5, "rgba(0,0,0,0)"); gx.addColorStop(1, "rgba(0,0,0,1)"); g.globalCompositeOperation = "destination-out"; g.fillStyle = gx; g.fillRect(0, 0, w, h); });
    var shafts = [];
    for (const [x, z, r, w] of [[-5.5, -16, 0.22, 2.6], [4.8, -22, -0.2, 3.2], [-1.5, -30, 0.16, 2.2], [7.5, -36, -0.25, 3.6], [-8, -9, 0.3, 2.4]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, 15), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2, fog: false }));
      s.position.set(x, 7.5, z); s.rotation.z = r; scene.add(s); shafts.push(s); onlyMain(s);
    }
    // clouds resting at the edges of the room, drawn in one go
    const puffs = [];
    for (const [x, z, s, k] of [[-8.5, 1, 1.1, 1], [9.5, -3, 1.3, 2], [-11, -11, 1.6, 3], [12, -15, 1.8, 4], [-7, -22, 1.5, 5], [8, -28, 2, 6], [-13, -32, 2.2, 7], [3.2, -46, 2.4, 8], [-4.5, -40, 2, 9], [14, 4, 1.4, 10]]) {
      const h = (j) => { const e = Math.sin((k * 31 + j) * 91.37) * 43758.5; return e - Math.floor(e); }, n = 7 + Math.floor(h(0) * 4);
      for (let i = 0; i < n; i++) { const r = (0.45 + h(i + 1) * 0.55) * (1 - (Math.abs(i - n / 2) / n) * 0.8); const lx = (i - n / 2) * 0.62 + (h(i + 9) - 0.5) * 0.3, ly = r * 0.55 + h(i + 5) * 0.2, lz = (h(i + 7) - 0.5) * 0.8, c = Math.cos(k * 0.7), sn = Math.sin(k * 0.7);
        puffs.push([x + (lx * c + lz * sn) * s, -0.15 + ly * s, z + (-lx * sn + lz * c) * s, r * s]); }
    }
    const cl = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 40, 28), M.cloud, puffs.length), mm = new THREE.Matrix4();
    puffs.forEach(([x, y, z, r], i) => { mm.compose(V(x, y, z), new THREE.Quaternion(), V(r, r * 0.86, r)); cl.setMatrixAt(i, mm); }); scene.add(cl); onlyMain(cl);
    const clLo = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), M.cloud, puffs.length); clLo.instanceMatrix.copy(cl.instanceMatrix); scene.add(clLo); onlyMirror(clLo);
    const N = 520, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const h = (k) => { const e = Math.sin((i * 7 + k) * 127.1 + 311.7) * 43758.5453; return e - Math.floor(e); }; pos[i * 3] = (h(1) - 0.5) * 13; pos[i * 3 + 1] = 0.4 + h(2) * 4.2; pos[i * 3 + 2] = 8 - h(3) * 40; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var dust = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.03, map: radial([[0, "rgba(255,244,214,1)"], [1, "rgba(255,244,214,0)"]], 32), transparent: true, depthWrite: false, opacity: 0.85, color: new THREE.Color("#fff1cf").multiplyScalar(1.6) }));
    scene.add(dust); onlyMain(dust);
    // mint topiaries between the desks
    const pot = lathe([[0, 0.002], [0.17, 0], [0.22, 0.05], [0.24, 0.44], [0.225, 0.47], [0.2, 0.46], [0, 0.44]], 48), stemM = pearlStuff({ color: "#e9dcc8", flank: "#cdb48f", fk: 0.5, rough: 0.6, cc: 0.2 });
    const balls = [], spots = [[-4.0, 1.7, 1], [4.0, 3.9, 2], [4.0, -0.2, 3], [-4.0, -1.6, 4], [-4.0, -5.2, 5], [4.0, -3.4, 6], [-4.0, -8.6, 7], [4.0, -7.0, 8], [-4.0, -12, 9], [4.0, -10.4, 10]];
    for (const [x, z, k] of spots) {
      const p = new THREE.Mesh(pot, M.shell); p.position.set(x, 0, z); scene.add(p);
      const st = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.5, 4, 10), stemM); st.position.set(x, 0.72, z); scene.add(st);
      const sh = blob(0.9, 0.9, shadowTex, 0.9); sh.position.set(x, 0.003, z); scene.add(sh); onlyMain(sh);
      const h = (j) => { const e = Math.sin((k * 13 + j) * 77.7) * 43758.5; return e - Math.floor(e); };
      [[0, 1.08, 0, 0.3], [0.16, 1.32, 0.05, 0.22], [-0.14, 1.26, -0.06, 0.2], [0.02, 1.5, -0.02, 0.17], [-0.05, 0.86, 0.12, 0.16]].forEach(([bx, by, bz, r], i) => balls.push([x + bx + (h(i) - 0.5) * 0.05, by, z + bz, r * (0.92 + h(i + 3) * 0.16)]));
    }
    const tb = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 40, 28), M.mint, balls.length);
    balls.forEach(([x, y, z, r], i) => { mm.compose(V(x, y, z), new THREE.Quaternion(), V(r, r, r)); tb.setMatrixAt(i, mm); }); scene.add(tb); onlyMain(tb);
    const tbLo = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), M.mint, balls.length); tbLo.instanceMatrix.copy(tb.instanceMatrix); scene.add(tbLo); onlyMirror(tbLo);
  }

  // ---------------- furniture and desk things ----------------
  const TOP = 0.77;
  const LEG = (() => { const W = 0.62, H = TOP - 0.06, R = 0.08, aw = 0.17, ah = 0.3, s = new THREE.Shape();
    s.moveTo(-W / 2, 0); s.lineTo(-W / 2, H - R); s.absarc(-W / 2 + R, H - R, R, Math.PI, Math.PI / 2, true); s.lineTo(W / 2 - R, H); s.absarc(W / 2 - R, H - R, R, Math.PI / 2, 0, true);
    s.lineTo(W / 2, 0); s.lineTo(aw, 0); s.lineTo(aw, ah); s.absarc(0, ah, aw, 0, Math.PI, false); s.lineTo(-aw, 0); s.lineTo(-W / 2, 0);
    const g = extrude(s, 0.05, 0.016, 5, 32); g.rotateY(Math.PI / 2); return g; })();
  const DESKTOP = slab(1.58, 0.8, 0.065, 0.16, 0.026, 6);
  const GEO = {
    seat: slab(0.52, 0.5, 0.1, 0.19, 0.045, 8), back: slab(0.5, 0.46, 0.08, 0.18, 0.036, 8), spine: new THREE.CapsuleGeometry(0.018, 0.26, 6, 16), post: new THREE.CapsuleGeometry(0.03, 0.3, 8, 20),
    cbase: lathe([[0, 0.002], [0.24, 0.002], [0.27, 0.014], [0.25, 0.03], [0.12, 0.045], [0, 0.05]]), trayBase: slab(0.29, 0.25, 0.022, 0.035, 0.008, 3), traySide: new X.RoundedBoxGeometry(0.014, 0.085, 0.25, 3, 0.006),
    folder: extrude(rrShape(0.24, 0.17, 0.014), 0.008, 0.003, 3), tab: shapeUV(extrude(rrShape(0.125, 0.032, 0.012), 0.009, 0.003, 3), 0.125, 0.032),
    mug: lathe([[0, 0.004], [0.034, 0], [0.04, 0.008], [0.042, 0.088], [0.039, 0.096], [0.035, 0.092], [0.035, 0.012], [0, 0.012]], 40), handle: new THREE.TorusGeometry(0.026, 0.008, 10, 24, Math.PI * 1.15), coffee: new THREE.CircleGeometry(0.035, 28),
    spot: lathe([[0, 0.002], [0.045, 0], [0.058, 0.02], [0.062, 0.075], [0.056, 0.082], [0.05, 0.078], [0, 0.07]], 40), leaf: new THREE.SphereGeometry(1, 20, 14),
    kbBase: slab(0.44, 0.155, 0.016, 0.05, 0.006, 4), key: new X.RoundedBoxGeometry(0.026, 0.011, 0.026, 2, 0.0055), space: new X.RoundedBoxGeometry(0.16, 0.011, 0.024, 2, 0.0055), enter: new X.RoundedBoxGeometry(0.04, 0.011, 0.026, 2, 0.0055),
    mouse: new THREE.SphereGeometry(1, 24, 16), shell: extrude(rrShape(0.76, 0.472, 0.045), 0.034, 0.013, 6, 32), glass: new THREE.ShapeGeometry(rrShape(0.736, 0.448, 0.03), 24), scr: shapeUV(new THREE.ShapeGeometry(rrShape(0.72, 0.432, 0.022), 24), 0.72, 0.432),
    foot: lathe([[0, 0.001], [0.095, 0.001], [0.105, 0.006], [0.09, 0.013], [0, 0.015]]), arm: new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(0, 0.02, -0.07), V(0, 0.14, -0.16), V(0, 0.27, -0.035)), 24, 0.016, 12),
    logo: new THREE.CircleGeometry(0.03, 32), strip: new THREE.CapsuleGeometry(0.008, 0.9, 4, 12), note: new THREE.PlaneGeometry(0.15, 0.15), card: new THREE.PlaneGeometry(0.2, 0.08), z: new THREE.PlaneGeometry(0.1, 0.1), steam: new THREE.PlaneGeometry(0.05, 0.18),
    sound: new THREE.TorusGeometry(0.05, 0.004, 8, 40, Math.PI * 0.9), hitBox: new THREE.BoxGeometry(1.0, 1.25, 1.3), pop: new THREE.TorusGeometry(0.3, 0.012, 8, 64),
  };
  const pipMark = radial([[0, "rgba(255,255,255,1)"], [0.35, "rgba(207,195,255,.9)"], [0.7, "rgba(94,234,217,.5)"], [1, "rgba(94,234,217,0)"]], 128);
  const steamTex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.3, "rgba(255,255,255,.75)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.filter = "blur(6px)"; g.beginPath(); g.ellipse(32, 128, 14, 110, 0, 0, Math.PI * 2); g.fill(); });
  const darkScreen = canvasTex(720, 432, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#1d1f36"); gr.addColorStop(1, "#121327"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(207,195,255,.55)"; g.beginPath(); g.arc(w / 2, h / 2 - 8, 34, 0, Math.PI * 2); g.fill(); g.fillStyle = "#1a1c33"; g.beginPath(); g.arc(w / 2 + 16, h / 2 - 20, 30, 0, Math.PI * 2); g.fill(); });
  const glowScreens = new Map();
  const screenGlow = (hex) => { if (glowScreens.has(hex)) return glowScreens.get(hex); const t = canvasTex(720, 432, (g, w) => { g.fillStyle = "#f8f6fe"; g.fillRect(0, 0, w, 432); g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, 30); g.fillStyle = hex; g.globalAlpha = 0.8; g.beginPath(); g.roundRect(28, 58, 290, 24, 10); g.fill(); g.globalAlpha = 1; g.fillStyle = "#dcd8ea"; for (let i = 0; i < 6; i++) { g.beginPath(); g.roundRect(28, 104 + i * 32, 330 + ((i * 53) % 120), 13, 7); g.fill(); } g.fillStyle = "#ffffff"; for (let i = 0; i < 3; i++) { g.beginPath(); g.roundRect(480, 58 + i * 116, 212, 100, 18); g.fill(); } }); glowScreens.set(hex, t); return t; };
  const steamMat = new THREE.MeshBasicMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0.4 });
  const zTex = label("z", { w: 128, h: 128, color: "#a397e8", font: "italic 400 120px 'Instrument Serif'", align: "center" });
  const qTex = label("?", { w: 160, h: 160, color: "#ffc23d", font: "italic 400 150px 'Instrument Serif'", align: "center" });
  const pausedCard = new THREE.MeshStandardMaterial({ map: label("Paused", { w: 512, h: 200, bg: "#ffffff", color: "#4b5175", font: "600 84px Geist", align: "center", radius: 24 }), roughness: 0.6 });
  const tabTex = new Map();
  const FOLDERS = ["Job description", "Tools", "House rules", "Work log"];
  function folderTray(hex) {
    const g = new THREE.Group(); const base = new THREE.Mesh(GEO.trayBase, M.shell); base.position.y = 0.011; g.add(base);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(GEO.traySide, M.shell); p.position.set(s * 0.138, 0.052, 0); g.add(p); }
    const tabCol = pastel(hex, 0.62).getStyle(), folders = [];
    FOLDERS.forEach((n, i) => {
      const f = new THREE.Group(); f.position.set(0, 0.022, -0.085 + i * 0.056); f.rotation.x = -0.2 + i * 0.035;
      const body = new THREE.Mesh(GEO.folder, M.kraft); body.position.y = 0.085; f.add(body);
      const hinge = new THREE.Group(); hinge.position.set(0, 0.0, -0.0065); f.add(hinge); // the front cover swings open from the bottom
      const cover = new THREE.Mesh(GEO.folder, M.kraft); cover.position.y = 0.083; cover.scale.set(0.985, 0.97, 0.8); hinge.add(cover);
      const k = tabCol + n; if (!tabTex.has(k)) tabTex.set(k, new THREE.MeshPhysicalMaterial({ map: label(n, { w: 512, h: 96, bg: tabCol, color: "#4a3a10", font: "600 44px Geist", pad: 24, radius: 28 }), roughness: 0.5, clearcoat: 0.5 }));
      const tab = new THREE.Mesh(GEO.tab, [tabTex.get(k), M.kraft]); tab.position.set(-0.058 + (i % 2) * 0.116, 0.178, 0); tab.rotation.y = Math.PI; f.add(tab);
      f.userData = { hinge, home: null }; g.add(f); folders.push(f);
    });
    return { g, folders };
  }
  function chair(hex) {
    const g = new THREE.Group(), tint = pearlStuff({ color: pastel(hex, 0.2).getStyle(), flank: pastel(hex, 0.5).getStyle(), belly: pastel(hex, 0.42).getStyle(), fk: 0.6, bk: 0.6, rough: 0.48, cc: 0.4, sheen: 0.9, sheenColor: pastel(hex, 0.15).getStyle(), rim: 0.3 });
    const seat = new THREE.Mesh(GEO.seat, tint); seat.position.y = 0.47; g.add(seat);
    const bk = new THREE.Mesh(GEO.back, tint); bk.rotation.x = Math.PI / 2 - 0.16; bk.position.set(0, 0.78, -0.25); g.add(bk);
    const sp = new THREE.Mesh(GEO.spine, M.silver); sp.position.set(0, 0.6, -0.27); sp.rotation.x = -0.16; g.add(sp);
    const post = new THREE.Mesh(GEO.post, M.silver); post.position.y = 0.26; g.add(post);
    g.add(new THREE.Mesh(GEO.cbase, M.silver));
    const sh = blob(1.0, 1.0, shadowTex, 0.9); sh.position.y = 0.003; g.add(sh);
    return g;
  }
  function mug(hex) {
    const g = new THREE.Group(), glaze = pearlStuff({ color: pastel(hex, 0.55).getStyle(), flank: hex, fk: 0.35, bk: 0.2, rough: 0.18, irid: 0.1 });
    g.add(new THREE.Mesh(GEO.mug, glaze)); const handle = new THREE.Mesh(GEO.handle, glaze); handle.rotation.z = -Math.PI * 0.57; handle.position.set(0.042, 0.05, 0); g.add(handle);
    const coffee = new THREE.Mesh(GEO.coffee, new THREE.MeshPhysicalMaterial({ color: "#7a5240", roughness: 0.15, clearcoat: 1 })); coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.078; g.add(coffee);
    return g;
  }
  function succulent() {
    const g = new THREE.Group(); g.add(new THREE.Mesh(GEO.spot, M.shell));
    for (let i = 0; i < 11; i++) { const a = i * 2.4, ring = i < 6 ? 1 : 0.55, l = new THREE.Mesh(GEO.leaf, M.mint); l.scale.set(0.022 * ring + 0.008, 0.055 * ring + 0.02, 0.014); l.position.set(Math.cos(a) * 0.022 * ring, 0.1 + (1 - ring) * 0.02, Math.sin(a) * 0.022 * ring); l.lookAt(l.position.clone().add(V(Math.cos(a), 0.2, Math.sin(a)))); l.rotateX(Math.PI / 2 - 0.55 * ring); g.add(l); }
    return g;
  }
  function monitor(tex) {
    const g = new THREE.Group(), cy = 0.31, panel = new THREE.Group(); panel.position.set(0, cy, 0); panel.rotation.x = -0.12; g.add(panel);
    const shell = new THREE.Mesh(GEO.shell, M.shell); shell.position.z = -0.012; panel.add(shell);
    const glass = new THREE.Mesh(GEO.glass, M.ink); glass.position.z = 0.0062; panel.add(glass);
    const scr = new THREE.Mesh(GEO.scr, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color("#ffffff").multiplyScalar(1.12) })); scr.position.z = 0.0068; panel.add(scr);
    const logo = new THREE.Mesh(GEO.logo, new THREE.MeshBasicMaterial({ map: pipMark, transparent: true, depthWrite: false, color: new THREE.Color("#ffffff").multiplyScalar(1.6) })); logo.position.set(0, 0.02, -0.0305); logo.rotation.y = Math.PI; panel.add(logo);
    g.add(new THREE.Mesh(GEO.arm, M.silver)); const foot = new THREE.Mesh(GEO.foot, M.silver); foot.position.set(0, 0, -0.07); g.add(foot);
    return { g, scr, W: 0.72, H: 0.432 };
  }
  function keyboard(hex) {
    const g = new THREE.Group(), base = new THREE.Mesh(GEO.kbBase, M.shell); base.position.y = 0.008; g.add(base);
    const rows = [13, 12, 11], keys = []; const inst = new THREE.InstancedMesh(GEO.key, M.key, 36), m = new THREE.Matrix4();
    rows.forEach((c, r) => { for (let i = 0; i < c; i++) { const x = (i - (c - 1) / 2) * 0.0305, z = -0.045 + r * 0.031; keys.push([x, z]); m.setPosition(x, 0.021, z); inst.setMatrixAt(keys.length - 1, m); } });
    g.add(inst); const space = new THREE.Mesh(GEO.space, M.key); space.position.set(0, 0.021, 0.048); g.add(space);
    const enter = new THREE.Mesh(GEO.enter, gloss(pastel(hex, 0.6).getStyle(), { roughness: 0.3 })); enter.position.set(0.19, 0.021, -0.014); g.add(enter);
    return { g, inst, keys };
  }
  // props that say what each teammate does (the Marketplace accessories, as desk things)
  function prop(kind) {
    const g = new THREE.Group();
    if (kind === "calendar") {
      const b = new THREE.Mesh(slab(0.09, 0.07, 0.085, 0.016, 0.01, 4), M.shell); b.rotation.x = Math.PI / 2 - 0.25; b.position.y = 0.04; g.add(b);
      const now = new Date(), day = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][now.getDay()];
      const page = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.066), new THREE.MeshBasicMaterial({ map: canvasTex(140, 132, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 140, 132); c.fillStyle = "#ef5f62"; c.fillRect(0, 0, 140, 34); c.fillStyle = "#fff"; c.font = "700 22px Geist"; c.textAlign = "center"; c.fillText(day, 70, 25); c.fillStyle = "#0b0d1f"; c.font = "600 70px Geist"; c.fillText(String(now.getDate()), 70, 110); }) }));
      page.position.set(0, 0.045, 0.012); page.rotation.x = -0.25; page.rotation.y = Math.PI; g.add(page);
    } else if (kind === "star" || kind === "heart") {
      const s = new THREE.Shape();
      if (kind === "star") for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.024 : 0.056, a = (i / 10) * Math.PI * 2 + Math.PI / 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      else { s.moveTo(0, -0.045); s.bezierCurveTo(-0.06, -0.005, -0.055, 0.045, -0.025, 0.045); s.bezierCurveTo(-0.01, 0.045, 0, 0.032, 0, 0.022); s.bezierCurveTo(0, 0.032, 0.01, 0.045, 0.025, 0.045); s.bezierCurveTo(0.055, 0.045, 0.06, -0.005, 0, -0.045); }
      const st = new THREE.Mesh(extrude(s, 0.022, 0.008, 4), kind === "star" ? M.gold : M.rose); st.position.y = 0.075; st.rotation.y = 0.5; g.add(st);
      g.add(new THREE.Mesh(lathe([[0, 0], [0.04, 0], [0.04, 0.012], [0.012, 0.02], [0.01, 0.05], [0, 0.05]]), M.shell));
    } else if (kind === "drop") {
      const d = new THREE.Mesh(lathe([[0, 0], [0.03, 0.012], [0.042, 0.04], [0.035, 0.07], [0.014, 0.1], [0, 0.12]], 32), M.water); g.add(d);
    } else if (kind === "lens") {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 12, 36), M.silver); r.position.set(0, 0.05, 0); g.add(r);
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.04, 32), new THREE.MeshPhysicalMaterial({ color: "#eaf6ff", roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.5 })); l.position.copy(r.position); g.add(l);
      const hd = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.06, 4, 10), M.silver); hd.position.set(0.045, 0.012, 0); hd.rotation.z = 1.1; g.add(hd); g.rotation.x = -1.2;
    } else if (kind === "bubble") {
      const b = new THREE.Mesh(slab(0.12, 0.085, 0.02, 0.035, 0.008, 4), M.water); b.rotation.x = Math.PI / 2 - 0.3; b.position.y = 0.06; g.add(b);
    } else { // letters to send
      for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(slab(0.2, 0.27, 0.006, 0.01, 0.002, 2), M.paper); p.position.set((i % 2) * 0.006, 0.004 + i * 0.0065, i * 0.004); p.rotation.y = (i - 1.5) * 0.05; g.add(p); }
      const e = new THREE.Mesh(slab(0.16, 0.1, 0.006, 0.01, 0.002, 2), M.kraft); e.position.set(0.02, 0.032, 0.03); e.rotation.y = -0.2; g.add(e);
    }
    return g;
  }
  function stickyTex(text) {
    return canvasTex(300, 300, (g) => {
      g.fillStyle = "#ffe592"; g.beginPath(); g.roundRect(0, 0, 300, 300, 18); g.fill(); g.fillStyle = "rgba(0,0,0,.06)"; g.fillRect(0, 0, 300, 40);
      g.fillStyle = "#3b2f00"; g.font = "600 40px Geist"; const words = String(text).split(/\s+/); let line = "", y = 100;
      for (const w of words) { const t = line ? line + " " + w : w; if (g.measureText(t).width > 256 && line) { g.fillText(line, 22, y); y += 52; line = w; if (y > 260) break; } else line = t; }
      if (y <= 260) g.fillText(line, 22, y);
    });
  }

  // ---------------- desks, one per teammate, kept in step with the Portal ----------------
  const PHI = 0.96, desks = new Map(), deskBits = []; let order = [];
  const sideX = () => (PHONE() ? 1.85 : 2.42);
  const slotOf = (i) => { const side = i % 2 ? 1 : -1; return { side, z: 3.3 - i * 1.64 }; };
  function makeDesk(a, i) {
    const { side, z } = slotOf(i), grp = new THREE.Group(); grp.position.set(side * sideX(), 0, z); grp.userData.side = side; grp.rotation.y = side < 0 ? PHI : -PHI; scene.add(grp);
    const d = { id: a.id, i, grp, a: null, Y: null, react: null, hoverUntil: 0, pop: { t0: -1 }, wasLook: null };
    const top = new THREE.Mesh(DESKTOP, M.desk); top.position.set(0, TOP - 0.0325, 0.7); grp.add(top);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(LEG, M.leg); leg.position.set(s * 0.64, 0, 0.7); grp.add(leg); }
    const sh = blob(2.4, 1.5, deskShadowTex); sh.position.set(0, 0.004, 0.7); grp.add(sh); onlyMain(sh);
    d.strip = new THREE.Mesh(GEO.strip, new THREE.MeshBasicMaterial({ color: "#ffffff" })); d.strip.rotation.z = Math.PI / 2; d.strip.position.set(0, TOP - 0.075, 1.07); grp.add(d.strip);
    d.pool = blob(2.2, 1.4, glowTex, 0.42, true); d.pool.position.set(0, 0.006, 0.95); grp.add(d.pool); onlyMain(d.pool);
    d.mon = monitor(darkScreen); d.mon.g.position.set(0, TOP, 0.99); d.mon.g.rotation.y = Math.PI; grp.add(d.mon.g);
    { const b = blob(0.34, 0.26, shadowTex, 0.8); b.position.set(0, TOP + 0.001, 1.06); grp.add(b); onlyMain(b); }
    const hit = new THREE.Mesh(GEO.hitBox, M.hit); hit.position.set(0, 0.9, 0.35); hit.userData.desk = a.id; grp.add(hit); d.hit = hit;
    if (a.look === "open") { d.open = true; return d; }
    d.kb = keyboard(a.hex); d.kb.g.position.set(0, TOP, 0.48); grp.add(d.kb.g);
    for (const [x, zz, w, dd, o] of [[0, 0.49, 0.6, 0.26, 0.5], [0.5, 0.44, 0.16, 0.16, 0.6], [-0.6, 0.62, 0.42, 0.38, 0.45], [-0.34, 0.5, 0.1, 0.13, 0.5]]) { const b = blob(w, dd, contactTex, o); b.position.set(x, TOP + 0.001, zz); grp.add(b); deskBits.push(b); }
    const mouse = new THREE.Mesh(GEO.mouse, M.shell); mouse.scale.set(0.034, 0.017, 0.054); mouse.position.set(-0.34, TOP + 0.008, 0.5); grp.add(mouse);
    d.folders = folderTray(a.hex); d.folders.g.position.set(-0.6, TOP, 0.62); d.folders.g.rotation.y = 0.5; grp.add(d.folders.g); // angled toward you when you sit at their shoulder
    d.mug = mug(a.hex); d.mug.position.set(0.5, TOP, 0.44); d.mug.rotation.y = 2.2; grp.add(d.mug);
    d.steam = [0, 1, 2].map(() => { const s = new THREE.Mesh(GEO.steam, steamMat.clone()); d.mug.add(s); return s; });
    const pr = prop(a.prop); pr.position.set(0.58, TOP, 0.88); pr.rotation.y = -0.3; grp.add(pr);
    if (i % 3 === 0) { const p = succulent(); p.position.set(-0.64, TOP, 1.0); grp.add(p); deskBits.push(p); }
    const ch = chair(a.hex); ch.position.set(0, 0, -0.06); grp.add(ch); deskBits.push(ch.children[ch.children.length - 1]); // its floor shadow
    d.light = new THREE.PointLight("#eef0ff", 1.3, 1.6, 2); d.light.position.set(0, 1.08, 0.82); grp.add(d.light);
    // the teammate, and the version of them Pip is still building
    d.mate = buildMate({ team: a.hex }); d.mate.root.scale.setScalar(0.3); grp.add(d.mate.root);
    d.seatGlow = blob(0.7, 0.7, radial([[0, a.hex + "aa"], [1, a.hex + "00"]]), 0.7, true); d.seatGlow.position.set(0, 0.53, -0.06); grp.add(d.seatGlow);
    d.rings = [0, 1, 2].map(() => { const r = new THREE.Mesh(GEO.sound, new THREE.MeshBasicMaterial({ color: new THREE.Color(C.aqua).multiplyScalar(6), transparent: true, depthWrite: false })); grp.add(r); return r; });
    d.note = new THREE.Mesh(GEO.note, new THREE.MeshStandardMaterial({ roughness: 0.8, transparent: true })); d.note.position.set(0.2, 1.27, 1.03); d.note.rotation.set(0, 0, -0.08); grp.add(d.note); d.noteText = null;
    d.qm = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: qTex, transparent: true, depthWrite: false, color: new THREE.Color("#ffffff").multiplyScalar(1.8) })); grp.add(d.qm);
    d.card = new THREE.Group(); for (const s of [-1, 1]) { const p = new THREE.Mesh(GEO.card, s > 0 ? pausedCard : M.paper); p.position.set(0, 0.035, s * 0.012); p.rotation.x = s * 0.3; d.card.add(p); } d.card.position.set(0.3, TOP, 1.0); grp.add(d.card);
    d.zs = [0, 1, 2].map(() => { const z = new THREE.Mesh(GEO.z, new THREE.MeshBasicMaterial({ map: zTex, transparent: true, depthWrite: false })); grp.add(z); return z; });
    const holo = new THREE.Group(); holo.position.set(0, 1.18, 0); holo.scale.setScalar(0.3); grp.add(holo); d.holo = holo;
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color("#9d8ff7").multiplyScalar(1.3), wireframe: true, transparent: true, opacity: 0.38 })); holo.add(wire);
    d.cut = new THREE.Plane(V(0, -1, 0), 0); const solid = pearl(a.hex, false, 0.45); solid.clippingPlanes = [d.cut]; holo.add(new THREE.Mesh(G.sphere, solid));
    d.scan = new THREE.Mesh(new THREE.TorusGeometry(1, 0.024, 10, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.aqua).multiplyScalar(8) })); d.scan.rotation.x = Math.PI / 2; holo.add(d.scan);
    d.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(94,234,217,0)"], [0.75, "rgba(94,234,217,.14)"], [0.98, "rgba(94,234,217,.6)"], [1, "rgba(94,234,217,0)"]]), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); d.disc.rotation.x = -Math.PI / 2; holo.add(d.disc);
    for (const s of [-1, 1]) { const hnd = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 2), wire.material); hnd.position.set(s * 1.3, -0.6, 0.3); holo.add(hnd); }
    const sp = new Float32Array(60 * 3); for (let k = 0; k < 60; k++) { const t = k * 2.39996, r = 1.15 + (k % 7) * 0.06; sp[k * 3] = Math.cos(t) * r; sp[k * 3 + 1] = -1 + (k / 60) * 2.6; sp[k * 3 + 2] = Math.sin(t) * r; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    d.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.12, map: radial([[0, "rgba(255,255,255,1)"], [0.4, "rgba(94,234,217,.8)"], [1, "rgba(94,234,217,0)"]], 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color("#ffffff").multiplyScalar(2) })); holo.add(d.sparks);
    d.popRing = new THREE.Mesh(GEO.pop, new THREE.MeshBasicMaterial({ color: new THREE.Color(C.aqua).multiplyScalar(5), transparent: true, depthWrite: false, opacity: 0 })); d.popRing.rotation.x = Math.PI / 2; d.popRing.position.set(0, 0.6, 0); grp.add(d.popRing);
    onlyMain(d.kb.g, mouse, d.folders.g, d.mug, pr, d.note, d.qm, d.card, d.popRing, d.seatGlow, ...d.rings, ...d.zs, ...deskBits); deskBits.length = 0;
    return d;
  }
  function dropDesk(d) { scene.remove(d.grp); }
  function applyLook(d) {
    const a = d.a; if (d.open) return;
    const col = LIGHT[a.light];
    d.strip.visible = d.pool.visible = !!col;
    if (col) { d.strip.material.color.set(col).multiplyScalar(7); d.pool.material.color.set(col); }
    const sleeping = a.look === "sleep", building = a.look === "build";
    d.mon.scr.material.map = sleeping || building ? darkScreen : screenGlow(a.hex); d.mon.scr.material.needsUpdate = true;
    d.light.visible = !sleeping && !building && !dim;
    d.mate.root.visible = !building; d.seatGlow.visible = !building && !sleeping; d.holo.visible = building;
    d.card.visible = sleeping; d.zs.forEach((z) => (z.visible = sleeping)); d.qm.visible = a.look === "scratch"; d.rings.forEach((r) => (r.visible = false));
    d.steam.forEach((s) => (s.visible = !sleeping && !building));
    if (a.sticky) { if (d.noteText !== a.sticky) { if (d.note.material.map) d.note.material.map.dispose(); d.note.material.map = stickyTex(a.sticky); d.note.material.needsUpdate = true; d.noteText = a.sticky; } d.note.visible = true; } else d.note.visible = false;
  }

  // ---------------- what each teammate is doing ----------------
  const tmpV = V(), tmpV2 = V(), tmpV3 = V(), tmpV4 = V(), tmpQ = new THREE.Quaternion();
  function lookAtCam(d) { // yaw and pitch that turn the head toward you, in the desk's frame
    tmpV.copy(camera.position); d.grp.worldToLocal(tmpV); tmpV.sub(tmpV2.set(0, 1.18, 0));
    return { yaw: clamp(Math.atan2(tmpV.x, tmpV.z), -1.25, 1.25), pitch: clamp(-Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z)), -0.5, 0.5) };
  }
  function poseOf(d, t) {
    const a = d.a, Y = baseY(), ph = a.ph || 0, bob = Math.sin(t * 1.6 + ph) * 0.012;
    Y.pos.set(0, 1.18 + bob, 0); Y.bulb = a.hex; Y.bulbK = 0.75; Y.antZ = Math.sin(t * 1.3 + ph) * 0.06; Y.antX = Math.sin(t * 0.9 + ph) * 0.04;
    const bl = (t + ph * 1.7) % 4.2; Y.blink = bl < 0.14 ? Math.sin((bl / 0.14) * Math.PI) : 0;
    let look = a.look;
    if (look === "work") look = a.phone && ((t + ph * 5) % 22) < 12 ? "call" : "type";
    if (look === "idle" && ((t + ph * 3) % 14) > 10.5) look = "sip";
    if (look === "type") {
      const k = t * 11 + ph, burst = ((t + ph * 2) % 9) < 6.5;
      Y.pitch = 0.16 + Math.sin(t * 1.1 + ph) * 0.02; Y.yaw = Math.sin(t * 0.5 + ph) * 0.07; Y.mouth = 0.04;
      Y.hands = [V(-0.42, -1.1 + (burst ? Math.max(0, Math.sin(k)) * 0.14 : 0.02), 1.62), V(0.42, -1.1 + (burst ? Math.max(0, Math.sin(k + 2.6)) * 0.14 : 0.02), 1.62)];
      if (!burst) { Y.pitch = 0.06; Y.yaw = Math.sin(t * 0.7 + ph) * 0.18; }
    } else if (look === "call") {
      Y.pitch = -0.04; Y.yaw = -0.42; Y.roll = 0.05; Y.eyeL = Y.eyeR = Math.sin(t * 0.8 + ph) > 0.6 ? "happy" : "open";
      Y.mouth = 0.18 + Math.abs(Math.sin(t * 6.5)) * 0.32; Y.mouthW = 0.1; Y.micOn = true;
      Y.hands = [V(-0.82 + Math.sin(t * 2.1) * 0.06, -0.72 + Math.cos(t * 2.6) * 0.06, 0.95), V(1.27, 0.08, 0.12)];
    } else if (look === "scratch") {
      Y.pitch = 0.06; Y.yaw = -0.12; Y.roll = 0.17; Y.eyeL = "squint"; Y.eyeR = "open"; Y.mouth = 0.1; Y.mouthW = -0.5;
      Y.hands = [V(-0.86 + Math.cos(t * 7) * 0.06, 0.72 + Math.sin(t * 7) * 0.06, 0.28), V(0.5, -1.08, 1.5)];
    } else if (look === "sleep") {
      Y.pos.y = 1.03 + Math.sin(t * 1.1) * 0.012; Y.pitch = 0.5; Y.roll = 0.14; Y.eyeL = Y.eyeR = "sleep"; Y.blink = 0;
      Y.mouth = 0.1 + Math.sin(t * 1.1) * 0.04; Y.coreK = 0.06; Y.bulb = "#b3b6c8"; Y.bulbK = 0; Y.antX = 0.3;
      Y.hands = [V(-0.55, -0.7, 1.45), V(0.6, -0.72, 1.4)]; Y.sy = 0.97 + Math.sin(t * 1.1) * 0.012; Y.sx = 1.01;
    } else if (look === "sip") { // a sip of coffee, then back to it
      const k = ((t + ph * 3) % 14 - 10.5) / 3.5; Y.pitch = -0.08 * bump(k); Y.eyeL = Y.eyeR = k > 0.3 && k < 0.7 ? "happy" : "open";
      Y.hands = [V(-1.2, -0.55, 0.4), V(lerp(1.3, 0.55, bump(k)), lerp(-1.0, -0.42, bump(k)), lerp(1.2, 1.05, bump(k)))];
    } else { // idle: ready and waiting, glancing around
      Y.pitch = 0.02; Y.yaw = Math.sin(t * 0.45 + ph) * 0.35; Y.roll = Math.sin(t * 0.3 + ph) * 0.05;
      Y.hands = [V(-1.15, -0.62 + Math.sin(t * 1.2 + ph) * 0.03, 0.55), V(1.15, -0.62 + Math.cos(t * 1.1 + ph) * 0.03, 0.55)];
    }
    // you looked at them: they glance back and give a little wave
    const hov = d.hoverUntil > t && look !== "sleep", wk = d.react && d.react.kind === "wave" && look !== "sleep" ? bump((t - d.react.t0) / 1.8) : 0, k = Math.max(hov ? 1 : 0, wk);
    if (k > 0.02) {
      const L = lookAtCam(d);
      Y.yaw = lerp(Y.yaw, L.yaw, k); Y.pitch = lerp(Y.pitch, L.pitch, k); if (k > 0.4) { Y.eyeL = Y.eyeR = "happy"; Y.micOn = false; } Y.mouth = Math.max(Y.mouth, 0.12 * k);
      Y.hands[1].lerp(V(1.35, 0.35 + Math.sin(t * 13) * 0.12, 0.45), k);
    }
    if (d.react) {
      const e = t - d.react.t0;
      if (d.react.kind === "wake" && e < 2.2) { const s = bump(e / 1.4); Y.pos.y += bump(clamp((e - 1.2) / 0.6)) * 0.08; Y.hands = [V(-0.9, 0.9 * s - 0.5 * (1 - s), 0.3), V(0.9, 0.9 * s - 0.5 * (1 - s), 0.3)]; Y.eyeL = Y.eyeR = e < 0.9 ? "sleep" : "wide"; Y.pitch = lerp(0.5, -0.15, clamp(e / 0.9)); Y.mouth = e < 1 ? 0.45 * bump(e / 1) : 0.15; }
      else if (d.react.kind === "cheer" && e < 1.6) { Y.pos.y += bump(clamp(e / 0.55)) * 0.12 + bump(clamp((e - 0.6) / 0.45)) * 0.05; Y.eyeL = Y.eyeR = "happy"; Y.mouth = 0.5; Y.hands = [V(-1.1, 0.75, 0.3), V(1.1, 0.75, 0.3)]; }
      else if (d.react.kind === "drowse" && e < 1.6) { Y.mouth = 0.55 * bump(e / 1.2); Y.eyeL = Y.eyeR = "squint"; }
      else if (d.react.kind === "glance" && e < 1.2) { const g = bump(e / 1.2); Y.yaw = lerp(Y.yaw, -0.55, g); Y.pitch = lerp(Y.pitch, 0.3, g); }
      else if (e > 2.4) d.react = null;
    }
    return Y;
  }

  // ---------------- the rest of the office: one floor, front to back ----------------
  // Front: the elevator you arrive by, the front desk (people, alerts, rules, consent) and the usage meter (price, card,
  // this month's use). Back, where the aisle of desks ends: the tool wall every desk's cable runs to, the comms corner
  // (phone line, texting, saved logins, deliveries) and the exit (disconnect, close the office). Founders also see a
  // glass office above the back of the room. Everything is the same pearl as the desks, so it reads as one room.
  const ST = new Map(); // id -> { grp, hit, anchor (local), shot(), extra }
  const FX = () => (PHONE() ? 2.0 : 2.34), FZ = 6.35;
  const zBack = () => { const n = Math.max(1, order.length || 1); return slotOf(n - 1).z - 3.1; };
  const glassMat = new THREE.MeshPhysicalMaterial({ color: "#f6f4ff", roughness: 0.08, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2, depthWrite: false });
  glassMat.envMap = env;
  const glowMat = (hex, k = 4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
  const RB = (w, h, d, r) => new X.RoundedBoxGeometry(w, h, d, 3, r);
  const column = (r, h) => lathe([[0, 0.002], [r + 0.04, 0.002], [r + 0.05, 0.03], [r, 0.07], [r * 0.94, h - 0.08], [r + 0.03, h - 0.03], [r + 0.02, h], [0, h]], 40);
  function stationHit(id, w, h, d, at) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.hit); m.position.copy(at); m.userData.station = id; return m; }
  function station(id, grp, hit, anchor, cam) { scene.add(grp); grp.add(hit); const s = { id, grp, hit, anchor, cam, on: true }; ST.set(id, s); return s; }

  // the elevator: a pearl cab whose doors part to let you onto the floor
  const lift = (() => {
    const g = new THREE.Group(); g.position.set(0, 0, 12.7);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(column(0.16, 2.7), M.leg); p.position.set(s * 1.16, 0, 0); g.add(p);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.7), M.shell); wall.rotation.y = -s * Math.PI / 2; wall.position.set(s * 1.12, 1.35, 1.25); g.add(wall);
    }
    const head = new THREE.Mesh(slab(2.6, 0.34, 0.24, 0.12, 0.05, 6), M.shell); head.position.set(0, 2.78, 0); g.add(head);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.5), M.shell); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 2.68, 1.25); g.add(ceil);
    const lamp = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 10, 64), glowMat("#ffffff", 2.6)); lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 2.64, 1.2); g.add(lamp);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.7), M.shell); back.position.set(0, 1.35, 2.5); back.rotation.y = Math.PI; g.add(back);
    const doors = [-1, 1].map((s) => { const d = new THREE.Mesh(slab(1.08, 0.06, 2.5, 0.04, 0.02, 4), M.shell); d.position.set(s * 0.55, 1.27, 0.06); g.add(d);
      const seam = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 2.3, 4, 8), glowMat(C.aqua, 3)); seam.position.set(-s * 0.53, 0, 0.04); d.add(seam); return d; });
    const sh = blob(3.2, 2.0, shadowTex, 0.35); sh.position.set(0, 0.004, 0.2); g.add(sh); onlyMain(sh, lamp);
    scene.add(g); return { g, doors };
  })();

  // the front desk: a curved counter with a badge tray, a service bell and a slim filing cabinet
  {
    const g = new THREE.Group(); g.position.set(-FX(), 0, FZ); g.rotation.y = 0.78; g.userData.side = -1;
    const arc = 2.3, a0 = -arc / 2; // the counter's curve faces you; whoever works it stands inside
    const prof = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof([[0.6, 0], [0.84, 0], [0.86, 0.06], [0.83, 0.9], [0.84, 0.95], [0.6, 0.95], [0.58, 0.06], [0.6, 0]]), 64, a0, arc), M.desk); g.add(body);
    const top = new THREE.Mesh(new THREE.LatheGeometry([[0.54, 0.95], [0.92, 0.95], [0.94, 0.975], [0.92, 1.0], [0.54, 1.0], [0.52, 0.975], [0.54, 0.95]].map(([x, y]) => new THREE.Vector2(x, y)), 64, a0 - 0.06, arc + 0.12), M.shell); g.add(top);
    const strip = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.009, 8, 96, arc), glowMat(C.lilac, 3.5)); strip.rotation.x = Math.PI / 2; strip.rotation.z = -(a0 + arc) + Math.PI / 2; strip.position.y = 0.91; g.add(strip);
    for (const e of [a0, a0 + arc]) { const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.72, 6, 18), M.desk); cap.position.set(Math.sin(e) * 0.72, 0.47, Math.cos(e) * 0.72); g.add(cap); }
    const bell = new THREE.Group(); bell.position.set(0.34, 1.0, 0.72);
    bell.add(new THREE.Mesh(lathe([[0, 0], [0.085, 0], [0.09, 0.012], [0, 0.016]], 36), M.silver));
    const dome = new THREE.Mesh(lathe([[0, 0.016], [0.075, 0.016], [0.07, 0.04], [0.05, 0.07], [0.02, 0.086], [0, 0.088]], 36), M.silver); bell.add(dome);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), M.silver); knob.position.y = 0.1; bell.add(knob); g.add(bell);
    const tray = new THREE.Group(); tray.position.set(-0.3, 1.0, 0.7); tray.rotation.y = -0.4;
    tray.add(new THREE.Mesh(slab(0.34, 0.16, 0.02, 0.04, 0.008, 3), M.shell));
    ["#ff9ac0", "#5eead9", "#ffc861"].forEach((hex, i) => { const bd = new THREE.Mesh(slab(0.085, 0.012, 0.11, 0.018, 0.005, 3), pearlStuff({ color: pastel(hex, 0.35).getStyle(), flank: hex, fk: 0.4, rough: 0.3 })); bd.rotation.x = -0.35; bd.position.set(-0.1 + i * 0.1, 0.07, 0); tray.add(bd); });
    g.add(tray);
    const cab = new THREE.Group(); cab.position.set(-0.35, 0, -0.55); cab.rotation.y = 0.2;
    cab.add(new THREE.Mesh(RB(0.42, 1.05, 0.46, 0.05), M.shell)); cab.children[0].position.y = 0.525;
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(slab(0.36, 0.01, 0.3, 0.03, 0.004, 2), M.leg); f.position.set(0, 0.2 + i * 0.33, 0.235); cab.add(f);
      const hd = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.08, 4, 8), M.silver); hd.rotation.z = Math.PI / 2; hd.position.set(0, 0.28 + i * 0.33, 0.245); cab.add(hd); }
    g.add(cab);
    const sh = blob(2.6, 2.2, deskShadowTex, 0.9); sh.position.y = 0.004; g.add(sh);
    onlyMain(sh, bell, tray, strip);
    station("front", g, stationHit("front", 2.0, 1.3, 1.6, V(0, 0.65, 0.3)), V(0, 1.6, 0.3), { pos: V(0.1, 2.15, 3.4), look: V(0, 0.85, 0.3) });
  }

  // the usage meter: a pearl column with a glass tube that fills with this month's use
  const meter = (() => {
    const g = new THREE.Group(); g.position.set(FX(), 0, FZ); g.rotation.y = -0.78; g.userData.side = 1;
    g.add(new THREE.Mesh(column(0.24, 2.05), M.leg));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 10, 64), glowMat("#ffffff", 2.4)); halo.rotation.x = Math.PI / 2; halo.position.y = 2.14; g.add(halo);
    const tubeG = new THREE.CylinderGeometry(0.085, 0.085, 1.2, 40, 1, true), tube = new THREE.Mesh(tubeG, glassMat); tube.position.set(0, 1.12, 0.27); tube.renderOrder = 3; g.add(tube);
    for (const y of [0.52, 1.72]) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.016, 10, 40), M.silver); c.rotation.x = Math.PI / 2; c.position.set(0, y, 0.27); g.add(c); }
    const liqMat = new THREE.MeshPhysicalMaterial({ color: "#bff5ee", roughness: 0.15, clearcoat: 1, emissive: new THREE.Color(C.aqua), emissiveIntensity: 0.55, transparent: true, opacity: 0.9 }); liqMat.envMap = env;
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 32), liqMat); liq.position.set(0, 0.53, 0.27); g.add(liq);
    const bubbles = []; for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.008 + (i % 3) * 0.004, 10, 8), glowMat("#ffffff", 1.6)); g.add(b); bubbles.push(b); }
    for (const k of [0.25, 0.5, 0.75]) { const tk = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.05, 2, 6), glowMat(C.lilac, 1.6)); tk.rotation.z = Math.PI / 2; tk.position.set(-0.13, 0.53 + k * 1.18, 0.25); g.add(tk); }
    const sh = blob(1.4, 1.4, shadowTex, 0.6); sh.position.y = 0.004; g.add(sh); onlyMain(sh, halo, ...bubbles);
    const s = station("meter", g, stationHit("meter", 0.9, 2.2, 0.9, V(0, 1.1, 0.1)), V(0, 2.3, 0.1), { pos: V(-0.55, 1.95, 4.7), look: V(0, 1.1, 0.15) });
    s.extra = { liq, liqMat, bubbles, frac: 0.0, shown: 0, warn: false };
    return s;
  })();

  // the back of the room: the tool wall under a pearl arch, with the comms corner and the exit on either side
  const tools = (() => {
    const g = new THREE.Group();
    for (const s of [-1, 1]) { const p = new THREE.Mesh(column(0.15, 2.5), M.leg); p.position.set(s * 1.8, 0, 0); g.add(p); }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.11, 18, 96, Math.PI), M.shell); arch.position.y = 2.5; g.add(arch);
    const archGlow = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.012, 8, 96, Math.PI), glowMat(C.aqua, 3)); archGlow.position.set(0, 2.5, 0.11); g.add(archGlow);
    const shelves = [0.78, 1.32, 1.86].map((y) => { const sh = new THREE.Mesh(slab(3.2, 0.34, 0.035, 0.05, 0.012, 3), glassMat); sh.position.set(0, y, -0.05); sh.renderOrder = 2; g.add(sh);
      const lip = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 3.0, 2, 8), glowMat(C.lilac, 2.4)); lip.rotation.z = Math.PI / 2; lip.position.set(0, y - 0.02, 0.12); g.add(lip); return y; });
    const plinth = new THREE.Mesh(slab(3.3, 0.5, 0.14, 0.12, 0.04, 5), M.shell); plinth.position.set(0, 0.07, 0.05); g.add(plinth);
    const sockets = [-1, 1].map((s) => { const k = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 28), glowMat(C.aqua, 3)); k.rotation.x = Math.PI / 2; k.position.set(s * 1.25, 0.145, 0.25); g.add(k); return k; });
    const sh = blob(4.4, 1.6, deskShadowTex, 0.8); sh.position.y = 0.004; g.add(sh); onlyMain(sh, archGlow, ...sockets);
    const s = station("tools", g, stationHit("tools", 3.6, 2.4, 0.8, V(0, 1.2, 0)), V(0, 2.95, 0), { pos: V(0, 1.75, 4.6), look: V(0, 1.3, 0) });
    s.extra = { blocks: [], shelves, sig: "" };
    return s;
  })();
  const blockGeo = RB(0.26, 0.24, 0.22, 0.06), dotGeo = new THREE.SphereGeometry(0.022, 12, 10), blockMats = new Map(), STATE_HEX = { ok: C.aqua, you: "#f2b02a", pip: C.violet, bad: "#ff7d6b" };
  function blockMat(hex) { if (!blockMats.has(hex)) blockMats.set(hex, pearlStuff({ color: pastel(hex, 0.3).getStyle(), flank: pastel(hex, 0.7).getStyle(), belly: "#ffffff", fk: 0.55, bk: 0.2, rough: 0.3, irid: 0.12, rim: 0.3 })); return blockMats.get(hex); }
  function setToolBlocks(list) { // one glossy block per tool your team uses, with a light that says where it stands
    const T_ = tools.extra, sig = JSON.stringify(list); if (sig === T_.sig) return; T_.sig = sig;
    for (const b of T_.blocks) tools.grp.remove(b); T_.blocks = [];
    const per = 7, shown = list.slice(0, per * 3);
    shown.forEach((t, i) => {
      const row = Math.floor(i / per), col = i % per, n = Math.min(per, shown.length - row * per), x = (col - (n - 1) / 2) * 0.44;
      const b = new THREE.Group(); b.position.set(x, T_.shelves[row] + 0.12, -0.05); b.rotation.y = (col % 2 ? -1 : 1) * 0.12;
      b.add(new THREE.Mesh(blockGeo, blockMat(t.hex)));
      const dot = new THREE.Mesh(dotGeo, glowMat(STATE_HEX[t.state] || C.aqua, 3)); dot.position.set(0, 0.07, 0.114); b.add(dot);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.08), new THREE.MeshBasicMaterial({ map: label(t.short, { w: 300, h: 120, color: "#3d3460", font: "600 64px Geist", align: "center" }), transparent: true, depthWrite: false }));
      face.position.set(0, -0.035, 0.113); b.add(face); b.userData.state = t.state; b.userData.dot = dot;
      tools.grp.add(b); T_.blocks.push(b); onlyMain(dot, face);
    });
  }

  const comms = (() => {
    const g = new THREE.Group(); g.userData.side = -1;
    const top = new THREE.Mesh(slab(1.2, 0.56, 0.05, 0.12, 0.02, 5), M.desk); top.position.set(0, 0.72, 0); g.add(top);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(LEG, M.leg); leg.scale.set(1, 0.72 / (TOP - 0.06) * 0.98, 0.85); leg.position.set(s * 0.48, 0, 0); g.add(leg); }
    const phone = new THREE.Group(); phone.position.set(-0.3, 0.745, 0.04); phone.rotation.y = 0.35;
    const pb = new THREE.Mesh(slab(0.24, 0.2, 0.07, 0.05, 0.02, 4), M.shell); pb.position.y = 0.035; pb.rotation.x = -0.12; phone.add(pb);
    const hs = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.17, 6, 14), M.shell); hs.rotation.z = Math.PI / 2; hs.position.set(0, 0.095, -0.02); phone.add(hs);
    const keys = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 14), M.key, 9), km2 = new THREE.Matrix4();
    for (let i = 0; i < 9; i++) { km2.makeRotationX(-0.12); km2.setPosition(-0.03 + (i % 3) * 0.03, 0.074 - Math.floor(i / 3) * 0.004, 0.02 + Math.floor(i / 3) * 0.028); keys.setMatrixAt(i, km2); } phone.add(keys);
    const pl = new THREE.Mesh(dotGeo, glowMat(C.aqua, 3)); pl.scale.setScalar(0.5); pl.position.set(0.08, 0.08, 0.07); phone.add(pl); g.add(phone);
    const mail = new THREE.Group(); mail.position.set(0.28, 0.745, -0.02); mail.rotation.y = -0.3;
    const mb = new THREE.Mesh(RB(0.2, 0.17, 0.3, 0.07), M.shell); mb.position.y = 0.09; mail.add(mb);
    const flag = new THREE.Mesh(slab(0.012, 0.07, 0.1, 0.004, 0.003, 2), M.gold); flag.rotation.z = Math.PI / 2; flag.position.set(0.105, 0.15, -0.04); mail.add(flag);
    const slot = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.08, 2, 6), glowMat(C.lilac, 2.4)); slot.rotation.z = Math.PI / 2; slot.position.set(0, 0.12, 0.152); mail.add(slot); g.add(mail);
    const safe = new THREE.Group(); safe.position.set(-0.85, 0, 0.12); safe.rotation.y = 0.35;
    safe.add(new THREE.Mesh(RB(0.46, 0.46, 0.44, 0.07), M.shell)); safe.children[0].position.y = 0.23;
    const dial = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 10, 32), M.silver); dial.position.set(0, 0.26, 0.225); safe.add(dial);
    const knb = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20), M.silver); knb.rotation.x = Math.PI / 2; knb.position.set(0, 0.26, 0.23); safe.add(knb);
    const sl = new THREE.Mesh(dotGeo, glowMat(C.aqua, 3)); sl.scale.setScalar(0.45); sl.position.set(0.15, 0.4, 0.225); safe.add(sl); g.add(safe);
    const parcels = [[0.82, 0.16, 0.25, 0.32, 0.26, 0.2], [0.95, 0.05, -0.1, 0.24, 0.2, 0.26]].map(([x, y, z, w, hh, d], i) => { const p = new THREE.Mesh(RB(w, hh, d, 0.025), M.kraft); p.position.set(x, hh / 2 + (i ? 0 : 0), z); p.rotation.y = i ? 0.4 : -0.2; g.add(p);
      const tape = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.2, d * 1.01), new THREE.MeshStandardMaterial({ color: "#efd9a6", roughness: 0.7 })); tape.rotation.x = -Math.PI / 2; tape.position.set(0, hh / 2 + 0.001, 0); p.add(tape); return p; });
    const sh = blob(2.6, 1.6, deskShadowTex, 0.85); sh.position.y = 0.004; g.add(sh); onlyMain(sh, keys, pl, slot, sl);
    return station("comms", g, stationHit("comms", 2.3, 1.2, 1.0, V(0, 0.6, 0)), V(-0.1, 1.38, 0), { pos: V(0.1, 1.85, 3.1), look: V(-0.05, 0.6, 0) });
  })();

  const exit = (() => {
    const g = new THREE.Group(); g.userData.side = 1;
    for (const s of [-1, 1]) { const p = new THREE.Mesh(column(0.07, 2.1), M.leg); p.position.set(s * 0.56, 0, 0); g.add(p); }
    const head = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 14, 64, Math.PI), M.shell); head.position.y = 2.1; g.add(head);
    const door = new THREE.Mesh(slab(1.0, 0.05, 2.12, 0.05, 0.02, 4), M.shell); door.position.set(0, 1.07, -0.02); g.add(door);
    const light = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(255,252,240,1)"], [0.6, "rgba(255,250,235,.5)"], [1, "rgba(255,255,255,0)"]], 128), transparent: true, depthWrite: false, opacity: 0 }));
    light.position.set(0, 1.07, 0.02); g.add(light);
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.2, 4, 10), M.silver); handle.position.set(0.36, 1.05, 0.04); g.add(handle);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.14), new THREE.MeshBasicMaterial({ map: label("Exit", { w: 360, h: 120, color: "#6f64c9", font: "italic 400 92px 'Instrument Serif'", align: "center" }), transparent: true, depthWrite: false }));
    sign.position.set(0, 2.38, 0.02); g.add(sign);
    const box = new THREE.Group(); box.position.set(-1.02, 0, 0.12); box.rotation.y = 0.25;
    const post = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 1.0, 4, 10), M.silver); post.position.y = 0.52; box.add(post);
    const panel = new THREE.Mesh(RB(0.34, 0.46, 0.1, 0.04), M.shell); panel.position.y = 1.22; box.add(panel);
    const lever = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.12, 4, 10), new THREE.MeshPhysicalMaterial({ color: "#ffb0a2", roughness: 0.3, clearcoat: 1, emissive: new THREE.Color("#ff7d6b"), emissiveIntensity: 0.25 }));
    lever.position.set(0, 1.25, 0.07); lever.rotation.x = 0.5; box.add(lever);
    const cover = new THREE.Mesh(RB(0.3, 0.4, 0.04, 0.03), glassMat); cover.position.set(0, 1.22, 0.1); cover.renderOrder = 3; box.add(cover); g.add(box);
    const sh = blob(2.2, 1.3, deskShadowTex, 0.75); sh.position.y = 0.004; g.add(sh); onlyMain(sh, sign, light, lever);
    const s = station("exit", g, stationHit("exit", 2.0, 2.4, 0.9, V(-0.35, 1.2, 0)), V(-0.4, 2.62, 0), { pos: V(-0.25, 1.75, 3.5), look: V(-0.4, 1.15, 0) });
    s.extra = { light };
    return s;
  })();

  // the founder's glass office, above the back of the room
  const loft = (() => {
    const g = new THREE.Group();
    const fl = new THREE.Mesh(slab(3.0, 1.5, 0.12, 0.2, 0.04, 6), M.shell); g.add(fl);
    const under = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 2.6, 4, 8), glowMat(C.aqua, 3)); under.rotation.z = Math.PI / 2; under.position.set(0, -0.07, 0.72); g.add(under);
    const rail = new THREE.Mesh(RB(3.0, 0.5, 0.03, 0.02), glassMat); rail.position.set(0, 0.32, 0.74); rail.renderOrder = 3; g.add(rail);
    const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 2.96, 4, 10), M.silver); cap.rotation.z = Math.PI / 2; cap.position.set(0, 0.58, 0.74); g.add(cap);
    const dk = new THREE.Mesh(slab(1.0, 0.45, 0.04, 0.1, 0.015, 4), M.desk); dk.position.set(0.3, 0.5, -0.2); g.add(dk);
    const mon = monitor(darkScreen); mon.g.scale.setScalar(0.7); mon.g.position.set(0.3, 0.52, -0.33); g.add(mon.g);
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.42, 4, 8), M.silver); l.position.set(0.3 + s * 0.42, 0.27, -0.2); g.add(l); }
    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.16, 40), new THREE.MeshBasicMaterial({ map: pipMark, transparent: true, depthWrite: false })); mark.position.set(-0.9, 0.36, 0.76); g.add(mark);
    onlyMain(under, mark);
    const s = station("founder", g, stationHit("founder", 3.0, 0.9, 1.6, V(0, 0.3, 0)), V(0, 0.95, 0.4), { pos: V(0, 1.3, 3.6), look: V(0, 0.3, 0) });
    s.on = false; g.visible = false; return s;
  })();

  // cables: each desk is wired to the tool wall; a broken tool lights its cable amber all the way from the desk
  const cables = new Map(), cableMats = { ok: glowMat(C.aqua, 2.2), you: glowMat("#f2b02a", 3), pip: glowMat(C.lilac, 2.4), none: glowMat("#e8e4f4", 1) };
  function placeStations() {
    const zb = zBack(), fx = FX();
    const front = ST.get("front"); front.grp.position.set(-fx, 0, FZ); meter.grp.position.set(fx, 0, FZ);
    tools.grp.position.set(0, 0, zb);
    comms.grp.position.set(-(PHONE() ? 2.55 : 3.1), 0, zb + 0.55); comms.grp.rotation.y = 0.62;
    exit.grp.position.set(PHONE() ? 2.55 : 3.1, 0, zb + 0.55); exit.grp.rotation.y = -0.62;
    loft.grp.position.set(0, 3.35, zb - 1.3);
    for (const [id, c] of cables) { const d = desks.get(id); if (!d) { scene.remove(c.mesh); cables.delete(id); continue; } c.mesh.geometry.dispose(); c.mesh.geometry = cableGeo(d); }
  }
  function cableGeo(d) {
    const x = d.grp.position.x, z = d.grp.position.z, s = Math.sign(x) || 1, zb = zBack();
    const pts = [V(x * 0.72, 0.014, z + 0.45), V(s * 1.5, 0.014, z + 0.1), V(s * 1.27, 0.014, z - 0.5), V(s * 1.26, 0.014, zb + 0.6), V(s * 1.25, 0.06, zb + 0.28)];
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.2), 64, 0.011, 6, false);
  }
  function syncCables(list) { // list: [{ id, state: ok | you | pip | none }]
    const keep = new Set();
    for (const c of list || []) {
      const d = desks.get(c.id); if (!d || d.open) continue; keep.add(c.id);
      let e = cables.get(c.id); if (!e) { e = { mesh: new THREE.Mesh(cableGeo(d), cableMats.none), state: null }; scene.add(e.mesh); onlyMain(e.mesh); cables.set(c.id, e); }
      if (e.state !== c.state) { e.state = c.state; e.mesh.material = c.state === "you" ? cableMats.you.clone() : cableMats[c.state] || cableMats.none; e.t0 = T(); }
    }
    for (const [id, e] of cables) if (!keep.has(id)) { scene.remove(e.mesh); cables.delete(id); }
  }

  // the arrival: shown the first time each day, otherwise a short glide in
  let arrive = null; // { t0, full }
  const shotLift = () => (PHONE() ? { pos: V(0, 1.9, 14.6), look: V(0, 1.5, 4), fov: 62, tilt: 0 } : { pos: V(0, 1.72, 14.1), look: V(0, 1.45, 2), fov: 44, tilt: 0 });
  function stepArrive(t) {
    const open = arrive ? clamp((t - arrive.t0 - 0.35) / 0.75) : 1, e = ease(open);
    lift.doors.forEach((d, i) => { d.position.x = (i ? 1 : -1) * (0.55 + e * 0.62); });
    lift.g.visible = !!arrive || mode !== "floor" || !!flight; // the cab sits behind you once you are on the floor
    if (arrive && t - arrive.t0 > 3.2) arrive = null;
  }

  // stations in the frame loop: the meter fills, bubbles rise, a broken cable breathes amber, the exit glows on hover
  let stHover = null;
  function stepStations(t) {
    const m = meter.extra; m.shown = lerp(m.shown, m.frac, RM() ? 1 : 0.06);
    const f = clamp(m.shown, 0.02, 1); m.liq.scale.y = f * 1.16; m.liq.position.y = 0.53 + (f * 1.16) / 2;
    m.liqMat.emissive.set(m.warn ? "#f2b02a" : C.aqua); m.liqMat.color.set(m.warn ? "#ffe3a3" : "#bff5ee");
    m.bubbles.forEach((b, i) => { const k = (t * (0.12 + i * 0.02) + i / 7) % 1; b.visible = k * 1.16 < f * 1.16 - 0.04; b.position.set(Math.sin(i * 2.1 + t) * 0.035, 0.55 + k * f * 1.16, 0.27 + Math.cos(i * 1.7) * 0.03); });
    for (const e of cables.values()) if (e.state === "you") { const k = 0.55 + 0.45 * Math.sin(t * 3.2); e.mesh.material.color.set("#f2b02a").multiplyScalar(2 + k * 3.5); }
    for (const b of tools.extra.blocks) if (b.userData.state === "you") b.userData.dot.material.color.set("#f2b02a").multiplyScalar(2 + 2.5 * (0.5 + 0.5 * Math.sin(t * 3.2)));
    exit.extra.light.material.opacity = lerp(exit.extra.light.material.opacity, stHover === "exit" ? 0.5 : 0.12, 0.08);
    for (const s of ST.values()) { const up = s.id === stHover ? 1 : 0; s.k = lerp(s.k || 0, up, 0.12); }
  }

  // where the camera stands to look at a station, with room for the panel that opens beside it
  function shotStation(s) {
    s.grp.updateMatrixWorld(true);
    const pos = s.cam.pos.clone().applyMatrix4(s.grp.matrixWorld), look = s.cam.look.clone().applyMatrix4(s.grp.matrixWorld);
    if (PHONE()) { // the panel rises from the bottom: stand further back and keep the station in the top half
      const back = pos.clone().sub(look).multiplyScalar(0.55); pos.add(back); pos.y += 0.5; look.y -= 0.75; return { pos, look, fov: 56, tilt: 0 };
    }
    const fov = 40, dist = pos.distanceTo(look), half = Math.tan((fov * Math.PI) / 360) * dist, aspect = innerWidth / innerHeight;
    const panel = Math.min(600, innerWidth - 28) + 14, free = innerWidth - panel, shiftPx = innerWidth / 2 - free / 2; // centre the station in the space left of the panel
    const right = look.clone().sub(pos).cross(V(0, 1, 0)).normalize();
    look.add(right.multiplyScalar((shiftPx / (innerWidth / 2)) * half * aspect));
    return { pos, look, fov, tilt: 0 };
  }
  // what the Portal draws on top: each station's tag, placed like a desk's tag
  const stTagEls = new Map();

  // ---------------- Pip, the floor manager ----------------
  const pip = buildMate({ team: C.violet, pip: true, headset: false });
  scene.add(pip.root);
  const clip = new THREE.Group();
  { const b = new THREE.Mesh(slab(0.75, 1.0, 0.06, 0.1, 0.025, 4), M.shell); b.rotation.x = Math.PI / 2; clip.add(b);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.8), new THREE.MeshStandardMaterial({ map: canvasTex(310, 400, (g) => { g.fillStyle = "#fdfcf8"; g.fillRect(0, 0, 310, 400); g.strokeStyle = "#d6d0ea"; g.lineWidth = 6; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(40, 90 + i * 50); g.lineTo(i % 2 ? 230 : 270, 90 + i * 50); g.stroke(); } g.fillStyle = "#5eead9"; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(24, 90 + i * 50, 9, 0, 7); g.fill(); } }), roughness: 0.7 })); p.position.z = 0.032; clip.add(p);
    const c = new THREE.Mesh(slab(0.3, 0.1, 0.05, 0.03, 0.012, 3), M.silver); c.rotation.x = Math.PI / 2; c.position.set(0, 0.48, 0.05); clip.add(c); }
  pip.root.add(clip); clip.scale.setScalar(0.7);
  const pipShadow = blob(1.2, 1.2, shadowTex, 0.55); scene.add(pipShadow); onlyMain(pipShadow);
  const P = { mood: "calm", talkUntil: 0, happyUntil: 0, hopAt: -9, nodAt: -9, waveAt: -9, troubleAt: -9, point: null, pointAt: 0, Y: null, pos: V() };
  const pipHome = () => (PHONE() ? V(0.12, 1.6, 1.7) : V(0.3, 1.5, 2.9));
  function pipPose(t) {
    const Y = baseY(), home = pipHome();
    Y.pos.copy(home).add(V(0, Math.sin(t * 1.5) * 0.03 + bump(clamp((t - P.hopAt) / 0.6)) * 0.22, 0));
    Y.yaw = -0.06 + Math.sin(t * 0.4) * 0.05; Y.pitch = -0.06; Y.roll = -0.04 + Math.sin(t * 1.1) * 0.03; Y.coreK = 0.55; Y.bulb = C.aqua; Y.bulbK = 0.9; Y.antZ = Math.sin(t * 1.3) * 0.08;
    Y.hands = [V(-1.25, -0.62, 0.55), V(1.3, -0.55 + Math.sin(t * 1.4) * 0.04, 0.45)];
    if (P.mood === "concerned" || t - P.troubleAt < 2) { Y.eyeL = Y.eyeR = "open"; Y.roll = 0.12; Y.pitch = 0.05; Y.mouthW = -0.4; Y.bulb = "#f2b02a"; Y.yaw += Math.sin((t - P.troubleAt) * 18) * 0.05 * bump(clamp((t - P.troubleAt) / 0.8)); }
    if (P.mood === "think") { Y.pitch = -0.22; Y.yaw = 0.25; Y.eyeL = "squint"; Y.hands[1] = V(0.55, -0.85, 0.85); }
    if (t < P.talkUntil) Y.mouth = 0.18 + Math.abs(Math.sin(t * 9)) * 0.28;
    if (t < P.happyUntil) { Y.eyeL = Y.eyeR = "happy"; Y.mouth = Math.max(Y.mouth, 0.3); }
    const nod = clamp((t - P.nodAt) / 0.7); if (nod < 1) Y.pitch += Math.sin(nod * Math.PI * 2) * 0.22;
    const wv = (t - P.waveAt) / 1.8; if (wv > 0 && wv < 1) { Y.hands[1] = V(1.38, 0.42 + Math.sin(t * 13) * 0.12, 0.62); Y.eyeL = Y.eyeR = "happy"; }
    if (P.point && desks.has(P.point)) { // point at the desk that needs you, now and then
      const since = t - P.pointAt, on = since < 5 || since % 13 < 3.4;
      if (on) { const d = desks.get(P.point); tmpV.set(0, 1.2, 0); d.grp.localToWorld(tmpV); tmpV.sub(Y.pos).normalize(); const sc = pip.root.scale.x || 0.25;
        const side = tmpV.x > 0 ? 1 : 0; tmpV.z = Math.max(tmpV.z, 0.25); tmpV.normalize(); Y.hands[side] = V(tmpV.x * 1.7, 0.25 + tmpV.y * 1.2, tmpV.z * 1.2); Y.yaw = clamp(tmpV.x, -1, 1) * 0.45; Y.eyeL = Y.eyeR = "open"; void sc; }
    }
    return Y;
  }

  // ---------------- confetti for good news ----------------
  const CONF_N = 140, confGeo = new X.RoundedBoxGeometry(0.03, 0.016, 0.005, 1, 0.003);
  const conf = new THREE.InstancedMesh(confGeo, new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 1, envMapIntensity: 0.9 }), CONF_N); conf.visible = false; conf.frustumCulled = false; scene.add(conf); onlyMain(conf);
  const confState = { t0: -9, parts: [] }, confCols = ["#5eead9", "#9b86ff", "#ffb3d4", "#ffd36a", "#cfc3ff", "#ffffff"];
  for (let i = 0; i < CONF_N; i++) conf.setColorAt(i, new THREE.Color(confCols[i % confCols.length]));
  function burst(at) {
    confState.t0 = T(); confState.parts = [];
    for (let i = 0; i < CONF_N; i++) { const a = Math.random() * Math.PI * 2, u = 0.6 + Math.random() * 1.6; confState.parts.push({ p: at.clone(), v: V(Math.cos(a) * u, 2.2 + Math.random() * 2.2, Math.sin(a) * u), r: V(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: V((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14) }); }
    conf.visible = true; invalidate();
  }
  const cm4 = new THREE.Matrix4(), ce = new THREE.Euler(), cq = new THREE.Quaternion(), cs = V(1, 1, 1);
  function stepConfetti(t, dt) {
    if (!conf.visible) return; const e = t - confState.t0; if (e > 3.4) { conf.visible = false; return; }
    for (let i = 0; i < CONF_N; i++) { const c = confState.parts[i]; c.v.y -= 6.5 * dt; c.v.multiplyScalar(1 - 1.4 * dt); c.p.addScaledVector(c.v, dt); if (c.p.y < 0.01) { c.p.y = 0.01; c.v.set(0, 0, 0); } c.r.addScaledVector(c.w, dt);
      cq.setFromEuler(ce.set(c.r.x, c.r.y, c.r.z)); cs.setScalar(e > 2.6 ? clamp(1 - (e - 2.6) / 0.8) : 1); cm4.compose(c.p, cq, cs); conf.setMatrixAt(i, cm4); }
    conf.instanceMatrix.needsUpdate = true;
  }

  // ---------------- post: glow, floor reflections, focus over the shoulder ----------------
  let composer = null, bokeh = null, prScale = 1;
  const pr = () => Math.max(0.75, prFor() * prScale); // the resolution actually drawn: the tier's, scaled down if frames run long
  function buildFX() {
    if (composer) { composer.dispose && composer.dispose(); composer = null; bokeh = null; }
    if (reflector) { scene.remove(reflector); reflector.dispose(); reflector = null; }
    renderer.setPixelRatio(pr());
    floorMat.opacity = tier === "high" ? 0.91 : 1; floorMat.transparent = tier === "high"; floorMat.needsUpdate = true;
    if (tier === "high") {
      reflector = new X.Reflector(new THREE.PlaneGeometry(220, 220), { textureWidth: Math.round(innerWidth * pr() * 0.5), textureHeight: Math.round(innerHeight * pr() * 0.5), color: 0xbdbcc6, clipBias: 0.003, multisample: 0 }); reflector.camera.layers.set(0); reflector.camera.layers.enable(MIRROR); reflector.rotation.x = -Math.PI / 2; reflector.position.y = -0.002; scene.add(reflector);
      // the floor turns solid past 26 m, so nothing further away can show in the mirror: cull it from the mirror's pass
      const mirror = reflector.onBeforeRender; reflector.onBeforeRender = function (r, sc, cam) { if (sc.overrideMaterial) return; const far = cam.far; cam.far = 34; cam.updateProjectionMatrix(); try { mirror.apply(this, arguments); } finally { cam.far = far; cam.updateProjectionMatrix(); } };
    }
    if (tier === "low") return;
    const w = innerWidth, h = innerHeight, p = pr();
    composer = new X.EffectComposer(renderer, new THREE.WebGLRenderTarget(w * p, h * p, { type: THREE.HalfFloatType, samples: p >= 1.75 ? 2 : 4 })); composer.setPixelRatio(p); composer.setSize(w, h);
    composer.addPass(new X.RenderPass(scene, camera));
    if (tier === "high") { bokeh = new X.BokehPass(scene, camera, { focus: 2.2, aperture: 0.009, maxblur: 0.014 }); bokeh.enabled = false; composer.addPass(bokeh); }
    composer.addPass(new X.UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 4.2));
    composer.addPass(new X.OutputPass());
  }

  // ---------------- camera: the floor, a desk, and the flights between ----------------
  const shotFloor = () => (PHONE() ? { pos: V(0, 4.9, 11.4), look: V(0, 0.55, -2.2), fov: 60, tilt: 0 } : { pos: V(0, 2.42, 10.6), look: V(0, 0.86, -3.4), fov: 41, tilt: 0 }); // from the entrance: the front desk and meter at your sides, the team down the aisle
  function shotDesk(d) {
    d.grp.updateMatrixWorld(true); const m = d.grp.matrixWorld;
    // Over the shoulder: high enough that their round head never hides what is on the screen, close enough that the
    // crown of their head, the headset and the antenna sit in the corner of the shot, softly out of focus.
    const pos = PHONE() ? V(-0.62, 2.5, -1.95) : V(-0.5, 2.06, -0.8), look = PHONE() ? V(-0.02, 1.08, 0.8) : V(-0.04, 0.95, 0.98);
    if (PHONE()) return { pos: pos.applyMatrix4(m), look: look.applyMatrix4(m), fov: 50, tilt: 0.17 };
    // Over the shoulder on a computer: frame the monitor so its text reads near full size. The screen is 1000 CSS px wide,
    // so aim for one CSS px per screen px, less when the window is small, and keep the header and folder bar clear.
    const O = (window.PIP_TEST && window.PIP_TEST.deskCam) || null; if (O && O.pos) pos.set(...O.pos); // tests only: try a composition
    pos.applyMatrix4(m); d.mon.scr.getWorldPosition(tmpV2); const at = tmpV2.clone(), dist = pos.distanceTo(at);
    const want = O && O.want ? O.want : Math.max(0.5, Math.min(0.84, ((innerHeight - 200) / 600) * 0.94, ((innerWidth - 160) / 1000) * 0.88));
    const half = Math.atan(((d.mon.W / 1000) * innerHeight) / (2 * dist * want)), fov = clamp((2 * half * 180) / Math.PI, 14, 34);
    // nudge the screen right of centre so their head and headset stay in the corner of your eye
    const right = at.clone().sub(pos).cross(V(0, 1, 0)).normalize(), perPx = (2 * dist * Math.tan((fov * Math.PI) / 360)) / innerHeight;
    const sx = O && O.sx != null ? O.sx : 0.07, sy = O && O.sy != null ? O.sy : 0.04;
    return { pos, look: at.sub(right.multiplyScalar(innerWidth * sx * perPx)).add(V(0, -0.012 + innerHeight * sy * perPx, 0)), fov, tilt: 0 };
  }
  const shotEnter = () => ({ pos: V(0, 7.4, 16), look: V(0, 1.6, -12), fov: 48, tilt: 0 });
  const cam = { pos: V(), look: V(), fov: 40, tilt: 0 }; let flight = null, mode = "floor", focusId = null, stationId = null, parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  function setCam(s) { cam.pos.copy(s.pos); cam.look.copy(s.look); cam.fov = s.fov; cam.tilt = s.tilt || 0; }
  function fly(to, dur = 1.5, lift = 0.6, aisle = false) {
    if (RM()) { setCam(to); flight = null; invalidate(); return Promise.resolve(); }
    return new Promise((res) => { flight = { from: { pos: cam.pos.clone(), look: cam.look.clone(), fov: cam.fov, tilt: cam.tilt }, to, t0: T(), dur, lift, aisle, res }; kick(); });
  }
  function stepFlight(t) {
    if (!flight) return;
    const k = clamp((t - flight.t0) / flight.dur), e = ease(k), f = flight.from, to = flight.to;
    cam.pos.lerpVectors(f.pos, to.pos, e); cam.pos.y += Math.sin(e * Math.PI) * flight.lift;
    cam.look.lerpVectors(f.look, to.look, ease(clamp(k * 1.15))); cam.fov = lerp(f.fov, to.fov, e); cam.tilt = lerp(f.tilt, to.tilt || 0, e);
    if (flight.aisle) { const b = bump(clamp(k / 0.68)); cam.look.lerp(tmpV3.set(cam.pos.x * 0.3, 1.1, cam.pos.z - 6), b * 0.8); cam.fov = lerp(cam.fov, 46, b * 0.7); } // walking desk to desk: look up the room on the way (not down at the floor), then settle on their screen
    if (k >= 1) { const r = flight.res; flight = null; r(); }
  }
  function placeCamera() {
    const p = mode === "floor" && !flight && !RM() ? parallax : { x: 0, y: 0 };
    camera.position.copy(cam.pos).add(tmpV.set(p.x * 0.25, p.y * 0.12, 0)); camera.lookAt(cam.look); if (cam.tilt) camera.rotateX(-cam.tilt);
    camera.fov = cam.fov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
  let skyHy = -1; const skyCv = document.createElement("canvas"); skyCv.width = 8; skyCv.height = 512; const skyTex = new THREE.CanvasTexture(skyCv); skyTex.colorSpace = THREE.SRGBColorSpace;
  function sky() { // the floor melts into the light at the horizon
    const h = V(camera.position.x, 0, camera.position.z - 300).project(camera), hy = clamp(0.5 - h.y * 0.5, 0.08, 0.98);
    if (Math.abs(hy - skyHy) < 0.01) return; skyHy = hy;
    const g = skyCv.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 512), fc = "#" + scene.fog.color.getHexString();
    gr.addColorStop(0, dim ? "#dedbe8" : "#e9e7f3"); gr.addColorStop(Math.max(0.01, hy - 0.3), dim ? "#e2dfeb" : "#efedf6"); gr.addColorStop(hy, fc); gr.addColorStop(1, fc); g.fillStyle = gr; g.fillRect(0, 0, 8, 512);
    skyTex.needsUpdate = true; scene.background = skyTex;
  }

  // ---------------- the lights come on: the entrance ----------------
  let enterT0 = -1, dim = false;
  function enter(full = true) {
    if (RM()) { enterT0 = -99; setCam(shotFloor()); invalidate(); opts.onEntered && opts.onEntered(); return; }
    enterT0 = T(); rings.forEach((r) => (r.on = 0));
    if (full) { // the doors part, light spills in, your team looks up
      arrive = { t0: enterT0 }; setCam(shotLift());
      order.forEach((id, i) => { const d = desks.get(id); if (d) { d.pop.t0 = enterT0 + 0.9 + i * 0.16; d.react = { kind: "wave", t0: enterT0 + 1.3 + i * 0.12 }; } });
      setTimeout(() => fly(shotFloor(), 1.9, 0.05).then(() => opts.onEntered && opts.onEntered()), 650);
    } else {
      enterT0 = T() - 1.2; const s = shotFloor(); setCam({ pos: s.pos.clone().add(V(0, 0.25, 1.6)), look: s.look.clone(), fov: s.fov + 3, tilt: 0 });
      fly(s, 1.1, 0).then(() => opts.onEntered && opts.onEntered());
    }
  }
  function stepRings(t) {
    const e = enterT0 < 0 ? 99 : t - enterT0, lvl = dim ? 0.28 : 1; let changed = false;
    for (const r of rings) {
      const on = clamp((e - 0.35 - r.row * 0.09) / 0.35); const flick = on > 0 && on < 1 ? (Math.sin(e * 60 + r.row) > 0 ? 1 : 0.4) : 1;
      const k = on * flick, key = Math.round(k * 200) + Math.round(lvl * 100) * 1000; if (r.key === key) continue; r.key = key; changed = true;
      ringMesh.setColorAt(r.i, rc.setRGB(0.84 + (3.4 * lvl - 0.84) * k, 0.83 + (3.4 * lvl - 0.83) * k, 0.9 + (3.4 * lvl - 0.9) * k)); // unlit rings are frosted glass, never black
      glowMesh.setColorAt(r.i, rc.setScalar(0.42 * on * lvl)); // additive glow: colour is brightness
    }
    if (changed) ringMesh.instanceColor.needsUpdate = glowMesh.instanceColor.needsUpdate = true;
  }

  // ---------------- tags, the floor's labels ----------------
  const tagEls = new Map(), tagSz = new Map(), lastStyle = new WeakMap();
  let bubbleEl = null, bubSz = { w: 320, h: 150 }, safe = { top: 0, bottom: 0 }, hudDirty = true;
  const bubRO = typeof ResizeObserver === "function" ? new ResizeObserver((es) => { for (const e of es) if (e.target === bubbleEl) bubSz = { w: e.target.offsetWidth, h: e.target.offsetHeight }; }) : null;
  function measureHud() { // reads first, all at once; placeHud then only writes
    tagSz.clear(); for (const [id, el] of tagEls) tagSz.set(id, { w: el.offsetWidth, h: el.offsetHeight }); for (const [id, el] of stTagEls) tagSz.set("st:" + id, { w: el.offsetWidth, h: el.offsetHeight });
    safe = { top: opts.safeTop ? opts.safeTop() : 0, bottom: opts.safeBottom ? opts.safeBottom() : 0 };
    if (bubbleEl) bubSz = { w: bubbleEl.offsetWidth, h: bubbleEl.offsetHeight }; hudDirty = false;
  }
  function put(el, k, v) { let m = lastStyle.get(el); if (!m) lastStyle.set(el, (m = {})); if (m[k] !== v) { m[k] = v; el.style[k] = v; } }
  function project(v) { tmpV.copy(v).project(camera); return { x: (tmpV.x * 0.5 + 0.5) * innerWidth, y: (-tmpV.y * 0.5 + 0.5) * innerHeight, z: tmpV.z }; }
  function placeHud(t) {
    if (hudDirty) measureHud();
    const show = mode === "floor" && !flight;
    if (!show && hudHidden) return placeBubble(t); // nothing to move while the tags are away
    hudHidden = !show;
    const placed = [], list = [];
    for (const id of order) {
      const d = desks.get(id), el = tagEls.get(id); if (!d || !el) continue;
      const w = V(0, d.a && d.a.look === "sleep" ? 1.62 : 1.8, d.open ? 0.6 : 0.05).applyMatrix4(d.grp.matrixWorld);
      const p = project(w), dist = camera.position.distanceTo(w), popK = d.open || d.pop.t0 < 0 ? 1 : clamp((t - d.pop.t0 - 0.2) / 0.4);
      list.push({ el, sz: tagSz.get(id) || { w: 200, h: 56 }, x: p.x, y: p.y, z: p.z, s: clamp(5.6 / dist, 0.66, 1) * (PHONE() ? 0.92 : 1), dist, popK });
    }
    for (const [id, el] of stTagEls) {
      const st = ST.get(id); if (!st || !st.on || !st.grp.visible) { put(el, "opacity", "0"); put(el, "pointerEvents", "none"); continue; }
      const w = st.anchor.clone().applyMatrix4(st.grp.matrixWorld), p = project(w), dist = camera.position.distanceTo(w);
      list.push({ el, sz: tagSz.get("st:" + id) || { w: 150, h: 40 }, x: p.x, y: p.y, z: p.z, s: clamp(5.6 / dist, 0.66, 1) * (PHONE() ? 0.92 : 1), dist, popK: enterT0 < 0 ? 1 : clamp((t - enterT0 - 1.6) / 0.5) });
    }
    list.sort((m, n) => m.dist - n.dist);
    for (const L of list) {
      const w = L.sz.w * L.s, h = L.sz.h * L.s, cx = clamp(L.x, w / 2 + 8, innerWidth - w / 2 - 8); let y = L.y;
      for (let k = 0; k < 8; k++) { const hit = placed.find((r) => cx - w / 2 < r.r + 6 && cx + w / 2 > r.l - 6 && y - h < r.b + 6 && y > r.t - 6); if (!hit) break; y = hit.t - 8; }
      const room = y - h > safe.top + 6; // a far tag with nowhere to go below the header steps aside instead of covering it
      if (room) placed.push({ l: cx - w / 2, r: cx + w / 2, t: y - h, b: y });
      const op = !show || !room || L.z > 1 ? 0 : clamp(1.25 - (L.dist - 9) / 14, 0.5, 1) * L.popK;
      if (op > 0) put(L.el, "transform", `translate(${cx.toFixed(1)}px,${(y + (1 - L.popK) * 10).toFixed(1)}px) translate(-50%,-100%) scale(${L.s.toFixed(3)})`);
      put(L.el, "opacity", op.toFixed(2)); put(L.el, "zIndex", String(100 - Math.round(L.dist))); put(L.el, "pointerEvents", show && room && L.popK > 0.5 ? "" : "none");
    }
    placeBubble(t);
  }
  let hudHidden = false;
  function placeBubble(t) {
    if (!bubbleEl || PHONE()) return;
    // Pip speaks once the room has settled, and his bubble never slides under the header or the roster
    const p = project(tmpV3.copy(pip.root.position).add(tmpV4.set(0, -0.34, 0))), low = innerHeight - safe.bottom - bubSz.h - 14;
    const x = clamp(p.x - 155, 14, innerWidth - bubSz.w - 14), y = clamp(p.y + 16, 96, Math.max(96, low));
    put(bubbleEl, "transform", `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`);
    const pre = !!flight || (!RM() && enterT0 >= 0 && t - enterT0 < 2.5); // quiet while the camera moves
    if (bubbleEl.classList.contains("pre") !== pre) bubbleEl.classList.toggle("pre", pre);
  }

  // ---------------- the screen you read over a shoulder: real HTML on the monitor glass ----------------
  // The HTML sits above the canvas, so where their head is nearer than the monitor we cut it out of the HTML layer
  // (their head and antenna are round, so a few circles are exact enough), and the screen fades in as you arrive.
  let cssObj = null, scrK = 0, revealed = false, maskKey = "", focusMounted = null;
  const mk = [V(), V(), V(), V()];
  function circleOf(w, r) { const c = project(w); tmpV3.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(r).add(w); const e = project(tmpV3); return { x: c.x, y: c.y, r: Math.hypot(e.x - c.x, e.y - c.y), z: c.z }; }
  function placeMask() {
    const el = css.domElement; let key = "", img = "";
    const d = mode === "desk" && focusId && desks.get(focusId);
    if (d && d.mate && d.mate.root.visible && scrK > 0.01 && !PHONE()) {
      const R = d.mate.root.scale.x * d.mate.head.parent.scale.x, cs = [];
      d.mate.head.getWorldPosition(mk[0]); cs.push(circleOf(mk[0], R * 1.17)); // head with its headset
      d.mate.bulb.getWorldPosition(mk[1]); cs.push(circleOf(mk[1], R * 0.16)); // antenna bulb
      d.mate.ant.localToWorld(mk[2].set(-0.01, 0.16, -0.03)); cs.push(circleOf(mk[2], R * 0.05)); d.mate.ant.localToWorld(mk[3].set(0.03, 0.36, -0.035)); cs.push(circleOf(mk[3], R * 0.05)); // stalk
      const vis = cs.filter((c) => c.z < 1 && c.x + c.r > 0 && c.y + c.r > 0 && c.x - c.r < innerWidth && c.y - c.r < innerHeight);
      key = vis.map((c) => [c.x, c.y, c.r].map((v) => Math.round(v)).join(",")).join(";");
      if (key !== maskKey) img = vis.map((c, i) => { const f = i ? 1.5 : Math.max(3, c.r * 0.035); return `radial-gradient(circle ${Math.round(c.r + f)}px at ${Math.round(c.x)}px ${Math.round(c.y)}px, transparent ${Math.max(0, c.r - f).toFixed(1)}px, #000 ${(c.r + f).toFixed(1)}px)`; }).join(",");
    }
    if (key === maskKey) return; maskKey = key;
    for (const k of ["maskImage", "webkitMaskImage"]) el.style[k] = img || "";
    el.style.maskComposite = img ? "intersect" : ""; el.style.webkitMaskComposite = img ? "source-in" : "";
  }
  function placeScreen(t, dt) {
    // how much of the HTML screen to show: it comes up over the last part of the flight in, and steps aside while a folder is out
    let want = 0;
    if (mode === "desk" && cssObj) {
      const k = flight ? clamp((t - flight.t0) / flight.dur) : 1, arrive = clamp((k - 0.62) / 0.33);
      const away = lifted ? (lifted.dir > 0 ? clamp(lifted.k * 3) : clamp(lifted.k * 1.6)) : 0;
      want = arrive * arrive * (3 - 2 * arrive) * (1 - away);
    }
    scrK = want >= scrK || RM() ? want : Math.max(want, scrK - dt * 6);
    const el = css.domElement, show = scrK > 0.005;
    put(el, "visibility", show ? "visible" : "hidden"); put(el, "opacity", scrK.toFixed(3));
    if (show && !revealed && cssObj) { revealed = true; if (opts.onReveal) opts.onReveal(cssObj.element); }
    if (!show && !cssObj) revealed = false;
    if (show) placeMask();
  }
  function mountScreen(id, el) {
    if (cssObj) { cssScene.remove(cssObj); if (cssObj.element.parentNode) cssObj.element.remove(); cssObj = null; }
    if (!el || id !== focusMounted) { revealed = false; scrK = 0; } focusMounted = id;
    const d = desks.get(id); if (!d || !el || d.open) return;
    cssObj = new X.CSS3DObject(el); cssScene.add(cssObj);
    d.grp.updateMatrixWorld(true); d.mon.scr.getWorldPosition(tmpV); d.mon.scr.getWorldQuaternion(tmpQ);
    cssObj.position.copy(tmpV).multiplyScalar(KCSS); cssObj.quaternion.copy(tmpQ); cssObj.scale.setScalar((d.mon.W / 1000) * KCSS);
    placeCamera(); syncCssCam(); css.render(cssScene, cssCam); invalidate();
  }

  // ---------------- folders: lift one out and bring it to exactly where its paper will open ----------------
  // The Portal opens the paper as HTML. The 3D folder flies to the same rectangle on screen, so when the HTML takes over
  // nothing jumps: same place, same size, then the HTML cover swings open and the paper slides out.
  let lifted = null;
  const FOLDER_D = 0.36; // metres in front of your eyes: nearer than their head, so it never passes behind it
  function poseForRect(rect) {
    placeCamera();
    const tanH = Math.tan((camera.fov * Math.PI) / 360), aspect = innerWidth / innerHeight, perPx = (2 * FOLDER_D * tanH) / innerHeight;
    const bx = rect.left + rect.width / 2, by = rect.top + rect.height; // the folder's own origin is the middle of its bottom edge
    const p = V(((bx / innerWidth) * 2 - 1) * FOLDER_D * tanH * aspect, (-(by / innerHeight) * 2 + 1) * FOLDER_D * tanH, -FOLDER_D).applyMatrix4(camera.matrixWorld);
    const q = camera.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)));
    return { p, q, s: V((rect.width * perPx) / 0.24, (rect.height * perPx) / 0.17, (rect.width * perPx) / 0.24) };
  }
  function homeOf(f) { const from = { p: V(), q: new THREE.Quaternion(), s: V() }; f.updateMatrixWorld(true); f.matrixWorld.decompose(from.p, from.q, from.s); return from; }
  function folderOut(id, idx, rect) {
    const d = desks.get(id); if (!d || !d.folders) return Promise.resolve();
    const f = d.folders.folders[idx]; if (!f) return Promise.resolve();
    if (lifted && lifted.f !== f) settleFolder();
    if (RM()) return Promise.resolve();
    const from = lifted && lifted.f === f ? lifted.from : homeOf(f);
    if (!(lifted && lifted.f === f)) { f.userData.home = f.matrix.clone(); scene.attach(f); }
    const to = rect ? poseForRect(rect) : { p: camera.position.clone().addScaledVector(V(0, 0, -1).applyQuaternion(camera.quaternion), 0.62), q: camera.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, Math.PI, 0))), s: V(2.3, 2.3, 2.3) };
    const k0 = lifted && lifted.f === f ? lifted.k : 0; // picked up again on its way back: carry on from where it is
    lifted = { f, d, from, to, t0: T(), dur: 0.9 * (1 - k0 * 0.6), dir: 1, moving: true, k: k0, k0 };
    kick(); return new Promise((res) => (lifted.res = res));
  }
  function folderIn() {
    if (!lifted) return Promise.resolve();
    lifted.t0 = T(); lifted.dir = -1; lifted.k0 = lifted.k; lifted.dur = Math.max(0.3, 0.75 * lifted.k); lifted.moving = true; kick(); // from wherever it is now
    return new Promise((res) => (lifted.res = res));
  }
  // switching papers happens in the HTML; the 3D folder behind it is swapped without a flight
  function swapFolder(id, idx) {
    if (!lifted || RM()) return; const d = desks.get(id); if (!d || !d.folders) return;
    const f = d.folders.folders[idx]; if (!f || f === lifted.f) return;
    const at = lifted.to; settleFolder();
    f.userData.home = f.matrix.clone(); const from = homeOf(f); scene.attach(f);
    f.position.copy(at.p); f.quaternion.copy(at.q); f.scale.copy(at.s);
    lifted = { f, d, from, to: at, t0: T() - 9, dur: 0.9, dir: 1, moving: false, k: 1, k0: 0 }; invalidate();
  }
  function settleFolder() { // straight back into the tray
    if (!lifted) return; const L = lifted; L.d.folders.g.add(L.f); L.f.matrix.copy(L.f.userData.home); L.f.matrix.decompose(L.f.position, L.f.quaternion, L.f.scale); L.f.userData.hinge.rotation.x = 0; lifted = null;
  }
  function stepFolder(t) {
    if (!lifted || !lifted.moving) return;
    const L = lifted, k = clamp((t - L.t0) / L.dur), k0 = L.k0 || 0, e = L.dir > 0 ? k0 + (1 - k0) * ease(k) : k0 * (1 - ease(k));
    L.k = e;
    // out of the tray, up in an arc, turning to face you; it settles flat and square at the end so the paper can take over
    L.f.position.lerpVectors(L.from.p, L.to.p, e); L.f.position.y += Math.sin(e * Math.PI) * 0.05 * (L.dir > 0 ? 1 : 0.6);
    L.f.quaternion.slerpQuaternions(L.from.q, L.to.q, easeOut(clamp(e * 1.25)));
    L.f.scale.lerpVectors(L.from.s, L.to.s, e * e * (3 - 2 * e));
    L.f.userData.hinge.rotation.x = 0;
    if (k >= 1) {
      L.moving = false; const r = L.res; L.res = null;
      if (L.dir < 0) settleFolder();
      if (r) r();
    }
  }
  function hoverFolder(id, idx) { const d = desks.get(id); if (!d || !d.folders) return; d.folders.folders.forEach((f, i) => (f.userData.hover = i === idx)); if (idx >= 0 && d.a && d.a.look !== "sleep" && T() > d.hoverUntil) d.react = { kind: "glance", t0: T() }; kick(); }

  // ---------------- pointing at desks with the mouse ----------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let hoverId = null;
  function pick(ev) { ndc.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const hits = ray.intersectObjects([...desks.values()].map((d) => d.hit).concat([...ST.values()].filter((x) => x.on && x.grp.visible).map((x) => x.hit)), false); if (!hits.length) return null; const u = hits[0].object.userData; return u.station ? "st:" + u.station : u.desk; }
  function onMove(ev) {
    parallax.tx = (ev.clientX / innerWidth - 0.5) * 2; parallax.ty = (ev.clientY / innerHeight - 0.5) * -2;
    if (mode !== "floor" || flight || ev.target !== canvas) { if (hoverId) { hoverId = null; canvas.style.cursor = ""; } return; }
    const id = pick(ev); if (id !== hoverId) { hoverId = id; canvas.style.cursor = id ? "pointer" : ""; stHover = id && id.startsWith("st:") ? id.slice(3) : null; if (id && !stHover) hover(id); kick(); }
  }
  function onClick(ev) { if (mode !== "floor" || flight) return; const id = pick(ev); if (!id) return; if (id.startsWith("st:")) { if (opts.onStation) opts.onStation(id.slice(3)); } else if (opts.onPick) opts.onPick(id); }
  addEventListener("pointermove", onMove, { passive: true }); canvas.addEventListener("click", onClick);
  function hover(id) { const d = desks.get(id); if (!d || d.open || !d.a) return; const t = T(); if (d.hoverUntil < t) d.react = { kind: "wave", t0: t }; d.hoverUntil = t + 1.6; kick(); }

  // ---------------- frame ----------------
  let raf = 0, active = true, need = true, lastT = T(), held = false, ready = false; const bornT = T();
  const tStill = 3.2;
  function invalidate() { need = true; kick(); }
  function kick() { if (!raf && active) raf = requestAnimationFrame(loop); }
  function frame(t, dt) {
    if (window.PIP_TEST && window.PIP_TEST.prof) { window.PIP_TEST.prof.f0 = performance.now(); renderer.info.autoReset = false; renderer.info.reset(); }
    stepFlight(t); stepRings(t); stepFolder(t); stepConfetti(t, dt); stepArrive(t); stepStations(t);
    parallax.x = lerp(parallax.x, parallax.tx, 0.04); parallax.y = lerp(parallax.y, parallax.ty, 0.04);
    placeCamera(); sky();
    const kk = 1 - Math.exp(-dt * 9);
    for (const id of order) {
      const d = desks.get(id); if (!d || d.open || !d.a) continue;
      const a = d.a;
      if (!d.holo.visible) {
        const tgt = poseOf(d, t); if (!d.Y) d.Y = cloneY(tgt); else blendY(d.Y, tgt, RM() ? 1 : kk);
        const popK = d.pop.t0 < 0 ? 1 : clamp((t - d.pop.t0) / 0.55); let s = 0.3 * (popK >= 1 ? 1 : back(popK, 2.2));
        if (d.leaving) { const k = clamp((t - d.leaving) / 1.8); s *= 1 - ease(clamp((k - 0.45) / 0.55)); d.grp.scale.setScalar(1 - 0.08 * ease(clamp((k - 0.55) / 0.45))); if (k >= 1) d.grp.visible = false; }
        d.mate.root.scale.setScalar(Math.max(0.0001, s)); d.mate.apply(d.Y);
        const pr = d.pop.t0 < 0 ? 1 : clamp((t - d.pop.t0) / 0.7); d.popRing.material.opacity = pr > 0 && pr < 1 ? (1 - pr) * 0.9 : 0; d.popRing.scale.setScalar(0.4 + pr * 2.2);
      }
      const typing = a.look === "type" || (a.look === "work" && !(a.phone && ((t + (a.ph || 0) * 5) % 22) < 12));
      if (d.kb && typing) { d.kb.keys.forEach(([x, z], i) => { const hit = Math.sin(t * 23 + i * 7.3) > 0.93; km.setPosition(x, hit ? 0.0165 : 0.021, z); d.kb.inst.setMatrixAt(i, km); }); d.kb.inst.instanceMatrix.needsUpdate = true; }
      if (d.steam && d.steam[0].visible) d.steam.forEach((s, i) => { const k = (t * 0.28 + i / 3) % 1; s.position.set(Math.sin(t * 1.3 + i * 2) * 0.012, 0.1 + k * 0.17, 0); s.scale.set(0.8 + k * 0.7, 0.7 + k * 0.6, 1); s.material.opacity = Math.sin(k * Math.PI) * 0.45; s.quaternion.copy(camera.quaternion).premultiply(s.parent.getWorldQuaternion(tmpQ).invert()); });
      const onCall = d.Y && d.Y.micOn;
      d.rings.forEach((r, i) => { r.visible = !!onCall; if (!onCall) return; const k = (t * 0.9 + i / 3) % 1; d.mate.mic.getWorldPosition(tmpV); r.position.copy(d.grp.worldToLocal(tmpV)).add(tmpV2.set(0.03, 0, 0.05 + k * 0.08)); r.scale.setScalar(0.6 + k * 1.8); r.material.opacity = (1 - k) * 0.8; r.rotation.set(0, -0.6, Math.PI * 0.55); });
      if (d.qm.visible) { d.qm.position.set(-0.2, 1.68 + Math.sin(t * 2.2) * 0.025, 0.1); d.qm.quaternion.copy(camera.quaternion).premultiply(d.grp.getWorldQuaternion(tmpQ).invert()); d.qm.rotateZ(Math.sin(t * 1.6) * 0.12); }
      if (d.zs[0].visible) d.zs.forEach((z, i) => { const k = (t * 0.35 + i / 3) % 1; z.position.set(0.12 + k * 0.22, 1.42 + k * 0.42, 0.18); z.scale.setScalar(0.5 + k * 0.9); z.material.opacity = Math.sin(k * Math.PI) * 0.9; z.quaternion.copy(camera.quaternion).premultiply(d.grp.getWorldQuaternion(tmpQ).invert()); });
      if (a.light === "needs" && d.strip.visible) { const k = 0.6 + 0.4 * Math.sin(t * 3.2); d.strip.material.color.set(LIGHT.needs).multiplyScalar(4 + k * 5); d.pool.material.opacity = 0.25 + k * 0.25; } else d.pool.material.opacity = 0.42;
      if (d.holo.visible) {
        const h = -0.05 + Math.sin(t * 0.9) * 0.08; d.scan.position.y = h; const r = Math.sqrt(1 - h * h); d.scan.scale.set(r * 1.01, r * 1.01, 1); d.disc.position.y = h; d.disc.scale.set(r * 1.04, r * 1.04, 1);
        d.holo.rotation.y = t * 0.25; d.holo.position.y = 1.18 + Math.sin(t * 1.4) * 0.02; d.sparks.rotation.y = -t * 0.6; d.grp.updateMatrixWorld(true); d.cut.constant = V(0, h, 0).applyMatrix4(d.holo.matrixWorld).y;
      }
      if (d.folders) d.folders.folders.forEach((f, i) => { if (f === (lifted && lifted.f)) return; const up = f.userData.hover ? 1 : 0; f.userData.up = lerp(f.userData.up || 0, up, kk); f.position.y = 0.022 + f.userData.up * 0.05; f.rotation.x = -0.2 + i * 0.035 + f.userData.up * 0.22; });
    }
    // Pip
    const pt = pipPose(t); if (!P.Y) P.Y = cloneY(pt); else blendY(P.Y, pt, RM() ? 1 : kk);
    pip.root.scale.setScalar(PHONE() ? 0.26 : 0.25); pip.apply(P.Y);
    clip.position.set(-1.05, -0.78, 0.75); clip.rotation.set(-0.5, 0.45, 0.18);
    pip.root.visible = pipShadow.visible = mode === "floor" || !!flight;
    pipShadow.position.set(P.Y.pos.x, 0.005, P.Y.pos.z); pipShadow.scale.setScalar(0.85);
    dust.rotation.y = Math.sin(t * 0.03) * 0.05;
    scene.updateMatrixWorld(true); placeHud(t);
    if (bokeh) {
      bokeh.enabled = mode === "desk" && !flight;
      if (bokeh.enabled && focusId && desks.has(focusId)) { // focus on the monitor, pulled to the folder as it comes to you
        desks.get(focusId).mon.scr.getWorldPosition(tmpV); const toScreen = camera.position.distanceTo(tmpV);
        bokeh.uniforms.focus.value = lifted ? lerp(toScreen, FOLDER_D, lifted.k) : toScreen;
      }
    }
    if (reflector) reflector.visible = !(mode === "desk" && !flight); // over the shoulder the floor is out of shot
    const prof = window.PIP_TEST && window.PIP_TEST.prof, p0 = prof ? performance.now() : 0;
    if (composer) composer.render(); else renderer.render(scene, camera);
    if (prof) { renderer.getContext().finish(); prof.push({ js: p0 - prof.f0, gpu: performance.now() - p0, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, progs: renderer.info.programs.length, mode, tier, pr: renderer.getPixelRatio() }); }
    placeScreen(t, dt);
    if (scrK > 0.005) { syncCssCam(); css.render(cssScene, cssCam); }
  }
  const km = new THREE.Matrix4();
  function loop() {
    raf = 0; if (!active || document.hidden || !ready) return;
    const now = T(), dt = Math.min(0.05, now - lastT); lastT = now;
    const test = window.PIP_TEST, frozen = !!(test && test.freezeAfter != null && now - bornT > test.freezeAfter), manual = !!(test && test.now != null); // screenshots only
    const moving = !!flight || !!(lifted && lifted.moving);
    if (held && !moving && !need) { pc.last = 0; return; } // a paper covers the room: keep the last frame, draw nothing
    const animate = !RM() && !frozen && !manual && !held, live = animate || (manual && !RM() && !held);
    if (!live && !need && !moving) return;
    frame(RM() ? tStill : now, live || moving ? dt : 1); need = false;
    if (animate && !(test && !test.pace)) pace(); // test pages keep a fixed look unless they are testing the pacing
    if (animate || ((moving || need) && !manual)) raf = requestAnimationFrame(loop);
    if (manual) window.__officeFrame = (window.__officeFrame || 0) + 1;
  }
  // Keep it smooth: watch the real time between frames (what you actually see, GPU and page included). If frames run
  // long, draw fewer pixels first (the look stays the same, slightly softer), and only then drop an effect. Climb back
  // up when there is room, a few times at most, so it never see-saws.
  const pc = { last: 0, d: [], best: 1e9, ups: 0, climbs: 0, prev: 0, undo: null, locked: false };
  function pace() {
    const n = performance.now(), gap = pc.last ? n - pc.last : 0; pc.last = n;
    if (pc.locked || !gap || gap > 10000 || (enterT0 > 0 && T() - enterT0 < 1.2)) return; // a hidden tab resets the clock, so long gaps here are slow frames
    if (!pc.d.length) pc.t0 = n;
    pc.d.push(gap); if (pc.d.length < 48 && !(pc.d.length >= 8 && n - pc.t0 > 2000) && !(pc.d.length >= 3 && n - pc.t0 > 1500)) return; // 48 frames, or less time when frames are very slow
    const s = pc.d.sort((a, b) => a - b), med = s[s.length >> 1]; pc.d = [];
    if (med > 19) { // under about 52 frames a second
      const helped = !pc.undo || med < pc.prev * 0.94;
      if (!helped && Math.abs(med - 33.3) < 1.8) { pc.undo(); pc.locked = true; return; } // steady 30 a second whatever we do: a battery-saver cap, not a slow machine, so put the look back
      pc.ups = 0; pc.prev = med;
      if (prScale > 0.62 && helped) { const was = prScale; prScale = Math.max(0.6, +(prScale - 0.14).toFixed(2)); pc.undo = () => { prScale = was; buildFX(); resize(); }; buildFX(); resize(); }
      else if (tier !== "low") { // fewer pixels didn't help (or are already at the floor): drop an effect, at full sharpness
        const was = tier, wasPr = prScale; if (!helped && pc.undo) pc.undo(); tier = tier === "high" ? "mid" : "low"; prScale = helped ? prScale : Math.max(prScale, 1);
        pc.undo = () => { tier = was; prScale = wasPr; buildFX(); resize(); }; buildFX(); resize();
      }
      return;
    }
    pc.undo = null; pc.prev = 0; pc.best = Math.min(pc.best, Math.max(med, 6.5)); // about one refresh of this screen
    if (med <= pc.best * 1.08 && prScale < 1 && pc.climbs < 3 && ++pc.ups >= 5) { pc.ups = 0; pc.climbs++; prScale = Math.min(1, +(prScale + 0.14).toFixed(2)); buildFX(); resize(); }
  }
  let wasPhone = null;
  function resize() {
    if (wasPhone !== PHONE()) { wasPhone = PHONE(); for (const d of desks.values()) d.grp.position.x = d.grp.userData.side * sideX(); placeRings(); placeStations(); }
    renderer.setSize(innerWidth, innerHeight, false); css.setSize(innerWidth, innerHeight);
    if (composer) composer.setSize(innerWidth, innerHeight);
    if (reflector) reflector.getRenderTarget().setSize(Math.round(innerWidth * pr() * 0.5), Math.round(innerHeight * pr() * 0.5));
    hudDirty = true;
    if (!flight) setCam(mode === "desk" && focusId && desks.has(focusId) ? shotDesk(desks.get(focusId)) : mode === "station" && stationId && ST.has(stationId) ? shotStation(ST.get(stationId)) : shotFloor());
    skyHy = -1; if (cssObj && focusId) { const el = cssObj.element; mountScreen(focusId, el); } invalidate();
  }
  addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => { lastT = T(); pc.last = 0; pc.d = []; kick(); });

  // ---------------- keeping in step with the Portal ----------------
  function sync(model) {
    dim = !!model.dim;
    scene.fog.color.copy(dim ? FOG_DIM : FOG); hemi.intensity = dim ? 0.55 : 0.9; key.intensity = dim ? 2.2 : 3.6; endMat.color.setScalar(dim ? 1.2 : 2.4); seamMat.color.setScalar(dim ? 2 : 5); skyHy = -1;
    const ids = model.agents.map((a) => a.id).concat(["~open"]);
    const same = ids.length === order.length && ids.every((id, i) => id === order[i]);
    if (!same) { for (const d of desks.values()) dropDesk(d); desks.clear(); }
    model.agents.concat([{ id: "~open", look: "open", hex: "#9b86ff" }]).forEach((a, i) => {
      let d = desks.get(a.id); if (!d) { d = makeDesk(a, i); desks.set(a.id, d); if (enterT0 > 0 && T() - enterT0 > 1) d.pop.t0 = T(); }
      const prev = d.a; d.a = a; applyLook(d);
      if (prev && !d.open) {
        if (prev.look === "sleep" && a.look !== "sleep") d.react = { kind: "wake", t0: T() };
        else if (prev.look !== "sleep" && a.look === "sleep") d.react = { kind: "drowse", t0: T() };
        else if (prev.light !== "working" && a.light === "working") d.react = { kind: "cheer", t0: T() };
      }
    });
    order = ids;
    placeStations();
    const sm = model.stations || {};
    meter.extra.frac = clamp(sm.meter ? sm.meter.frac : 0, 0, 1); meter.extra.warn = !!(sm.meter && sm.meter.warn);
    setToolBlocks(sm.tools || []); syncCables(sm.cables || []);
    loft.on = loft.grp.visible = !!sm.founder;
    stTagEls.clear(); for (const [id, el] of sm.tags || []) stTagEls.set(id, el);
    tagEls.clear(); for (const [id, el] of model.tags || []) tagEls.set(id, el);
    if (bubRO && bubbleEl !== (model.bubble || null)) { if (bubbleEl) bubRO.unobserve(bubbleEl); if (model.bubble) bubRO.observe(model.bubble); }
    bubbleEl = model.bubble || null; hudDirty = true; hudHidden = false;
    const was = P.point; P.point = model.pipPoint || null; if (P.point !== was) P.pointAt = T();
    invalidate();
  }

  buildFX(); resize();
  const readyP = (async () => {
    await new Promise((r) => setTimeout(r, 0));
    setCam(shotEnter()); placeCamera();
    const hidden = []; scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); } catch (e) { /* compiled on first use instead */ }
    for (const o of hidden) o.visible = false;
    if (composer) { // the post passes, depth of field included, rendered once off screen
      const was = bokeh ? bokeh.enabled : false; if (bokeh) bokeh.enabled = true; composer.renderToScreen = false;
      try { composer.render(); } catch (e) { /* ignore */ }
      composer.renderToScreen = true; if (bokeh) bokeh.enabled = was;
    }
    ready = true; invalidate();
  })();
  return {
    ready: readyP,
    hold(on) { held = !!on; if (!held) { lastT = T(); invalidate(); } },
    swapFolder,
    sync, enter, invalidate, mountScreen, folderOut, folderIn, hoverFolder, hover,
    step() { if (window.PIP_TEST && window.PIP_TEST.now != null) { need = true; cancelAnimationFrame(raf); loop(); } }, // tests only: render one frame at PIP_TEST.now
    get mode() { return mode; }, get tier() { return tier; }, layer: css.domElement,
    get debug() { return window.PIP_TEST ? { scene, renderer, camera, THREE, get held() { return held; }, get prScale() { return prScale; }, get pace() { return JSON.parse(JSON.stringify({ ...pc, d: pc.d.length })); }, get lifted() { return lifted ? { k: lifted.k, moving: lifted.moving, dir: lifted.dir } : null; }, reshoot() { if (focusId) { setCam(shotDesk(desks.get(focusId))); if (cssObj) mountScreen(focusId, cssObj.element); } } } : null; }, // tests only
    floor() { const was = mode; mode = "floor"; focusId = null; stationId = null; stHover = null; settleFolder(); return fly(shotFloor(), was === "station" ? 0.95 : 1.35, was === "station" ? 0.15 : 0.5); },
    station(id) { const s = ST.get(id); if (!s || !s.on) return Promise.resolve(); if (mode === "station" && stationId === id && !flight) return Promise.resolve(); const was = mode; mode = "station"; stationId = id; focusId = null; settleFolder(); return fly(shotStation(s), was === "floor" ? 0.85 : 1.1, was === "floor" ? 0.12 : 0.4); },
    letGo(id) { const d = desks.get(id); if (!d || d.open || d.leaving) return; d.leaving = T(); d.react = { kind: "wave", t0: T() }; burst(V(0, 1.4, 0.4).applyMatrix4(d.grp.matrixWorld)); kick(); }, // ready for the day "Let go" is wired to the backend
    get station_() { return stationId; },
    desk(id) { const d = desks.get(id); if (!d || d.open) return Promise.resolve(); const was = mode; mode = "desk"; focusId = id; d.react = { kind: "wave", t0: T() + (was === "floor" ? 0.2 : 0) }; d.hoverUntil = 0; return fly(shotDesk(d), was === "floor" ? 1.6 : 1.5, was === "floor" ? 0.55 : 0.75, was === "desk"); },
    setActive(on) { active = !!on; canvas.style.display = on ? "" : "none"; css.domElement.style.display = on ? "" : "none"; if (on) { lastT = T(); invalidate(); } },
    pip: {
      mood(m) { P.mood = m || "calm"; kick(); }, talk(sec) { P.talkUntil = T() + sec; kick(); }, happy(s = 1.4) { P.happyUntil = T() + s; kick(); }, nod() { P.nodAt = T(); kick(); },
      hop() { P.hopAt = T(); kick(); }, wave() { P.waveAt = T(); P.happyUntil = T() + 1.8; kick(); }, trouble() { P.troubleAt = T(); kick(); },
      party() { P.hopAt = T(); P.happyUntil = T() + 2.4; const at = mode === "desk" && focusId && desks.has(focusId) ? V(0, 1.6, 0.6).applyMatrix4(desks.get(focusId).grp.matrixWorld) : pip.root.position.clone().add(V(0, 0.3, 0)); burst(at); for (const d of desks.values()) if (d.a && (d.a.look === "work" || d.a.look === "type" || d.a.look === "idle")) d.react = { kind: "cheer", t0: T() + Math.random() * 0.4 }; },
    },
    dispose() { active = false; cancelAnimationFrame(raf); removeEventListener("resize", resize); removeEventListener("pointermove", onMove); renderer.dispose(); canvas.remove(); css.domElement.remove(); },
  };
}

