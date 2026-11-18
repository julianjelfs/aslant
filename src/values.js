// Value banding, ported from Askance (lib/engine/lstar.dart and
// shaders/askance.frag) so a head here bands the way a photograph of it
// would there: sRGB -> CIE L*, then absolute quantisation into `steps` equal
// bands of L*, each painted at an even step between Askance's grey endpoints.

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const lstarOfLuminance = (y) => (y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y);
const luminanceOfLstar = (l) => (l > 8 ? ((l + 16) / 116) ** 3 : l / 903.3);

const lstarOfHex = (hex) =>
  lstarOfLuminance(
    luminance(
      srgbToLinear(((hex >> 16) & 255) / 255),
      srgbToLinear(((hex >> 8) & 255) / 255),
      srgbToLinear((hex & 255) / 255),
    ),
  );

// Askance's neutral scale endpoints (ValueScale._greyDark / _greyLight).
export const DARK_L = lstarOfHex(0x111010);
export const LIGHT_L = lstarOfHex(0xf8f4f4);

/** sRGB grey, 0..1, at a given L*. */
export const greyOfLstar = (l) => linearToSrgb(luminanceOfLstar(l));

export const ValueShader = {
  name: 'ValueShader',
  uniforms: {
    tDiffuse: { value: null },
    uSteps: { value: 3 },
    uDarkL: { value: DARK_L },
    uLightL: { value: LIGHT_L },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // tDiffuse arrives after OutputPass, so it already holds sRGB-encoded
  // colour, which is what askance.frag's lstar() expects.
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSteps;
    uniform float uDarkL;
    uniform float uLightL;
    varying vec2 vUv;

    float lstar(vec3 c) {
      vec3 lin = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
      float y = dot(lin, vec3(0.2126, 0.7152, 0.0722));
      return y > 0.008856 ? 116.0 * pow(y, 1.0 / 3.0) - 16.0 : 903.3 * y;
    }

    float srgbOfLstar(float l) {
      float y = l > 8.0 ? pow((l + 16.0) / 116.0, 3.0) : l / 903.3;
      return y <= 0.0031308 ? y * 12.92 : 1.055 * pow(y, 1.0 / 2.4) - 0.055;
    }

    void main() {
      vec3 c = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);
      float band = clamp(floor(lstar(c) / 100.0 * uSteps), 0.0, uSteps - 1.0);
      float target = uSteps < 1.5 ? uDarkL : mix(uDarkL, uLightL, band / (uSteps - 1.0));
      gl_FragColor = vec4(vec3(srgbOfLstar(target)), 1.0);
    }
  `,
};
