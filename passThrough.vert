// passThrough.vert
#ifdef GL_ES
precision mediump float;
#endif

// Default p5 attributes
attribute vec3 aPosition;
attribute vec2 aTexCoord;

varying vec2 vTexCoord;

// Default p5 uniforms
uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;

void main() {
  // Flip the Y-coordinate when passing texture coords
  vTexCoord = vec2(aTexCoord.x, 1.0 - aTexCoord.y);
  
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
} 