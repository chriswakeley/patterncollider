/* brightnessMap.frag */
#ifdef GL_ES
precision highp float;
precision highp int;
#endif

// Varyings
varying vec2 vScreenCoord;

// Uniforms
uniform sampler2D uTilePositions;   // Tile XY pixel coords (RG channels)
uniform sampler2D uTileData;        // Tile minDistance (R channel)
uniform sampler2D uTileDirections1; // First line direction vectors (RG channels)
uniform sampler2D uTileDirections2; // Second line direction vectors (RG channels)
uniform int uTileCount;
uniform vec2 uScreenSize;
uniform float uInterpolationPower;  // Currently unused
uniform vec3 uColor1;               // First direction color (RGB)

// Constants
const float EPSILON = 1e-60;
const float TEXTURE_SIZE = 128.0;
const float INV_TEXTURE_SIZE = 1.0 / 128.0;
const float TEXTURE_CENTER_OFFSET = 0.5;
const int MAX_ITERATIONS = 16384; // TEXTURE_SIZE * TEXTURE_SIZE

// Precomputed constants for performance
const float DIRECTION_SCALE = 30.0;
const float ANGLE_WEIGHT_SCALE = 0.02;
const float BRIGHTNESS_SCALE = 0.000001; // 1.0 / 100.0

// Convert 1D index to 2D texture coordinates
vec2 getTexCoord(int index) {
    float indexFloat = float(index);
    float row = floor(indexFloat * INV_TEXTURE_SIZE);
    float col = indexFloat - row * TEXTURE_SIZE;
    return vec2(
        (col + TEXTURE_CENTER_OFFSET) * INV_TEXTURE_SIZE,
        (row + TEXTURE_CENTER_OFFSET) * INV_TEXTURE_SIZE
    );
}

void main() {
    // Convert normalized coords to pixel coords (flip Y for top-left origin)
    vec2 fragCoordPixels = vec2(vScreenCoord.x, 1.0 - vScreenCoord.y) * uScreenSize;

    // Accumulation variables
    float totalWeight1 = 0.0;
    float totalBrightness1 = 0.0;
    float totalWeight2 = 0.0;
    float totalBrightness2 = 0.0;

    // Process all active tiles
    for (int i = 0; i < MAX_ITERATIONS; i++) {
        if (i >= uTileCount) break;

        vec2 texCoord = getTexCoord(i);
        
        // Sample all textures at once
        vec2 tilePosPixels = texture2D(uTilePositions, texCoord).xy;
        float tileBrightness = texture2D(uTileData, texCoord).r;
        vec2 bisectorLarge = texture2D(uTileDirections1, texCoord).xy;  // Already the large angle bisector
        vec2 bisectorSmall = texture2D(uTileDirections2, texCoord).xy;  // Already the small angle bisector

        // Calculate distance to tile
        float dist = distance(fragCoordPixels, tilePosPixels);

        // Calculate directional alignment with bisectors
        vec2 fragToTile = normalize(tilePosPixels - fragCoordPixels);
        float alignLarge = abs(dot(fragToTile, bisectorLarge));
        float alignSmall = abs(dot(fragToTile, bisectorSmall));

        // Calculate angle-based weights
        float angleWeight1 = -1.0 * log(alignLarge - 0.001);
        float angleWeight2 = -1.0 * log(alignSmall - 0.001);
        
        // Calculate distance weights with angle modulation
        //float brightnessSquared = tileBrightness * tileBrightness;
        float distanceFactor = dist * dist + 2.0 * dist + 1.0;
        
        float weight1 = tileBrightness * pow(angleWeight1, 10.0);
        float weight2 = tileBrightness * pow(angleWeight2, 10.0);
        
        // Accumulate weighted values
        totalBrightness1 += weight1 / (distanceFactor);
        
        totalBrightness2 += weight2 / (distanceFactor);
    }

    // Calculate final brightness values with safe division
    float finalBrightness1 = totalBrightness1;
    float finalBrightness2 = totalBrightness2;
    
    // Normalize and invert brightness (dark to light)
    finalBrightness1 = clamp(finalBrightness1 * BRIGHTNESS_SCALE, 0.0, 1.0);
    finalBrightness2 = clamp(finalBrightness2 * BRIGHTNESS_SCALE, 0.0, 1.0);

    // Calculate complementary color (when added to uColor1 gives white)
    vec3 color2 = vec3(1.0) - uColor1;
    
    // Blend the two colors based on their brightness values
    vec3 finalColor = uColor1 * finalBrightness1 + color2 * finalBrightness2;

    // Output final color
    gl_FragColor = vec4(finalColor, 1.0);
}