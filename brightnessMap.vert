/* brightnessMap.vert */
#ifdef GL_ES
precision mediump float;
#endif

// Attribute for quad vertex positions (passed directly)
attribute vec2 aPosition; // Values will be -1.0 to 1.0

// Varying to pass screen-space coordinates to fragment shader
varying vec2 vScreenCoord;

void main() {
  // Output the clip-space position (no transformation needed for full-screen quad)
  gl_Position = vec4(aPosition, 0.0, 1.0);

  // Convert vertex position from clip space (-1 to 1) to screen space (0 to 1)
  // and pass to fragment shader.
  vScreenCoord = aPosition * 0.5 + 0.5;
} 