document.addEventListener("DOMContentLoaded", async () => {
    let activeJob;
    let generatedVideoData;
    let fileName;

    const imageInput = document.getElementById("image");
    const audioInput = document.getElementById("audio");
    const convertBtn = document.getElementById("convert");
    const cancelBtn = document.getElementById("cancelBtn");
    const saveBtn = document.getElementById("saveBtn");
    const progressBar = document.getElementById("progress-bar");
    const status = document.getElementById("status");
    const resolutionSelect = document.getElementById("resolution");
    const isMobile = (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const MOBILE_MAX_DURATION = 60 * 60 * 3;      // 3 hours
    const MOBILE_MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

    if (isMobile) {
        resolutionSelect.value = "1280";
        resolutionSelect.querySelector('[value="1920"]').disabled = true;
    }

    const dropOverlay = document.getElementById("drop-overlay");

    window.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!activeJob && e.dataTransfer.types.includes("Files")) dropOverlay.style.display = "flex";
    });

    window.addEventListener("dragleave", (e) => {
        if (!e.relatedTarget) {
            dropOverlay.style.display = "none";
        }
    });

    window.addEventListener("drop", (e) => {
        e.preventDefault();
        dropOverlay.style.display = "none";

        if (activeJob) return;
        const selections = new Map();
        for (const file of e.dataTransfer.files) {
            let input;
            if (file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav)$/i.test(file.name)) input = audioInput;
            else if (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name)) input = imageInput;
            else {
                status.textContent = "Choose an audio file and, optionally, a JPG, PNG or WebP cover.";
                return;
            }
            if (selections.has(input)) {
                status.textContent = "Drop one audio file and one cover at a time.";
                return;
            }
            selections.set(input, file);
        }
        for (const [input, file] of selections) {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            input.dispatchEvent(new Event("change"));
        }
    });

    const clearCover = document.getElementById("clear-cover");
    clearCover.addEventListener("click", () => {
        imageInput.value = "";
        imageInput.dispatchEvent(new Event("change"));
        imageInput.focus();
    });
    const preview = document.getElementById("cover-preview");
    let previewUrl;
    preview.onload = () => { preview.hidden = false; };
    preview.onerror = () => { preview.hidden = true; };
    imageInput.addEventListener("change", () => {
        clearCover.hidden = !imageInput.files.length;
        status.textContent = "";
        preview.hidden = true;
        preview.removeAttribute("src");
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        if (imageInput.files && imageInput.files[0]) {
            previewUrl = URL.createObjectURL(imageInput.files[0]);
            preview.src = previewUrl;
            document.getElementById("image-label-text").innerText =
                imageInput.files[0].name;
        } else {
            document.getElementById("image-label-text").innerText =
                "Choose cover (optional)";
        }
    });

    audioInput.addEventListener("change", () => {
        status.textContent = "";
        if (audioInput.files && audioInput.files[0]) {
            document.getElementById("audio-label-text").innerText =
                audioInput.files[0].name;
        } else {
            document.getElementById("audio-label-text").innerText =
                "Choose audio";
        }
    });
    function showBusy(busy) {
        convertBtn.disabled = busy;
        clearCover.disabled = busy;
        imageInput.disabled = busy;
        audioInput.disabled = busy;
        resolutionSelect.disabled = busy;
        cancelBtn.style.display = busy ? "inline-block" : "none";
        document.getElementById("progress-box").style.display = busy ? "block" : "none";
    }

    async function getAudioDuration(file, signal) {
        const url = URL.createObjectURL(file);
        const audio = document.createElement("audio");
        let timer;
        let cancel;
        try {
            return await new Promise((resolve, reject) => {
                cancel = () => reject(new Error("Canceled."));
                signal.addEventListener("abort", cancel);
                audio.onerror = () => reject(new Error("Could not read this audio file."));
                timer = setTimeout(audio.onerror, 30000);
                audio.onloadedmetadata = () => {
                    if (Number.isFinite(audio.duration) && audio.duration > 0) resolve(audio.duration);
                    else audio.onerror();
                };
                audio.src = url;
            });
        } finally {
            clearTimeout(timer);
            signal.removeEventListener("abort", cancel);
            audio.onerror = audio.onloadedmetadata = null;
            audio.removeAttribute("src");
            audio.load();
            URL.revokeObjectURL(url);
        }
    }

    async function prepareCover(file, width, height) {
        const img = new Image();
        const url = file ? URL.createObjectURL(file) : "default.png";
        try {
            img.src = url;
            await img.decode();
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, width, height);
            const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
            const w = img.naturalWidth * scale;
            const h = img.naturalHeight * scale;
            ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
            if (!blob) throw new Error();
            return blob;
        } catch {
            throw new Error(file ? "Could not read the cover. Choose another image or remove it." : "Could not load the default cover.");
        } finally {
            if (file) URL.revokeObjectURL(url);
        }
    }

    function formatTime(sec) {
        sec = Math.max(0, sec);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    }

    function getAdaptiveFPS(duration) {
        let fps;
        if (duration < 3600) {
            fps = 0.7;
        } else if (duration < 7200) {
            fps = 0.3;
        } else {
            fps = 0.2;
        }
        // Mobile cap
        if (isMobile) {
            fps = Math.min(fps, 0.3); // Never above 0.4 on mobile
        }
        return fps;
    }
    convertBtn.addEventListener("click", async () => {

        const audioFile = audioInput.files[0];
        const imageFile = imageInput.files[0];

        if (activeJob) return;
        if (!audioFile) {
            status.textContent = "Choose an audio file to convert.";
            return;
        }

        const controller = new AbortController();
        const signal = controller.signal;
        let ffmpeg;
        activeJob = { controller, stopEncoder() { if (ffmpeg?.isLoaded()) ffmpeg.exit(); } };
        showBusy(true);
        saveBtn.style.display = "none";
        progressBar.style.width = "0%";
        const width = isMobile ? 1280 : Number(resolutionSelect.value);
        const height = width * 9 / 16;
        try {
            if (!window.FFmpeg) throw new Error("The video encoder could not load. Check your connection and reload the page.");
            const { createFFmpeg, fetchFile } = window.FFmpeg;
            status.textContent = "Reading audio…";
            if (imageFile && /\.hei[cf]$/i.test(imageFile.name)) throw new Error("Please convert the image to JPG or PNG first.");
            if (isMobile && audioFile.size > MOBILE_MAX_FILE_SIZE) throw new Error("Audio exceeds the 200 MB mobile limit.");
            const audioDuration = await getAudioDuration(audioFile, signal);
            signal.throwIfAborted();
            if (isMobile && audioDuration > MOBILE_MAX_DURATION) throw new Error("Audio exceeds the 3 hour mobile limit.");
            status.textContent = "Preparing cover…";
            const cover = await prepareCover(imageFile, width, height);
            signal.throwIfAborted();
            status.textContent = "Loading encoder…";
            ffmpeg = createFFmpeg({
                log: true,
                corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
            });
            await ffmpeg.load();
            signal.throwIfAborted();
            // Spread a whole number of still frames across the track so the final
            // frame ends with the audio, including tracks shorter than one frame.
            const frameCount = Math.max(1, Math.ceil(audioDuration * getAdaptiveFPS(audioDuration)));
            const frameRate = (frameCount / audioDuration).toFixed(8);
            status.textContent = "Creating video…";

            ffmpeg.setLogger(({ type, message }) => {
                if (!signal.aborted && type === "fferr") {
                    const timeMatch = message.match(/time=([0-9:.]+)/);
                    const speedMatch = message.match(/speed=\s*([0-9.]+)x/);

                    if (timeMatch) {
                        const parts = timeMatch[1].split(":");
                        const seconds =
                            parseInt(parts[0]) * 3600 +
                            parseInt(parts[1]) * 60 +
                            parseFloat(parts[2]);

                        const percent = Math.min(
                            100,
                            (seconds / audioDuration) * 100
                        );

                        progressBar.style.width = percent.toFixed(1) + "%";

                        let etaText = "";
                        if (speedMatch && Number(speedMatch[1]) > 0) {
                            const speed = parseFloat(speedMatch[1]);
                            const remaining = audioDuration - seconds;
                            const eta = remaining / speed;
                            etaText = " | ETA: " + formatTime(eta);
                        }

                        status.innerText =
                            `Processing... ${percent.toFixed(1)}%${etaText}`;
                    }
                }
            });

            const audioExt = audioFile.name.split(".").pop().toLowerCase();
            const audioName = "input." + audioExt;
            ffmpeg.FS("writeFile", audioName, await fetchFile(audioFile));

            signal.throwIfAborted();
            const imageName = "cover.png";
            ffmpeg.FS("writeFile", imageName, await fetchFile(cover));
            signal.throwIfAborted();

            await ffmpeg.run(
                "-threads", "1",
                "-loop", "1",
                "-framerate", frameRate,
                "-i", imageName,
                "-i", audioName,
                "-r", frameRate,  // force output fps
                "-map", "0:v:0", "-map", "1:a:0",
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "30",
                "-tune", "stillimage",
                "-c:a", "aac", "-profile:a", "aac_low",
                "-ar", "48000", "-ac", "2", "-b:a", "192k",
                "-t", String(audioDuration),
                "-pix_fmt", "yuv420p",
                "-g", "999999",
                "output.mp4"
            );

            signal.throwIfAborted();
            const result = ffmpeg.FS("readFile", "output.mp4");

            if (!result.length) throw new Error("The encoder produced an empty video.");
            generatedVideoData = result;
            fileName = audioFile.name.replace(/\.[^/.]+$/, "") + "_video.mp4";
            saveBtn.textContent = "Save " + fileName;
            window.recordConversion?.();
            progressBar.style.width = "100%";
            status.innerText = "Conversion complete!";
            saveBtn.style.display = "inline-block";

        } catch (error) {
            if (!signal.aborted) status.textContent = error.message || "Conversion failed. Check the audio and image files.";
        } finally {
            if (ffmpeg?.isLoaded()) ffmpeg.exit();
            if (!signal.aborted) {
                activeJob = null;
                showBusy(false);
                if (generatedVideoData) saveBtn.style.display = "inline-block";
            }
        }
    });

    cancelBtn.addEventListener("click", () => {
        if (!activeJob) return;
        activeJob.controller.abort();
        activeJob.stopEncoder();
        activeJob = null;
        showBusy(false);
        if (generatedVideoData) saveBtn.style.display = "inline-block";
        status.textContent = "Canceled.";
    });

    saveBtn.addEventListener("click", async () => {
        const video = generatedVideoData;
        if (!video) return;
        try {
            // Modern Chrome
            if ("showSaveFilePicker" in window) {

                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: "MP4 Video",
                        accept: { "video/mp4": [".mp4"] }
                    }]
                });

                const writable = await handle.createWritable();
                await writable.write(video);
                await writable.close();

            } else {
                // Fallback for Safari / Firefox / unsupported browsers
                const blob = new Blob([video], {
                    type: "video/mp4"
                });

                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            }
        } catch (error) {
            if (error.name !== "AbortError") status.textContent = "Could not save the video. Try saving again.";
        }
    });

});