"""The remake's tunes found in the soundtrack, in numpy. remake_check.mjs
compares zb-tunes.js with it. The tunes are the AudioClips that UnityPy decodes
through FMOD, written as WAV files into <out>, where the check reads them
too. The reading is zb-tunes.js's: 12 pitch classes of mono samples at
8 kHz, frames of 2,048 samples 1,024 apart, three windows of 10 s from a
tune's start slid along every track, and a tune found where two windows
match one track (a cosine over 0.6) as far apart as in the tune, within
1 s. It prints a JSON object: each tune's name, then [the track's file,
the start in seconds] or null.

  python remake_tunes_oracle.py <Data folder> <soundtrack folder> <out>
"""
import json
import os
import subprocess
import sys

import numpy as np
import UnityPy

RATE, N, HOP = 8000, 2048, 1024
FPS = RATE / HOP
W = round(10 * FPS)


def chroma(x):
    if len(x) < N:
        return np.zeros((0, 12))
    frames = np.lib.stride_tricks.sliding_window_view(x, N)[::HOP] * np.hanning(N)
    spec = np.abs(np.fft.rfft(frames.astype(np.float64), axis=1))
    freqs = np.arange(N // 2 + 1) * RATE / N
    cls = np.full(len(freqs), -1)
    ok = (freqs > 60) & (freqs < 2000)
    cls[ok] = np.round(12 * np.log2(freqs[ok] / 440)).astype(int) % 12
    c = np.stack([spec[:, cls == k].sum(1) for k in range(12)], 1)
    c = c / (np.linalg.norm(c, axis=1, keepdims=True) + 1e-9)
    return c - c.mean(0)


def pcm(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
                         capture_output=True).stdout
    return np.frombuffer(raw, np.float32)


def slide(q, m):
    if len(m) < W:
        return -1.0, 0
    win = np.lib.stride_tricks.sliding_window_view(m, (W, 12))[:, 0]
    c = (win * q).sum((1, 2)) / (np.sqrt((win ** 2).sum((1, 2)) * (q ** 2).sum()) + 1e-9)
    return float(c.max()), int(c.argmax())


def find(t, tracks):
    hits = []
    for w in range(3):
        if (w + 1) * W > len(t):
            break
        q = t[w * W:(w + 1) * W]
        best = max(((*slide(q, m), i) for i, m in enumerate(tracks)), key=lambda r: r[0])
        if best[0] > 0.6:
            hits.append((best[2], best[1], w))
    for a in range(len(hits)):
        for b in range(a + 1, len(hits)):
            (ta, oa, wa), (tb, ob, wb) = hits[a], hits[b]
            if ta == tb and abs((ob - oa) - (wb - wa) * W) <= FPS:
                return ta, (oa - wa * W) / FPS
    return None


def main():
    data, ost, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    env = UnityPy.load(data)
    gg = next(f for f in env.files.values() if getattr(f, 'name', '') == 'globalgamemanagers')
    music = set()
    for obj in gg.objects.values():
        if obj.type.name == 'ResourceManager':
            for path, ptr in obj.read().m_Container:
                if path.startswith('audio/music'):
                    music.add(path.split('/')[-1])
    tunes = {}
    for obj in env.objects:
        if obj.type.name != 'AudioClip':
            continue
        clip = obj.read()
        if clip.m_Name.lower() not in music:
            continue
        name = clip.m_Name.lower()
        path = os.path.join(out, name + '.wav')
        with open(path, 'wb') as f:
            f.write(next(iter(clip.samples.values())))
        tunes[name] = chroma(pcm(path))
    names = sorted(f for f in os.listdir(ost) if f.lower().endswith('.mp3'))
    tracks = [chroma(pcm(os.path.join(ost, f))) for f in names]
    result = {}
    for name, t in sorted(tunes.items()):
        r = find(t, tracks)
        result[name] = [names[r[0]], round(r[1], 2)] if r else None
    print(json.dumps(result))


if __name__ == '__main__':
    main()
