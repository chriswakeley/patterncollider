/* brightnessMap.frag */
#ifdef GL_ES
precision highp float; // Use high precision for calculations
precision highp int;   // Use high precision for loop counters
#endif

// Varying input from vertex shader
varying vec2 vScreenCoord; // Screen coordinates (0.0 to 1.0)

// Uniforms
uniform sampler2D uTilePositions; // Texture with tile XY pixel coords (packed in RGBA)
uniform sampler2D uTileData;      // Texture with tile minDistance (packed in RGBA, use R)
uniform int uTileCount;           // Number of active tiles
uniform vec2 uScreenSize;         // Canvas dimensions in pixels
uniform float uInterpolationPower;  // Power for inverse distance weighting (e.g., 2.0)

// Constants
const float EPSILON = 1e-60; // Small value to avoid division by zero
const float TEXTURE_SIZE = 128.0; // Must match JS: Texture dimensions (TEXTURE_SIZE x TEXTURE_SIZE)
const float MAX_BRIGHTNESS_CLAMP = 50.0; // Clamp max brightness to avoid extreme values

// Helper function to get texture coordinates for 1D index in 2D texture
vec2 getTexCoord(int index) {
    float i_float = float(index);
    float row = floor(i_float / TEXTURE_SIZE);
    float col = mod(i_float, TEXTURE_SIZE);
    // Add 0.5 to sample center of texel
    return vec2((col + 0.5) / TEXTURE_SIZE, (row + 0.5) / TEXTURE_SIZE);
}

void main() {
  // Get current fragment coordinate in pixels (origin top-left)
  // vScreenCoord is 0-1 (bottom-left origin), need to flip Y for pixel coords
  vec2 fragCoordPixels = vec2(vScreenCoord.x, 1.0 - vScreenCoord.y) * uScreenSize;

  float totalWeight = 0.0;
  float totalBrightness = 0.0;
  float maxTileCount = min(float(uTileCount), TEXTURE_SIZE * TEXTURE_SIZE); // Ensure we don't exceed texture bounds

  for (int i = 0; i < 16384; i++) { // Max iterations based on TEXTURE_SIZE*TEXTURE_SIZE
      if (i >= uTileCount) {
          break; // Exit loop if we've processed all active tiles
      }

      vec2 texCoord = getTexCoord(i);
      
      // Sample tile data
      vec4 posData = texture2D(uTilePositions, texCoord);
      vec2 tilePosPixels = posData.xy; // Position stored in R, G
      
      vec4 data = texture2D(uTileData, texCoord);
      float tileBrightness = data.r; // minDistance stored in R
      
      // --- Interpolation --- 
      float dist = distance(fragCoordPixels, tilePosPixels);

      if (dist < EPSILON) { 
          totalBrightness = tileBrightness;
          totalWeight = 1.0;
          break; // We are exactly at a tile center
      }
      
      // Inverse distance weighting
      // Clamp distance to avoid extremely large weights near centers
      //float weight = 1.0 / pow(max(dist, 1.0), uInterpolationPower);
      float weight = 1.0 /(pow(dist + 1.0, uInterpolationPower) * pow(tileBrightness, -2.0));
      
      totalBrightness += weight * tileBrightness;
      //totalBrightness += tileBrightness * 0.001;
      totalWeight += weight;
  }

  // Calculate final brightness and handle division by zero
  float finalBrightness = (totalWeight > EPSILON) ? totalBrightness / totalWeight : 0.0;
  
  // --- Normalization / Scaling ---
  // The raw minDistance values might be large. We need to scale them to a 0-1 range.
  // Option 1: Simple clamp and scale (requires knowing typical range)
  // finalBrightness = clamp(finalBrightness / MAX_BRIGHTNESS_CLAMP, 0.0, 1.0);
  
  // Option 2: Normalize based on some factor (e.g., related to canvas size or zoom) 
  // This needs adjustment based on visual results. Let's try a simple division.
  finalBrightness = 1.0 - clamp(finalBrightness / 100.0, 0.0, 1.0); // Arbitrary scaling factor

  // Output final grayscale color
  gl_FragColor = vec4(vec3(finalBrightness), 1.0);
} 