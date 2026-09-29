// Generates Assets/GeneratedSFX/lava_land.wav: node tools/sfx/gen_sfx_lava_land.js
const path = require('path');
const fs = require('fs');
// Synth engine from the Lens Studio agent plugin (ls-clad build-sfx skill); override with SFX_ENGINE if it lives elsewhere
const audio = require(process.env.SFX_ENGINE || path.join(require('os').homedir(), '.claude/plugins/cache/ls-extensions/ls-clad/1.0.0/skills/build-sfx/tools'));
const PROJECT_ASSETS_SFX = path.resolve(__dirname, '../../Assets/GeneratedSFX');
fs.mkdirSync(PROJECT_ASSETS_SFX, { recursive: true });

// Lava landing: a low whoomph as the flames rise, then a hissing sizzle tail
function render() {
	const sr = audio.SAMPLE_RATE;
	const out = new Float32Array(Math.floor(1.1 * sr));

	const whoomph = audio.transient_designer.designImpact({
		attack: { kind: 'click', durationMs: 10, lpHz: 2500, hpHz: 200, gain: 0.4 },
		body: { kind: 'thump', freq: 70, decay: 0.25, lpHz: 600, gain: 0.8, dist: 1.5 },
	});

	const rise = audio.whiteNoise(0.45, 0.8);
	audio.lowPassSweep(rise, 300, 4000, 1.2, 'exponential');
	audio.adsrExp(rise, 0.02, 0.1, 0.5, 0.3, 2);

	const sizzle = audio.granular.grainCloud({
		source: 'white', duration: 0.9, grainSizeMs: 6, density: 260, ampJitter: 0.7,
		filter: { type: 'hp', freq: 3800, Q: 0.7 }, panSpread: 0.3,
	});
	const sizzleMono = new Float32Array(sizzle.left.length);
	for (let i = 0; i < sizzleMono.length; i++) sizzleMono[i] = 0.5 * (sizzle.left[i] + sizzle.right[i]);
	audio.fadeIn(sizzleMono, 0.05);
	audio.fadeOut(sizzleMono, 0.4);

	audio.addInto(out, whoomph, 0, 0.9);
	audio.addInto(out, rise, 0, 0.35);
	audio.addInto(out, sizzleMono, Math.floor(0.12 * sr), 0.45);
	audio.fadeOut(out, 0.01);

	return audio.mix_bus.applyFx(out, { hpf: 50, reverb: 'smallRoom', gain: 0.85 });
}

const result = render();
audio.mix_bus.masterChain(result, { normalize: 'peak' });
audio.WavBuilder.write(result, path.join(PROJECT_ASSETS_SFX, 'lava_land.wav'));
console.log('written');
