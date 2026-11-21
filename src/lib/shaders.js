export const VS = `#version 300 es
precision highp float;

in vec3 aPos;
in float aSize;
in vec3 aColor;
in float aSeed;

uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec3 uCam;
uniform float uPointScale;
uniform float uTime;
uniform float uFade;
uniform float uTwinkle;
uniform vec2 uRange;

out vec3 vColor;
out float vAlpha;

void main() {
	vec4 world = uModel * vec4(aPos, 1.0);
	gl_Position = uViewProj * world;

	float dist = max(length(world.xyz - uCam), 0.08);
	float px = aSize * uPointScale / dist;
	gl_PointSize = clamp(px, 0.7, 90.0);

	float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * 1.7 + aSeed * 71.3));
	// 太远的点淡出，避免远景糊成一片
	float farFade = 1.0 - smoothstep(uRange.x, uRange.y, dist);
	// 太近的点也淡出
	float nearFade = smoothstep(0.15, 1.1, dist);

	vColor = aColor;
	vAlpha = uFade * tw * farFade * nearFade;
}`;

export const FS = `#version 300 es
precision highp float;

in vec3 vColor;
in float vAlpha;
uniform float uDaylight;
out vec4 fragColor;

void main() {
	vec2 c = gl_PointCoord - 0.5;
	float d = dot(c, c);
	if (d > 0.25) discard;

	// 高斯核，中心锐、边缘柔
	float a = exp(-d * 30.0) - exp(-7.5);
	a = max(a, 0.0);

	float v = a * vAlpha;

	if (uDaylight > 0.5) {
		// 白昼：星点变成宣纸上的墨痕，保留一点原色相
		vec3 ink = mix(vec3(0.115, 0.118, 0.132), vColor * 0.58, 0.22);
		fragColor = vec4(ink, v * 0.84);
	} else {
		fragColor = vec4(vColor * v, v);
	}
}`;

// 尘埃用正常混合：叠在星系上做暗带
export const FS_DUST = `#version 300 es
precision highp float;

in vec3 vColor;
in float vAlpha;
out vec4 fragColor;

void main() {
	vec2 c = gl_PointCoord - 0.5;
	float d = dot(c, c);
	if (d > 0.25) discard;

	float a = exp(-d * 12.0) - exp(-3.0);
	a = max(a, 0.0);

	fragColor = vec4(vColor, a * vAlpha * 0.07);
}`;

// 全屏四边形，用于后期叠加
export const VS_QUAD = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main() {
	vUv = aPos * 0.5 + 0.5;
	gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// 亮部提取 + 水平/垂直模糊共用（方向由 uDir 控制）
export const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uThreshold;

void main() {
	// 9-tap 高斯
	vec3 sum = vec3(0.0);
	float wsum = 0.0;
	for (int i = -4; i <= 4; i++) {
		float w = exp(-float(i * i) / 8.0);
		vec3 c = texture(uTex, vUv + uDir * float(i)).rgb;
		sum += c * w;
		wsum += w;
	}
	vec3 col = sum / wsum;

	// 第一次（水平 pass）做阈值提取
	if (uThreshold > 0.0) {
		float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
		col *= smoothstep(uThreshold, uThreshold + 0.35, lum);
	}
	fragColor = vec4(col, 1.0);
}`;

export const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform vec2 uResolution;

void main() {
	vec3 base = texture(uScene, vUv).rgb;
	vec3 bloom = texture(uBloom, vUv).rgb;

	// 暗角
	vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
	float vig = 1.0 - smoothstep(0.55, 1.35, length(p));

	vec3 col = base + bloom * uBloomStrength;
	col *= vig;

	// 指数色调映射：高光收敛但保留层次，不会糊成一块白
	col = vec3(1.0) - exp(-col * 1.12);

	// 颗粒
	float n = fract(sin(dot(vUv * uResolution, vec2(12.9898, 78.233))) * 43758.5453);
	col += (n - 0.5) * 0.012;

	fragColor = vec4(col, 1.0);
}`;
