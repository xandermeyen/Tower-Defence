const { NodeIO, Node } = require('@gltf-transform/core');
const { PNG } = require('pngjs');
const fs = require('fs');

const BASE = '/sessions/hopeful-gallant-euler/mnt/KayKit_Adventurers_2.0_FREE';
const io = new NodeIO();

// ---------- mat4 / quat helpers (column-major, glTF style) ----------
function mat4Identity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function mat4Multiply(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
    }
    return o;
}
function mat4Compose(t, q, s) {
    const [x,y,z,w] = q;
    const x2=x+x, y2=y+y, z2=z+z;
    const xx=x*x2, xy=x*y2, xz=x*z2, yy=y*y2, yz=y*z2, zz=z*z2, wx=w*x2, wy=w*y2, wz=w*z2;
    const [sx,sy,sz] = s;
    return [
        (1-(yy+zz))*sx, (xy+wz)*sx, (xz-wy)*sx, 0,
        (xy-wz)*sy, (1-(xx+zz))*sy, (yz+wx)*sy, 0,
        (xz+wy)*sz, (yz-wx)*sz, (1-(xx+yy))*sz, 0,
        t[0], t[1], t[2], 1
    ];
}
function transformPoint(m, p) {
    return [
        m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],
        m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],
        m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]
    ];
}
function slerp(a, b, t) {
    let [ax,ay,az,aw] = a, [bx,by,bz,bw] = b;
    let dot = ax*bx+ay*by+az*bz+aw*bw;
    if (dot < 0) { bx=-bx; by=-by; bz=-bz; bw=-bw; dot=-dot; }
    if (dot > 0.9995) {
        const o = [ax+(bx-ax)*t, ay+(by-ay)*t, az+(bz-az)*t, aw+(bw-aw)*t];
        const l = Math.hypot(...o); return o.map(v => v/l);
    }
    const th = Math.acos(dot), s = Math.sin(th);
    const wa = Math.sin((1-t)*th)/s, wb = Math.sin(t*th)/s;
    return [ax*wa+bx*wb, ay*wa+by*wb, az*wa+bz*wb, aw*wa+bw*wb];
}
function lerp3(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function rotY(d) { const r = d*Math.PI/180, c=Math.cos(r), s=Math.sin(r); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; }
function rotX(d) { const r = d*Math.PI/180, c=Math.cos(r), s=Math.sin(r); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; }

// ---------- accessor reading ----------
function readAccessor(acc) {
    const n = acc.getCount(), size = acc.getElementSize();
    const out = [];
    const tmp = new Array(size);
    const normalized = acc.getNormalized();
    const ctype = acc.getComponentType();
    let div = 1;
    if (normalized) {
        if (ctype === 5121) div = 255;
        else if (ctype === 5123) div = 65535;
    }
    for (let i = 0; i < n; i++) {
        acc.getElement(i, tmp);
        out.push(div === 1 ? [...tmp] : tmp.map(v => v / div));
    }
    return out;
}

// ---------- animation sampling ----------
function buildClip(animDoc, clipName) {
    const anim = animDoc.getRoot().listAnimations().find(a => a.getName() === clipName);
    if (!anim) throw new Error('clip not found: ' + clipName);
    const tracks = {}; // nodeName -> {translation:{times,values}, rotation:..., scale:...}
    let duration = 0;
    for (const ch of anim.listChannels()) {
        const nodeName = ch.getTargetNode().getName();
        const path = ch.getTargetPath();
        const s = ch.getSampler();
        const times = readAccessor(s.getInput()).map(v => v[0]);
        const values = readAccessor(s.getOutput());
        duration = Math.max(duration, times[times.length-1]);
        tracks[nodeName] = tracks[nodeName] || {};
        tracks[nodeName][path] = { times, values };
    }
    return { tracks, duration };
}
function sampleTrack(track, t, isQuat) {
    const { times, values } = track;
    if (t <= times[0]) return values[0];
    if (t >= times[times.length-1]) return values[values.length-1];
    let i = 0;
    while (times[i+1] < t) i++;
    const f = (t - times[i]) / (times[i+1] - times[i]);
    return isQuat ? slerp(values[i], values[i+1], f) : lerp3(values[i], values[i+1], f);
}

// ---------- main bake ----------
async function bake({ charFile, animFile, clipName, frames, frameW, frameH, out, margin = 4, yaw = 75, pitch = 12 }) {
    const doc = await io.read(BASE + '/' + charFile);
    const animDoc = await io.read(BASE + '/' + animFile);
    const root = doc.getRoot();
    const skin = root.listSkins()[0];
    const joints = skin.listJoints();
    const invBind = readAccessor(skin.getInverseBindMatrices());
    const clip = buildClip(animDoc, clipName);

    // joint parent map (within doc node graph)
    const parentOf = new Map();
    for (const node of root.listNodes()) {
        for (const child of node.listChildren()) parentOf.set(child, node);
    }
    // include scene-level parents (node transforms above joints)
    function localMatrix(node, animLocal) {
        if (animLocal && animLocal.has(node)) return animLocal.get(node);
        return mat4Compose(node.getTranslation(), node.getRotation(), node.getScale());
    }
    function worldMatrix(node, animLocal, cache) {
        if (cache.has(node)) return cache.get(node);
        const local = localMatrix(node, animLocal);
        const parent = parentOf.get(node);
        const world = parent ? mat4Multiply(worldMatrix(parent, animLocal, cache), local) : local;
        cache.set(node, world);
        return world;
    }

    // texture
    const tex = root.listTextures()[0];
    const texPng = PNG.sync.read(Buffer.from(tex.getImage()));

    // gather skinned mesh primitives
    const prims = [];
    for (const node of root.listNodes()) {
        const mesh = node.getMesh();
        if (!mesh || !node.getSkin()) continue;
        for (const prim of mesh.listPrimitives()) {
            prims.push({
                pos: readAccessor(prim.getAttribute('POSITION')),
                uv: readAccessor(prim.getAttribute('TEXCOORD_0')),
                jn: readAccessor(prim.getAttribute('JOINTS_0')),
                wt: readAccessor(prim.getAttribute('WEIGHTS_0')),
                idx: readAccessor(prim.getIndices()).map(v => v[0])
            });
        }
    }

    const view = mat4Multiply(rotX(pitch), rotY(yaw));

    // compute skinned+viewed vertices for one time
    function computeFrameVerts(t) {
        const animLocal = new Map();
        for (const j of joints) {
            const tr = clip.tracks[j.getName()];
            if (!tr) continue;
            const T = tr.translation ? sampleTrack(tr.translation, t, false) : j.getTranslation();
            const R = tr.rotation ? sampleTrack(tr.rotation, t, true) : j.getRotation();
            const S = tr.scale ? sampleTrack(tr.scale, t, false) : j.getScale();
            animLocal.set(j, mat4Compose(T, R, S));
        }
        const cache = new Map();
        const jointMats = joints.map((j, i) => mat4Multiply(worldMatrix(j, animLocal, cache), invBind[i]));
        return prims.map(p => {
            const verts = p.pos.map((pos, vi) => {
                const jn = p.jn[vi], wt = p.wt[vi];
                let x = 0, y = 0, z = 0;
                for (let k = 0; k < 4; k++) {
                    const w = wt[k];
                    if (w === 0) continue;
                    const q = transformPoint(jointMats[jn[k]], pos);
                    x += q[0]*w; y += q[1]*w; z += q[2]*w;
                }
                return transformPoint(view, [x, y, z]);
            });
            return verts;
        });
    }

    // sample all frames, get bbox
    const times = [];
    for (let i = 0; i < frames; i++) times.push((i / frames) * clip.duration);
    const frameVerts = times.map(computeFrameVerts);
    let minX=1e9, maxX=-1e9, minY=1e9, maxY=-1e9;
    for (const fv of frameVerts) for (const verts of fv) for (const v of verts) {
        minX=Math.min(minX,v[0]); maxX=Math.max(maxX,v[0]);
        minY=Math.min(minY,v[1]); maxY=Math.max(maxY,v[1]);
    }
    const scale = Math.min((frameW - margin*2) / (maxX - minX), (frameH - margin*2) / (maxY - minY));
    const cx = (minX + maxX) / 2;

    // light
    const L = (() => { const l = [0.4, 0.75, 0.6], n = Math.hypot(...l); return l.map(v => v/n); })();

    const sheet = new PNG({ width: frameW * frames, height: frameH });

    for (let f = 0; f < frames; f++) {
        const zbuf = new Float32Array(frameW * frameH).fill(-1e9);
        const cbuf = new Uint8ClampedArray(frameW * frameH * 4);
        const fv = frameVerts[f];
        fv.forEach((verts, pi) => {
            const p = prims[pi];
            for (let i = 0; i < p.idx.length; i += 3) {
                const ia = p.idx[i], ib = p.idx[i+1], ic = p.idx[i+2];
                const a = verts[ia], b = verts[ib], cc = verts[ic];
                // screen coords
                const ax = (a[0]-cx)*scale + frameW/2, ay = frameH - margin - (a[1]-minY)*scale;
                const bx = (b[0]-cx)*scale + frameW/2, by = frameH - margin - (b[1]-minY)*scale;
                const cx2 = (cc[0]-cx)*scale + frameW/2, cy = frameH - margin - (cc[1]-minY)*scale;
                // face normal
                let nx = (b[1]-a[1])*(cc[2]-a[2]) - (b[2]-a[2])*(cc[1]-a[1]);
                let ny = (b[2]-a[2])*(cc[0]-a[0]) - (b[0]-a[0])*(cc[2]-a[2]);
                let nz = (b[0]-a[0])*(cc[1]-a[1]) - (b[1]-a[1])*(cc[0]-a[0]);
                const nl = Math.hypot(nx, ny, nz) || 1;
                nx/=nl; ny/=nl; nz/=nl;
                if (nz < 0) { nx=-nx; ny=-ny; nz=-nz; }
                const lit = Math.min(1.15, 0.55 + 0.6 * Math.max(0, nx*L[0]+ny*L[1]+nz*L[2]));
                // raster bbox
                const x0 = Math.max(0, Math.floor(Math.min(ax,bx,cx2)));
                const x1 = Math.min(frameW-1, Math.ceil(Math.max(ax,bx,cx2)));
                const y0 = Math.max(0, Math.floor(Math.min(ay,by,cy)));
                const y1 = Math.min(frameH-1, Math.ceil(Math.max(ay,by,cy)));
                const area = (bx-ax)*(cy-ay) - (by-ay)*(cx2-ax);
                if (Math.abs(area) < 1e-6) continue;
                const uvA = p.uv[ia], uvB = p.uv[ib], uvC = p.uv[ic];
                for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
                    const sx = px + 0.5, sy = py + 0.5;
                    const w0 = ((bx-ax)*(sy-ay) - (by-ay)*(sx-ax)) / area;
                    const w1 = ((cx2-bx)*(sy-by) - (cy-by)*(sx-bx)) / area;
                    const w2 = ((ax-cx2)*(sy-cy) - (ay-cy)*(sx-cx2)) / area;
                    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
                    // barycentric: w1 is weight of A, w2 of B, w0 of C
                    const wa = w1, wb = w2, wc = w0;
                    const depth = wa*a[2] + wb*b[2] + wc*cc[2];
                    const zi = py*frameW + px;
                    if (depth <= zbuf[zi]) continue;
                    zbuf[zi] = depth;
                    let u = wa*uvA[0] + wb*uvB[0] + wc*uvC[0];
                    let v = wa*uvA[1] + wb*uvB[1] + wc*uvC[1];
                    u = u - Math.floor(u); v = v - Math.floor(v);
                    const tx = Math.min(texPng.width-1, Math.floor(u * texPng.width));
                    const ty = Math.min(texPng.height-1, Math.floor(v * texPng.height));
                    const ti = (ty*texPng.width + tx) * 4;
                    cbuf[zi*4] = texPng.data[ti] * lit;
                    cbuf[zi*4+1] = texPng.data[ti+1] * lit;
                    cbuf[zi*4+2] = texPng.data[ti+2] * lit;
                    cbuf[zi*4+3] = 255;
                }
            }
        });
        // blit into sheet
        for (let py = 0; py < frameH; py++) for (let px = 0; px < frameW; px++) {
            const si = ((py)*sheet.width + f*frameW + px) * 4;
            const ci = (py*frameW + px) * 4;
            sheet.data[si] = cbuf[ci]; sheet.data[si+1] = cbuf[ci+1];
            sheet.data[si+2] = cbuf[ci+2]; sheet.data[si+3] = cbuf[ci+3];
        }
    }
    fs.writeFileSync(out, PNG.sync.write(sheet));
    console.log('baked', out, frames + 'f', frameW + 'x' + frameH, 'clip:', clipName);
}

const MOVE = 'Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb';
const GEN = 'Animations/gltf/Rig_Medium/Rig_Medium_General.glb';

async function main() {
    await bake({ charFile: 'Characters/gltf/Rogue.glb', animFile: MOVE, clipName: 'Walking_A', frames: 8, frameW: 100, frameH: 100, out: '/tmp/baker/out/rogue.png' });
    await bake({ charFile: 'Characters/gltf/Rogue_Hooded.glb', animFile: MOVE, clipName: 'Running_A', frames: 8, frameW: 100, frameH: 100, out: '/tmp/baker/out/rogue_hooded.png' });
    await bake({ charFile: 'Characters/gltf/Knight.glb', animFile: MOVE, clipName: 'Walking_B', frames: 8, frameW: 100, frameH: 100, out: '/tmp/baker/out/knight.png' });
    await bake({ charFile: 'Characters/gltf/Barbarian.glb', animFile: MOVE, clipName: 'Walking_C', frames: 8, frameW: 100, frameH: 100, out: '/tmp/baker/out/barbarian.png' });
    await bake({ charFile: 'Characters/gltf/Mage.glb', animFile: GEN, clipName: 'Throw', frames: 19, frameW: 128, frameH: 144, out: '/tmp/baker/out/mage_tower.png', yaw: 35 });
}
main().catch(e => { console.error(e); process.exit(1); });
