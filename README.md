# Audio2Tube

Turn any **image + audio** into a ready-to-upload YouTube video — directly in your browser.

No backend processing.
Your media stays on your device. A successful conversion sends an empty request to update the public total. The site also loads Vercel Analytics.


## Live Demo

https://audio2tube.vercel.app/

## Features

*  Fully client-side encoding (powered by FFmpeg.wasm)
*  100% private — files never leave your device
*  Adaptive FPS for long audio (optimized performance)
*  AAC stereo audio in every MP4
*  720p or 1080p output with the cover centered in the frame
*  Mobile-safe restrictions
*  Live progress bar + ETA estimation
*  Cross-browser download support
*  No server required


##  How It Works

Audio2Tube runs **FFmpeg compiled to WebAssembly** directly inside the browser.

### Encoding optimizations include:

* Large GOP for static images
* Adaptive frame rate (0.2–0.7 FPS)
* 720p output on mobile
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

* Browser-based converter
* FFmpeg.wasm
* No backend processing
* Fully client-compute architecture
* Hosted on CDN

The optional conversion counter uses a Vercel function and Upstash Redis. Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to display the total.

##  License

MIT License