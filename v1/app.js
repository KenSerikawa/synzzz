class Synth {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.oscillator = null; 
        this.gainNode = null; 
        this.delayNode = null;
        this.reverbNode = null;
        this.chorusNode = null;
        this.lfo = null;
        this.analyser = audioContext.createAnalyser();
        this.eqAnalyser = audioContext.createAnalyser();

        this.currentWaveType = 'sine';
        this.currentDelayTime = 0.3;
        this.currentReverbTime = 1;

        this.attackTime = 0;
        this.decayTime = 1;
        this.sustainLevel = 1;
        this.releaseTime = 1;

        this.eqAnalyser.fftSize = 256;

        this.connectSource = function(source) {
            source.connect(this.analyser);
            source.connect(this.eqAnalyser);
        }
    }

    playNote(frequency) {
        this.oscillator = this.audioContext.createOscillator();
        this.gainNode = this.audioContext.createGain();
        const rampValue = 0.001;

        this.oscillator.type = this.currentWaveType;
        this.oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

        this.gainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
        this.gainNode.gain.exponentialRampToValueAtTime(rampValue, this.audioContext.currentTime + 1);
        this.gainNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + this.attackTime);
        this.gainNode.gain.exponentialRampToValueAtTime(this.sustainLevel, this.audioContext.currentTime + this.attackTime + this.decayTime);

        this.oscillator.connect(this.analyser);
        this.oscillator.connect(this.gainNode);

        let currentNode = this.gainNode;

        if (this.chorusNode) {
            currentNode.connect(this.chorusNode);
            currentNode = this.chorusNode;
        }

        if (this.delayNode) {
            currentNode.connect(this.delayNode);
            currentNode = this.delayNode;
        }

        if (this.reverbNode) {
            currentNode.connect(this.reverbNode);
            this.reverbNode.connect(this.audioContext.destination);
        } else {
            currentNode.connect(this.audioContext.destination);
        }

        this.oscillator.start();
        this.oscillator.stop(this.audioContext.currentTime + 1);
        this.oscillator.stop(this.audioContext.currentTime + this.attackTime + this.decayTime + this.releaseTime);

        this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.audioContext.currentTime);
        this.gainNode.gain.exponentialRampToValueAtTime(rampValue, this.audioContext.currentTime + this.releaseTime);
    }

    stopNote() {
        if (this.oscillator && this.gainNode) {
            const now = this.audioContext.currentTime;
            const release = now + this.releaseTime;
    
            this.gainNode.gain.cancelScheduledValues(now);
    
            const currentGain = this.gainNode.gain.value;
    
            this.gainNode.gain.setValueAtTime(currentGain, now);
            this.gainNode.gain.exponentialRampToValueAtTime(0.001, release);
            this.oscillator.stop(release);

            setTimeout(() => {
                if (this.oscillator) {
                    this.oscillator.disconnect();
                    this.oscillator = null;
                }
                if (this.gainNode) {
                    this.gainNode.disconnect();
                    this.gainNode = null;
                }
            }, this.releaseTime * 1000);
        }
    }
    
    setWaveType(type) {
        this.currentWaveType = type;
    }

    setDelayTime(time) {
        this.currentDelayTime = time;
        if (this.delayNode) {
            this.delayNode.delayTime.value = this.currentDelayTime;
        }
    }

    setReverbTime(time) {
        this.currentReverbTime = time;
        this.createReverbNode();
    }

    setChorusTime(time) {
        this.currentChorusTime = time;
        this.createChorusNode();
    }

    enableDelay(enabled) {
        if (enabled && !this.delayNode) {
            this.createDelayNode();
        } else if (!enabled && this.delayNode) {
            this.delayNode.disconnect();
            this.delayNode = null;
        }
    }

    enableReverb(enabled) {
        if (enabled && !this.reverbNode) {
            this.createReverbNode();
        } else if (!enabled && this.reverbNode) {
            this.reverbNode.disconnect();
            this.reverbNode = null;
        }
    }

    enableChorus(enabled) {
        if (enabled && !this.chorusNode) {
            this.createChorusNode();
        } else if (!enabled && this.chorusNode) {
            this.chorusNode.disconnect();
            this.chorusNode = null;
            if (this.lfo) {
                this.lfo.stop();
                this.lfo.disconnect();
                this.lfo = null;
            }
        }
    }

    createChorusNode() {
        this.chorusNode = this.audioContext.createDelay();
        this.chorusNode.delayTime.value = this.currentChorusTime; 

        this.lfo = this.audioContext.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.value = 1;

        const lfoGain = this.audioContext.createGain();
        lfoGain.gain.value = 0.32;

        this.lfo.connect(lfoGain);
        lfoGain.connect(this.chorusNode.delayTime);
        this.lfo.start();

        return this.chorusNode;
    }

    createDelayNode() {
        this.delayNode = this.audioContext.createDelay(5.0);
        this.delayNode.delayTime.value = this.currentDelayTime; 

        const feedbackNode = this.audioContext.createGain();
        feedbackNode.gain.value = 0.4;

        this.delayNode.connect(feedbackNode);
        feedbackNode.connect(this.delayNode);

        return this.delayNode;
    }

    async createReverbNode() {
        this.reverbNode = this.audioContext.createConvolver();

        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * this.currentReverbTime;
        const impulseBuffer = this.audioContext.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < impulseBuffer.numberOfChannels; channel++) {
            const channelData = impulseBuffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * (1 - i / length);
            }
        }

        this.reverbNode.buffer = impulseBuffer;
        return this.reverbNode;
    }
}

class Keyboard {
    constructor(synth, noteFrequencies, keys) {
        this.synth = synth;
        this.noteFrequencies = noteFrequencies; 
        this.keys = keys; 
        this.isMouseDown = false;
        this.triggeredKeys = new Set();

        this.attachEventListeners(); 
    }

    findKeyNote(key) {
        switch (key.toLowerCase()) {
            // Lower row (lower octave)
            case 'z': return 'C';
            case 'x': return 'D';
            case 'c': return 'E';
            case 'v': return 'F';
            case 'b': return 'G';
            case 'n': return 'A';
            case 'm': return 'B';
    
            case 'q': return 'C1';
            case 'w': return 'D1';
            case 'e': return 'E1';
            case 'r': return 'F1';
            case 't': return 'G1';
            case 'y': return 'A1';
            case 'u': return 'B1';
    
            case 's': return 'C#';
            case 'd': return 'D#';
            case 'g': return 'F#';
            case 'h': return 'G#';
            case 'j': return 'A#';
    
            case '2': return 'C#1';
            case '3': return 'D#1';
            case '5': return 'F#1';
            case '6': return 'G#1';
            case '7': return 'A#1';
    
            default: return null;
        }
    }    

    attachEventListeners() {
        this.keys.forEach(key => {
            const note = key.getAttribute('data-note');

            key.addEventListener('mousedown', () => {
                const frequency = this.noteFrequencies[note];
                this.synth.playNote(frequency);
                key.classList.add('active');
            });

            key.addEventListener('mouseup', () => {
                key.classList.remove('active');
            });

            key.addEventListener('mouseleave', () => {
                key.classList.remove('active');
                this.synth.stopNote();
            });

            key.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const frequency = this.noteFrequencies[note];
                this.synth.playNote(frequency);
                key.classList.add('active');
            });

            key.addEventListener('touchend', (e) => {
                e.preventDefault();
                key.classList.remove('active');
                this.synth.stopNote();
            });

            key.addEventListener('mousedown', () => {
                this.isMouseDown = true;
                this.triggeredKeys.clear(); 
                if (!this.triggeredKeys.has(note)) {
                    this.synth.playNote(this.noteFrequencies[note]);
                    this.triggeredKeys.add(note);
                    key.classList.add('active');
                }
            });

            key.addEventListener('mouseenter', () => {
                if (this.isMouseDown && !this.triggeredKeys.has(note)) {
                    this.synth.playNote(this.noteFrequencies[note]);
                    this.triggeredKeys.add(note);
                    key.classList.add('active');
                }
            });
        });

        document.addEventListener('mouseup', () => {
            this.isMouseDown = false;
            this.triggeredKeys.clear(); 
        });

        document.addEventListener('mousedown', () => {
            this.isMouseDown = true;
        });
    }

    handleKeyDown(event) {

    }

    handleKeyUp(event) {

    }

    highlightKey(note) {

    }

    unhighlightKey(note) {

    }
}

class Arrangement {
    constructor(audioContext, noteFrequencies) {
        this.audioContext = audioContext;
        this.noteFrequencies = noteFrequencies;
        this.recordedNotes = [];
        this.isRecording = false;
        this.isLooping = false;
        this.loopTimeout = null;
        this.recordingStopTime = null;
        this.startTime = null;
        this.arrangementView = null;
        this.playbackTimeoutIds = [];  
    }

    startRecording() {
        this.recordedNotes = [];
        this.isRecording = true;
        this.startTime = this.audioContext.currentTime;  
    }

    stopRecording() {
        this.isRecording = false;
        this.recordingStopTime = this.audioContext.currentTime;
    }

    addNote(note, time) {
        if (this.isRecording) {
            this.recordedNotes.push({ note: note, time: time });
        }
    }

    removeNote(index) {
        this.recordedNotes.splice(index, 1);
    }

    moveNote(index, newTime) {
        this.recordedNotes[index].time = newTime;
    }

    play(playNoteFunction) { 
        if (this.recordedNotes.length === 0) return;
        this.stop(); 
        this.startTime = this.audioContext.currentTime;
        this.recordedNotes.sort((a, b) => a.time - b.time);

        this.recordedNotes.forEach(noteData => {
            const noteTime = noteData.time - this.startTime;
            const playbackTime = this.startTime + noteTime; 

            const timeoutId = setTimeout(() => {
                const frequency = this.noteFrequencies[noteData.note];
                playNoteFunction(frequency);
            }, playbackTime * 1000);

            this.playbackTimeoutIds.push(timeoutId); 
        });

        if (this.arrangementView) {
            this.arrangementView.startPlayback();
        }
    }

    stop() {
        this.playbackTimeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
        this.playbackTimeoutIds = [];

        if (this.arrangementView) {
            this.arrangementView.stopPlayback();
        }
    }

    setLooping(looping, playNoteFunction) {
        this.isLooping = looping;
        if (looping) {
            this.startLoop(playNoteFunction);
        } else {
            this.stopLoop();
        }
    }

    startLoop(playNoteFunction) {
        if (this.recordedNotes.length === 0) return; 

        const loopDuration = this.recordingStopTime - this.startTime;

        const loop = () => {
            if (!this.isLooping) return; 
            this.play(playNoteFunction); 

            this.loopTimeout = setTimeout(() => {
                if (this.isLooping) {
                    loop(); 
                }
            }, loopDuration * 1000);
        };

        loop();
    }

    stopLoop() {
        this.isLooping = false;
        clearTimeout(this.loopTimeout);
        this.stop();  
    }

    getNotes() {
        return this.recordedNotes;  
    }

    setNotes(notes) {
        this.recordedNotes = notes; 
    }
}

class ArrangementView {
    constructor(arrangement, arrangementViewElement) {
        this.arrangement = arrangement;
        this.arrangementViewElement = arrangementViewElement;
        this.draggingNote = null;
        this.dragStartOffsetX = 0;
        this.dragStartOffsetY = 0;
        this.cursor = null; 
        this.pixelsPerSecond = 50; 
        this.isPlaying = false; 
        this.playbackStartTime = null; 
        this.animationFrameId = null; 

        this.addFollowTrackCursor(); 
    }

    addFollowTrackCursor() {
        this.cursor = document.createElement('div');
        this.cursor.setAttribute('id', 'cursor-line');
        this.arrangementViewElement.appendChild(this.cursor);
    }

    moveCursor() {
        if (!this.isPlaying) return;

        const currentTime = (Date.now() - this.playbackStartTime) / 1000; 
        const cursorPosition = currentTime * this.pixelsPerSecond; 

        this.cursor.style.left = `${cursorPosition}px`; 

        const recordedNotes = this.arrangement.getNotes();
        if (recordedNotes.length > 0 && currentTime > recordedNotes[recordedNotes.length - 1].time) {
            if (this.arrangement.isLooping) {
                this.playbackStartTime = Date.now(); 
            } else {
                this.stopPlayback(); 
                return;
            }
        }

        this.animationFrameId = requestAnimationFrame(() => this.moveCursor());
    }

    startPlayback() {
        this.isPlaying = true;
        this.playbackStartTime = Date.now(); 
        this.moveCursor(); 
    }

    stopPlayback() {
        this.isPlaying = false;
        cancelAnimationFrame(this.animationFrameId); 
        this.cursor.style.left = '0px'; 
    }

    render() {
        this.arrangementViewElement.innerHTML = ''; 
        const recordedNotes = this.arrangement.getNotes(); 
        if (recordedNotes.length === 0) {
            this.arrangementViewElement.textContent = 'No notes recorded.';
            return;
        }

        this.createRows();

        const startTime = recordedNotes[0].time;

        recordedNotes.forEach(noteData => {
            const noteElement = document.createElement('div');
            const noteText = `${noteData.note} (${(noteData.time - startTime).toFixed(2)}s)`; 

            noteElement.textContent = noteText;
            noteElement.classList.add('arrangement-note');
            noteElement.setAttribute('data-note', noteData.note); 

            const relativeTime = noteData.time - startTime;
            noteElement.style.left = (relativeTime * this.pixelsPerSecond) + 'px'; 
            noteElement.style.top = this.getRowPosition(noteData.note) + 'px'; 

            noteElement.draggable = true;
            this.arrangementViewElement.appendChild(noteElement);
        });

        this.attachDragEvents();
    }

    createRows() {
        const noteRows = {  
            'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
            'C1': 12, 'C#1': 13, 'D1': 14, 'D#1': 15, 'E1': 16, 'F1': 17, 'F#1': 18, 'G1': 19, 'G#1': 20, 'A1': 21, 'A#1': 22, 'B1': 23,
            'C2': 24, 'C#2': 25, 'D2': 26, 'D#2': 27, 'E2': 28, 'F2': 29 
        };
        const rowHeight = 25; 
        for (const note in noteRows) {
            const row = document.createElement('div');
            row.classList.add('arrangement-row');
            row.style.top = this.getRowPosition(note) + 'px';
            row.style.height = rowHeight + 'px';
            this.arrangementViewElement.appendChild(row);
        }
    }

    getRowPosition(note) {
        const noteRows = {  
            'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
            'C1': 12, 'C#1': 13, 'D1': 14, 'D#1': 15, 'E1': 16, 'F1': 17, 'F#1': 18, 'G1': 19, 'G#1': 20, 'A1': 21, 'A#1': 22, 'B1': 23,
            'C2': 24, 'C#2': 25, 'D2': 26, 'D#2': 27, 'E2': 28, 'F2': 29 
        };

        const rowHeight = 25; 
        return (noteRows[note] || 0) * rowHeight; 
    }

    attachDragEvents() {
        const notes = this.arrangementViewElement.querySelectorAll('.arrangement-note');

        notes.forEach(note => {
            note.addEventListener('mousedown', (e) => {
                this.draggingNote = note;
                this.dragStartOffsetX = e.clientX - note.offsetLeft;
                this.dragStartOffsetY = e.clientY - note.offsetTop;  
                note.classList.add('dragging');
            });
        });
    }

    handleDrag(event) {
        if (this.draggingNote) {
            const newLeft = event.clientX - this.dragStartOffsetX;
            const initialTop = this.getRowPosition(this.draggingNote.dataset.note);
            this.draggingNote.style.left = newLeft + 'px';
            this.draggingNote.style.top = initialTop + 'px'; 
        }
    }

    handleDragEnd() {
        if (this.draggingNote) {
            this.draggingNote.classList.remove('dragging');
            this.draggingNote = null;
        }
    }
}

class Visualizer {
    constructor(audioContext, waveformCanvas, eqCanvas) {
        this.audioContext = audioContext;
        this.waveformCanvas = waveformCanvas;
        this.eqCanvas = eqCanvas;
        this.waveformContext = waveformCanvas.getContext("2d");
        this.eqContext = eqCanvas.getContext("2d");

        this.analyser = audioContext.createAnalyser();
        this.analyser.fftSize = 2048;

        this.eqAnalyser = audioContext.createAnalyser();
        this.eqAnalyser.fftSize = 256;

        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);

        this.eqBufferLength = this.eqAnalyser.frequencyBinCount;
        this.eqDataArray = new Uint8Array(this.eqBufferLength);
    }

    drawWaveform() {
        this.waveformContext.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
        this.analyser.getByteTimeDomainData(this.dataArray);

        this.waveformContext.lineWidth = 2;
        this.waveformContext.strokeStyle = "rgb(252, 50, 196)";

        this.waveformContext.beginPath();

        const sliceWidth = (this.waveformCanvas.width * 1.0) / this.bufferLength;
        let x = 0;

        for (let i = 0; i < this.bufferLength; i++) {
            const v = this.dataArray[i] / 128.0;
            const y = (v * this.waveformCanvas.height) / 2;

            if (i === 0) {
                this.waveformContext.moveTo(x, y);
            } else {
                this.waveformContext.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.waveformContext.lineTo(this.waveformCanvas.width, this.waveformCanvas.height / 2);
        this.waveformContext.stroke();

        requestAnimationFrame(() => this.drawWaveform()); 
    }

    drawEQ() {
        this.eqAnalyser.getByteFrequencyData(this.eqDataArray);
        this.eqContext.clearRect(0, 0, this.eqCanvas.width, this.eqCanvas.height);

        const barWidth = (this.eqCanvas.width / this.eqBufferLength) * 2.5;
        let barHeight = 0;
        let x = 0;

        for (let i = 0; i < this.eqBufferLength; i++) {
            barHeight = Math.max(0, this.eqDataArray[i] - 10); 

            this.eqContext.fillStyle = 'rgb(' + (barHeight + 100) + ',50, 196)';
            this.eqContext.fillRect(x, this.eqCanvas.height - barHeight / 2, barWidth, barHeight / 2);

            x += barWidth + 1;
        }

        requestAnimationFrame(() => this.drawEQ()); 
    }

    connectSource(source) {
        source.connect(this.analyser);
        source.connect(this.eqAnalyser);
    }
}

class Metronome {
    constructor(audioContext, bpmDisplay, tapButton, metronomeButton) {
        this.audioContext = audioContext;
        this.bpmDisplay = bpmDisplay;
        this.tapButton = tapButton;
        this.metronomeButton = metronomeButton
        this.taps = [];
        this.lastTapTime = 0;
        this.isMetronomeOn = false;
        this.metronomeInterval = null;
        this.beatsPerMinute = 120;
        this.secondsPerBeat = 60 / this.beatsPerMinute;
        this.pixelsPerSecond = 50;

        this.oscillator = null
        this.gainNode = null;

        this.setupEventListeners(); 
    }

    setupEventListeners() {

        this.tapButton.addEventListener('click', () => this.calculateBPM());

        this.metronomeButton.addEventListener('click', () => {
            this.toggleMetronome();
        });
    }

    calculateBPM() {
        const now = Date.now();
        if (now - this.lastTapTime > 2000) {
            this.taps = [];
        }
        this.taps.push(now);
        this.lastTapTime = now;

        if (this.taps.length > 4) {
            this.taps = this.taps.slice(-4);
        }

        if (this.taps.length > 1) {
            const intervals = [];
            for (let i = 1; i < this.taps.length; i++) {
                intervals.push(this.taps[i] - this.taps[i - 1]);
            }
            const averageInterval = intervals.reduce((a, b) => a + b) / intervals.length;
            this.beatsPerMinute = Math.round(60000 / averageInterval);
            this.updateBPMDisplay();
        }
    }

    updateBPMDisplay() {
        this.bpmDisplay.textContent = `${this.beatsPerMinute} BPM`;
    }

    toggleMetronome() {
        this.isMetronomeOn = !this.isMetronomeOn;
        if (this.isMetronomeOn) {
            this.startMetronome();
        } else {
            this.stopMetronome();
        }
    }

    startMetronome() {
        if (this.metronomeInterval) {
            clearInterval(this.metronomeInterval);
        }

        this.metronomeInterval = setInterval(() => {
            this.playTick();
        }, 60000 / this.beatsPerMinute);
        this.playTick()
    }

    stopMetronome() {
        clearInterval(this.metronomeInterval);
        this.metronomeInterval = null;
    }

    playTick() {
        this.oscillator = this.audioContext.createOscillator();
        this.gainNode = this.audioContext.createGain();

        this.oscillator.type = 'sine'; 
        this.oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime); 

        this.gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);  
        this.gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);

        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        this.oscillator.start();
        this.oscillator.stop(this.audioContext.currentTime + 0.1); 
    }

    getBPM() {
        return this.beatsPerMinute;
    }

    setBPM(bpm) {
        this.beatsPerMinute = bpm;
        this.updateBPMDisplay();
        if (this.isMetronomeOn) {
            this.stopMetronome();
            this.startMetronome();
        }
    }
}

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

document.addEventListener('DOMContentLoaded', () => {

    const noteFrequencies = {

        'C': 130.81, 'C#': 138.59, 'D': 146.83, 'D#': 155.56,
        'E': 164.81, 'F': 174.61, 'F#': 185.00, 'G': 196.00,
        'G#': 207.65, 'A': 220.00, 'A#': 233.08, 'B': 246.94,

        'C1': 261.63, 'C#1': 277.18, 'D1': 293.66, 'D#1': 311.13,
        'E1': 329.63, 'F1': 349.23, 'F#1': 369.99, 'G1': 392.00,
        'G#1': 415.30, 'A1': 440.00, 'A#1': 466.16, 'B1': 493.88,

        'C2': 523.25, 'C#2': 554.37, 'D2': 587.33, 'D#2': 622.25,
        'E2': 659.25, 'F2': 698.46, 'F#2': 739.99, 'G2': 783.99,
        'G#2': 830.61, 'A2': 880.00, 'A#2': 932.33, 'B2': 987.77
    };

    const waveformCanvas = document.getElementById("waveformCanvas");
    const eqCanvas = document.getElementById("eqCanvas");
    const keys = document.querySelectorAll('.key');
    const delayFader = document.getElementById('delay-fader');
    const reverbFader = document.getElementById('reverb-fader');
    const chorusFader = document.getElementById('chorus-fader');
    const delayToggle = document.getElementById('delay-toggle');
    const reverbToggle = document.getElementById('reverb-toggle');
    const chorusToggle = document.getElementById('chorus-toggle');
    const recordButton = document.getElementById('record-button');
    const arrangementViewElement = document.getElementById('arrangement-view');
    const playbackButton = document.getElementById('playback-button');
    const loopButton = document.getElementById('loop-button');
    const bpmDisplay = document.getElementById('bpm-display');
    const tapButton = document.getElementById('tap-button');
    const metronomeButton = document.getElementById('metronome-button');

    const synth = new Synth(audioContext);

    const visualizer = new Visualizer(audioContext, waveformCanvas, eqCanvas);
    visualizer.connectSource(synth.analyser);
    visualizer.connectSource(synth.eqAnalyser);
    visualizer.drawWaveform();
    visualizer.drawEQ();

    const keyboard = new Keyboard(synth, noteFrequencies, keys);

    const arrangement = new Arrangement(audioContext, noteFrequencies);

    const arrangementView = new ArrangementView(arrangement, arrangementViewElement);

    arrangement.arrangementView = arrangementView;

    const metronome = new Metronome(audioContext, bpmDisplay, tapButton, metronomeButton);

    delayFader.addEventListener('input', (event) => {
        synth.setDelayTime(event.target.value / 100);
    });

    reverbFader.addEventListener('input', (event) => {
        synth.setReverbTime(event.target.value);
    });

    chorusFader.addEventListener('input', (event) => {
        synth.setChorusTime(event.target.value);
    });

    delayToggle.addEventListener('change', () => {
        synth.enableDelay(delayToggle.checked);
    });

    reverbToggle.addEventListener('change', () => {
        synth.enableReverb(reverbToggle.checked);
    });

    chorusToggle.addEventListener('change', () => {
        synth.enableChorus(chorusToggle.checked);
    });

    recordButton.addEventListener('click', () => {
        if (!arrangement.isRecording) {
            arrangement.startRecording();
            recordButton.textContent = 'Stop Recording';
            playbackButton.disabled = true;
            loopButton.disabled = true;
        } else {
            arrangement.stopRecording();
            recordButton.textContent = 'Start Recording';
            playbackButton.disabled = false;
            loopButton.disabled = false;
        }
        arrangementView.render();
    });

    playbackButton.addEventListener('click', () => {
        arrangement.play(synth.playNote.bind(synth));
    });

    loopButton.addEventListener('click', () => {
        arrangement.setLooping(!arrangement.isLooping, synth.playNote.bind(synth));
    });

    const waveforms = [
        { icon: '∿', name: 'Sine', value: 'sine' },
        { icon: '▇', name: 'Square', value: 'square' },
        { icon: '◺', name: 'Triangle', value: 'triangle' },
        { icon: '◿', name: 'Sawtooth', value: 'sawtooth' }
    ];

    let currentIndex = 0;
    const display = document.querySelector('.display');
    const leftButton = document.querySelector('.left');
    const rightButton = document.querySelector('.right');

    function updateDisplay() {
        const currentWave = waveforms[currentIndex];
        display.innerHTML = `<span class="wave-icon">${currentWave.icon}</span>`;
        synth.setWaveType(currentWave.value);
    }

    function findElementByDataNote(note) {
        return document.querySelector(`[data-note="${note}"]`);
    }

    leftButton.addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + waveforms.length) % waveforms.length;
        updateDisplay();
    });

    rightButton.addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % waveforms.length;
        updateDisplay();
    });

    document.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        let note = keyboard.findKeyNote(key);
        if (note) {
            const keyElement = findElementByDataNote(note);
            keyElement.classList.remove('active');
        }
    });

    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        let note = keyboard.findKeyNote(key);

        if (note) {
            console.log(`Playing note: ${note}`);
            synth.playNote(noteFrequencies[note]);
            const keyElement = findElementByDataNote(note);
            keyElement.classList.add('active');

            if (arrangement.isRecording) {
                arrangement.addNote(note, audioContext.currentTime);
                arrangementView.render();
            }
        }
    });

    updateDisplay();
    arrangementView.render();
});