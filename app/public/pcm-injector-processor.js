// AudioWorklet processor that accepts PCM samples posted from the main thread
// and outputs them into the Web Audio render graph for Butterchurn to analyse.
class PcmInjectorProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    // Ring buffer: holds ~185 ms of audio at 44.1 kHz (8192 samples)
    this._buf       = new Float32Array(8192)
    this._writePos  = 0
    this._readPos   = 0
    this._available = 0

    this.port.onmessage = ({ data }) => {
      // data is a Float32Array of 512 samples sent from the main thread
      for (let i = 0; i < data.length; i++) {
        this._buf[this._writePos] = data[i]
        this._writePos = (this._writePos + 1) % this._buf.length
        if (this._available < this._buf.length) {
          this._available++
        } else {
          // Overflow: advance read pointer (drop oldest sample)
          this._readPos = (this._readPos + 1) % this._buf.length
        }
      }
    }
  }

  process(_inputs, outputs) {
    const ch = outputs[0]?.[0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      if (this._available > 0) {
        ch[i] = this._buf[this._readPos]
        this._readPos   = (this._readPos + 1) % this._buf.length
        this._available--
      } else {
        ch[i] = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-injector-processor', PcmInjectorProcessor)
