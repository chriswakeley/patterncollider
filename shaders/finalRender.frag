precision highp float;

varying vec2 vTexCoord;

// Uniforms
uniform sampler2D u_tileDataTexture;
uniform vec2 u_tileDataTextureSize;
uniform int u_tileCount;
uniform float u_falloffFactor;
uniform vec2 u_resolution;

const float epsilon = 1e-6;

// Function to calculate squared distance
float distanceSquared(vec2 fragCoord, vec2 tilePixelCoord) {
    vec2 diff = fragCoord - tilePixelCoord;
    return dot(diff, diff);
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    fragCoord.y = u_resolution.y - fragCoord.y; // Flip Y for top-left origin

    float totalBrightness = 0.0;
    float totalWeight = 0.0;

    // Loop through the actual tile data provided via texture
    for (int i = 0; i < 1024; ++i) { // Loop up to MAX_TILES (shader needs fixed limit)
        if (i >= u_tileCount) break;

        // Calculate tex coord to sample the data texture for tile i
        float i_float = float(i);
        vec2 dataTexCoord = vec2(
            mod(i_float, u_tileDataTextureSize.x),
            floor(i_float / u_tileDataTextureSize.x)
        ) / u_tileDataTextureSize;
        dataTexCoord += (0.5 / u_tileDataTextureSize); // Center sampling

        // Sample the encoded data
        vec4 encodedData = texture2D(u_tileDataTexture, dataTexCoord);

        // Decode data
        vec2 tilePixelCoord = encodedData.rg * u_resolution; // Denormalize X, Y
        float tileBrightness = encodedData.b;            // Brightness (0-1)

        // Calculate distance squared from current pixel to this tile center
        float d2 = distanceSquared(fragCoord, tilePixelCoord);

        // Calculate Gaussian weight
        float weight = exp(-d2 / (u_falloffFactor * u_falloffFactor));

        // Accumulate weighted brightness and total weight
        totalBrightness += tileBrightness * weight;
        totalWeight += weight;
    }

    // Calculate final interpolated brightness
    float finalValue = totalBrightness / (totalWeight + epsilon);

    // Output the result
    gl_FragColor = vec4(vec3(clamp(finalValue, 0.0, 1.0)), 1.0);
} 