const toonShader = `
precision highp float;

// Vertex shader attributes
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

// Matrices
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform mat4 view;

// Lighting
uniform vec3 lightDirection;
uniform vec3 cameraPosition;

// Varying outputs to fragment shader
varying vec2 vUV;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewDirection;

void main(void) {
    // Transform position
    gl_Position = worldViewProjection * vec4(position, 1.0);
    
    // Pass UV coordinates
    vUV = uv;
    
    // Transform normal to world space
    vNormal = normalize((world * vec4(normal, 0.0)).xyz);
    
    // Calculate world position
    vWorldPosition = (world * vec4(position, 1.0)).xyz;
    
    // Calculate view direction
    vViewDirection = normalize(cameraPosition - vWorldPosition);
}
`;

const toonFragmentShader = `
precision highp float;

// Varying inputs from vertex shader
varying vec2 vUV;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewDirection;

// Textures
uniform sampler2D diffuseTexture;
uniform sampler2D rampTexture; // Optional toon ramp texture

// Material properties
uniform vec3 diffuseColor;
uniform vec3 specularColor;
uniform float shininess;

// Lighting
uniform vec3 lightDirection;
uniform vec3 lightColor;
uniform vec3 ambientColor;

// Toon shading parameters
uniform float toonSteps; // Number of lighting bands (e.g., 4.0)
uniform float rimPower; // Rim lighting intensity
uniform vec3 rimColor; // Rim lighting color
uniform bool useRampTexture; // Whether to use ramp texture or stepped lighting

// Outline parameters
uniform bool enableOutline;
uniform float outlineThickness;
uniform vec3 outlineColor;

// Utility function for stepped lighting
float toonify(float value, float steps) {
    return floor(value * steps) / steps;
}

void main(void) {
    // Sample diffuse texture
    vec4 texColor = texture2D(diffuseTexture, vUV);
    
    // Normalize vectors
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(-lightDirection);
    vec3 viewDir = normalize(vViewDirection);
    
    // Calculate lighting
    float NdotL = max(dot(normal, lightDir), 0.0);
    
    // Toon shading - either use ramp texture or stepped lighting
    float toonLighting;
    if (useRampTexture) {
        // Use 1D ramp texture for smooth toon transitions
        toonLighting = texture2D(rampTexture, vec2(NdotL, 0.5)).r;
    } else {
        // Use stepped lighting for classic toon look
        toonLighting = toonify(NdotL, toonSteps);
    }
    
    // Diffuse component
    vec3 diffuse = diffuseColor * lightColor * toonLighting;
    
    // Specular component (toonified)
    vec3 halfVector = normalize(lightDir + viewDir);
    float NdotH = max(dot(normal, halfVector), 0.0);
    float specular = pow(NdotH, shininess);
    float toonSpecular = step(0.5, specular); // Hard specular cutoff for toon look
    vec3 specularComponent = specularColor * toonSpecular;
    
    // Rim lighting for cartoon effect
    float rimFactor = 1.0 - max(dot(viewDir, normal), 0.0);
    rimFactor = pow(rimFactor, rimPower);
    vec3 rim = rimColor * rimFactor;
    
    // Combine lighting components
    vec3 finalColor = ambientColor + diffuse + specularComponent + rim;
    
    // Apply to texture
    vec3 result = texColor.rgb * finalColor;
    
    // Output final color
    gl_FragColor = vec4(result, texColor.a);
}
`;

// Simplified toon post-process shader for screen-space effects
const toonPostProcessShader = `
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;

// Toon parameters
uniform float posterizationLevels; // Number of color levels per channel
uniform float edgeThreshold; // Threshold for edge detection
uniform vec3 edgeColor; // Color for detected edges
uniform vec2 screenSize;

// Posterization function
vec3 posterize(vec3 color, float levels) {
    return floor(color * levels) / levels;
}

// Simple edge detection using depth
float detectEdge(vec2 uv) {
    vec2 texel = 1.0 / screenSize;
    
    float depth = texture2D(depthSampler, uv).r;
    float depthRight = texture2D(depthSampler, uv + vec2(texel.x, 0.0)).r;
    float depthDown = texture2D(depthSampler, uv + vec2(0.0, texel.y)).r;
    
    float depthDiff = abs(depth - depthRight) + abs(depth - depthDown);
    return step(edgeThreshold, depthDiff);
}

void main(void) {
    vec4 originalColor = texture2D(textureSampler, vUV);
    
    // Posterize the color
    vec3 posterized = posterize(originalColor.rgb, posterizationLevels);
    
    // Detect edges
    float edge = detectEdge(vUV);
    
    // Mix posterized color with edge color
    vec3 finalColor = mix(posterized, edgeColor, edge);
    
    gl_FragColor = vec4(finalColor, originalColor.a);
}
`;

const outlineShader = `precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screenSize;
uniform vec4 outlineColor;

void main(void) {
    vec2 texel = 1.0 / screenSize;

    // Sample current pixel
    vec4 center = texture2D(textureSampler, vUV);

    if (center.a > 0.0) {
        // Inside the sprite → just draw it
        gl_FragColor = center;
        return;
    }

    // Check neighbors for alpha > 0
    float neighborAlpha = 0.0;
    neighborAlpha += texture2D(textureSampler, vUV + vec2(texel.x, 0.0)).a;
    neighborAlpha += texture2D(textureSampler, vUV - vec2(texel.x, 0.0)).a;
    neighborAlpha += texture2D(textureSampler, vUV + vec2(0.0, texel.y)).a;
    neighborAlpha += texture2D(textureSampler, vUV - vec2(0.0, texel.y)).a;

    if (neighborAlpha > 0.0) {
        // Transparent pixel with solid neighbor = outline
        gl_FragColor = outlineColor;
    } else {
        // Just background
        discard;
    }
}
`;

const pixelShader = `
    precision highp float;

    varying vec2 vUV;
    uniform sampler2D textureSampler;

    // Target resolution to pixelize to (e.g., 320x180)
    uniform vec2 targetRes;

    void main(void) {
        // Compute pixel step in UV space
        vec2 uvStep = 1.0 / targetRes;

        // Snap UV to the nearest block
        vec2 uv = floor(vUV / uvStep) * uvStep + 0.5 * uvStep;

        // Sample scene at snapped UV
        gl_FragColor = texture2D(textureSampler, uv);
    }
`;


export {outlineShader, pixelShader, toonShader, toonFragmentShader, toonPostProcessShader};
