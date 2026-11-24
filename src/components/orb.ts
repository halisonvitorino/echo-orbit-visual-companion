// Browser-only: imported dynamically after mount.
import * as THREE from "three";

export type OrbInput = { rms: number; bands: number[]; state: string };

const noise = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}`;

export function createOrb(canvas: HTMLCanvasElement, read: () => OrbInput) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 4.2;

  const uniforms = {
    uTime: { value: 0 }, uAmp: { value: 0 }, uLow: { value: 0 }, uHigh: { value: 0 },
    uHue: { value: 0 },
  };
  const vert = `${noise}
  uniform float uTime,uAmp,uLow,uHigh; varying float vD; varying vec3 vN;
  void main(){
    vec3 p=position; float t=uTime*0.35;
    float n=snoise(p*1.4+t)*(0.08+uLow*0.55)+snoise(p*4.0-t*2.)*(0.02+uHigh*0.25);
    p+=normal*n*(1.0+uAmp*1.5); vD=n; vN=normalize(normalMatrix*normal);
    vec4 mv=modelViewMatrix*vec4(p,1.); gl_PointSize=(1.6+uAmp*2.5)*(4.0/-mv.z); gl_Position=projectionMatrix*mv;
  }`;
  const frag = `uniform float uAmp,uHue; varying float vD; varying vec3 vN;
  void main(){
    float d=length(gl_PointCoord-.5); if(d>.5) discard;
    float k=clamp(vD*2.+.5,0.,1.);
    vec3 orange=vec3(1.0,0.45,0.1), violet=vec3(0.55,0.2,1.0), cyan=vec3(0.2,0.85,1.0);
    vec3 c=mix(mix(orange,violet,k),cyan,uHue);
    float rim=pow(1.-abs(vN.z),1.5);
    float a=(0.35+rim*0.65)*(1.-d*2.)*(0.7+uAmp*0.8);
    gl_FragColor=vec4(c*(1.0+uAmp),a);
  }`;
  const geo = new THREE.IcosahedronGeometry(1, 64);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  const wire = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: vert,
    fragmentShader: `uniform float uAmp; void main(){gl_FragColor=vec4(0.7,0.35,1.0,0.04+uAmp*0.08);}`,
    wireframe: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(points, wire);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  resize(); window.addEventListener("resize", resize);

  const clock = new THREE.Clock(); let raf = 0;
  const s = { amp: 0, low: 0, high: 0, hue: 0 };
  const loop = () => {
    const dt = clock.getDelta(); const inp = read();
    const b = inp.bands.length ? inp.bands : [0];
    const half = Math.max(1, Math.floor(b.length / 2));
    const low = b.slice(0, half).reduce((a, v) => a + v, 0) / half;
    const high = b.slice(half).reduce((a, v) => a + v, 0) / Math.max(1, b.length - half);
    const lerp = (c: number, n: number, f: number) => c + (n - c) * f;
    s.amp = lerp(s.amp, inp.rms, 0.2); s.low = lerp(s.low, low, 0.2); s.high = lerp(s.high, high, 0.2);
    s.hue = lerp(s.hue, inp.state === "listening" ? 1 : 0, 0.05);
    const speed = inp.state === "thinking" ? 3 : 1 + s.amp * 3;
    uniforms.uTime.value += dt * speed;
    uniforms.uAmp.value = s.amp; uniforms.uLow.value = s.low; uniforms.uHigh.value = s.high; uniforms.uHue.value = s.hue;
    const breathe = 1 + Math.sin(clock.elapsedTime * 1.2) * 0.015 + s.amp * 0.12;
    points.scale.setScalar(breathe); wire.scale.setScalar(breathe);
    points.rotation.y += dt * (0.08 + s.amp * 0.4); wire.rotation.y = points.rotation.y;
    renderer.render(scene, camera); raf = requestAnimationFrame(loop);
  };
  loop();
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); renderer.dispose(); geo.dispose(); };
}
