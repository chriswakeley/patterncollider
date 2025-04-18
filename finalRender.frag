// finalRender.frag
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 vTexCoord;

uniform sampler2D u_smoothedTex; // Input texture (initialDistFieldTex)
uniform float u_maxDistValue;    // (Currently unused)
uniform vec2 u_texelSize;        // Texel size needed for blurring

// Gaussian kernel weights for 3x3 (normalized)
// 1 2 1
// 2 4 2 
// 1 2 1   Sum = 16
const float W0 = 4.0/16.0; // Center
const float W1 = 2.0/16.0; // Cardinal neighbors (N, S, E, W)
const float W2 = 1.0/16.0; // Diagonal neighbors (NE, NW, SE, SW)

void main() {
  // --- Perform 9-Tap Gaussian Blur --- 
  vec2 uv = vTexCoord;
  vec2 offsetN = vec2(0.0,  u_texelSize.y);
  vec2 offsetS = vec2(0.0, -u_texelSize.y);
  vec2 offsetE = vec2( u_texelSize.x, 0.0);
  vec2 offsetW = vec2(-u_texelSize.x, 0.0);

  vec4 sum = vec4(0.0);

  // Center
  sum += texture2D(u_smoothedTex, uv) * W0;
  // Cardinal Neighbors
  sum += texture2D(u_smoothedTex, uv + offsetN) * W1;
  sum += texture2D(u_smoothedTex, uv + offsetS) * W1;
  sum += texture2D(u_smoothedTex, uv + offsetE) * W1;
  sum += texture2D(u_smoothedTex, uv + offsetW) * W1;
  // Diagonal Neighbors
  sum += texture2D(u_smoothedTex, uv + offsetN + offsetE) * W2; // NE
  sum += texture2D(u_smoothedTex, uv + offsetN + offsetW) * W2; // NW
  sum += texture2D(u_smoothedTex, uv + offsetS + offsetE) * W2; // SE
  sum += texture2D(u_smoothedTex, uv + offsetS + offsetW) * W2; // SW

  // Extract the smoothed red channel value (our brightness)
  float displayValue = clamp(sum.r, 0.0, 1.0); // Clamp just in case
  
  // Map the value to brightness (with slight amplification)
  float amplifiedValue = clamp(displayValue * 2.0, 0.0, 1.0); 
  gl_FragColor = vec4(vec3(amplifiedValue), 1.0); 
  /* */

  // --- DEBUG: Visualize Alpha Channel (Commented out) ---
  // float alphaValue = texture2D(u_smoothedTex, vTexCoord).a;
  // gl_FragColor = vec4(vec3(alphaValue), 1.0);
  // --------------------------------------

  // Example: Map to opacity (white color, varying opacity)
  // gl_FragColor = vec4(1.0, 1.0, 1.0, displayValue);
  
  // Example: Use as mix factor between two colors
  // vec3 colorA = vec3(0.0, 0.0, 1.0); // Blue
  // vec3 colorB = vec3(1.0, 1.0, 0.0); // Yellow
  // gl_FragColor = vec4(mix(colorA, colorB, displayValue), 1.0);
} 