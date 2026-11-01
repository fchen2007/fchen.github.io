/**
 * 云间列车 · 首页动态 Banner ("Up in the Cloud Sea")
 *
 * 原作: mdb — https://www.shadertoy.com/view/Ndc3zl  (CC BY-NC-SA 3.0)
 * 单 Pass 移植: Tianxiu (Tyson) Zhou — https://github.com/choutianxius/csce646-digital-image
 * 本文件: 由 WorkBuddy 适配 Hexo/Fluid 首页 banner，蓝噪声纹理降采样为 256x256。
 *
 * 行为:
 *  - 仅首页生效；手机端 (<768px) / prefers-reduced-motion / 不支持 WebGL2 时保持静态头图
 *  - 自适应降分辨率: 帧耗时超标时先降渲染比例，仍不行则整体退回静态头图
 *  - 页面切后台 / banner 滚出视口时暂停渲染
 */
(function () {
  'use strict';

  // ---------- 生效条件 ----------
  // 全站所有页面（首页/关于/友链/归档/分类/标签页等）都显示，因每页都有 #banner
  // 注：仍保留对系统“减弱动效(prefers-reduced-motion)”的尊重——用户主动关闭动效时不渲染

  var banner = document.getElementById('banner');
  if (!banner) return;

  // 静态头图 fallback：banner.ejs 默认已用「与云海场景接近的渐变」作预载底色，
  // 这里是“再退一步”——仅在无法渲染 WebGL 动画时挂上静态壁纸(default.png)，
  // 避免硬刷新瞬间或降级时露出渐变/空白。
  function showStaticFallback() {
    banner.style.backgroundImage = "url('/img/default.png')";
    banner.style.backgroundRepeat = 'no-repeat';
    banner.style.backgroundPosition = 'center center';
    banner.style.backgroundSize = 'cover';
  }

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) { showStaticFallback(); return; }

  var MOBILE = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
  // 手机端同样显示；但用更低分辨率比例与 DPR 上限以控发热/耗电

  var gl = null;
  try {
    gl = document.createElement('canvas').getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
  } catch (e) { showStaticFallback(); } // 不支持 WebGL2：保持静态壁纸
  if (!gl) { showStaticFallback(); return; }

  // ---------- Shader 源码 ----------
  var NOISE_SIZE_STR = '256.0'; // 蓝噪声纹理尺寸（字符串形式，保持 GLSL 浮点字面量），须与 /img/cloud-sea-noise.png 一致
  var FRAG = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec3 iResolution;',
    'uniform float iTime;',
    'uniform sampler2D iChannel0;',
    'out vec4 outColor;',
    // ---- 以下改编自 Tianxiu Zhou 的单 Pass 移植版（基于 mdb 的 Shadertoy 作品 Ndc3zl）----
    'float noise(vec2 x){',
    '    vec2 f = fract(x);',
    '    vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);',
    '    vec2 p = floor(x);',
    '    float a = texture(iChannel0, (p+vec2(0.0,0.0))/' + NOISE_SIZE_STR + ').x;',
    '    float b = texture(iChannel0, (p+vec2(1.0,0.0))/' + NOISE_SIZE_STR + ').x;',
    '    float c = texture(iChannel0, (p+vec2(0.0,1.0))/' + NOISE_SIZE_STR + ').x;',
    '    float d = texture(iChannel0, (p+vec2(1.0,1.0))/' + NOISE_SIZE_STR + ').x;',
    '    return a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y;',
    '}',
    'float fbm(vec2 x, int detail){',
    '    float a = 0.0; float b = 1.0; float t = 0.0;',
    '    for(int i = 0; i < detail; i++){',
    '        float n = noise(x);',
    '        a += b*n; t += b; b *= 0.7; x *= 2.0;',
    '    }',
    '    return a/t;',
    '}',
    'float fbm2(vec2 x, int detail){',
    '    float a = 0.0; float b = 1.0; float t = 0.0;',
    '    for(int i = 0; i < detail; i++){',
    '        float n = noise(x);',
    '        a += b*n; t += b; b *= 0.9; x *= 2.0;',
    '    }',
    '    return a/t;',
    '}',
    'float box(vec2 uv, float x1, float x2, float y1, float y2){',
    '    return (uv.x > x1 && uv.x < x2 && uv.y > y1 && uv.y < y2)?1.0:0.0;',
    '}',
    '#define dot2(v) dot(v, v)',
    '#define layer(dh, v)  if (uv.y < h + midlevel - (dh) ) return vec4(v, 1.);',
    'vec4 foreground(vec2 uv, float t){',
    '    float midlevel; float h; float disp; float dist; vec2 uv2;',
    '    uv.y -= 0.2;',
    '    midlevel = -0.1; disp = 1.7; dist = 1.0;',
    '    uv2 = uv + vec2(t/dist + 40.0, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.12, vec3(0.43, 0.32, 0.31));',
    '    layer(0.08, vec3(0.55, 0.42, 0.41));',
    '    layer(0.04, vec3(0.66, 0.42, 0.40));',
    '    layer(0., vec3(0.77, 0.48, 0.46));',
    '    midlevel = 0.05; disp = 1.7; dist = 2.0;',
    '    uv2 = uv + vec2(t/dist + 38.0, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.1, vec3(0.95, 0.66, 0.48));',
    '    layer(0.04, vec3(0.98, 0.76, 0.64));',
    '    layer(0., vec3(0.95, 0.80, 0.77));',
    '    return vec4(0.95, 0.80, 0.77, 0.);',
    '}',
    'vec4 background(vec2 uv, float t){',
    '    float midlevel; float h; float disp; float dist; vec2 uv2;',
    '    midlevel = 0.3; disp = 0.9; dist = 10.0;',
    '    uv2 = uv + vec2(t/dist + 32.5, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.14, vec3(0.48, 0.19, 0.20));',
    '    layer(0.1, vec3(0.68, 0.28, 0.19));',
    '    layer(0.07, vec3(0.88, 0.38, 0.24));',
    '    layer(0., vec3(0.95, 0.45, 0.30));',
    '    midlevel = 0.35; disp = 1.0; dist = 15.0;',
    '    uv2 = uv + vec2(t/dist + 30.0, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.04, vec3(0.98, 0.76, 0.64));',
    '    layer(0., vec3(0.95, 0.80, 0.77));',
    '    midlevel = 0.35; disp = 3.5; dist = 20.0;',
    '    uv2 = uv + vec2(t/dist + 27.5, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.12, vec3(0.43, 0.32, 0.31));',
    '    layer(0.08, vec3(0.55, 0.42, 0.41));',
    '    layer(0.04, vec3(0.66, 0.42, 0.40));',
    '    layer(0., vec3(0.77, 0.48, 0.46));',
    '    midlevel = 0.45; disp = 2.0; dist = 25.0;',
    '    uv2 = uv + vec2(t/dist + 23.0, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.04, vec3(0.98, 0.57, 0.36));',
    '    layer(0., vec3(1.0, 0.62, 0.44));',
    '    midlevel = 0.5; disp = 2.3; dist = 30.0;',
    '    uv2 = uv + vec2(t/dist + 20.5, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.12, vec3(0.41, 0.27, 0.27));',
    '    layer(0.08, vec3(0.53, 0.35, 0.32));',
    '    layer(0.04, vec3(0.80, 0.24, 0.17));',
    '    layer(0., vec3(0.99, 0.29, 0.20));',
    '    midlevel = 0.5; disp = 2.5; dist = 35.0;',
    '    uv2 = uv + vec2(t/dist + 18.0, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.1, vec3(0.88, 0.38, 0.24));',
    '    layer(0.05, vec3(0.98, 0.42, 0.28));',
    '    layer(0., vec3(1.0, 0.48, 0.35));',
    '    midlevel = 0.6; disp = 2.0; dist = 40.0;',
    '    uv2 = uv + vec2(t/dist + 18.0, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.1, vec3(0.95, 0.66, 0.48));',
    '    layer(0., vec3(1.0, 0.76, 0.60));',
    '    midlevel = 0.75; disp = 3.5; dist = 45.0;',
    '    uv2 = uv + vec2(t/dist + 15.5, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.2, vec3(1.0, 0.55, 0.33));',
    '    layer(0.15, vec3(0.98, 0.50, 0.24));',
    '    layer(0.1, vec3(0.90, 0.55, 0.40));',
    '    layer(0., vec3(1.0, 0.62, 0.44));',
    '    midlevel = 0.7; disp = 2.7; dist = 50.0;',
    '    uv2 = uv + vec2(t/dist + 12.0, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.04, vec3(0.73, 0.36, 0.30));',
    '    layer(0., vec3(0.80, 0.40, 0.34));',
    '    midlevel = 0.8; disp = 2.7; dist = 60.0;',
    '    uv2 = uv + vec2(t/dist + 9.5, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.1, vec3(0.93, 0.58, 0.35));',
    '    layer(0., vec3(1.0, 0.76, 0.60));',
    '    midlevel = 0.9; disp = 3.0; dist = 70.0;',
    '    uv2 = uv + vec2(t/dist + 7.0, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.1, vec3(0.56, 0.25, 0.22));',
    '    layer(0.05, vec3(0.60, 0.30, 0.27));',
    '    layer(0., vec3(0.74, 0.35, 0.30));',
    '    midlevel = 1.0; disp = 5.0; dist = 100.0;',
    '    uv2 = uv + vec2(t/dist + 3.5, 0.0);',
    '    h = (fbm(uv2, 8) - 0.5)*disp;',
    '    layer(0.1, vec3(0.92, 0.85, 0.82));',
    '    layer(0., vec3(1.0, 0.94, 0.91));',
    '    return vec4(0.58, 0.7, 1.0, 1.);',
    '}',
    'vec3 genRaster( vec2 uv ) {',
    '    float t = sin(1.2 * iTime) + 4. * iTime;',
    '    vec4 bg = background(uv, t);',
    '    vec4 fg = vec4(0.);',
    '    int n = 5;',
    '    if (uv.y < 0.5)',
    '    for (int i = 0; i < n; i++){',
    '        fg += foreground(uv, t+4.*float(i)/float(n)/60.) / (float(n));',
    '    }',
    '    vec3 col = bg.rgb;',
    '    float k; float midlevel; float h; float disp; float dist; vec2 uv2;',
    '    uv.y -= 0.2;',
    '    k = 1.0;',
    '    uv2 = fract(uv*9.0);',
    '    float wagon = 1.0;',
    '    wagon *= 1.0 - step(0.45, uv.x);',
    '    wagon *= 1.0 - step(0.115, uv.y);',
    '    wagon *= step(0.103, uv.y);',
    '    wagon *= step(0.05, 1.0 - abs(uv2.x*2.0 - 1.0));',
    '    float join = 1.0;',
    '    join *= 1.0 - step(0.45, uv.x);',
    '    join *= 1.0 - step(0.11, uv.y);',
    '    join *= step(0.107, uv.y);',
    '    float roof = 1.0;',
    '    roof *= 1.0 - step(0.45, uv.x);',
    '    roof *= 1.0 - step(0.117, uv.y);',
    '    roof *= step(0.11, uv.y);',
    '    roof *= step(0.15, 1.0 - abs(uv2.x*2.0 - 1.0));',
    '    float loco = box(uv, 0.45, 0.5, 0.103, 0.112);',
    '    float chem1 = box(uv, 0.49, 0.495, 0.103, 0.12);',
    '    float chem2 = box(uv, 0.488, 0.496, 0.12, 0.123);',
    '    float locoRoof = box(uv, 0.443, 0.47, 0.11, 0.117);',
    '    float wheel = 1.0 - step(0.00004, dot2(uv - vec2(0.457, 0.106)));',
    '    wheel += 1.0 - step(0.00002, dot2(uv - vec2(0.487, 0.105)));',
    '    wheel += 1.0 - step(0.00002, dot2(uv - vec2(0.497, 0.105)));',
    '    if (uv.x < 0.45 && uv.y > 0.025 && uv.y < 0.2){',
    '        wheel += 1.0 - step(0.002, dot2(uv2 - vec2(0.2, 0.95)));',
    '        wheel += 1.0 - step(0.002, dot2(uv2 - vec2(0.8, 0.95)));',
    '    }',
    '    col = mix(col, vec3(0.18, 0.12, 0.15), join);',
    '    col =  mix(col, vec3(0.48, 0.19, 0.20), wagon);',
    '    col = mix(col, vec3(0.18, 0.12, 0.15), roof);',
    '    col = mix(col, vec3(0.38, 0.19, 0.20), loco);',
    '    col = mix(col, vec3(0.38, 0.19, 0.20), chem1);',
    '    col = mix(col, vec3(0.18, 0.12, 0.15), locoRoof);',
    '    col = mix(col, vec3(0.18, 0.12, 0.15), chem2 + wheel);',
    '    dist = 5.0;',
    '    uv2 = uv + vec2(t/dist + 3.5, 0.0);',
    '    uv2.x -= t/dist*0.2;',
    '    h = fbm2(uv2, 8) - 0.55;',
    '    if(uv.x < 0.49){',
    '        float x = -uv.x + 0.49;',
    '        float y = abs(uv.y + h*0.4 - 0.16*sqrt(x) - 0.12) - 0.8*x*exp(-x*10.0);',
    '        if(y < 0.0) col = vec3(1.0, 0.94, 0.91);',
    '        if(y < - 0.02) col = vec3(0.92, 0.85, 0.82);',
    '    }',
    '    dist = 5.0;',
    '    uv2 = uv + vec2(t/dist + 32.5, 0.0);',
    '    uv2.x = fract(uv2.x*3.0);',
    '    k = 1.0;',
    '    k *= smoothstep(0.001, 0.003, abs(uv2.y - pow(uv2.x - 0.5, 2.0)*0.15 - 0.12));',
    '    k *= min(step(0.05, 1.0 - abs(uv2.x*2.0 - 1.0))',
    '         +   step(0.17, uv2.y), 1.0);',
    '    k *= min(smoothstep(0.02, 0.05, 1.0 - abs(uv2.x*2.0 - 1.0))',
    '         +   step(0.177, uv2.y), 1.0);',
    '    k *= min(step(0.1, uv2.y)',
    '           + smoothstep(-0.09, -0.085, -uv2.y - 0.001/(1.0 - abs(uv2.x*2.0 - 1.0))), 1.0);',
    '    k *= min(smoothstep(0.05, 0.2, 1.0 - abs(fract(uv2.x*16.0)*2.0 - 1.0))',
    '         +   step(0.12, uv2.y - pow(uv2.x - 0.5, 2.0)*0.15)',
    '         +   step(-0.1, -uv2.y), 1.0);',
    '    col = mix(vec3(0.29, 0.09, 0.08)*smoothstep(-0.08, 0.08, uv.y), col, k);',
    '    col = mix(col, fg.rgb, fg.a);',
    '    return col;',
    '}',
    'vec3 vignettCorrection( vec3 col, vec2 uv ) {',
    '    vec3 col1 = col;',
    '    col1 *= 0.5 + 0.5 * pow( 16.0*uv.x*uv.y*(1.0-uv.x)*(1.0-uv.y), 0.2 );',
    /* 原作这里还有一行整体曝光脉动：
         col1 *= 1.3 + 0.4 * cos(0.5 * (iTime + 3.14));
       它让画面亮度在 0.9x~1.7x 之间以约 12.6 秒为周期反复起伏，
       既会让人觉得"忽明忽暗"，峰值还会过曝。已移除，保持恒定亮度（1.0x）。 */
    '    return col1;',
    '}',
    'void mainImage( out vec4 fragColor, in vec2 fragCoord ) {',
    '    vec2 uvGen = fragCoord/iResolution.y;',
    '    vec3 col = genRaster( uvGen );',
    '    vec2 uvVignett = fragCoord/iResolution.xy;',
    '    col = vignettCorrection( col, uvVignett);',
    '    fragColor = vec4(col, 1.0);',
    '}',
    'void main() {',
    '    vec4 fragColor;',
    '    mainImage(fragColor, gl_FragCoord.xy);',
    '    outColor = fragColor;',
    '}'
  ].join('\n');

  var VERT = [
    '#version 300 es',
    'precision highp float;',
    'const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));',
    'void main(){ gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0); }'
  ].join('\n');

  // ---------- 编译 ----------
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[cloud-sea] shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[cloud-sea] link error:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);
  var uRes = gl.getUniformLocation(prog, 'iResolution');
  var uTime = gl.getUniformLocation(prog, 'iTime');
  gl.uniform1i(gl.getUniformLocation(prog, 'iChannel0'), 0);

  // ---------- 蓝噪声纹理 ----------
  var texReady = false;
  var noiseImg = new Image();
  noiseImg.onload = function () {
    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, noiseImg);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    texReady = true;
    start(); // 纹理就绪后唤起渲染循环（若 start 早于纹理加载被调用过）
  };
  noiseImg.onerror = function () {
    console.error('[cloud-sea] 蓝噪声纹理加载失败，回退静态头图');
    showStaticFallback();
    dispose();
  };
  noiseImg.src = '/img/cloud-sea-noise.png';

  // ---------- Canvas & 渲染循环 ----------
  var canvas = gl.canvas;
  canvas.id = 'cloud-sea-canvas';
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  banner.insertBefore(canvas, banner.firstChild);

  var renderScale = MOBILE ? 0.5 : 0.75;   // 手机端从更低分辨率起步以控耗电

  // 跨页面动画续接：把动画时刻存进 sessionStorage，新页面从上一页离开时刻继续跑，
  // 避免整页导航时列车/亮度相位“从头开始”造成的跳变。sessionStorage 按标签页隔离，关页即重置。
  var CLOCK_KEY = 'cloudSeaElapsed';
  var seed = 0;
  try { seed = parseFloat(sessionStorage.getItem(CLOCK_KEY)) || 0; } catch (e) {}
  var startTime = performance.now() - seed * 1000;
  var rafId = 0;
  var running = false;
  var inView = true;
  var frameCount = 0;
  var frameTimeSum = 0;
  var degradedOnce = false;

  function resize() {
    var w = banner.clientWidth, h = banner.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2);
    canvas.width = Math.max(2, Math.round(w * dpr * renderScale));
    canvas.height = Math.max(2, Math.round(h * dpr * renderScale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function frame() {
    rafId = 0;
    if (!running || !texReady) return;
    var t0 = performance.now();
    gl.uniform3f(uRes, canvas.width, canvas.height, 1.0);
    gl.uniform1f(uTime, (t0 - startTime) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 跨页面续接：每 16 帧把当前动画时刻存回 sessionStorage（导航离开时 pagehide 再精确存一次）
    if ((frameCount & 15) === 0) {
      try { sessionStorage.setItem(CLOCK_KEY, ((t0 - startTime) / 1000).toString()); } catch (e) {}
    }
    // 自适应降级：连续统计帧耗时，过重则降分辨率，仍不行则退回静态头图
    frameCount++;
    frameTimeSum += performance.now() - t0;
    if (frameCount === 120) {
      var avg = frameTimeSum / frameCount;
      if (avg > 24 && !degradedOnce) {
        degradedOnce = true;
        renderScale = 0.5;
        frameCount = 0; frameTimeSum = 0;
        resize();
      } else if (avg > (MOBILE ? 45 : 30)) {
        dispose();
        return;
      }
    }
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running || !texReady) return;
    running = true;
    if (!rafId) rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }
  function dispose() {
    stop();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    if (observer) observer.disconnect();
    if (resizeObs) resizeObs.disconnect();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVis);
  }
  function onVis() { document.hidden ? stop() : (inView && start()); }
  function saveClock() {
    try { sessionStorage.setItem(CLOCK_KEY, ((performance.now() - startTime) / 1000).toString()); } catch (e) {}
  }
  // 离开/隐藏页面时精确记录动画时刻，保证下一页无缝续接
  window.addEventListener('pagehide', saveClock);
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveClock(); });

  var observer = null;
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(function (entries) {
      inView = entries[0].intersectionRatio > 0.02;
      inView && !document.hidden ? start() : stop();
    }, { threshold: [0, 0.02, 0.5] });
    observer.observe(banner);
  }

  // banner 尺寸变化时重算 canvas 分辨率（软导航切换到不同高度的 banner 时防止拉伸模糊）
  var resizeObs = null;
  if ('ResizeObserver' in window) {
    resizeObs = new ResizeObserver(function () { resize(); });
    resizeObs.observe(banner);
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVis);
  start();
})();
