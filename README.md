# Audio2Tube

Turn any **image + audio** into a ready-to-upload YouTube video — directly in your browser.

No backend processing.
No data leaves your device.


## Live Demo

https://audio2tube.vercel.app/

## Features

*  Fully client-side encoding (powered by FFmpeg.wasm)
*  100% private — files never leave your device
*  Adaptive FPS for long audio (optimized performance)
*  Automatic audio stream copy (when possible)
*  Smart resolution optimization for long recordings
*  Mobile-safe restrictions
*  Live progress bar + ETA estimation
*  Cross-browser download support
*  No server required


##  How It Works

Audio2Tube runs **FFmpeg compiled to WebAssembly** directly inside the browser.

### Encoding optimizations include:

* Large GOP for static images
* Adaptive frame rate (0.25–0.8 FPS)
* Conditional audio copying (`-c:a copy`)
* Resolution auto-downgrade for long audio
* Mobile memory protection

All processing uses your device’s CPU and RAM.


## 📸 Supported Image Formats

* JPG
* PNG
* WebP

❌ HEIC / HEIF not supported
(Please convert to JPG before uploading.)

## 🎵 Supported Audio Formats

* MP3
* AAC / M4A
* WAV (re-encoded to AAC)

##  Why This Project Exists

Most “audio to video” tools:

* Upload your files to servers
* Re-encode on backend
* Limit duration
* Charge fees

Audio2Tube runs locally.

That makes it:

* Privacy-first
* Infinitely scalable
* Cost-free
* Suitable for long-form content


##  Architecture

* Frontend-only
* FFmpeg.wasm
* No backend processing
* Fully client-compute architecture
* Hosted on CDN

##  License

MIT License