// blur.frag
#ifdef GL_ES
// precision mediump float;
precision highp float; // Use high precision
#endif

varying vec2 vTexCoord;

uniform sampler2D u_inputTex; // Texture to be blurred
uniform vec2 u_texelSize;     // Size of one pixel: (1.0/width, 1.0/height)
uniform vec2 u_blurDirection; // Direction of blur: (1.0, 0.0) for horizontal, (0.0, 1.0) for vertical

/* --- Standard Gaussian Blur Logic --- */ 
// Gaussian weights for 5 taps (approximate) - defined as individual constants
const float WEIGHT_0 = 0.227027;
const float WEIGHT_1 = 0.316216;
const float WEIGHT_2 = 0.070270;

/* --- Max Brightness Propagation Logic --- */ 

void main() {
  vec2 uv = vTexCoord;
  vec2 tx = u_texelSize;

  // Sample current pixel and neighbors
  vec4 current = texture2D(u_inputTex, uv);
  vec4 neighborN = texture2D(u_inputTex, uv + vec2(0.0,  tx.y));
  vec4 neighborS = texture2D(u_inputTex, uv + vec2(0.0, -tx.y));
  vec4 neighborE = texture2D(u_inputTex, uv + vec2( tx.x, 0.0));
  vec4 neighborW = texture2D(u_inputTex, uv + vec2(-tx.x, 0.0));

  // Find the maximum brightness (Red channel) among ACTIVE neighbors (Alpha > 0)
  float maxBrightness = current.r; // Start with current brightness
  float currentAlpha = current.a; 

  if (neighborN.a > 0.0) { maxBrightness = max(maxBrightness, neighborN.r); }
  if (neighborS.a > 0.0) { maxBrightness = max(maxBrightness, neighborS.r); }
  if (neighborE.a > 0.0) { maxBrightness = max(maxBrightness, neighborE.r); }
  if (neighborW.a > 0.0) { maxBrightness = max(maxBrightness, neighborW.r); }

  // If maxBrightness is greater than current, update brightness and set alpha to 1
  float newAlpha = currentAlpha;
  if (maxBrightness > current.r) {
      newAlpha = 1.0; // Mark as active if we adopted a neighbor's max
  }
  // Keep alpha at 1 if it was already 1 (original seed or previously activated)
  if (currentAlpha > 0.0) {
    newAlpha = 1.0;
  }

  // Output the max brightness found, keep G/B zero, update alpha
  gl_FragColor = vec4(maxBrightness, 0.0, 0.0, newAlpha);
} 