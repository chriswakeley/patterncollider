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
const float BRIGHTNESS_SCALE = 0.01; // 1.0 / 100.0

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
        vec2 direction1 = texture2D(uTileDirections1, texCoord).xy;
        vec2 direction2 = texture2D(uTileDirections2, texCoord).xy;
        
        // Calculate distance to tile
        float dist = distance(fragCoordPixels, tilePosPixels);
        
        // Calculate the two angle bisectors
        // The sum of two unit vectors gives the bisector of the small angle
        vec2 bisectorSmall = normalize(direction1 + direction2);
        
        // The perpendicular to the small angle bisector gives the large angle bisector
        vec2 bisectorLarge = vec2(-bisectorSmall.y, bisectorSmall.x);
        
        // Calculate directional alignment with bisectors
        vec2 fragToTile = normalize(tilePosPixels - fragCoordPixels);
        float alignLarge = abs(dot(fragToTile, bisectorLarge));
        float alignSmall = abs(dot(fragToTile, bisectorSmall));

        // Calculate angle-based weights
        float angleWeight1 = 1.0 + alignLarge * DIRECTION_SCALE;
        float angleWeight2 = 1.0 + alignSmall * DIRECTION_SCALE;
        
        // Calculate distance weights with angle modulation
        float brightnessSquared = tileBrightness * tileBrightness;
        float distanceFactor = dist * dist + 2.0 * dist + 1.0;
        
        float weight1 = brightnessSquared / (angleWeight1 * distanceFactor);
        float weight2 = brightnessSquared / (angleWeight2 * distanceFactor);
        
        // Accumulate weighted values
        totalBrightness1 += weight1 * tileBrightness;
        totalWeight1 += weight1 * (1.0 - angleWeight1 * ANGLE_WEIGHT_SCALE);
        
        totalBrightness2 += weight2 * tileBrightness;
        totalWeight2 += weight2 * (1.0 - angleWeight2 * ANGLE_WEIGHT_SCALE);
    }

    // Calculate final brightness values with safe division
    float finalBrightness1 = (totalWeight1 > EPSILON) ? 
        totalBrightness1 / totalWeight1 : 0.0;
    float finalBrightness2 = (totalWeight2 > EPSILON) ? 
        totalBrightness2 / totalWeight2 : 0.0;
    
    // Normalize and invert brightness (dark to light)
    finalBrightness1 = 1.0 - clamp(finalBrightness1 * BRIGHTNESS_SCALE, 0.0, 1.0);
    finalBrightness2 = 1.0 - clamp(finalBrightness2 * BRIGHTNESS_SCALE, 0.0, 1.0);

    // Calculate complementary color (when added to uColor1 gives white)
    vec3 color2 = vec3(1.0) - uColor1;
    
    // Blend the two colors based on their brightness values
    vec3 finalColor = uColor1 * finalBrightness1 + color2 * finalBrightness2;

    // Output final color
    gl_FragColor = vec4(finalColor, 1.0);
}