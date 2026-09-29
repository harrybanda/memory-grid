// Generates Assets/GeneratedSFX/minefield_go.wav: node tools/sfx/gen_sfx_minefield_go.js
const path = require('path');
const fs = require('fs');
// Synth engine from the Lens Studio agent plugin (ls-clad build-sfx skill); override with SFX_ENGINE if it lives elsewhere
const audio = require(process.env.SFX_ENGINE || path.join(require('os').homedir(), '.claude/plugins/cache/ls-extensions/ls-clad/1.0.0/skills/build-sfx/tools'));
const PROJECT_ASSETS_SFX = path.resolve(__dirname, '../../Assets/GeneratedSFX');
fs.mkdirSync(PROJECT_ASSETS_SFX, { recursive: true });

// "GO!" cue: a quick rising fifth of mallet bells with a bright click on the downbeat
function render() {
	const sr = audio.SAMPLE_RATE;
	const out = new Float32Array(Math.floor(0.6 * sr));

	const click = audio.sweep(3200, 1800, 0.015, 'triangle', 'exponential');
	audio.adsrExp(click, 0.001, 0.004, 0, 0.01, 4);

	const low = audio.synth_voices.bell(79, 0.35, 110, 240); // G5
	const high = audio.synth_voices.bell(86, 0.5, 110, 240); // D6
	const shimmer = audio.synth_voices.bell(98, 0.3, 90, 240); // D7, faint sparkle on the second note

	audio.addInto(out, click, 0, 0.35);
	audio.addInto(out, low, 0, 0.7);
	audio.addInto(out, high, Math.floor(0.09 * sr), 0.75);
	audio.addInto(out, shimmer, Math.floor(0.09 * sr), 0.12);

	const fx = audio.mix_bus.applyFx(out, { hpf: 180, reverb: 'smallRoom', gain: 0.9 });
	return fx;
}

const result = render();
audio.mix_bus.masterChain(result, { normalize: 'peak' });
audio.WavBuilder.write(result, path.join(PROJECT_ASSETS_SFX, 'minefield_go.wav'));
console.log('written');
