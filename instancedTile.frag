// instancedTile.frag
#ifdef GL_ES
precision mediump float;
#endif

varying vec3 vColor; // Received color from vertex shader
void main() {
  gl_FragColor = vec4(vColor, 1.0); // Output the instance color
} 