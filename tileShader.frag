// tileShader.frag
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 vTexCoord; // Screen texture coordinate (0.0 to 1.0)
varying vec2 vPixelCoord; // Pixel coordinate in model space (-width/2 to width/2, -height/2 to height/2)

uniform vec2 u_resolution;  // Canvas resolution (width, height)
uniform int u_tileCount;    // Number of actual tiles to draw

// Data Textures
uniform sampler2D u_positionTexture;    // Stores tile XY position (encoded)
uniform sampler2D u_propertiesTexture;  // Stores radius (R) and color (GBA) (encoded)
uniform vec2 u_dataTextureSize;     // Dimensions (width, height) of data textures

// Background color
uniform vec3 u_bgColor;

// Define a constant for max iterations based on texture size
const int MAX_ITERATIONS = 32 * 16; // MUST match MAX_TILES_TEXTURE_WIDTH * MAX_TILES_TEXTURE_HEIGHT

// Helper to get texture coordinate for a given tile index
vec2 getTexCoordForIndex(int index, vec2 textureSize) {
    float i_f = float(index);
    float x = mod(i_f, textureSize.x);
    float y = floor(i_f / textureSize.x);
    // Add 0.5 to sample the center of the pixel
    return (vec2(x, y) + 0.5) / textureSize; 
}

// Helper to decode data (simple version, assuming direct mapping for now)
// You might need more complex decoding based on how data was encoded
vec2 decodePosition(vec4 textureData, vec2 canvasResolution) {
    // Assuming simple 0-255 mapping in drawTiles.js
    // This needs to match the p.map() ranges used there.
    float x = mix(-canvasResolution.x, canvasResolution.x, textureData.r);
    float y = mix(-canvasResolution.y, canvasResolution.y, textureData.g);
    return vec2(x, y);
}

float decodeRadius(vec4 textureData, float maxRadius) {
     // Assuming simple 0-255 mapping in drawTiles.js
     return mix(0.0, maxRadius * 2.0, textureData.r); // Match p.map() range
}

vec3 decodeColor(vec4 textureData) {
     return textureData.gba; // Assuming Color R, G, B stored in G, B, A channels (0.0-1.0)
}

void main() {
    vec2 fragCoord = vPixelCoord; 
    vec4 finalColor = vec4(u_bgColor, 1.0);

    // Estimate max radius based on preFactor used in JS (approximate)
    float approxMaxRadius = max(u_resolution.x, u_resolution.y) * 0.5; 

    // Loop up to the constant MAX_ITERATIONS
    for (int i = 0; i < MAX_ITERATIONS; ++i) {
        // Break if we are beyond the actual tile count
        if (i >= u_tileCount) {
            break;
        }

        // Calculate texture coordinate for this tile
        vec2 dataTexCoord = getTexCoordForIndex(i, u_dataTextureSize);

        // Sample data from textures
        vec4 posData = texture2D(u_positionTexture, dataTexCoord);
        vec4 propData = texture2D(u_propertiesTexture, dataTexCoord);

        // Decode data (adjust decode functions based on encoding)
        vec2 tileCenter = decodePosition(posData, u_resolution); 
        float tileRadius = decodeRadius(propData, approxMaxRadius); 
        vec3 tileColor = decodeColor(propData); 

        float radiusSq = tileRadius * tileRadius;
        vec2 diff = fragCoord - tileCenter;
        float distSq = dot(diff, diff);

        if (distSq < radiusSq) {
            finalColor = vec4(tileColor, 1.0);
            gl_FragColor = finalColor;
            return; // Found topmost tile
        }
    }

    gl_FragColor = finalColor; 
} 