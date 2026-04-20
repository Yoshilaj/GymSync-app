// Self-contained HTML for the AI visualizer WebView.
// Three.js is loaded from CDN — requires network on first load.
export const visualizerHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
canvas { display: block; }
</style>
</head>
<body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>
<script>
// ── Vertex shader: 3D Simplex noise displacement ──────────────────────────
const VERT = \`
  uniform float uTime;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  vec3 _m289(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 _m289v(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 _perm(vec4 x){return _m289v(((x*34.)+1.)*x);}
  vec4 _tis(vec4 r){return 1.79284291400159-0.85373472095314*r;}

  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);
    const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy));
    vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);
    vec3 l=1.-g;
    vec3 i1=min(g.xyz,l.zxy);
    vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;
    vec3 x2=x0-i2+C.yyy;
    vec3 x3=x0-D.yyy;
    i=_m289(i);
    vec4 p=_perm(_perm(_perm(
      i.z+vec4(0.,i1.z,i2.z,1.))
      +i.y+vec4(0.,i1.y,i2.y,1.))
      +i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=.142857142857;
    vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);
    vec4 y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy;
    vec4 y=y_*ns.x+ns.yyyy;
    vec4 h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);
    vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.;
    vec4 s1=floor(b1)*2.+1.;
    vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
    vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);
    vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z);
    vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=_tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
    m=m*m;
    return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  void main(){
    float amplitude = 0.10 + uIntensity * 0.22;
    // Displacement = Noise(Position * Scale + Time) * Amplitude
    float noise = snoise(position * 1.6 + uTime * 0.35);
    vec3 displaced = position + normal * (noise * amplitude);
    vec4 viewPos = viewMatrix * modelMatrix * vec4(displaced, 1.0);
    vViewDir = normalize(-viewPos.xyz);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewPos;
  }
\`;

// ── Fragment shader: Fresnel glow + light-blue gradient ───────────────────
const FRAG = \`
  uniform vec3 uColorCore;
  uniform vec3 uColorEdge;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main(){
    float NdotV = max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
    float fresnel = pow(1.0 - NdotV, 2.8);
    vec3 color = mix(uColorCore, uColorEdge, fresnel);
    // Edge bloom: brighten rim on intensity spikes
    color += uColorEdge * fresnel * (0.4 + uIntensity * 0.7);
    float alpha = 0.72 + fresnel * 0.28;
    gl_FragColor = vec4(color, alpha);
  }
\`;

// ── Scene setup ───────────────────────────────────────────────────────────
const scene   = new THREE.Scene();
const camera  = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
camera.position.z = 2.8;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);

const uniforms = {
  uTime:      { value: 0.0 },
  uIntensity: { value: 0.0 },
  uColorCore: { value: new THREE.Color('#2E90EA') },
  uColorEdge: { value: new THREE.Color('#E9F2FD') },
};

const mesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 64),
  new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true })
);
scene.add(mesh);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

// ── Animation loop ────────────────────────────────────────────────────────
let rafId = null;

function tick() {
  rafId = requestAnimationFrame(tick);
  uniforms.uTime.value      += 0.007;
  uniforms.uIntensity.value *= 0.90;   // smooth decay
  mesh.rotation.y           += 0.0018;
  renderer.render(scene, camera);
}
tick();

// Called by RN via injectJavaScript when AppState changes
function pauseAnimation() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}
function resumeAnimation() {
  if (rafId === null) tick();
}

// ── Audio reactivity ──────────────────────────────────────────────────────
let audioCtx = null, analyser = null, micStream = null;
let simTimer  = null;
let _simT = 0;

// Called by React Native via injectJavaScript to drive orb from AI TTS level
function setIntensity(v) {
  uniforms.uIntensity.value = Math.min(Math.max(v, 0), 1);
}

function measureRMS() {
  if (!analyser) return;
  const buf = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  uniforms.uIntensity.value = Math.min(Math.sqrt(sum / buf.length) * 5.0, 1.0);
  requestAnimationFrame(measureRMS);
}

function simulatePulse() {
  _simT += 0.07;
  uniforms.uIntensity.value = (Math.sin(_simT) * 0.5 + 0.5) * 0.75;
  simTimer = setTimeout(simulatePulse, 40);
}

// Auto-start: try mic, fall back to simulation
(async function startAudio() {
  try {
    audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser  = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    measureRMS();
  } catch (_) {
    simulatePulse();
  }
})();
</script>
</body>
</html>`;
