// 4D rotation utilities. The Buddhabrot lives in the 4D space
//   (Re(c), Im(c), Re(z), Im(z))
// and we view it by rotating that space and orthographically projecting the
// first three coordinates. A general 4D rotation is the composition of
// rotations in the six coordinate planes.

import type { GeometryConfig } from '../state';

export type Mat4 = Float64Array; // 16 entries, row-major

function identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 4; col++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + col];
      out[r * 4 + col] = s;
    }
  }
  return out;
}

/** Rotation by `angle` in the plane spanned by axes i and j. */
function planeRotation(i: number, j: number, angle: number): Mat4 {
  const m = identity();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  m[i * 4 + i] = c;
  m[j * 4 + j] = c;
  m[i * 4 + j] = -s;
  m[j * 4 + i] = s;
  return m;
}

/** Build the composed 4D rotation matrix from the six plane angles. */
export function buildRotation(g: GeometryConfig): Mat4 {
  let m = identity();
  m = multiply(planeRotation(0, 1, g.a01), m);
  m = multiply(planeRotation(0, 2, g.a02), m);
  m = multiply(planeRotation(0, 3, g.a03), m);
  m = multiply(planeRotation(1, 2, g.a12), m);
  m = multiply(planeRotation(1, 3, g.a13), m);
  m = multiply(planeRotation(2, 3, g.a23), m);
  return m;
}
