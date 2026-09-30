/* zb-script.js -- the Zoombinis disc's animation scripts: SCRS, a snoid's
   (a Zoombini's or a Fleen's), and SCRB, any other feature's.
   =========================================================================
   Needs mac-bytes.js.

   Both are the same stream: a frame count (SCRS adds a second word, the
   order of the snoid's five layers), then that many frames, each a run of
   records -- a shape, x and y, all signed 16-bit -- closed by a negative
   word. 0xffXX closes a frame; 0xfeXX closes it and is followed by a sound
   id. The low byte, when not 0, is an event code the game's page for that
   place acts on. A frame is one tick of animation.

   WHERE IT CAME FROM
   The grammar was recovered from the data by the extraction project
   (tools/mohawk_script.py, tools/README.md § Scripts) and, separately, by
   ScummVM's Zoombinis branch (zoombini_scripts.cpp, decodeScriptFrames),
   which is where the layer orders and the event code are from. This follows
   ScummVM's reading; utilities/script_check.mjs holds it to mohawk_script.py
   over every script on the disc, record for record.
*/

/* SCRS header word 2: which layer each of a section's five records draws, in
   drawing order (ScummVM's TraitLayout). 0xffff marks a table of positions
   rather than an animation. */
const ZB_LAYER_ORDERS = {
  0: ['feet', 'body', 'nose', 'eyes', 'hair'],
  1: ['feet', 'nose', 'body', 'eyes', 'hair'],
  2: ['body', 'eyes', 'nose', 'feet', 'hair'],
  3: ['body', 'feet', 'nose', 'eyes', 'hair'],
};

/* tag is 'SCRS' or 'SCRB'. Returns { frameCount, layout (SCRS only; -1 for
   0xffff), frames: [{ records: [{ shape, x, y }], event, sound }] }; sound
   is null where the frame has none. */
function parseScript(bytes, tag) {
  const b = bytes;
  const head = tag === 'SCRS' ? 4 : 2;
  if (b.length < head) throw new Error(`${tag}: shorter than its header`);
  const frameCount = u16be(b, 0);
  const layout = tag === 'SCRS' ? i16be(b, 2) : null;
  if (!frameCount) throw new Error(`${tag}: no frames`);
  if (layout != null && layout !== -1 && !ZB_LAYER_ORDERS[layout]) throw new Error(`SCRS: layer order ${layout}`);
  const frames = [];
  let p = head;
  for (let f = 0; f < frameCount; f++) {
    const records = [];
    for (;;) {
      if (p + 2 > b.length) throw new Error(`${tag}: frame ${f} of ${frameCount} runs past the end`);
      const shape = i16be(b, p);
      p += 2;
      if (shape < 0) {
        let sound = null;
        if (shape < -256) {
          if (p + 2 > b.length) throw new Error(`${tag}: frame ${f}'s sound id runs past the end`);
          sound = i16be(b, p);
          p += 2;
        }
        frames.push({ records, event: shape & 0xff, sound, end: shape & 0xffff });
        break;
      }
      if (p + 4 > b.length) throw new Error(`${tag}: a record in frame ${f} runs past the end`);
      records.push({ shape, x: i16be(b, p), y: i16be(b, p + 2) });
      p += 4;
    }
  }
  if (p !== b.length) throw new Error(`${tag}: ${b.length - p} bytes after frame ${frameCount}`);
  return { frameCount, layout, frames };
}
