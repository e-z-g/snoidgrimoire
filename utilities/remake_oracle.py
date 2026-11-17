"""What UnityPy reads from the 2015 remake's files, for remake_check.mjs.
Run with the venv in zoombini-reference/remake/.venv (UnityPy).
  python remake_oracle.py <Data folder> [<folder for the Vorbis sounds>]
With the second argument it writes each Vorbis sound as FMOD decodes it,
as <file>-<path id>.wav.
Prints JSON: each file's object counts by class id, every text asset's
name and SHA-1, every sound's name, frequency, channels and length, and
every texture in a plain, ASTC or PVRTC format with the SHA-1 of its RGBA pixels, top
row first."""
import hashlib, json, os, sys
import UnityPy
from UnityPy.export.Texture2DConverter import parse_image_data

PLAIN = {1, 3, 4, 5, 30, 31, 32, 33} | set(range(48, 60))
folder = sys.argv[1]
out = {}
env = UnityPy.load(folder)
for o in env.objects:
    name = os.path.basename(o.assets_file.name)
    f = out.setdefault(name, {'classes': {}, 'text': {}, 'sounds': {}, 'textures': {}})
    cid = o.class_id
    f['classes'][cid] = f['classes'].get(cid, 0) + 1
    if cid == 49:
        d = o.read()
        s = d.m_Script.encode('utf-8', 'surrogateescape') if isinstance(d.m_Script, str) else bytes(d.m_Script)
        f['text'][o.path_id] = [d.m_Name, hashlib.sha1(s).hexdigest()]
    elif cid == 83:
        d = o.read()
        f['sounds'][o.path_id] = [d.m_Name, d.m_Frequency, d.m_Channels, round(d.m_Length, 3)]
        if len(sys.argv) > 2 and int(d.m_CompressionFormat) == 1:
            with open(os.path.join(sys.argv[2], f"{name}-{o.path_id}.wav"), 'wb') as wav_file:
                wav_file.write(list(d.samples.values())[0])
    elif cid == 28:
        d = o.read()
        if int(d.m_TextureFormat) in PLAIN:
            data = bytes(d.image_data) if d.image_data else b''
            if not data and d.m_StreamData and d.m_StreamData.size:
                with open(os.path.join(folder, os.path.basename(d.m_StreamData.path)), 'rb') as side:
                    side.seek(d.m_StreamData.offset)
                    data = side.read(d.m_StreamData.size)
            img = parse_image_data(data, d.m_Width, d.m_Height, d.m_TextureFormat, o.version, o.platform, d.m_PlatformBlob).convert('RGBA')
            f['textures'][o.path_id] = [d.m_Name, hashlib.sha1(img.tobytes()).hexdigest()]
json.dump(out, sys.stdout)
