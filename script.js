let audioContext;
let isPlaying = false;
let current16thNote;
let tempo = 120.0;
const lookahead = 25.0; // How frequently to call scheduling function (in milliseconds)
const scheduleAheadTime = 0.1; // How far ahead to schedule audio (sec)
let nextNoteTime = 0.0; // when the next note is due
let timerID;

const samples = {
    cowbell: null,
    vocal: null
};

let noiseBuffer = null; // For 8-bit hi-hat

const patterns = {
    kick: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    cowbell: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1],
    bass: [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    vocal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
};

const activeInstruments = {
    kick: true,
    hihat: true,
    cowbell: true,
    bass: true,
    vocal: true
};

function nextNote() {
    const secondsPerBeat = 60.0 / tempo;
    nextNoteTime += 0.25 * secondsPerBeat; // Each 16th note is 1/4 of a beat

    current16thNote++;
    if (current16thNote === 16) {
        current16thNote = 0;
    }
}

function scheduleNote(beatNumber, time) {
    if (activeInstruments.kick && patterns.kick[beatNumber]) {
        playKick(time);
    }
    if (activeInstruments.hihat && patterns.hihat[beatNumber]) {
        playHiHat(time);
    }
    if (activeInstruments.cowbell && patterns.cowbell[beatNumber] && samples.cowbell) {
        playSound(samples.cowbell, time, 0.6);
    }
    if (activeInstruments.bass && patterns.bass[beatNumber]) {
        playBass(time, 41.20); // E1 note, or adjust for 8-bit range
    }
    if (activeInstruments.vocal && patterns.vocal[beatNumber] && samples.vocal) {
        playSound(samples.vocal, time, 0.7);
    }
}

function scheduler() {
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) {
        scheduleNote(current16thNote, nextNoteTime);
        nextNote();
    }
    timerID = window.setTimeout(scheduler, lookahead);
}

function playSound(buffer, time, volume = 1.0) {
    if (!audioContext) return;
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    source.buffer = buffer;
    gainNode.gain.setValueAtTime(volume, time);
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(time);
}

function playKick(time) {
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.type = 'square'; // 8-bit kick often square or triangle
    osc.frequency.setValueAtTime(120, time); // Start higher
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.05); // Quick drop

    gain.gain.setValueAtTime(0.8, time); // Punchy
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15); // Short decay

    osc.start(time);
    osc.stop(time + 0.15);
}

function playHiHat(time) {
    if (!audioContext || !noiseBuffer) return;
    const source = audioContext.createBufferSource();
    source.buffer = noiseBuffer;

    const gain = audioContext.createGain();
    const highPass = audioContext.createBiquadFilter();

    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(6000, time); // Bright, hissy 8-bit hats
    highPass.Q.setValueAtTime(1, time); // Low Q for less resonance

    gain.gain.setValueAtTime(0.15, time); // 8-bit hats are often quieter / more subtle
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05); // Very short

    source.connect(highPass);
    highPass.connect(gain);
    gain.connect(audioContext.destination);

    source.start(time);
    // Play only a short segment of the noise buffer
    // Note: source.stop() cannot be called before source.start() in some browsers if time is in the past.
    // Ensure time + 0.05 is in the future relative to audioContext.currentTime if issues arise.
    // For scheduled notes, this should be fine.
    // Schedule a stop event if precise duration is needed beyond the gain envelope
    const stopTime = time + 0.05;
    if (stopTime > audioContext.currentTime) {
         source.stop(stopTime);
    } else {
        // if time + 0.05 is in the past, stop immediately after start for safety.
        // This usually means the scheduling is too late or time is miscalculated.
        source.stop(time + 0.001);
    }
}

function playBass(time, frequency) {
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    // Optional: Add a filter for tonal shaping, but simple square is very 8-bit
    // const filter = audioContext.createBiquadFilter();
    // osc.connect(filter);
    // filter.connect(gain);
    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.type = 'square'; // Classic 8-bit bass sound
    osc.frequency.setValueAtTime(frequency, time);

    // filter.type = 'lowpass';
    // filter.frequency.setValueAtTime(300, time); // Adjust to taste
    // filter.Q.setValueAtTime(1, time);

    gain.gain.setValueAtTime(0.3, time); // Adjust volume
    gain.gain.setValueAtTime(gain.gain.value, time + 0.01); // Hold for a tiny moment for attack
    gain.gain.linearRampToValueAtTime(0.001, time + 0.15); // Short, somewhat percussive decay

    osc.start(time);
    osc.stop(time + 0.15);
}

function createNoiseBuffer() {
    if (!audioContext) return;
    const bufferSize = audioContext.sampleRate * 0.5; // 0.5 second of noise is plenty
    noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1; // White noise: -1 to +1
    }
}

async function loadSample(url) {
    if (!audioContext) {
        console.error("AudioContext not initialized, cannot load samples.");
        return null;
    }
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error(`Error loading sample ${url}:`, e);
        return null;
    }
}

function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (!audioContext) {
        console.error("AudioContext could not be initialized.");
        alert("Web Audio API is not supported in this browser.");
        return;
    }
    
    createNoiseBuffer(); // Create noise buffer for hi-hats

    loadSample('cowbell.mp3').then(buffer => {
        if (buffer) samples.cowbell = buffer;
    });
    loadSample('vocal_chop_phonk.mp3').then(buffer => {
        if (buffer) samples.vocal = buffer;
    });
}

function togglePlay() {
    if (!audioContext) {
        initAudio();
    }
    
    if (!audioContext) { // Check again if initAudio failed
        console.error("AudioContext could not be initialized after attempt.");
        // Alert moved to initAudio if it fails there.
        return;
    }

    isPlaying = !isPlaying;
    const playButton = document.getElementById('playButton');

    if (isPlaying) {
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                startSequencer(playButton);
            }).catch(e => console.error("Error resuming AudioContext:", e));
        } else {
            startSequencer(playButton);
        }
    } else {
        window.clearTimeout(timerID);
        playButton.textContent = 'Play';
    }
}

function startSequencer(playButton) {
    current16thNote = 0;
    nextNoteTime = audioContext.currentTime + 0.1; // Add small delay to ensure scheduling starts slightly ahead
    scheduler();
    playButton.textContent = 'Stop';
}

window.addEventListener('load', () => {
    const playButton = document.getElementById('playButton');
    playButton.addEventListener('click', togglePlay);

    const tempoSlider = document.getElementById('tempo');
    const bpmDisplay = document.getElementById('bpmDisplay');
    
    tempo = parseFloat(tempoSlider.value); 
    bpmDisplay.textContent = tempo; 

    tempoSlider.addEventListener('input', (e) => {
        tempo = parseFloat(e.target.value);
        bpmDisplay.textContent = tempo;
    });

    ['kick', 'hihat', 'cowbell', 'bass', 'vocal'].forEach(instr => {
        const checkbox = document.getElementById(`${instr}Toggle`);
        if (checkbox) {
            activeInstruments[instr] = checkbox.checked;
            checkbox.addEventListener('change', (e) => {
                activeInstruments[instr] = e.target.checked;
            });
        }
    });
});