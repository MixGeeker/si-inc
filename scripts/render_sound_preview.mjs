import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { sampleRate, soundBank } from "../apps/web/src/audio/cues.ts"

// Export the same mono test tone that the browser plays.
const directory = new URL("../output/audio/", import.meta.url)
mkdirSync(directory, { recursive: true })
const samples = soundBank.test()
const bytes = samples.length * 2
const wav = Buffer.alloc(44 + bytes)
wav.write("RIFF", 0)
wav.writeUInt32LE(36 + bytes, 4)
wav.write("WAVEfmt ", 8)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(sampleRate, 24)
wav.writeUInt32LE(sampleRate * 2, 28)
wav.writeUInt16LE(2, 32)
wav.writeUInt16LE(16, 34)
wav.write("data", 36)
wav.writeUInt32LE(bytes, 40)
for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] * 32767), 44 + i * 2)
const path = new URL("sound-check.wav", directory)
writeFileSync(path, wav)
console.log(fileURLToPath(path))
