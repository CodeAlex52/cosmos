export const VS_QUAD = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPos;

out vec2 vUv;
out vec2 vNdc;

void main() {
	vNdc = aPos;
	vUv = aPos * 0.5 + 0.5;
	gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const FS_NEBULA = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec2 vNdc;

uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uTime;
uniform float uDaylight;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform float uWarp;

out vec4 fragColor;

float hash31(vec3 p) {
	p = fract(p * vec3(443.8975, 397.2973, 491.1871));
	p += dot(p, p.yxz + 19.19);
	return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);

	float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
	float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

	float nx00 = mix(n000, n100, f.x);
	float nx10 = mix(n010, n110, f.x);
	float nx01 = mix(n001, n101, f.x);
	float nx11 = mix(n011, n111, f.x);
	return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

float fbm3(vec3 p) {
	float v = 0.0;
	float a = 0.5;
	mat3 rot = mat3(
		0.80, -0.60, 0.0,
		0.48,  0.64, -0.60,
		0.36,  0.48,  0.80
	);
	for (int i = 0; i < 3; i++) {
		v += a * noise3(p);
		p = rot * p * 2.08 + vec3(1.7, 9.2, 4.1);
		a *= 0.5;
	}
	return v;
}

void main() {
	vec3 rd = normalize(
		uCamFwd +
		vNdc.x * uAspect * uTanHalfFov * uCamRight +
		vNdc.y * uTanHalfFov * uCamUp
	);
	float band = exp(-pow(rd.y * 2.2 + rd.x * 0.55 - 0.12, 2.0) * 3.8);

	if (uDaylight < 0.5) {
		// ---- 夜间深空星云（单分支 3-octave FBM）----
		vec3 p = rd * 2.4 + vec3(uTime * 0.008, -uTime * 0.005, uTime * 0.004);
		float q = fbm3(p);
		float neb = fbm3(p * 1.45 + vec3(q * 1.4, -q * 1.1, q * 0.8));
		float dustCloud = smoothstep(0.30, 0.82, neb);

		vec3 nightCol = vec3(0.014, 0.010, 0.030);
		nightCol += uTintA * pow(dustCloud, 1.5) * (0.30 + 0.44 * band);
		nightCol += uTintB * smoothstep(0.46, 0.90, q * neb) * (0.24 + 0.36 * band);

		float radial = length(vNdc);
		nightCol += mix(uTintA, vec3(0.7, 0.82, 1.0), 0.5) * uWarp * 0.06 * smoothstep(0.25, 1.2, radial);
		fragColor = vec4(nightCol, 1.0);
	} else {
		// ---- 白昼宣纸水墨晕染（精细纸纹留给全分辨率合成 pass）----
		vec2 paperUv = vUv * vec2(uAspect, 1.0);
		float fiberA = fbm3(vec3(paperUv * 16.0, 1.2));
		float wash = fbm3(vec3(rd.xy * 2.3 + vec2(0.0, uTime * 0.005), 3.7));
		float inkWash = smoothstep(0.45, 0.83, wash) * (0.45 + 0.55 * band);

		vec3 paperBase = vec3(0.937, 0.914, 0.863);
		vec3 paperWarm = vec3(0.908, 0.878, 0.816);
		vec3 dayCol = mix(paperWarm, paperBase, 0.5 + 0.5 * fiberA);
		dayCol -= vec3(0.055, 0.048, 0.042) * inkWash;
		fragColor = vec4(dayCol, 1.0);
	}
}`;

export const VS_STARS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in float aSize;
layout(location = 2) in vec3 aColor;
layout(location = 3) in vec4 aMeta; // x=phase, y=normR, z=starClass(0 norm, 1 hero, 2 core), w=orbitalSpeed

uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec3 uCam;
uniform float uPointScale;
uniform float uTime;
uniform float uFade;
uniform float uTwinkle;
uniform vec2 uRange;
uniform float uDiffSpin;
uniform vec3 uCursorWorld;
uniform float uCursorForce;
uniform float uCharge;
uniform vec3 uWaveOrigin;
uniform float uWaveRadius;
uniform float uWaveStrength;
uniform float uWarp;
uniform float uIsStarfield;
uniform float uMaxPointSize;

out vec3 vColor;
out float vAlpha;
out float vKind;
out float vFlare;

void main() {
	vec3 localPos = aPos;

	// 差动旋转：星系内圈公转快、外圈慢，形成真实旋臂剪切
	if (uIsStarfield < 0.5) {
		float ang = uTime * uDiffSpin * aMeta.w;
		float ca = cos(ang);
		float sa = sin(ang);
		localPos.xy = vec2(localPos.x * ca - localPos.y * sa, localPos.x * sa + localPos.y * ca);
	}

	vec4 world = uModel * vec4(localPos, 1.0);
	float flare = 0.0;

	// 光标三维引力漩涡与蓄力坍缩
	if (uIsStarfield < 0.5 && uCursorForce > 0.001) {
		vec3 toCur = uCursorWorld - world.xyz;
		float cd = length(toCur);
		float inf = exp(-cd * cd * 2.7) * uCursorForce;
		if (inf > 0.002) {
			vec3 tang = normalize(vec3(-toCur.y, toCur.x, 0.25) + 1e-4);
			float pull = 0.14 + uCharge * 0.42;
			world.xyz += toCur * (inf * pull) + tang * (inf * (0.12 + uCharge * 0.22));
			world.z += sin(cd * 10.0 - uTime * 4.5) * inf * 0.04;
			flare += inf * (0.55 + uCharge * 1.25);
		}
	}

	// 超新星三维冲击波球壳
	if (uWaveStrength > 0.001) {
		vec3 fromW = world.xyz - uWaveOrigin;
		float wd = length(fromW);
		float ring = exp(-pow((wd - uWaveRadius) * 2.5, 2.0)) * uWaveStrength;
		if (ring > 0.002) {
			vec3 dir = wd > 0.001 ? fromW / wd : vec3(0.0, 0.0, 1.0);
			float amp = uIsStarfield > 0.5 ? 0.08 : 0.26;
			world.xyz += dir * (ring * amp);
			world.z += ring * 0.09;
			flare += ring * 1.45;
		}
	}

	float dist = max(length(world.xyz - uCam), 0.08);
	float farFade = 1.0 - smoothstep(uRange.x, uRange.y, dist);
	float nearFade = smoothstep(0.16, 1.12, dist);
	float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * 1.85 + aMeta.x * 71.3));
	float alpha = uFade * tw * farFade * nearFade;

	// 不可见粒子提前剔除，避免多余栅格化
	if (alpha < 0.004) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		gl_PointSize = 0.0;
		vAlpha = 0.0;
		vColor = vec3(0.0);
		vKind = 0.0;
		vFlare = 0.0;
		return;
	}

	gl_Position = uViewProj * world;

	float sizeBoost = 1.0 + clamp(flare * 0.48, 0.0, 0.9) + uWarp * 0.28;
	float px = aSize * sizeBoost * uPointScale / dist;
	gl_PointSize = clamp(px, 0.7, uMaxPointSize);

	vColor = aColor;
	vAlpha = alpha;
	vKind = aMeta.z;
	vFlare = flare;
}`;

export const FS_STARS = `#version 300 es
precision highp float;

in vec3 vColor;
in float vAlpha;
in float vKind;
in float vFlare;

uniform float uDaylight;

out vec4 fragColor;

void main() {
	vec2 c = gl_PointCoord - 0.5;
	float d = dot(c, c);
	if (d > 0.25) discard;

	// 高斯 Airy 核：中心锐利、光晕自然
	float core = max(exp(-d * 34.0) - exp(-8.5), 0.0);

	// 亮星与冲击波爆发星渲染四芒星光学衍射星芒
	float hero = (vKind > 0.75 && vKind < 1.5) ? 1.0 : 0.0;
	float spikeMask = clamp(hero + vFlare * 0.65, 0.0, 1.35);
	float spikes = 0.0;
	if (spikeMask > 0.05) {
		float sx = exp(-abs(c.y) * 34.0) * exp(-abs(c.x) * 6.0);
		float sy = exp(-abs(c.x) * 34.0) * exp(-abs(c.y) * 6.0);
		spikes = (sx + sy) * 0.52 * spikeMask * smoothstep(0.25, 0.04, d);
	}

	float shape = core + spikes;
	float v = shape * vAlpha;

	if (uDaylight > 0.5) {
		vec3 ink = mix(vec3(0.095, 0.105, 0.125), vColor * 0.54, 0.22);
		ink = mix(ink, vec3(0.68, 0.36, 0.14), clamp(vFlare * 0.55, 0.0, 0.85));
		float a = clamp(v * 0.88, 0.0, 1.0);
		fragColor = vec4(ink * a, a);
	} else {
		vec3 col = mix(vColor, vec3(1.0, 0.93, 0.78), clamp(vFlare * 0.45 + core * 0.22, 0.0, 0.85));
		float boost = 1.0 + vFlare * 0.85;
		fragColor = vec4(col * v * boost, v);
	}
}`;

export const FS_DUST = `#version 300 es
precision mediump float;

in vec3 vColor;
in float vAlpha;
in float vKind;
in float vFlare;

out vec4 fragColor;

void main() {
	vec2 c = gl_PointCoord - 0.5;
	float d = dot(c, c);
	if (d > 0.25) discard;

	float a = max(exp(-d * 12.0) - exp(-3.0), 0.0);
	fragColor = vec4(vColor, a * vAlpha * 0.075);
}`;

export const VS_METEOR = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPos;
layout(location = 1) in float aAlpha;
layout(location = 2) in float aHead;

uniform mat4 uViewProj;

out float vAlpha;
out float vHead;

void main() {
	gl_Position = uViewProj * vec4(aPos, 1.0);
	vAlpha = aAlpha;
	vHead = aHead;
}`;

export const FS_METEOR = `#version 300 es
precision mediump float;

in float vAlpha;
in float vHead;

uniform float uDaylight;

out vec4 fragColor;

void main() {
	if (uDaylight > 0.5) {
		vec3 ink = mix(vec3(0.16, 0.17, 0.2), vec3(0.58, 0.34, 0.14), vHead);
		float a = clamp(vAlpha * 0.52, 0.0, 1.0);
		fragColor = vec4(ink * a, a);
	} else {
		vec3 tailCol = vec3(0.55, 0.78, 1.0);
		vec3 headCol = vec3(1.0, 0.92, 0.72);
		vec3 col = mix(tailCol, headCol, vHead);
		fragColor = vec4(col * vAlpha * (0.9 + vHead * 1.4), vAlpha);
	}
}`;

// 硬件双线性插值 5-tap 高斯（等效 9-tap，无循环无 exp）
export const FS_BLUR = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec2 vNdc;

uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uThreshold;

out vec4 fragColor;

void main() {
	vec3 col =
		texture(uTex, vUv).rgb * 0.22702703 +
		texture(uTex, vUv + uDir * 1.38461538).rgb * 0.31621622 +
		texture(uTex, vUv - uDir * 1.38461538).rgb * 0.31621622 +
		texture(uTex, vUv + uDir * 3.23076923).rgb * 0.07027027 +
		texture(uTex, vUv - uDir * 3.23076923).rgb * 0.07027027;

	if (uThreshold > 0.0) {
		float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
		col *= smoothstep(uThreshold, uThreshold + 0.42, lum);
	}
	fragColor = vec4(col, 1.0);
}`;

export const FS_COMPOSITE = `#version 300 es
precision highp float;

in vec2 vUv;
in vec2 vNdc;

uniform sampler2D uScene;
uniform sampler2D uNebula;
uniform sampler2D uBloomA;
uniform sampler2D uBloomB;
uniform float uBloomStrength;
uniform vec2 uResolution;
uniform float uDaylight;
uniform float uWarp;
uniform float uWaveStrength;
uniform float uTime;

out vec4 fragColor;

vec3 aces(vec3 x) {
	const float a = 2.51;
	const float b = 0.03;
	const float c = 2.43;
	const float d = 0.59;
	const float e = 0.14;
	return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

void main() {
	vec3 neb = texture(uNebula, vUv).rgb;
	vec2 dir = vUv - 0.5;
	float edgeDist = length(dir);

	if (uDaylight >= 0.5) {
		// 白昼宣纸全分辨率纤维微噪 + Porter-Duff 预乘墨迹合成
		float fiberB = hash21(floor(vUv * 480.0));
		neb += (fiberB - 0.5) * 0.015;

		vec4 sc = texture(uScene, vUv);
		vec3 base = sc.rgb + neb * (1.0 - clamp(sc.a, 0.0, 1.0));

		vec2 p = dir * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
		float vigDay = 1.0 - smoothstep(0.62, 1.55, length(p)) * 0.08;
		vec3 col = base * vigDay;

		float n = fract(sin(dot(vUv * uResolution, vec2(12.9898, 78.233))) * 43758.5453);
		col += (n - 0.5) * 0.008;

		fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
		return;
	}

	float caAmt = (uWarp * 0.0045 + uWaveStrength * 0.0032) * smoothstep(0.15, 0.85, edgeDist);
	vec3 starCol;
	if (caAmt > 0.0001) {
		vec2 off = dir * caAmt;
		float r = texture(uScene, clamp(vUv + off, 0.0, 1.0)).r;
		float g = texture(uScene, vUv).g;
		float b = texture(uScene, clamp(vUv - off, 0.0, 1.0)).b;
		starCol = vec3(r, g, b);
	} else {
		starCol = texture(uScene, vUv).rgb;
	}

	vec3 base = neb + starCol;
	vec3 bloomTight = texture(uBloomA, vUv).rgb;
	vec3 bloomWide = texture(uBloomB, vUv).rgb;

	// 横向变形镜头高光带
	vec3 anamorphic = (
		texture(uBloomB, clamp(vUv + vec2(0.018, 0.0), 0.0, 1.0)).rgb +
		texture(uBloomB, clamp(vUv - vec2(0.018, 0.0), 0.0, 1.0)).rgb
	) * 0.16;

	vec3 bloom = (bloomTight * 0.58 + bloomWide * 0.78 + anamorphic) * uBloomStrength;

	vec2 p = dir * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
	float vigNight = 1.0 - smoothstep(0.58, 1.42, length(p)) * 0.42;

	vec3 col = aces((base + bloom) * vigNight * 1.15);

	float n = fract(sin(dot(vUv * uResolution + fract(uTime * 13.7), vec2(12.9898, 78.233))) * 43758.5453);
	col += (n - 0.5) * 0.012;

	fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
