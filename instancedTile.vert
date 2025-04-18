// instancedTile.vert
#ifdef GL_ES
precision mediump float;
#endif

// Attributes for the base circle geometry (same for all instances)
attribute vec3 aPosition; // Base vertex position (e.g., points on a unit circle)

// Attributes for per-instance data (different for each ellipse)
attribute vec2 aInstanceOffset; // XY offset (center position) for this instance
attribute float aInstanceRadius; // Radius (used for scaling) for this instance
attribute vec3 aInstanceColor;  // RGB color for this instance

// Uniforms (standard p5 WEBGL uniforms)
uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewMatrix; // p5 handles camera/view transforms here

// Varying to pass color to fragment shader
varying vec3 vColor;

void main() {
  // Scale the base vertex position by the instance radius
  // Since aPosition is likely 2D for a circle, use vec2
  vec2 scaledPos = aPosition.xy * aInstanceRadius;

  // Add the instance offset
  vec2 finalPos = scaledPos + aInstanceOffset;

  // Calculate final screen position
  // Pass z=0 and w=1.0 for standard 2D projection
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(finalPos, 0.0, 1.0);

  // Pass the instance color to the fragment shader
  vColor = aInstanceColor;
} 