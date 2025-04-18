// Basic pass-through vertex shader for p5.js WEBGL mode

// Vertex attributes (provided by p5.js)
attribute vec3 aPosition; // Vertex position
attribute vec2 aTexCoord; // Texture coordinate

// Uniforms (provided by p5.js)
uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix;

// Varying variable to pass texture coordinate to fragment shader
varying vec2 vTexCoord;

varying vec2 vPixelCoord;

void main() {
  // Calculate the position of the vertex in screen space
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);

  // Pass the texture coordinate to the fragment shader
  vTexCoord = aTexCoord;

  // Pass the vertex position (model space) for potential calculations
  vPixelCoord = aPosition.xy; 

} 