// Worklet runs on the audio rendering thread; no audio is routed to speakers.
class PCMRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (samples) this.port.postMessage(new Float32Array(samples));
    return true;
  }
}
registerProcessor("pcm-recorder", PCMRecorder);
