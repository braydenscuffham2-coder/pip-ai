"""Wraps Higgsfield's painted views back onto the room (see skin.py for the whole process).

    python3 project.py            -> skin.jpg (4096 atlas) from paint/<view>.png, renders/<view>_pos.exr, renders/views.json

Each atlas texel knows its place in the room (atlas_pos.exr) and its facing (atlas_nrm.exr). From every painted view it
takes the painted colour where that view truly sees it: the view's own position render must agree within a few
centimetres (so nothing paints through a wall), weighted by how squarely and how closely the view looks at it, and
faded at the picture's edges. The best views dominate (weights are sharpened) so overlaps don't ghost. Texels no view
sees keep the baked light from Blender.
"""
import os, sys, json
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "renders"); PAINT = os.path.join(HERE, "paint")

def exr(p):  # this OpenCV build has no EXR codec, so read with the OpenEXR package
    import OpenEXR
    ch = OpenEXR.File(p).parts[0].channels
    a = ch["RGBA"].pixels if "RGBA" in ch else (ch["RGB"].pixels if "RGB" in ch else np.dstack([ch[k].pixels for k in "RGB"]))
    return np.ascontiguousarray(a[..., :3]).astype(np.float32)

def trust(render_png, paint, W, H):
    """1 where the painting keeps the blockout's shapes, falling towards 0.1 where it invented something
    (a chair, a lamp) that has no geometry under it, so the invention isn't smeared onto whatever lies behind."""
    r = cv2.resize(cv2.imread(render_png, cv2.IMREAD_GRAYSCALE), (W, H), interpolation=cv2.INTER_AREA)
    p = cv2.cvtColor((paint * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    er = cv2.Canny(cv2.GaussianBlur(r, (5, 5), 0), 20, 60); ep = cv2.Canny(cv2.GaussianBlur(p, (5, 5), 0), 40, 110)
    stray = (ep > 0) & (cv2.dilate(er, np.ones((15, 15), np.uint8)) == 0)
    blob = cv2.morphologyEx(stray.astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((45, 45), np.uint8))
    blob = cv2.GaussianBlur(blob.astype(np.float32) / 255, (0, 0), 12)
    return np.clip(1 - 0.9 * np.clip(blob * 1.6, 0, 1), 0.1, 1)

# close-ups are trusted only around what they look at: away from it the painter tends to invent props (chairs)
FOCUS = {"desk_l": ((-3.4, 7.2, 1.15), 2.0), "desk_r": ((3.4, 7.2, 1.15), 2.0),
         "front": ((-5.0, 3.4, 0.8), 2.2), "meter": ((5.3, 3.4, 1.6), 1.3), "loft": ((4.8, 25.2, 3.4), 2.4)}
def focus(name, P):
    if name not in FOCUS: return 1.0
    c, r = FOCUS[name]; d = np.linalg.norm(P - np.array(c, np.float32), axis=1)
    return np.exp(-(d / r) ** 4).astype(np.float32)

def main(out=os.path.join(HERE, "skin.jpg")):
    pos, nrm, light = (np.load(os.path.join(HERE, n + ".npy")) for n in ("atlas_pos", "atlas_nrm", "atlas_light"))
    S = pos.shape[0]
    used = np.abs(pos).sum(-1) > 1e-6
    idx = np.nonzero(used.ravel())[0]
    P = pos.reshape(-1, 3)[idx]; Nn = nrm.reshape(-1, 3)[idx]; Nn /= np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-9
    acc = np.zeros((len(idx), 3), np.float32); wsum = np.zeros(len(idx), np.float32)
    meta = json.load(open(os.path.join(R, "views.json")))
    for name, m in meta.items():
        pp = os.path.join(PAINT, name + ".png")
        if not os.path.exists(pp): continue
        W, H = m["w"], m["h"]
        img = cv2.imread(pp, cv2.IMREAD_COLOR)[..., ::-1]; img = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
        vpos = exr(os.path.join(R, name + "_pos.exr"))
        tr = 1.0
        M = np.array(m["matrix"], np.float64); Mi = np.linalg.inv(M); eye = M[:3, 3]
        pc = (Mi[:3, :3] @ P.T).T + Mi[:3, 3]
        z = -pc[:, 2]; f = m["lens"] / m["sensor"] * W
        ok = z > 0.15
        x = np.where(ok, W / 2 + pc[:, 0] / np.maximum(z, 1e-3) * f, -1); y = np.where(ok, H / 2 - pc[:, 1] / np.maximum(z, 1e-3) * f, -1)
        ok &= (x >= 1) & (x < W - 2) & (y >= 1) & (y < H - 2)
        xi = np.clip(x.astype(np.int32), 0, W - 1); yi = np.clip(y.astype(np.int32), 0, H - 1)
        seen = vpos[yi, xi]
        ok &= np.linalg.norm(seen - P, axis=1) < (0.035 + 0.012 * z)  # the view really shows this spot
        d = eye[None, :] - P; dist = np.linalg.norm(d, axis=1); d /= dist[:, None] + 1e-9
        cos = np.clip((Nn * d).sum(1), 0, 1)
        edge = np.clip(np.minimum.reduce([x, y, W - x, H - y]) / 70, 0, 1)
        w = np.where(ok, (cos ** 2) * edge * focus(name, P) / (1 + (dist / 5) ** 2), 0).astype(np.float32)
        w = w ** 3  # the best view for each spot wins clearly
        # bilinear sample of the painting
        x0 = np.clip(np.floor(x).astype(np.int32), 0, W - 2); y0 = np.clip(np.floor(y).astype(np.int32), 0, H - 2); fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
        c = img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy
        acc += c * w[:, None]; wsum += w
        print(name, "covers %.1f%% of the room" % (100 * (w > 0).mean()), flush=True)
    col = acc / np.maximum(wsum, 1e-12)[:, None]
    # where no view looks: the baked light, mapped to the same look
    L = light.reshape(-1, 3)[idx]; fb = np.clip((L / (1 + L)) ** (1 / 2.2) * 1.12, 0, 1)
    a = np.clip(wsum / (np.percentile(wsum[wsum > 0], 20) + 1e-12), 0, 1)[:, None] if (wsum > 0).any() else np.zeros((len(idx), 1))
    final = col * a + fb * (1 - a)
    outimg = np.zeros((S * S, 3), np.float32); outimg[idx] = final
    outimg = outimg.reshape(S, S, 3)
    # grow the edges of every island a few texels so mip-mapping never pulls in black
    u8 = (np.clip(outimg, 0, 1) * 255).astype(np.uint8); mask = used.astype(np.uint8)
    for _ in range(6):
        grown = cv2.dilate(u8, np.ones((3, 3), np.uint8)); mg = cv2.dilate(mask, np.ones((3, 3), np.uint8))
        u8 = np.where(mask[..., None] > 0, u8, grown); mask = mg
    cv2.imwrite(out, u8[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 86])
    print("wrote", out, "painted %.1f%% of the room" % (100 * (wsum > 0).mean()))

if __name__ == "__main__":
    main()
