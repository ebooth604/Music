import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClipPrompt, extractStyleBlock } from "./continuity.js";
import { shotCount } from "./planner.js";
import type { StoryBible } from "./types.js";

const bible: StoryBible = {
  master: {
    logline: "x", genre: "sci-fi", visualStyle: "v", colourPalette: "c", lighting: "l",
    cameraStyle: "cam", pacing: "slow", tone: "moody",
    styleBlock: "Moody sci-fi, desaturated teal and rust palette, anamorphic 35mm, slow dolly moves.",
    negativePrompt: "cartoon",
  },
  characters: [{ id: "c1", name: "Ada", role: "protagonist", age: "38", face: "f", hair: "h", wardrobe: "w",
    distinguishingMarks: "scar", lockedDescription: "Ada, 38, cropped grey hair, orange EVA suit, scar on left cheek." }],
  locations: [{ id: "l1", name: "Colony hub", lockedDescription: "A dust-caked geodesic dome." }],
  beats: [
    { index: 0, scene: "Arrival", action: "Ada steps in", characterIds: ["c1"], locationId: "l1",
      emotionalTone: "awe", shotType: "wide", transitionIn: "cut", cameraMovement: "slow push-in" },
    { index: 1, scene: "Inside", action: "Ada kneels", characterIds: ["c1"], locationId: "l1",
      emotionalTone: "dread", shotType: "close-up", transitionIn: "crossfade", cameraMovement: "static" },
  ],
};

test("style block repeated verbatim in every prompt", () => {
  const p0 = buildClipPrompt({ ...bible, beat: bible.beats[0], previous: null, durationSeconds: 15 });
  const p1 = buildClipPrompt({
    ...bible, beat: bible.beats[1], durationSeconds: 15,
    previous: { pose: "kneeling", position: "centre", lighting: "rim light", cameraFraming: "wide", summary: "Ada kneels centre frame" },
  });
  assert.equal(extractStyleBlock(p0), bible.master.styleBlock);
  assert.equal(extractStyleBlock(p1), bible.master.styleBlock);
  assert.match(p1, /begins EXACTLY on the previous clip's final frame/);
  assert.match(p1, /Ada, 38, cropped grey hair/);
  assert.match(p0, /opening shot of the film/);
});

test("shot count math", () => {
  assert.equal(shotCount(15, 15), 60);
  assert.equal(shotCount(15, 30), 30);
  assert.equal(shotCount(1, 30), 2);
});
