declare module 'butterchurn' {
  export interface Visualizer {
    connectAudio(sourceNode: AudioNode): void
    loadPreset(preset: Record<string, unknown>, blendTime: number): void
    render(): void
    setRendererSize(width: number, height: number): void
  }

  export interface ButterchurnStatic {
    createVisualizer(
      audioContext: AudioContext,
      canvas: HTMLCanvasElement,
      options: { width: number; height: number },
    ): Visualizer
  }

  const butterchurn: ButterchurnStatic
  export default butterchurn
}
